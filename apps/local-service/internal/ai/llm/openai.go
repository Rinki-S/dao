package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type openAIClient struct {
	config  Config
	baseURL string
	http    *http.Client
}

// Chat Completions rather than the newer Responses API: this wire exists to
// reach every endpoint that claims OpenAI compatibility, and compatibility
// always means Chat Completions.
type openAIRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens,omitempty"`
	Messages  []openAIMessage `json:"messages"`
	Stream    bool            `json:"stream,omitempty"`
	// Without this the usage of a streamed answer is never reported: the
	// per-chunk objects carry none, and the wire only adds a final usage-only
	// chunk when asked. Endpoints that do not recognise it ignore it, which is
	// why it costs nothing to always ask.
	StreamOptions *openAIStreamOptions `json:"stream_options,omitempty"`
	Tools         []openAITool         `json:"tools,omitempty"`
}

type openAIStreamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

// A tool is a "function" on this wire, wrapped in an envelope whose type field
// has only ever had one value.
type openAITool struct {
	Type     string             `json:"type"`
	Function openAIToolFunction `json:"function"`
}

type openAIToolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters"`
}

type openAIMessage struct {
	Role string `json:"role"`
	// A string when the turn is only words, and a list of parts when it
	// carries an image. Both are valid on this wire and the string form is
	// what every endpoint claiming compatibility understands, so it stays the
	// default and the list is used only when there is something in the turn
	// that cannot be said in text.
	Content any `json:"content"`
	// An assistant turn's calls, and — on a message with role "tool" — the one
	// this message answers.
	ToolCalls  []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`

	// ReasoningContent is a reasoning model's working, echoed back on exactly
	// the assistant turn it belongs to. Unlike the Anthropic wire, where
	// reasoning is never replayed, a reasoning model on this wire — DeepSeek's
	// deepseek-reasoner is the case this was found against — refuses the next
	// request with a 400 if a message carrying tool_calls does not carry the
	// reasoning that produced them back with it.
	ReasoningContent string `json:"reasoning_content,omitempty"`
}

// openAIPart is one piece of a multimodal turn.
//
// Only two shapes exist here: text, and an image behind a URL. The URL is a
// data: URL rather than something to fetch — the bytes are on this machine,
// and handing a provider a link to localhost would be handing it nothing.
type openAIPart struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *openAIImageURL `json:"image_url,omitempty"`
}

type openAIImageURL struct {
	URL string `json:"url"`
}

// openAIToolCall carries its arguments as a *string* of JSON rather than as
// JSON, which is the sharpest difference between the two wires and the reason
// the raw bytes are kept rather than decoded on the way through.
type openAIToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content          string           `json:"content"`
			ReasoningContent string           `json:"reasoning_content"`
			ToolCalls        []openAIToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

// newRequest builds the HTTP call for both Complete and Stream.
//
// Shared rather than duplicated: the two differ by one field, and the parts
// they have in common — how a system prompt is carried, how content blocks
// flatten to a string, which header the credential goes in — are exactly the
// parts that would be painful to have drift apart.
func (c *openAIClient) newRequest(
	ctx context.Context, request Context, opts Options, stream bool,
) (*http.Request, error) {
	body := openAIRequest{
		Model:     c.config.Model,
		MaxTokens: opts.MaxTokens,
		Messages:  make([]openAIMessage, 0, len(request.Messages)+1),
		Stream:    stream,
	}
	if stream {
		body.StreamOptions = &openAIStreamOptions{IncludeUsage: true}
	}

	// The system prompt is a message here, not a field. This is the whole
	// shape difference from the Anthropic wire.
	if request.SystemPrompt != "" {
		body.Messages = append(body.Messages, openAIMessage{
			Role:    "system",
			Content: request.SystemPrompt,
		})
	}

	for _, tool := range opts.Tools {
		body.Tools = append(body.Tools, openAITool{
			Type: "function",
			Function: openAIToolFunction{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.Schema,
			},
		})
	}

	for _, message := range request.Messages {
		body.Messages = append(body.Messages, openAIMessages(message)...)
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpRequest.Header.Set("content-type", "application/json")

	// Authentication goes on last, and can fail: renewing an expired token is
	// a network call, so this is the one header that is not just a string.
	if err := c.config.credential().Apply(ctx, httpRequest); err != nil {
		return nil, fmt.Errorf("authenticate request: %w", err)
	}

	return httpRequest, nil
}

// openAIMessages turns one message into the one or more this wire needs.
//
// One in, several out, because a tool's result is a message here rather than
// content inside one. A user turn carrying three results becomes three messages
// with role "tool" — and the prose in that same turn, if there is any, becomes
// a fourth, after them: this wire reads a tool message as answering the calls
// before it, so anything the user said has to come once that exchange is
// closed.
func openAIMessages(message Message) []openAIMessage {
	var messages []openAIMessage
	var text strings.Builder
	var reasoning strings.Builder
	var calls []openAIToolCall
	var images []openAIPart

	for _, block := range message.Content {
		switch block.Kind {
		case KindText:
			text.WriteString(block.Text)
		case KindThinking:
			reasoning.WriteString(block.Text)
		case KindToolCall:
			call := openAIToolCall{ID: block.ID, Type: "function"}
			call.Function.Name = block.Name
			// The arguments go back as the string this wire wants. Raw JSON
			// with no bytes touched: re-encoding a number the model wrote is
			// how 1e300 becomes something else.
			call.Function.Arguments = string(block.Input)
			calls = append(calls, call)
		case KindImage:
			images = append(images, openAIPart{
				Type:     "image_url",
				ImageURL: &openAIImageURL{URL: "data:" + block.MediaType + ";base64," + block.Data},
			})
		case KindDocument:
			// There is no document on this wire, so the file arrives as its own
			// words or it does not arrive. Said in the turn's text, named, and
			// fenced so the model can tell the file from the sentence
			// introducing it.
			if block.Text != "" {
				fmt.Fprintf(&text, "\n\nAttached file %q:\n\n```\n%s\n```\n", block.Filename, block.Text)
				break
			}

			// Nothing could be got out of it. Saying so is the whole point: a
			// model told an attachment exists and left to guess at it will
			// describe what such a file usually contains.
			fmt.Fprintf(
				&text,
				"\n\n[%q was attached. This provider cannot read that kind of file, and no text could be taken from it.]\n",
				block.Filename,
			)
		case KindToolResult:
			// An error is reported as the result's text. This wire has no flag
			// for it, and the model needs to be told in words regardless.
			content := block.Text
			if block.IsError {
				content = "Error: " + content
			}
			messages = append(messages, openAIMessage{
				Role:       "tool",
				ToolCallID: block.ID,
				Content:    content,
			})
		}
	}

	// A turn with a picture in it has to go as a list of parts; one without
	// goes as a plain string. The string is not a shortcut — it is the shape
	// every endpoint claiming compatibility understands, and a list sent to
	// one that only reads strings is a turn it drops on the floor. So the
	// richer shape is used only when there is something in the turn that
	// cannot be said any other way.
	if len(images) > 0 {
		parts := make([]openAIPart, 0, len(images)+1)
		if text.Len() > 0 {
			parts = append(parts, openAIPart{Type: "text", Text: text.String()})
		}
		parts = append(parts, images...)

		messages = append(messages, openAIMessage{
			Role:             string(message.Role),
			Content:          parts,
			ToolCalls:        calls,
			ReasoningContent: reasoning.String(),
		})

		return messages
	}

	if text.Len() > 0 || len(calls) > 0 {
		messages = append(messages, openAIMessage{
			Role:             string(message.Role),
			Content:          text.String(),
			ToolCalls:        calls,
			ReasoningContent: reasoning.String(),
		})
	}

	return messages
}

func (c *openAIClient) Complete(ctx context.Context, request Context, opts Options) (Response, error) {
	httpRequest, err := c.newRequest(ctx, request, opts, false)
	if err != nil {
		return Response{}, err
	}

	response, err := c.http.Do(httpRequest)
	if err != nil {
		return Response{}, fmt.Errorf("call provider: %w", err)
	}
	defer response.Body.Close()

	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return Response{}, fmt.Errorf("read response: %w", err)
	}

	if response.StatusCode != http.StatusOK {
		return Response{}, &APIError{StatusCode: response.StatusCode, Body: string(raw)}
	}

	var decoded openAIResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return Response{}, fmt.Errorf("decode response: %w", err)
	}

	result := Response{
		StopReason: StopEnd,
		Usage: Usage{
			InputTokens:  decoded.Usage.PromptTokens,
			OutputTokens: decoded.Usage.CompletionTokens,
		},
	}

	// A 200 with no choices is a compatible-in-name-only endpoint. Reporting it
	// as an empty answer would send the caller off to parse "" as JSON and
	// blame the model.
	if len(decoded.Choices) == 0 {
		return result, fmt.Errorf("provider returned no choices")
	}

	choice := decoded.Choices[0]
	result.StopReason = openAIStopReason(choice.FinishReason)
	if choice.Message.ReasoningContent != "" {
		result.Content = append(result.Content, ContentBlock{Kind: KindThinking, Text: choice.Message.ReasoningContent})
	}
	if choice.Message.Content != "" {
		result.Content = append(result.Content, TextBlock(choice.Message.Content))
	}
	for _, call := range choice.Message.ToolCalls {
		// Arguments come as a string of JSON. Empty means the model asked for a
		// tool that takes none, and an empty object is what a schema-validating
		// tool expects to decode.
		arguments := json.RawMessage(call.Function.Arguments)
		if len(arguments) == 0 {
			arguments = json.RawMessage("{}")
		}
		result.Content = append(result.Content, ToolCallBlock(call.ID, call.Function.Name, arguments))
	}

	return result, nil
}

// openAIChunk is one event of a streamed answer.
//
// Usage is a pointer because its presence is the signal: every content chunk
// omits it, and the wire sends one final chunk that carries usage and an empty
// choices array. A value type could not tell "no usage in this chunk" from
// "zero tokens".
type openAIChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
			// A reasoning model streams this ahead of Content, as its own run
			// of chunks before the answer's chunks begin.
			ReasoningContent string `json:"reasoning_content"`
			// A call's id and name arrive with its first fragment and are
			// absent from every one after it, which is why the accumulator is
			// keyed on index rather than on id.
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

func (c *openAIClient) Stream(
	ctx context.Context, request Context, opts Options, sink Sink,
) (Response, error) {
	httpRequest, err := c.newRequest(ctx, request, opts, true)
	if err != nil {
		return Response{}, err
	}

	response, err := c.http.Do(httpRequest)
	if err != nil {
		return Response{}, fmt.Errorf("call provider: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(response.Body)
		return Response{}, &APIError{StatusCode: response.StatusCode, Body: string(raw)}
	}

	var text strings.Builder
	var reasoning strings.Builder
	var calls toolCalls
	result := Response{StopReason: StopEnd}
	sawChunk := false

	err = scanSSE(response.Body, func(data []byte) (bool, error) {
		if string(data) == sseDone {
			return false, nil
		}

		var chunk openAIChunk
		if err := json.Unmarshal(data, &chunk); err != nil {
			return false, fmt.Errorf("decode stream chunk: %w", err)
		}
		sawChunk = true

		if chunk.Usage != nil {
			result.Usage = Usage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
			}
		}

		for _, choice := range chunk.Choices {
			if choice.FinishReason != "" {
				result.StopReason = openAIStopReason(choice.FinishReason)
			}

			for _, call := range choice.Delta.ToolCalls {
				if call.ID != "" || call.Function.Name != "" {
					calls.start(call.Index, call.ID, call.Function.Name)
				}
				if call.Function.Arguments != "" {
					// Not passed to onText: arguments are not prose, and a
					// reader shown half a JSON object would be right to think
					// something had gone wrong.
					calls.argument(call.Index, call.Function.Arguments)
				}
			}

			if choice.Delta.ReasoningContent != "" {
				// Its own callback, never the text one: this is the model's
				// working, and a caller that received it as prose would store
				// it as the answer.
				reasoning.WriteString(choice.Delta.ReasoningContent)
				if err := sink.reasoning(choice.Delta.ReasoningContent); err != nil {
					return false, err
				}
			}

			if choice.Delta.Content == "" {
				continue
			}

			// Accumulated as well as forwarded. The caller streams to a
			// reader, but the whole answer is still what gets stored, and
			// making the caller reassemble it invites two versions of it.
			text.WriteString(choice.Delta.Content)
			if err := sink.text(choice.Delta.Content); err != nil {
				return false, err
			}
		}

		return true, nil
	})
	if err != nil {
		return Response{}, err
	}

	// A 200 that produced no event at all is a compatible-in-name-only
	// endpoint, the streaming counterpart of Complete's empty-choices case.
	// Returning an empty answer would send the caller off to blame the model.
	if !sawChunk {
		return Response{}, fmt.Errorf("provider streamed no chunks")
	}

	if reasoning.Len() > 0 {
		result.Content = append(result.Content, ContentBlock{Kind: KindThinking, Text: reasoning.String()})
	}
	if text.Len() > 0 {
		result.Content = append(result.Content, TextBlock(text.String()))
	}
	result.Content = append(result.Content, calls.blocks()...)

	return result, nil
}

func openAIStopReason(reason string) StopReason {
	switch reason {
	case "length":
		return StopLength
	case "tool_calls":
		return StopToolUse
	case "stop":
		return StopEnd
	default:
		return StopEnd
	}
}
