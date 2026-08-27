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
}

type openAIStreamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
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

	for _, message := range request.Messages {
		text := ""
		for _, block := range message.Content {
			if block.Kind == KindText {
				text += block.Text
			}
		}
		body.Messages = append(body.Messages, openAIMessage{
			Role:    string(message.Role),
			Content: text,
		})
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
	if choice.Message.Content != "" {
		result.Content = []ContentBlock{TextBlock(choice.Message.Content)}
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
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

func (c *openAIClient) Stream(
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
			if choice.Delta.Content == "" {
				continue
			}

			// Accumulated as well as forwarded. The caller streams to a
			// reader, but the whole answer is still what gets stored, and
			// making the caller reassemble it invites two versions of it.
			text.WriteString(choice.Delta.Content)
			if err := onText(choice.Delta.Content); err != nil {
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

	if text.Len() > 0 {
		result.Content = []ContentBlock{TextBlock(text.String())}
	}

	return result, nil
}

func openAIStopReason(reason string) StopReason {
	switch reason {
	case "length":
		return StopLength
	case "stop":
		return StopEnd
	default:
		return StopEnd
	}
}
