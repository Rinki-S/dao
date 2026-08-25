package harness

import (
	"context"
	"errors"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"
)

// One retry, not a loop. A model that answers with something unusable twice in
// a row is telling you about the prompt, and a third attempt spends the user's
// money to learn nothing.
const maxAttempts = 2

// Enough for the schema several times over. Too low is worse than too high:
// a truncated answer is invalid JSON that looks like a model's mistake.
const summaryMaxTokens = 800

var (
	// ErrNothingToday is not a failure. A day with no work in it has nothing
	// to summarise, and saying so costs no tokens.
	ErrNothingToday = errors.New("nothing was touched today")
)

// Runner executes a summary run.
//
// Plain fields rather than an interface: what varies between production and a
// test is which client comes back and what time it is, and both are one
// function each.
type Runner struct {
	Gather    *Gatherer
	Traces    *trace.Repository
	NewClient func() (llm.Client, error)
	// Describe reports where the request is going, for the trace. Recorded
	// with the run because the model behind a base URL can change.
	Describe func() (wire string, model string)
	Now      func() time.Time
}

type SummaryResult struct {
	TraceID  string     `json:"traceId"`
	Date     string     `json:"date"`
	Summary  DaySummary `json:"summary"`
	Included Included   `json:"included"`
}

// SummarizeToday gathers the day, asks the model, checks the answer, and
// records what happened either way.
func (r *Runner) SummarizeToday(ctx context.Context, workspaceID string) (SummaryResult, error) {
	now := r.Now()

	day, err := r.Gather.Today(workspaceID, now)
	if err != nil {
		return SummaryResult{}, err
	}

	request, included := BuildSummaryContext(day)
	if included.Empty() {
		// Nothing to send. No trace either: no run happened, and a table of
		// empty days would bury the runs worth reading.
		return SummaryResult{Date: day.Date, Included: included}, ErrNothingToday
	}

	wire, model := r.Describe()
	record := trace.Record{
		WorkspaceID:   workspaceID,
		Feature:       summaryFeature,
		PromptVersion: SummaryPromptVersion,
		Wire:          wire,
		Model:         model,
		Request:       request,
	}

	client, err := r.NewClient()
	if err != nil {
		// Not configured, or configured wrongly. It never reached the model,
		// so it cost nothing — but it is still a run, and still recorded.
		record.Status = trace.StatusFailed
		record.ErrorMessage = err.Error()
		r.record(record)
		return SummaryResult{Date: day.Date, Included: included}, err
	}

	attempt := request
	var lastErr error

	for i := 1; i <= maxAttempts; i++ {
		record.Attempts = i
		// The context that is recorded is the one actually sent, which on a
		// retry includes the correction. A trace showing only the first
		// request would misrepresent what the model was answering.
		record.Request = attempt

		response, err := client.Complete(ctx, attempt, llm.Options{MaxTokens: summaryMaxTokens})
		// Usage accumulates across attempts: a retry is spent money too.
		record.Usage.InputTokens += response.Usage.InputTokens
		record.Usage.OutputTokens += response.Usage.OutputTokens

		if err != nil {
			// The provider refused or could not be reached. Retrying would
			// hit the same wall — this is not the model's answer being wrong.
			record.Status = trace.StatusFailed
			record.ErrorMessage = err.Error()
			r.record(record)
			return SummaryResult{Date: day.Date, Included: included}, err
		}

		answer := response.Text()
		record.ResponseText = answer

		summary, parseErr := ParseSummary(answer)
		if parseErr == nil {
			record.Status = trace.StatusOK
			record.OutputJSON = mustJSON(summary)
			stored := r.record(record)

			return SummaryResult{
				TraceID:  stored.ID,
				Date:     day.Date,
				Summary:  summary,
				Included: included,
			}, nil
		}

		lastErr = parseErr
		if response.StopReason == llm.StopLength {
			// The answer was cut off rather than badly written. Saying so is
			// more useful than reporting malformed JSON, and it points at the
			// token ceiling rather than at the prompt.
			lastErr = errors.New("the model's answer was cut short")
		}

		if i < maxAttempts {
			attempt = withCorrection(request, answer, lastErr)
		}
	}

	record.Status = trace.StatusInvalid
	record.ErrorMessage = lastErr.Error()
	r.record(record)

	return SummaryResult{Date: day.Date, Included: included}, lastErr
}

// record writes the trace and swallows its error.
//
// A run that produced a usable summary should not be reported as failed
// because the record of it could not be written. The summary is what the user
// asked for; the trace is what we asked for.
func (r *Runner) record(record trace.Record) trace.Trace {
	stored, err := r.Traces.Record(record)
	if err != nil {
		return trace.Trace{}
	}

	return stored
}
