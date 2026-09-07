// Package attach turns a file on this machine into something a model can be
// shown.
//
// It sits above llm and below the chat: llm knows how each wire carries an
// image or a document, and this knows how to get one out of a file — which
// kinds are worth sending, how large is too large, and what to do about a PDF
// that a wire cannot read. Keeping those apart is what lets a new wire be
// added without teaching it about file extensions, and a new file type be
// added without touching either wire.
package attach

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// maxBytes bounds one attachment.
//
// Not a guess at what a provider accepts — they disagree, and the number that
// matters is smaller than all of them. It is a bound on what this app will
// base64 into memory and post over a wire on somebody's behalf: five megabytes
// of PNG is already an unusual thing to put in a chat message, and the failure
// for anything larger should be a sentence rather than a stalled request.
const maxBytes = 5 << 20

// How a modification time is written down. One constant because the stamping
// and the comparing have to agree exactly — a difference of format is a file
// that always looks changed.
const stampFormat = "2006-01-02T15:04:05Z07:00"

var (
	ErrTooLarge     = errors.New("that file is too large to attach")
	ErrUnsupported  = errors.New("that kind of file cannot be attached")
	ErrEmpty        = errors.New("that file is empty")
	ErrNotAFile     = errors.New("that is not a file")
	ErrChangedSince = errors.New("that file has changed since it was attached")
)

// Attachment is a file as it was when somebody attached it.
//
// Path, Size and ModifiedAt are what gets stored; the bytes are not. That is a
// deliberate choice about where attachments live — nothing is copied, so the
// file on disk stays the only copy — and Size and ModifiedAt are the price of
// it. On a later turn the file is read again, and those two say whether what
// comes back is what was sent. Without them the app would re-read whatever
// happens to be at that path now and present it as what somebody attached.
type Attachment struct {
	Path       string `json:"path"`
	Filename   string `json:"filename"`
	MediaType  string `json:"mediaType"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`

	// Unreadable says the file cannot be replayed as the one that was sent —
	// it has been moved, deleted, or edited since.
	//
	// Derived, never stored, and filled in wherever an attachment comes back
	// out of the database. It is a fact about the disk right now rather than
	// about the turn, so a column holding it would be a column that is wrong
	// as soon as somebody tidies their folder. Same reason a proposal's
	// comparison is computed on the way out rather than written down.
	//
	// It is sent because a transcript that shows a filename as though the file
	// went is a transcript claiming something it cannot check. The model is
	// already told; this is how the person reading is.
	Unreadable bool `json:"unreadable,omitempty"`
}

// Check reports whether the file is still the one that was attached, without
// reading it. Cheap enough to run over a whole conversation on the way out.
func (a Attachment) Check() Attachment {
	info, err := os.Stat(a.Path)
	a.Unreadable = err != nil || info.Size() != a.Size ||
		info.ModTime().UTC().Format(stampFormat) != a.ModifiedAt

	return a
}

// byExtension is what this app will attach, and nothing else.
//
// An allowlist rather than a sniff. What a file is called is a poor guide to
// what is in it, but the question here is not "what is this really" — it is
// "what will this app agree to read into memory and send to a third party",
// and answering that from a fixed list is the only version of it that cannot
// be talked into something by a file's own contents.
var byExtension = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif":  "image/gif",

	".pdf": "application/pdf",

	".md":   "text/markdown",
	".txt":  "text/plain",
	".csv":  "text/csv",
	".json": "application/json",
	".log":  "text/plain",
	".yaml": "text/yaml",
	".yml":  "text/yaml",
}

// MediaTypeOf reports what a path will be treated as, and whether it can be
// attached at all. Exported because the interface has to be able to refuse a
// file before reading it, and refusing on the same rule the reader uses is the
// only way the two cannot disagree.
func MediaTypeOf(path string) (string, bool) {
	mediaType, ok := byExtension[strings.ToLower(filepath.Ext(path))]

	return mediaType, ok
}

// Describe looks at a file without reading it, for the moment somebody picks
// one. It answers with what would be stored, so the interface can show the
// attachment before a turn is sent and refuse an impossible one immediately.
func Describe(path string) (Attachment, error) {
	mediaType, ok := MediaTypeOf(path)
	if !ok {
		return Attachment{}, fmt.Errorf("%w: %s", ErrUnsupported, filepath.Base(path))
	}

	info, err := os.Stat(path)
	if err != nil {
		return Attachment{}, err
	}
	if info.IsDir() {
		return Attachment{}, ErrNotAFile
	}
	if info.Size() == 0 {
		return Attachment{}, ErrEmpty
	}
	if info.Size() > maxBytes {
		return Attachment{}, fmt.Errorf("%w: %s is over %d MB", ErrTooLarge, filepath.Base(path), maxBytes>>20)
	}

	return Attachment{
		Path:       path,
		Filename:   filepath.Base(path),
		MediaType:  mediaType,
		Size:       info.Size(),
		ModifiedAt: info.ModTime().UTC().Format(stampFormat),
	}, nil
}

// Block reads the file and turns it into content for a model.
//
// The attachment it is given is what was recorded when somebody chose the
// file, and the file is checked against it: same size, same modification time.
// A mismatch is refused rather than sent, because the alternative is showing a
// model one file while the transcript names another — and on a second turn,
// silently swapping what everybody has already been talking about.
func Block(attachment Attachment) (llm.ContentBlock, error) {
	info, err := os.Stat(attachment.Path)
	if err != nil {
		return llm.ContentBlock{}, err
	}

	stamp := info.ModTime().UTC().Format(stampFormat)
	if info.Size() != attachment.Size || stamp != attachment.ModifiedAt {
		return llm.ContentBlock{}, fmt.Errorf("%w: %s", ErrChangedSince, attachment.Filename)
	}
	if info.Size() > maxBytes {
		return llm.ContentBlock{}, fmt.Errorf("%w: %s", ErrTooLarge, attachment.Filename)
	}

	raw, err := os.ReadFile(attachment.Path)
	if err != nil {
		return llm.ContentBlock{}, err
	}

	if strings.HasPrefix(attachment.MediaType, "image/") {
		return llm.ImageBlock(
			attachment.MediaType,
			base64.StdEncoding.EncodeToString(raw),
			attachment.Filename,
		), nil
	}

	// A document carries both readings of itself: the file, for a wire that
	// can take one, and its words, for a wire that cannot. Which of the two
	// gets used is decided in llm, by the wire that happens to be configured.
	block := llm.DocumentBlock(
		attachment.MediaType,
		base64.StdEncoding.EncodeToString(raw),
		attachment.Filename,
	)

	if attachment.MediaType == "application/pdf" {
		// Best effort, and it is genuinely only that: text extraction fails on
		// scanned pages, on unusual encodings, and on plenty of ordinary PDFs.
		// A failure here is not an error — the wire that can read the file
		// itself is unaffected, and the one that cannot has a sentence to say
		// about it.
		block.Text = extractPDF(attachment.Path)

		return block, nil
	}

	// Everything else on the list is text already.
	block.Text = string(raw)

	return block, nil
}
