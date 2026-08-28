// Package agent runs a model that can ask for things to be done.
//
// Separate from ai/harness, which runs one shot: gather a fixed context, ask
// once, validate the answer against a schema, record a trace. The loop here has
// no schema and no fixed context — it asks, runs what the model asked for, and
// asks again with the results, until the model has nothing left to ask. The two
// share a model client and nothing else.
package agent

import (
	"context"
	"encoding/json"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Tool is something the model can ask to have run.
//
// Run returns a string because that is what goes back to the model, and the
// model reads. A tool that has structured output still has to decide how to
// say it in a way a reader can act on, and pretending otherwise only moves that
// decision somewhere it is easier to forget.
//
// An error means the tool could not do its job. It is reported to the model
// rather than raised to the caller — see the loop for why — so the message is
// written for the model to act on: what went wrong, and what it might try
// instead.
type Tool interface {
	Definition() llm.ToolDefinition
	Run(ctx context.Context, input json.RawMessage) (string, error)
}

// Definitions is what the tools look like to a model.
func Definitions(tools []Tool) []llm.ToolDefinition {
	definitions := make([]llm.ToolDefinition, 0, len(tools))
	for _, tool := range tools {
		definitions = append(definitions, tool.Definition())
	}

	return definitions
}

// byName indexes the tools for lookup when a call arrives.
//
// Built per run rather than kept, because which tools exist depends on what is
// being asked and of what workspace.
func byName(tools []Tool) map[string]Tool {
	index := make(map[string]Tool, len(tools))
	for _, tool := range tools {
		index[tool.Definition().Name] = tool
	}

	return index
}
