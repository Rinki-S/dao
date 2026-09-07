package diff

import (
	"strings"
	"testing"
)

// A compact rendering, so a test can say what it expects the way somebody
// reading a diff would.
func render(lines []Line) string {
	var out strings.Builder

	for _, line := range lines {
		switch line.Op {
		case Add:
			out.WriteString("+")
		case Remove:
			out.WriteString("-")
		default:
			out.WriteString(" ")
		}
		out.WriteString(line.Text)
		out.WriteString("\n")
	}

	return out.String()
}

func TestOneChangedLineInTheMiddle(t *testing.T) {
	got := render(Lines(
		"# Kestrel\n\nListens on 8080.\n\nRetries three times.\n",
		"# Kestrel\n\nListens on 7743.\n\nRetries three times.\n",
	))

	// The removal before the addition: a changed line reads as the old one
	// replaced by the new one, not the new one arriving before the old one
	// goes.
	want := " # Kestrel\n" +
		" \n" +
		"-Listens on 8080.\n" +
		"+Listens on 7743.\n" +
		" \n" +
		" Retries three times.\n"

	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

// Every line of both texts appears exactly once. Deciding what is worth showing
// is the interface's business, and a diff that had already dropped the context
// could not be asked for more of it later.
func TestNothingIsElided(t *testing.T) {
	before := "a\nb\nc\nd\ne\nf\ng\nh\n"
	after := "a\nb\nc\nX\ne\nf\ng\nh\n"

	lines := Lines(before, after)

	kept := 0
	for _, line := range lines {
		if line.Op == Keep {
			kept++
		}
	}

	if kept != 7 {
		t.Errorf("kept %d lines of the 7 that did not change:\n%s", kept, render(lines))
	}
}

func TestAddingToTheEnd(t *testing.T) {
	got := render(Lines("one\ntwo\n", "one\ntwo\nthree\n"))
	want := " one\n two\n+three\n"

	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestRemovingFromTheMiddle(t *testing.T) {
	got := render(Lines("one\ntwo\nthree\n", "one\nthree\n"))
	want := " one\n-two\n three\n"

	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

// The comparison that keeps the most lines unchanged. A line that did not have
// to move should not be shown as having moved.
func TestARepeatedLineIsNotShownAsMoving(t *testing.T) {
	lines := Lines(
		"- [ ] one\n- [ ] two\n",
		"- [ ] one\n- [ ] one and a half\n- [ ] two\n",
	)

	if render(lines) != " - [ ] one\n+- [ ] one and a half\n - [ ] two\n" {
		t.Errorf("got:\n%s", render(lines))
	}
}

// Creating a note from nothing. An empty text is no lines rather than one empty
// line, or the diff opens by removing a line that was never there.
func TestFromNothing(t *testing.T) {
	got := render(Lines("", "# New\n\nSomething.\n"))
	want := "+# New\n+\n+Something.\n"

	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestToNothing(t *testing.T) {
	got := render(Lines("gone\n", ""))

	if got != "-gone\n" {
		t.Errorf("got:\n%s", got)
	}
}

// Every text file ends in a newline, and showing it as content would put a
// spurious line at the end of every diff.
func TestATrailingNewlineIsNotALine(t *testing.T) {
	lines := Lines("one\n", "one\n")

	if len(lines) != 1 || lines[0].Text != "one" {
		t.Errorf("got %+v", lines)
	}
}

func TestNoChangeIsNoChange(t *testing.T) {
	if Changed(Lines("same\ntext\n", "same\ntext\n")) {
		t.Error("identical texts reported a change")
	}
	if !Changed(Lines("same\n", "different\n")) {
		t.Error("a real change reported none")
	}
}

// A whole-file rewrite still has to come out as a diff rather than as nothing,
// and every line has to be accounted for.
func TestARewriteReplacesEveryLine(t *testing.T) {
	lines := Lines("a\nb\nc\n", "x\ny\nz\n")

	removed, added := 0, 0
	for _, line := range lines {
		switch line.Op {
		case Remove:
			removed++
		case Add:
			added++
		}
	}

	if removed != 3 || added != 3 {
		t.Errorf("removed %d, added %d:\n%s", removed, added, render(lines))
	}
}

// The common ends are taken off before the table is built, which is most of the
// speed. This is the shape that would be slowest without it.
func TestALongNoteWithOneChangedLine(t *testing.T) {
	var before, after strings.Builder
	for i := range 5000 {
		line := "line of a long note\n"
		before.WriteString(line)
		if i == 2500 {
			after.WriteString("the one that changed\n")
			continue
		}
		after.WriteString(line)
	}

	lines := Lines(before.String(), after.String())

	if len(lines) != 5001 {
		t.Fatalf("got %d lines, want 5001", len(lines))
	}
	if !Changed(lines) {
		t.Error("the change was lost")
	}
}
