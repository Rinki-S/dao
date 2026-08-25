package harness

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// DaySummary is the shape a summary run must produce.
//
// Small on purpose. Every field is one the reader can check against their own
// day, and a schema the model can satisfy in one short answer fails to
// validate far less often than one with a dozen optional fields.
type DaySummary struct {
	Headline   string   `json:"headline"`
	Highlights []string `json:"highlights"`
	Focus      string   `json:"focus"`
}

const (
	maxHeadlineChars  = 120
	maxHighlights     = 6
	maxHighlightChars = 200
)

var ErrInvalidOutput = errors.New("model output did not match the expected shape")

// Validate is the verification layer for this feature.
//
// Model output is never trusted: it is text that resembles JSON, produced by
// something with no obligation to the schema. Anything that reaches the rest
// of the app has passed through here.
func (s DaySummary) Validate() error {
	headline := strings.TrimSpace(s.Headline)

	switch {
	case headline == "":
		return fmt.Errorf("%w: headline is empty", ErrInvalidOutput)
	case len(headline) > maxHeadlineChars:
		return fmt.Errorf("%w: headline is longer than %d characters", ErrInvalidOutput, maxHeadlineChars)
	case len(s.Highlights) == 0:
		return fmt.Errorf("%w: no highlights", ErrInvalidOutput)
	case len(s.Highlights) > maxHighlights:
		return fmt.Errorf("%w: more than %d highlights", ErrInvalidOutput, maxHighlights)
	}

	for i, highlight := range s.Highlights {
		trimmed := strings.TrimSpace(highlight)
		if trimmed == "" {
			return fmt.Errorf("%w: highlight %d is empty", ErrInvalidOutput, i+1)
		}
		if len(trimmed) > maxHighlightChars {
			return fmt.Errorf("%w: highlight %d is too long", ErrInvalidOutput, i+1)
		}
	}

	return nil
}

// Normalise trims what validated, so trailing whitespace from the model does
// not reach the note a summary may be saved as.
func (s DaySummary) Normalise() DaySummary {
	clean := DaySummary{
		Headline:   strings.TrimSpace(s.Headline),
		Focus:      strings.TrimSpace(s.Focus),
		Highlights: make([]string, 0, len(s.Highlights)),
	}
	for _, highlight := range s.Highlights {
		clean.Highlights = append(clean.Highlights, strings.TrimSpace(highlight))
	}

	return clean
}

// extractJSON finds the JSON object in a model's answer.
//
// Neither wire can be relied on for native structured output: Anthropic has no
// JSON mode, and an endpoint that merely claims OpenAI compatibility usually
// does not implement response_format. So the prompt asks for JSON and this
// copes with what actually comes back — a fenced block, a sentence of
// preamble, or the object on its own.
//
// This is the reason the retry below exists. Asking nicely is not a contract.
func extractJSON(answer string) (string, error) {
	text := strings.TrimSpace(answer)
	if text == "" {
		return "", fmt.Errorf("%w: the model returned nothing", ErrInvalidOutput)
	}

	if fenced, ok := insideFence(text); ok {
		text = fenced
	}

	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start == -1 || end == -1 || end < start {
		return "", fmt.Errorf("%w: no JSON object in the answer", ErrInvalidOutput)
	}

	return text[start : end+1], nil
}

func insideFence(text string) (string, bool) {
	start := strings.Index(text, "```")
	if start == -1 {
		return "", false
	}

	rest := text[start+3:]
	// Drop the language tag, if any: ```json
	if newline := strings.IndexByte(rest, '\n'); newline != -1 {
		rest = rest[newline+1:]
	}

	end := strings.Index(rest, "```")
	if end == -1 {
		// An unterminated fence means the answer was cut off. What is there is
		// still the best candidate.
		return rest, true
	}

	return rest[:end], true
}

// ParseSummary turns a model's answer into a checked summary.
func ParseSummary(answer string) (DaySummary, error) {
	raw, err := extractJSON(answer)
	if err != nil {
		return DaySummary{}, err
	}

	var summary DaySummary
	if err := json.Unmarshal([]byte(raw), &summary); err != nil {
		return DaySummary{}, fmt.Errorf("%w: %s", ErrInvalidOutput, err)
	}

	if err := summary.Validate(); err != nil {
		return DaySummary{}, err
	}

	return summary.Normalise(), nil
}

// Markdown renders a summary for a note. The harness owns this rather than the
// frontend so what gets saved is what the trace recorded, in one shape.
func (s DaySummary) Markdown(date string) string {
	var builder strings.Builder

	fmt.Fprintf(&builder, "# %s\n\n%s\n", date, s.Headline)

	if len(s.Highlights) > 0 {
		builder.WriteString("\n")
		for _, highlight := range s.Highlights {
			fmt.Fprintf(&builder, "- %s\n", highlight)
		}
	}

	if s.Focus != "" {
		fmt.Fprintf(&builder, "\n**Next:** %s\n", s.Focus)
	}

	return builder.String()
}

// mustJSON encodes a value that is known to encode. A summary that just
// validated cannot fail to marshal, and returning an error here would put an
// impossible branch in every caller.
func mustJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}
