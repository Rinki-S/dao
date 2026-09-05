package llm

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

// A one-pixel PNG, as base64. The bytes do not matter to either wire — what
// matters is that they arrive whole and wrapped the way that wire expects.
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func withImage() Context {
	return Context{Messages: []Message{{Role: RoleUser, Content: []ContentBlock{
		TextBlock("what is this?"),
		ImageBlock("image/png", pixel, "pixel.png"),
	}}}}
}

func TestAnthropicSendsAnImageAsABase64Source(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"content": [{"type": "text", "text": "a pixel"}],
		"stop_reason": "end_turn", "usage": {"input_tokens": 1, "output_tokens": 1}
	}`)

	if _, err := newClient(t, WireAnthropic, server.URL).Complete(
		context.Background(), withImage(), Options{MaxTokens: 64},
	); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	messages, _ := recorded.body["messages"].([]any)
	blocks, _ := messages[0].(map[string]any)["content"].([]any)
	if len(blocks) != 2 {
		t.Fatalf("sent %d blocks, want the question and the picture", len(blocks))
	}

	image, _ := blocks[1].(map[string]any)
	if image["type"] != "image" {
		t.Fatalf("second block = %v", image)
	}
	source, _ := image["source"].(map[string]any)
	if source["type"] != "base64" || source["media_type"] != "image/png" {
		t.Errorf("source = %v", source)
	}
	if source["data"] != pixel {
		t.Errorf("the bytes did not arrive whole")
	}
}

func TestOpenAISendsAnImageAsADataURL(t *testing.T) {
	server, recorded := serve(t, http.StatusOK,
		`{"choices":[{"message":{"content":"a pixel"},"finish_reason":"stop"}],"usage":{}}`)

	if _, err := newClient(t, WireOpenAI, server.URL).Complete(
		context.Background(), withImage(), Options{MaxTokens: 64},
	); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	messages, _ := recorded.body["messages"].([]any)
	message, _ := messages[0].(map[string]any)

	// A list of parts rather than a string, which is the shape this wire needs
	// the moment a turn stops being only words.
	parts, ok := message["content"].([]any)
	if !ok || len(parts) != 2 {
		t.Fatalf("content = %v, want a text part and an image part", message["content"])
	}
	if first, _ := parts[0].(map[string]any); first["type"] != "text" {
		t.Errorf("first part = %v, want the question", parts[0])
	}

	image, _ := parts[1].(map[string]any)
	url, _ := image["image_url"].(map[string]any)
	// A data: URL, not a link. The bytes are on this machine and a provider
	// handed a localhost URL would be handed nothing.
	if want := "data:image/png;base64," + pixel; url["url"] != want {
		t.Errorf("image url = %v", url["url"])
	}
}

// A turn with no picture in it keeps the string form. Every endpoint claiming
// OpenAI compatibility understands a string; the list is newer, and one sent
// to an endpoint that only reads strings is a turn dropped on the floor.
func TestOpenAIKeepsPlainTurnsAsAString(t *testing.T) {
	server, recorded := serve(t, http.StatusOK,
		`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{}}`)

	if _, err := newClient(t, WireOpenAI, server.URL).Complete(
		context.Background(), request(), Options{MaxTokens: 64},
	); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	messages, _ := recorded.body["messages"].([]any)
	for index, message := range messages {
		if _, isString := message.(map[string]any)["content"].(string); !isString {
			t.Errorf("message %d went as parts, want a plain string", index)
		}
	}
}

func documentContext(extracted string) Context {
	return Context{Messages: []Message{{Role: RoleUser, Content: []ContentBlock{
		TextBlock("summarise this"),
		{
			Kind:      KindDocument,
			MediaType: "application/pdf",
			Data:      "JVBERi0xLjQK",
			Text:      extracted,
			Filename:  "report.pdf",
		},
	}}}}
}

// The sharpest difference between the two wires. Anthropic reads the file
// itself; the OpenAI wire has no such thing, so the same attachment has to
// arrive as words or not at all.
func TestADocumentTravelsDifferentlyOnEachWire(t *testing.T) {
	t.Run("anthropic takes the file", func(t *testing.T) {
		server, recorded := serve(t, http.StatusOK, `{
			"content": [{"type": "text", "text": "ok"}],
			"stop_reason": "end_turn", "usage": {"input_tokens": 1, "output_tokens": 1}
		}`)

		if _, err := newClient(t, WireAnthropic, server.URL).Complete(
			context.Background(), documentContext("the quarter went well"), Options{MaxTokens: 64},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}

		messages, _ := recorded.body["messages"].([]any)
		blocks, _ := messages[0].(map[string]any)["content"].([]any)
		document, _ := blocks[1].(map[string]any)
		if document["type"] != "document" {
			t.Fatalf("second block = %v, want the file itself", document)
		}
		source, _ := document["source"].(map[string]any)
		if source["media_type"] != "application/pdf" || source["data"] != "JVBERi0xLjQK" {
			t.Errorf("source = %v", source)
		}
	})

	t.Run("openai takes the words", func(t *testing.T) {
		server, recorded := serve(t, http.StatusOK,
			`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{}}`)

		if _, err := newClient(t, WireOpenAI, server.URL).Complete(
			context.Background(), documentContext("the quarter went well"), Options{MaxTokens: 64},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}

		messages, _ := recorded.body["messages"].([]any)
		content, _ := messages[0].(map[string]any)["content"].(string)
		if !strings.Contains(content, "the quarter went well") {
			t.Errorf("content = %q, want the extracted words", content)
		}
		// Named, so the model can tell which file it is reading.
		if !strings.Contains(content, "report.pdf") {
			t.Errorf("content = %q, want the file named", content)
		}
	})

	// Nothing could be got out of it. The model has to be told that, or it
	// will describe what a file with that name usually contains.
	t.Run("openai says so when there are no words to send", func(t *testing.T) {
		server, recorded := serve(t, http.StatusOK,
			`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{}}`)

		if _, err := newClient(t, WireOpenAI, server.URL).Complete(
			context.Background(), documentContext(""), Options{MaxTokens: 64},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}

		messages, _ := recorded.body["messages"].([]any)
		content, _ := messages[0].(map[string]any)["content"].(string)
		if !strings.Contains(content, "report.pdf") || !strings.Contains(content, "cannot read") {
			t.Errorf("content = %q, want it to say the file could not be read", content)
		}
	})
}
