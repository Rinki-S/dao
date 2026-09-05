package chats

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/attach"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

func attachedFile(t *testing.T, name string, body []byte) attach.Attachment {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	attachment, err := attach.Describe(path)
	if err != nil {
		t.Fatalf("Describe: %v", err)
	}

	return attachment
}

// A picture and no words is a message. Left to the emptiness check that keeps
// half-written assistant rows out of the request, it would have been dropped
// before the model ever saw it.
func TestATurnThatIsOnlyAnAttachmentIsStillSent(t *testing.T) {
	picture := attachedFile(t, "shot.png", []byte{0x89, 'P', 'N', 'G'})

	context := BuildContext([]Message{
		{Role: "user", Content: "", Attachments: []attach.Attachment{picture}},
	})

	if len(context.Messages) != 1 {
		t.Fatalf("got %d messages, want the turn kept", len(context.Messages))
	}
	if got := context.Messages[0].Content[0].Kind; got != llm.KindImage {
		t.Errorf("block kind = %q, want the picture", got)
	}
}

func TestAnAttachmentIsReplayedBesideTheWordsItCameWith(t *testing.T) {
	picture := attachedFile(t, "shot.png", []byte{0x89, 'P', 'N', 'G'})

	context := BuildContext([]Message{
		{Role: "user", Content: "what is this?", Attachments: []attach.Attachment{picture}},
	})

	blocks := context.Messages[0].Content
	if len(blocks) != 2 {
		t.Fatalf("got %d blocks, want the question and the picture", len(blocks))
	}
	if blocks[0].Kind != llm.KindText || blocks[1].Kind != llm.KindImage {
		t.Errorf("blocks = %+v", blocks)
	}
	if blocks[1].Data == "" {
		t.Error("the picture was replayed with no bytes in it")
	}
}

// The cost of not copying, and the reason a size and a time are stored beside
// the path. The model is told, in the place the file would have been, rather
// than being handed whatever is at that path now — or nothing at all.
func TestAFileThatChangedSinceItWasAttachedIsReplayedAsASentence(t *testing.T) {
	picture := attachedFile(t, "shot.png", []byte("original"))

	if err := os.WriteFile(picture.Path, []byte("replaced"), 0o600); err != nil {
		t.Fatalf("rewrite: %v", err)
	}
	later := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(picture.Path, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	context := BuildContext([]Message{
		{Role: "user", Content: "what is this?", Attachments: []attach.Attachment{picture}},
	})

	blocks := context.Messages[0].Content
	if len(blocks) != 2 {
		t.Fatalf("got %d blocks, want the question and something in the picture's place", len(blocks))
	}

	// Words, not an image, and not silence. A model asked a follow-up about a
	// picture it can no longer see, and told nothing, answers as confidently
	// as it did when it could.
	if blocks[1].Kind != llm.KindText {
		t.Fatalf("second block = %+v, want a sentence", blocks[1])
	}
	if !strings.Contains(blocks[1].Text, "shot.png") {
		t.Errorf("text = %q, want the file named", blocks[1].Text)
	}
}

func TestAnAttachmentSurvivesBeingStoredAndReadBack(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)
	picture := attachedFile(t, "shot.png", []byte{0x89, 'P', 'N', 'G'})

	if _, err := repo.Append(conversation.ID, Message{
		Role:        RoleUser,
		Content:     "what is this?",
		Attachments: []attach.Attachment{picture},
	}); err != nil {
		t.Fatalf("Append: %v", err)
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored[0].Attachments) != 1 {
		t.Fatalf("stored attachments = %+v", stored[0].Attachments)
	}

	// Every field the replay check depends on. A row that came back without
	// the size or the time would re-read the path and believe whatever it
	// found there.
	got := stored[0].Attachments[0]
	if got.Path != picture.Path || got.Filename != "shot.png" {
		t.Errorf("attachment = %+v", got)
	}
	if got.Size != picture.Size || got.ModifiedAt != picture.ModifiedAt {
		t.Errorf("attachment = %+v, want the size and time it was attached with", got)
	}
	if got.MediaType != "image/png" {
		t.Errorf("media type = %q", got.MediaType)
	}
}
