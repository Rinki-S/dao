package attach

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

func write(t *testing.T, name string, body []byte) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}

	return path
}

func describe(t *testing.T, path string) Attachment {
	t.Helper()

	attachment, err := Describe(path)
	if err != nil {
		t.Fatalf("Describe: %v", err)
	}

	return attachment
}

func TestDescribeRefusesWhatWillNotBeSent(t *testing.T) {
	cases := []struct {
		name string
		file string
		body []byte
		want error
	}{
		{"a kind that is not on the list", "notes.docx", []byte("x"), ErrUnsupported},
		{"an empty file", "empty.txt", nil, ErrEmpty},
		{"something too large", "big.png", make([]byte, maxBytes+1), ErrTooLarge},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := Describe(write(t, testCase.file, testCase.body))
			if !errors.Is(err, testCase.want) {
				t.Errorf("error = %v, want %v", err, testCase.want)
			}
		})
	}
}

func TestDescribeRefusesADirectory(t *testing.T) {
	// It has a name and it has an extension, and neither makes it a file.
	dir := filepath.Join(t.TempDir(), "pictures.png")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if _, err := Describe(dir); !errors.Is(err, ErrNotAFile) {
		t.Errorf("error = %v, want %v", err, ErrNotAFile)
	}
}

func TestAnImageBecomesImageContent(t *testing.T) {
	body := []byte{0x89, 'P', 'N', 'G', 1, 2, 3}
	attachment := describe(t, write(t, "shot.png", body))

	if attachment.MediaType != "image/png" || attachment.Filename != "shot.png" {
		t.Fatalf("attachment = %+v", attachment)
	}

	block, err := Block(attachment)
	if err != nil {
		t.Fatalf("Block: %v", err)
	}
	if block.Kind != llm.KindImage {
		t.Errorf("kind = %q, want %q", block.Kind, llm.KindImage)
	}
	if block.Data != base64.StdEncoding.EncodeToString(body) {
		t.Errorf("the bytes did not survive being encoded")
	}
}

func TestATextFileTravelsAsItsOwnWords(t *testing.T) {
	attachment := describe(t, write(t, "notes.md", []byte("# Title\n\nthe body")))

	block, err := Block(attachment)
	if err != nil {
		t.Fatalf("Block: %v", err)
	}

	if block.Kind != llm.KindDocument {
		t.Errorf("kind = %q, want %q", block.Kind, llm.KindDocument)
	}
	// Both readings, because which one is usable is a property of the endpoint
	// that happens to be configured rather than of the file.
	if block.Text != "# Title\n\nthe body" {
		t.Errorf("text = %q", block.Text)
	}
	if block.Data == "" {
		t.Error("the file itself was not carried")
	}
}

// The whole cost of not copying attachments. The file is read again on a later
// turn, and the only thing standing between "what was attached" and "whatever
// is at that path now" is this check.
func TestAFileEditedSinceItWasAttachedIsRefused(t *testing.T) {
	path := write(t, "shot.png", []byte("original"))
	attachment := describe(t, path)

	// Same length, different content, and a later timestamp — the case a size
	// comparison alone would wave through.
	if err := os.WriteFile(path, []byte("replaced"), 0o600); err != nil {
		t.Fatalf("rewrite: %v", err)
	}
	later := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	if _, err := Block(attachment); !errors.Is(err, ErrChangedSince) {
		t.Errorf("error = %v, want %v", err, ErrChangedSince)
	}
}

func TestAFileDeletedSinceItWasAttachedIsReported(t *testing.T) {
	path := write(t, "shot.png", []byte("gone soon"))
	attachment := describe(t, path)

	if err := os.Remove(path); err != nil {
		t.Fatalf("remove: %v", err)
	}

	// Not a special error of its own: the caller needs to know it cannot be
	// read, and os.ErrNotExist says which way better than a wrapper would.
	if _, err := Block(attachment); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("error = %v, want it to say the file is not there", err)
	}
}

// A PDF nothing can be read out of is not a failure. The wire that takes the
// file itself is unaffected, and the one that cannot has a sentence for it.
func TestAnUnreadablePDFStillCarriesTheFile(t *testing.T) {
	attachment := describe(t, write(t, "scan.pdf", []byte("%PDF-1.4\nnot really a pdf")))

	block, err := Block(attachment)
	if err != nil {
		t.Fatalf("Block: %v", err)
	}
	if block.Kind != llm.KindDocument || block.Data == "" {
		t.Errorf("block = %+v, want the file carried regardless", block)
	}
	if block.Text != "" {
		t.Errorf("text = %q, want nothing rather than nonsense", block.Text)
	}
}
