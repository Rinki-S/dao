// Package events tells the interface that something changed underneath it.
//
// One direction only, and one word per message. The renderer already knows how
// to fetch everything it needs; what it cannot know is when. So this carries
// the "when" and nothing else — no payload, no diff, no ordering guarantees —
// and the renderer answers it by asking for what it wants the ordinary way.
//
// That keeps the two halves from having to agree on a second description of the
// same data, which is the thing that goes stale.
package events

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// WorkspaceChanged is sent when the workspace folder stopped matching what the
// app had last read from it.
const WorkspaceChanged = "workspace"

// keepAlive is how often a comment goes down an idle stream.
//
// A connection with nothing on it is indistinguishable from a broken one, and
// something between the browser and this process will eventually close it. A
// comment line is the cheapest thing that is not silence.
const keepAlive = 25 * time.Second

// Broker fans one message out to every listener.
type Broker struct {
	mu        sync.Mutex
	listeners map[chan string]struct{}
}

func NewBroker() *Broker {
	return &Broker{listeners: map[chan string]struct{}{}}
}

// Subscribe returns a channel of messages and a function that stops it.
func (b *Broker) Subscribe() (<-chan string, func()) {
	// Buffered, and dropped rather than blocked on below. A listener that has
	// stopped reading must not be able to hold up the filesystem watcher, and
	// a missed message costs a refresh that the next message will ask for
	// anyway.
	listener := make(chan string, 8)

	b.mu.Lock()
	b.listeners[listener] = struct{}{}
	b.mu.Unlock()

	return listener, func() {
		b.mu.Lock()
		defer b.mu.Unlock()

		if _, open := b.listeners[listener]; open {
			delete(b.listeners, listener)
			close(listener)
		}
	}
}

// Publish sends a message to everyone listening, and to nobody if there is no
// one — the app runs perfectly well with its window closed.
func (b *Broker) Publish(message string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for listener := range b.listeners {
		select {
		case listener <- message:
		default:
		}
	}
}

// Handler streams the broker's messages as server-sent events.
type Handler struct {
	broker *Broker
}

func NewHandler(broker *Broker) *Handler {
	return &Handler{broker: broker}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/events", h.stream)
}

func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "this connection cannot stream", http.StatusInternalServerError)
		return
	}

	messages, unsubscribe := h.broker.Subscribe()
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	// Sent before anything else so a client knows the stream is open rather
	// than merely accepted, which are different things through a proxy.
	fmt.Fprint(w, ": open\n\n")
	flusher.Flush()

	ticker := time.NewTicker(keepAlive)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return

		case message, open := <-messages:
			if !open {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: {}\n\n", message)
			flusher.Flush()

		case <-ticker.C:
			fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}
