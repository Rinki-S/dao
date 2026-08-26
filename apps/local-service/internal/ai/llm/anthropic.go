package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
}

type anthropicMessage struct {
	Role    string             `json:"role"`
	Content []anthropicContent `json:"content"`
}

type anthropicContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
}

type anthropicResponse struct {
	Content    []anthropicContent `json:"content"`
	StopReason string             `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (c *anthropicClient) Complete(ctx context.Context, request Context, opts Options) (Response, error) {
	body := anthropicRequest{
		Model:     c.config.Model,
		MaxTokens: opts.MaxTokens,
		System:    request.SystemPrompt,
		Messages:  make([]anthropicMessage, 0, len(request.Messages)),
	}

	for _, message := range request.Messages {
		content := make([]anthropicContent, 0, len(message.Content))
		for _, block := range message.Content {
			// Reasoning is never sent back up: it is the model's own working,
			// and replaying it across a wire that did not produce it is how
			// contexts get corrupted.
			if block.Kind != KindText {
				continue
			}
			content = append(content, anthropicContent{Type: "text", Text: block.Text})
		}
		body.Messages = append(body.Messages, anthropicMessage{
			Role:    string(message.Role),
			Content: content,
		})
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return Response{}, fmt.Errorf("encode request: %w", err)
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+"/v1/messages", bytes.NewReader(payload),
	)
	if err != nil {
		return Response{}, fmt.Errorf("build request: %w", err)
	}
	httpRequest.Header.Set("content-type", "application/json")
	httpRequest.Header.Set("anthropic-version", anthropicVersion)

	// Authentication goes on last, and can fail: renewing an expired token is
	// a network call, so this is the one header that is not just a string.
	if err := c.config.credential().Apply(ctx, httpRequest); err != nil {
		return Response{}, fmt.Errorf("authenticate request: %w", err)
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
		}
	}

	return result, nil
}

func anthropicStopReason(reason string) StopReason {
	switch reason {
	case "max_tokens":
		return StopLength
	case "end_turn", "stop_sequence":
		return StopEnd
	default:
		return StopEnd
	}
}
