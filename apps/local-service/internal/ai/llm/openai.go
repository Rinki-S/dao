package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

func (c *openAIClient) Complete(ctx context.Context, request Context, opts Options) (Response, error) {
	body := openAIRequest{
		Model:     c.config.Model,
		MaxTokens: opts.MaxTokens,
		Messages:  make([]openAIMessage, 0, len(request.Messages)+1),
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
		return Response{}, fmt.Errorf("encode request: %w", err)
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(payload),
	)
	if err != nil {
		return Response{}, fmt.Errorf("build request: %w", err)
	}
	httpRequest.Header.Set("content-type", "application/json")

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
