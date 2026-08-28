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

// The version Anthropic's API requires on every request. It pins the wire
// format, not the model.
const anthropicVersion = "2023-06-01"

type anthropicClient struct {
	config  Config
	baseURL string
	http    *http.Client
}

// Anthropic carries the system prompt as a field of its own rather than as a
// first message, which is the main shape difference from the OpenAI wire.
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	Stream    bool               `json:"stream,omitempty"`
	Tools     []anthropicTool    `json:"tools,omitempty"`
}

type anthropicTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type anthropicMessage struct {
	Role    string             `json:"role"`
	Content []anthropicContent `json:"content"`
}

// anthropicContent is the union of the block shapes this wire uses. A tool call
// and its result are both content here — the result rides in a user message,
// which is the shape this package normalised on.
type anthropicContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`

	// tool_use
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result
	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   string `json:"content,omitempty"`
	IsError   bool   `json:"is_error,omitempty"`
}

type anthropicResponse struct {
	Content    []anthropicContent `json:"content"`
	StopReason string             `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// newRequest builds the HTTP call for both Complete and Stream. Shared for the
// same reason as on the OpenAI wire: the two differ by one field, and
// everything else is exactly what should not be allowed to drift apart.
func (c *anthropicClient) newRequest(
	ctx context.Context, request Context, opts Options, stream bool,
) (*http.Request, error) {
	body := anthropicRequest{
		Model:     c.config.Model,
		MaxTokens: opts.MaxTokens,
		System:    request.SystemPrompt,
		Messages:  make([]anthropicMessage, 0, len(request.Messages)),
		Stream:    stream,
	}

	for _, tool := range opts.Tools {
		body.Tools = append(body.Tools, anthropicTool{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: tool.Schema,
		})
	}

	for _, message := range request.Messages {
		content := make([]anthropicContent, 0, len(message.Content))
		for _, block := range message.Content {
			switch block.Kind {
			case KindText:
				content = append(content, anthropicContent{Type: "text", Text: block.Text})
			case KindToolCall:
				// Sent back up, unlike reasoning: the result that follows refers
				// to this block by id, and a wire that never saw the call has
				// nothing for the result to answer.
				content = append(content, anthropicContent{
					Type:  "tool_use",
					ID:    block.ID,
					Name:  block.Name,
					Input: block.Input,
				})
			case KindToolResult:
				content = append(content, anthropicContent{
					Type:      "tool_result",
					ToolUseID: block.ID,
					Content:   block.Text,
					IsError:   block.IsError,
				})
			default:
				// Reasoning is never sent back up: it is the model's own
				// working, and replaying it across a wire that did not produce
				// it is how contexts get corrupted.
			}
		}
		body.Messages = append(body.Messages, anthropicMessage{
			Role:    string(message.Role),
			Content: content,
		})
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+"/v1/messages", bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpRequest.Header.Set("content-type", "application/json")
	httpRequest.Header.Set("anthropic-version", anthropicVersion)

	// Authentication goes on last, and can fail: renewing an expired token is
	// a network call, so this is the one header that is not just a string.
	if err := c.config.credential().Apply(ctx, httpRequest); err != nil {
		return nil, fmt.Errorf("authenticate request: %w", err)
	}

	return httpRequest, nil
}

func (c *anthropicClient) Complete(ctx context.Context, request Context, opts Options) (Response, error) {
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

	var decoded anthropicResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return Response{}, fmt.Errorf("decode response: %w", err)
	}

	result := Response{
		StopReason: anthropicStopReason(decoded.StopReason),
		Usage: Usage{
			InputTokens:  decoded.Usage.InputTokens,
			OutputTokens: decoded.Usage.OutputTokens,
		},
	}
	for _, block := range decoded.Content {
		switch block.Type {
		case "text":
			result.Content = append(result.Content, ContentBlock{Kind: KindText, Text: block.Text})
		case "thinking":
			result.Content = append(result.Content, ContentBlock{Kind: KindThinking, Text: block.Thinking})
		case "tool_use":
			result.Content = append(result.Content, ToolCallBlock(block.ID, block.Name, block.Input))
		}
	}

	return result, nil
}

// anthropicEvent is one event of a streamed answer.
//
// Unlike the OpenAI wire, where every chunk has the same shape, this one sends
// several different event types down the same stream and names each in its own
// payload. So this is the union of the fields the types we care about carry,
// and Type decides which of them mean anything.
//
// The types not handled below — content_block_start, ping, message_stop — are
// structure rather than content. Ignoring an unknown type is deliberate: the
// wire is free to add events, and a stream that failed on one it had not seen
// before would break on a provider upgrade.
type anthropicEvent struct {
	Type string `json:"type"`
	// Which block of the turn this event belongs to. Text is usually block 0
	// and a tool call the one after it, but the only thing worth relying on is
	// that the number identifies the block.
	Index        int `json:"index"`
	ContentBlock struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content_block"`
	Delta struct {
		Type string `json:"type"`
		Text string `json:"text"`
		// A tool's arguments arrive as fragments of JSON text, which is why
		// they cannot be decoded until the block is closed.
		PartialJSON string `json:"partial_json"`
		StopReason  string `json:"stop_reason"`
	} `json:"delta"`
	// Input tokens arrive once, in message_start; output tokens arrive at the
	// end, in message_delta. Neither event carries both.
	Message struct {
		Usage struct {
			InputTokens int `json:"input_tokens"`
		} `json:"usage"`
	} `json:"message"`
	Usage struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (c *anthropicClient) Stream(
	ctx context.Context, request Context, opts Options, onText func(string) error,
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
	var calls toolCalls
	result := Response{StopReason: StopEnd}
	sawEvent := false

	err = scanSSE(response.Body, func(data []byte) (bool, error) {
		var event anthropicEvent
		if err := json.Unmarshal(data, &event); err != nil {
			return false, fmt.Errorf("decode stream event: %w", err)
		}
		sawEvent = true

		switch event.Type {
		case "message_start":
			result.Usage.InputTokens = event.Message.Usage.InputTokens

		case "content_block_start":
			// The only event carrying a call's id and name; everything after it
			// is arguments.
			if event.ContentBlock.Type == "tool_use" {
				calls.start(event.Index, event.ContentBlock.ID, event.ContentBlock.Name)
			}

		case "content_block_delta":
			switch event.Delta.Type {
			case "text_delta":
				if event.Delta.Text == "" {
					return true, nil
				}
				text.WriteString(event.Delta.Text)
				if err := onText(event.Delta.Text); err != nil {
					return false, err
				}
			case "input_json_delta":
				// Not passed to onText. These are a tool's arguments, not
				// something anybody should be reading as an answer.
				calls.argument(event.Index, event.Delta.PartialJSON)
			}
			// Any other delta is the model's own working, which this package
			// already declines to carry back up.

		case "message_delta":
			if event.Delta.StopReason != "" {
				result.StopReason = anthropicStopReason(event.Delta.StopReason)
			}
			result.Usage.OutputTokens = event.Usage.OutputTokens

		case "error":
			// An error can arrive after a 200: the status is sent before the
			// model has produced anything, so a failure mid-generation has
			// nowhere to go but the stream itself.
			return false, fmt.Errorf("provider error: %s: %s", event.Error.Type, event.Error.Message)
		}

		return true, nil
	})
	if err != nil {
		return Response{}, err
	}

	if !sawEvent {
		return Response{}, fmt.Errorf("provider streamed no events")
	}

	if text.Len() > 0 {
		result.Content = []ContentBlock{TextBlock(text.String())}
	}
	result.Content = append(result.Content, calls.blocks()...)

	return result, nil
}

func anthropicStopReason(reason string) StopReason {
	switch reason {
	case "max_tokens":
		return StopLength
	case "tool_use":
		return StopToolUse
	case "end_turn", "stop_sequence":
		return StopEnd
	default:
		return StopEnd
	}
}
