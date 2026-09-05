package attach

import (
	"io"
	"strings"

	"github.com/ledongthuc/pdf"
)

// extractPDF gets what words it can out of a PDF, and returns none rather than
// failing.
//
// Kept in a file of its own because it is the one part of this package that is
// somebody else's problem badly solved. Pure-Go PDF text extraction handles
// ordinary text documents and does not handle a scan, a form, or a file whose
// fonts carry no usable encoding — and there is no reliable way to tell which
// kind you have short of trying. So this tries, and an empty answer is a
// perfectly good outcome: the Anthropic wire never needed it, and the other
// one says in words that the file could not be read.
//
// The library panics on some malformed files rather than returning an error,
// which is why there is a recover here. A chat message must not be able to
// take the service down by having the wrong PDF attached to it.
func extractPDF(path string) (text string) {
	defer func() {
		if recover() != nil {
			text = ""
		}
	}()

	file, reader, err := pdf.Open(path)
	if err != nil {
		return ""
	}
	defer file.Close()

	plain, err := reader.GetPlainText()
	if err != nil {
		return ""
	}

	var builder strings.Builder
	if _, err := io.Copy(&builder, plain); err != nil {
		return ""
	}

	// Whitespace only is the shape a failed extraction usually takes — the
	// pages were found and nothing legible came out of them. That is the same
	// outcome as not having read it, and should be reported as such rather
	// than sent as an attachment made of spaces.
	if strings.TrimSpace(builder.String()) == "" {
		return ""
	}

	return builder.String()
}
