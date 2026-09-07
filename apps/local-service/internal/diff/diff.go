// Package diff says what changed between two texts, by line.
//
// Written here rather than taken from a library because what it is for is
// narrow and the requirement is exact: a person is about to agree to a change
// to their own file, and what they are shown has to be what will happen. A
// dependency would be more general, and the generality is not the part that is
// hard to trust.
//
// By line rather than by word or character. A note is prose and Markdown, both
// of which are read a line at a time, and a word-level diff of a rewritten
// paragraph is a scatter of fragments that is harder to check than the two
// paragraphs side by side.
package diff

import "strings"

// What happened to a line.
const (
	Keep   = "keep"
	Add    = "add"
	Remove = "remove"
)

// Line is one line of the comparison, and what became of it.
type Line struct {
	Op   string `json:"op"`
	Text string `json:"text"`
}

// Lines compares two texts.
//
// Every line of both appears exactly once in the result: kept lines once,
// changed lines as a removal and an addition. Nothing is elided — deciding what
// is worth showing is the interface's business, and a diff that had already
// dropped the context could not be asked for more of it later.
func Lines(before string, after string) []Line {
	beforeLines := split(before)
	afterLines := split(after)

	// The common ends, taken off first.
	//
	// Not only for speed, though it is most of the speed: a targeted edit
	// changes a line or two of a long note, and without this the table below
	// would be the whole note squared. It also keeps the comparison honest —
	// the interesting part is what is left after the parts that plainly did not
	// change.
	var head, tail []Line

	start := 0
	for start < len(beforeLines) && start < len(afterLines) &&
		beforeLines[start] == afterLines[start] {
		head = append(head, Line{Op: Keep, Text: beforeLines[start]})
		start++
	}

	endBefore, endAfter := len(beforeLines), len(afterLines)
	for endBefore > start && endAfter > start &&
		beforeLines[endBefore-1] == afterLines[endAfter-1] {
		endBefore--
		endAfter--
		tail = append([]Line{{Op: Keep, Text: beforeLines[endBefore]}}, tail...)
	}

	middle := longestCommon(beforeLines[start:endBefore], afterLines[start:endAfter])

	result := make([]Line, 0, len(head)+len(middle)+len(tail))
	result = append(result, head...)
	result = append(result, middle...)

	return append(result, tail...)
}

// Changed reports whether anything actually differs, which is not the same
// question as whether the texts are equal — a proposal that turns out to change
// nothing is worth catching before somebody is asked to approve it.
func Changed(lines []Line) bool {
	for _, line := range lines {
		if line.Op != Keep {
			return true
		}
	}

	return false
}

// longestCommon walks the two runs against each other by longest common
// subsequence, which is the standard answer and the right one here: it is the
// comparison that keeps the most lines unchanged, and a line that did not have
// to move should not be shown as having moved.
func longestCommon(before []string, after []string) []Line {
	// lengths[i][j] is the length of the longest common subsequence of
	// before[i:] and after[j:], built from the end backwards so the walk below
	// can go forwards and produce lines in order.
	lengths := make([][]int, len(before)+1)
	for i := range lengths {
		lengths[i] = make([]int, len(after)+1)
	}

	for i := len(before) - 1; i >= 0; i-- {
		for j := len(after) - 1; j >= 0; j-- {
			if before[i] == after[j] {
				lengths[i][j] = lengths[i+1][j+1] + 1
				continue
			}

			lengths[i][j] = max(lengths[i+1][j], lengths[i][j+1])
		}
	}

	lines := []Line{}
	i, j := 0, 0

	for i < len(before) && j < len(after) {
		if before[i] == after[j] {
			lines = append(lines, Line{Op: Keep, Text: before[i]})
			i++
			j++
			continue
		}

		// The removal first, so a changed line reads as the old one replaced by
		// the new one rather than the new one arriving before the old one goes.
		if lengths[i+1][j] >= lengths[i][j+1] {
			lines = append(lines, Line{Op: Remove, Text: before[i]})
			i++
			continue
		}

		lines = append(lines, Line{Op: Add, Text: after[j]})
		j++
	}

	for ; i < len(before); i++ {
		lines = append(lines, Line{Op: Remove, Text: before[i]})
	}
	for ; j < len(after); j++ {
		lines = append(lines, Line{Op: Add, Text: after[j]})
	}

	return lines
}

// split cuts a text into lines.
//
// An empty text is no lines rather than one empty line, so that creating a note
// from nothing does not show a phantom line being removed. A text that ends in
// a newline is also not given a trailing empty line, because every text file
// ends in one and showing it as content would put a spurious line at the end of
// every diff.
func split(text string) []string {
	if text == "" {
		return nil
	}

	return strings.Split(strings.TrimSuffix(text, "\n"), "\n")
}
