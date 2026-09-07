package harness

import (
	"fmt"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Bump whenever the prompt below changes. A trace written by an older build
// would otherwise look as though it came from the prompt in the current
// source, and a comparison across versions would be meaningless.
const SummaryPromptVersion = "1"

const summaryFeature = "summarize-today"

// The system prompt. Built here rather than in a handler or a component, so
// it is one thing, versioned, and readable next to the schema it describes.
//
// The rules are the ones a summary of someone's own day actually needs: no
// invention, no praise, and no restating of the material as though it were a
// finding. A model told only "summarise this" will pad.
const summarySystemPrompt = `You are summarising one day of a developer's own work inside their personal workspace.

You will be given the notes and task list that day changed. Write a short account of what the day contained.

Rules:
- Use only what is in the material. Never invent work that is not there.
- Write plainly. No praise, no encouragement, no filler.
- Say what changed, not what the files are.
- If the material is thin, say little. A short honest summary is correct.

Reply with a single JSON object and nothing else:

{
  "headline": "one sentence, under 120 characters, describing the day",
  "highlights": ["1 to 6 short lines, each a concrete thing that happened"],
  "focus": "one sentence on what is unfinished or next, or an empty string"
}`

// BuildSummaryContext assembles the request for a day.
func BuildSummaryContext(day Day) (llm.Context, Included) {
	rendered, included := RenderDay(day)

	return llm.Context{
		SystemPrompt: summarySystemPrompt,
		Messages: []llm.Message{
			llm.UserText(fmt.Sprintf("Here is what changed today.\n\n%s", rendered)),
		},
	}, included
}

// withCorrection appends the failed answer and what was wrong with it.
//
// This is what makes the retry worth making. Asking the same question again
// invites the same answer; showing the model its own output and the specific
// complaint gives it something to correct. The failure becomes part of the
// context rather than being thrown away.
func withCorrection(request llm.Context, answer string, reason error) llm.Context {
	corrected := request
	corrected.Messages = append(append([]llm.Message{}, request.Messages...),
		llm.Message{
			Role:    llm.RoleAssistant,
			Content: []llm.ContentBlock{llm.TextBlock(answer)},
		},
		llm.UserText(fmt.Sprintf(
			"That reply could not be used: %s.\n\nReply again with only the JSON object described above. No explanation, no code fence.",
			reason,
		)),
	)

	return corrected
}
