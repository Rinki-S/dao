package harness

import (
	"errors"
	"strings"
	"testing"
)

const goodAnswer = `{"headline":"Fixed the parser and started the notes","highlights":["Added error fixtures","Rewrote the recovery path"],"focus":"Write the release notes"}`

func TestParseSummaryAcceptsAPlainObject(t *testing.T) {
	summary, err := ParseSummary(goodAnswer)
	if err != nil {
		t.Fatalf("ParseSummary: %v", err)
	}
	if summary.Headline != "Fixed the parser and started the notes" {
		t.Errorf("Headline = %q", summary.Headline)
	}
	if len(summary.Highlights) != 2 {
		t.Errorf("Highlights = %v", summary.Highlights)
	}
}

func TestParseSummaryCopesWithHowModelsActuallyAnswer(t *testing.T) {
	// None of these is the model misbehaving. Neither wire can be relied on
	// for native structured output, so the answer arrives as prose that
	// happens to contain JSON, and this is the shape of that prose.
	cases := []struct {
		name   string
		answer string
	}{
		{"fenced with a language tag", "```json\n" + goodAnswer + "\n```"},
		{"fenced without one", "```\n" + goodAnswer + "\n```"},
		{"a sentence of preamble", "Sure! Here is the summary:\n\n" + goodAnswer},
		{"preamble and a trailing remark", "Here you go:\n" + goodAnswer + "\nLet me know if you want more."},
		{"leading whitespace", "\n\n  " + goodAnswer},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := ParseSummary(testCase.answer); err != nil {
				t.Errorf("ParseSummary: %v", err)
			}
		})
	}
}

func TestParseSummaryRefusesWhatCannotBeUsed(t *testing.T) {
	cases := []struct {
		name   string
		answer string
	}{
		{"nothing", ""},
		{"prose only", "I had a look at your day and it seems productive."},
		{"cut off mid-object", `{"headline":"Fixed the parser","highlights":["Added`},
		{"no headline", `{"headline":"","highlights":["Something"]}`},
		{"no highlights", `{"headline":"A day","highlights":[]}`},
		{"an empty highlight", `{"headline":"A day","highlights":["Something","  "]}`},
		{"too many highlights", `{"headline":"A day","highlights":["1","2","3","4","5","6","7"]}`},
		{"a headline that is a paragraph", `{"headline":"` + strings.Repeat("a", 200) + `","highlights":["x"]}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := ParseSummary(testCase.answer); !errors.Is(err, ErrInvalidOutput) {
				t.Errorf("error = %v, want ErrInvalidOutput", err)
			}
		})
	}
}

func TestParseSummaryTrimsWhatItAccepts(t *testing.T) {
	// Whitespace from the model would otherwise reach the note a summary is
	// saved as.
	summary, err := ParseSummary(`{"headline":"  A day  ","highlights":["  Something  "],"focus":" Next "}`)
	if err != nil {
		t.Fatalf("ParseSummary: %v", err)
	}

	if summary.Headline != "A day" || summary.Highlights[0] != "Something" || summary.Focus != "Next" {
		t.Errorf("summary = %+v, want trimmed", summary)
	}
}

func TestFocusMayBeEmpty(t *testing.T) {
	// Not every day has an obvious next thing, and forcing one invites the
	// model to invent it.
	if _, err := ParseSummary(`{"headline":"A day","highlights":["Something"],"focus":""}`); err != nil {
		t.Errorf("ParseSummary: %v", err)
	}
}

func TestMarkdownRendersWhatWillBeSaved(t *testing.T) {
	summary, err := ParseSummary(goodAnswer)
	if err != nil {
		t.Fatalf("ParseSummary: %v", err)
	}

	rendered := summary.Markdown("2026-08-25")

	for _, want := range []string{
		"# 2026-08-25",
		"Fixed the parser and started the notes",
		"- Added error fixtures",
		"**Next:** Write the release notes",
	} {
		if !strings.Contains(rendered, want) {
			t.Errorf("Markdown is missing %q:\n%s", want, rendered)
		}
	}
}

func TestMarkdownLeavesOutAnEmptyFocus(t *testing.T) {
	summary, err := ParseSummary(`{"headline":"A day","highlights":["Something"],"focus":""}`)
	if err != nil {
		t.Fatalf("ParseSummary: %v", err)
	}

	if strings.Contains(summary.Markdown("2026-08-25"), "**Next:**") {
		t.Error("an empty focus produced a heading with nothing under it")
	}
}
