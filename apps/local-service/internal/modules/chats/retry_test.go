package chats

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
)

// A conversation whose last turn failed, which is the only shape a retry
// applies to.
func brokenTurn(t *testing.T, repo *Repository, conversationID string) Message {
	t.Helper()

	if _, err := repo.Append(conversationID, Message{
		Role:    RoleUser,
		Content: "what did I write?",
	}); err != nil {
		t.Fatalf("Append: %v", err)
	}

	failed, err := repo.Append(conversationID, Message{
		Role:         RoleAssistant,
		Status:       StatusFailed,
		ErrorMessage: "provider returned 429: slow down",
	})
	if err != nil {
		t.Fatalf("Append: %v", err)
	}

	return failed
}

func retry(t *testing.T, handler *Handler, conversationID, messageID string) *httptest.ResponseRecorder {
	t.Helper()

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/chats/"+conversationID+"/messages/"+messageID+"/retry",
		nil,
	)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	return recorder
}

func TestRetryAnswersIntoTheTurnThatFailed(t *testing.T) {
	fake := llmtest.Streamed("The answer, second time.", 2)
	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)
	failed := brokenTurn(t, repo, conversation.ID)

	recorder := retry(t, handler, conversation.ID, failed.ID)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}

	var final Message
	lastData(t, parseEvents(t, recorder.Body.String()), &final)
	if final.ID != failed.ID {
		t.Errorf("the reply landed on %q, want the row that failed", final.ID)
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}

	// Two turns, not three. Sending the question again would work and would
	// leave the transcript holding it twice with a dead turn between.
	if len(stored) != 2 {
		t.Fatalf("stored %d messages, want the question and one reply", len(stored))
	}
	if stored[1].Content != "The answer, second time." {
		t.Errorf("reply = %q", stored[1].Content)
	}
	if stored[1].Status != StatusOK {
		t.Errorf("status = %q, want the failure cleared", stored[1].Status)
	}
	if stored[1].ErrorMessage != "" {
		t.Errorf("error message = %q, want it gone", stored[1].ErrorMessage)
	}
}

// The failed row holds whatever arrived before it broke. Handing the model
// half of its own last answer would have it carry on from a sentence it never
// finished.
func TestRetryDoesNotSendTheHalfAnswerBack(t *testing.T) {
	fake := llmtest.Streamed("A whole answer.", 1)
	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	if _, err := repo.Append(conversation.ID, Message{Role: RoleUser, Content: "a question"}); err != nil {
		t.Fatalf("Append: %v", err)
	}
	failed, err := repo.Append(conversation.ID, Message{
		Role:         RoleAssistant,
		Content:      "Half an ans",
		Status:       StatusFailed,
		ErrorMessage: "the stream died",
	})
	if err != nil {
		t.Fatalf("Append: %v", err)
	}

	retry(t, handler, conversation.ID, failed.ID)

	asked := fake.Requests[0].Messages
	if len(asked) != 1 {
		t.Fatalf("asked with %d messages, want the question alone", len(asked))
	}
	if asked[0].Role != llm.RoleUser {
		t.Errorf("asked with %+v, want only what was said before the failure", asked[0])
	}
}

func TestRetryRefusesWhatIsNotARetry(t *testing.T) {
	cases := []struct {
		name  string
		build func(t *testing.T, repo *Repository, conversationID string) string
	}{
		{
			// Asking again for a turn somebody ended would be answering their
			// decision with its opposite.
			name: "a reply that was stopped on purpose",
			build: func(t *testing.T, repo *Repository, conversationID string) string {
				stopped, err := repo.Append(conversationID, Message{
					Role: RoleAssistant, Content: "half", Status: StatusStopped,
				})
				if err != nil {
					t.Fatalf("Append: %v", err)
				}

				return stopped.ID
			},
		},
		{
			name: "a reply that arrived",
			build: func(t *testing.T, repo *Repository, conversationID string) string {
				ok, err := repo.Append(conversationID, Message{
					Role: RoleAssistant, Content: "an answer", Status: StatusOK,
				})
				if err != nil {
					t.Fatalf("Append: %v", err)
				}

				return ok.ID
			},
		},
		{
			// Everything after it would still be replying to the turn that
			// got replaced.
			name: "a failed turn that is no longer the last one",
			build: func(t *testing.T, repo *Repository, conversationID string) string {
				failed, err := repo.Append(conversationID, Message{
					Role: RoleAssistant, Status: StatusFailed, ErrorMessage: "broke",
				})
				if err != nil {
					t.Fatalf("Append: %v", err)
				}
				if _, err := repo.Append(conversationID, Message{
					Role: RoleUser, Content: "never mind, something else",
				}); err != nil {
					t.Fatalf("Append: %v", err)
				}

				return failed.ID
			},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fake := llmtest.Streamed("should not be asked", 1)
			handler, repo := newHandler(t, fake, nil)
			conversation := newConversation(t, repo)

			messageID := testCase.build(t, repo, conversation.ID)

			recorder := retry(t, handler, conversation.ID, messageID)
			if recorder.Code != http.StatusConflict {
				t.Errorf("status = %d, want 409", recorder.Code)
			}
			if fake.Calls() != 0 {
				t.Errorf("the model was asked %d times, want none", fake.Calls())
			}
		})
	}
}
