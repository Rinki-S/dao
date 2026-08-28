package events

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestEveryListenerGetsTheMessage(t *testing.T) {
	broker := NewBroker()

	first, stopFirst := broker.Subscribe()
	defer stopFirst()
	second, stopSecond := broker.Subscribe()
	defer stopSecond()

	broker.Publish(WorkspaceChanged)

	for name, listener := range map[string]<-chan string{"first": first, "second": second} {
		select {
		case got := <-listener:
			if got != WorkspaceChanged {
				t.Errorf("%s received %q", name, got)
			}
		case <-time.After(time.Second):
			t.Errorf("%s received nothing", name)
		}
	}
}

// The app runs perfectly well with its window closed, and the watcher must not
// notice the difference.
func TestPublishingToNobodyIsFine(t *testing.T) {
	broker := NewBroker()

	done := make(chan struct{})
	go func() {
		broker.Publish(WorkspaceChanged)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("publishing blocked with no listeners")
	}
}

// A listener that has stopped reading must not be able to hold up the
// filesystem watcher. A missed message costs a refresh; a blocked publish costs
// the app.
func TestASlowListenerDoesNotBlockThePublisher(t *testing.T) {
	broker := NewBroker()

	_, stop := broker.Subscribe()
	defer stop()

	done := make(chan struct{})
	go func() {
		// Far more than the buffer holds, none of them read.
		for range 100 {
			broker.Publish(WorkspaceChanged)
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("a listener that stopped reading blocked the publisher")
	}
}

func TestUnsubscribingTwiceDoesNotPanic(t *testing.T) {
	broker := NewBroker()
	_, stop := broker.Subscribe()

	stop()
	stop()
}

func TestTheStreamOpensAndCarriesMessages(t *testing.T) {
	broker := NewBroker()
	mux := http.NewServeMux()
	NewHandler(broker).RegisterRoutes(mux)

	server := httptest.NewServer(mux)
	defer server.Close()

	response, err := http.Get(server.URL + "/api/events")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer response.Body.Close()

	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("Content-Type = %q", got)
	}

	buffer := make([]byte, 256)

	// The open comment comes first, so a client knows the stream is running
	// rather than merely accepted.
	n, err := response.Body.Read(buffer)
	if err != nil || !strings.Contains(string(buffer[:n]), ": open") {
		t.Fatalf("first read = %q, err = %v", buffer[:n], err)
	}

	// Published after the stream is established, so the read below is the
	// message rather than a race with the greeting.
	go func() {
		time.Sleep(50 * time.Millisecond)
		broker.Publish(WorkspaceChanged)
	}()

	n, err = response.Body.Read(buffer)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(buffer[:n]), "event: "+WorkspaceChanged) {
		t.Errorf("stream carried %q", buffer[:n])
	}
}
