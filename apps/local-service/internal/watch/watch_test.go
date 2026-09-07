package watch

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"testing"
	"time"
)

// collector gathers the batches a watcher reports.
type collector struct {
	mu      sync.Mutex
	batches [][]string
}

func (c *collector) add(paths []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.batches = append(c.batches, paths)
}

// seen waits for a path to be reported, or gives up. Waiting on the filesystem
// is the only honest way to test this: the events come from the kernel and
// arrive when they arrive.
func (c *collector) seen(t *testing.T, path string) bool {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		for _, batch := range c.batches {
			if slices.Contains(batch, path) {
				c.mu.Unlock()

				return true
			}
		}
		c.mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}

	return false
}

func (c *collector) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return len(c.batches)
}

func start(t *testing.T, root string, ignore func(string) bool) *collector {
	t.Helper()

	found := &collector{}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	if _, err := Watch(ctx, []string{root}, Options{
		OnChange: found.add,
		Ignore:   ignore,
	}); err != nil {
		t.Fatalf("Watch: %v", err)
	}

	return found
}

func TestAFileWrittenOutsideTheAppIsReported(t *testing.T) {
	root := t.TempDir()
	found := start(t, root, nil)

	note := filepath.Join(root, "written-elsewhere.md")
	if err := os.WriteFile(note, []byte("typed in another editor"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !found.seen(t, note) {
		t.Fatal("a file written outside the app went unnoticed")
	}
}

// fsnotify watches a directory, not a tree. A folder that appears after the
// watch started has to be picked up, or everything put in it is invisible.
func TestADirectoryCreatedLaterIsWatchedToo(t *testing.T) {
	root := t.TempDir()
	found := start(t, root, nil)

	nested := filepath.Join(root, "new-project")
	if err := os.Mkdir(nested, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Give the watcher a moment to notice the directory before writing in it.
	time.Sleep(400 * time.Millisecond)

	note := filepath.Join(nested, "inside.md")
	if err := os.WriteFile(note, []byte("in a folder made after the watch"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !found.seen(t, note) {
		t.Fatal("a file in a directory created after the watch went unnoticed")
	}
}

// Saving one file is rarely one event, and the interface should not redraw for
// each of them.
func TestABurstOfWritesIsReportedOnce(t *testing.T) {
	root := t.TempDir()
	found := start(t, root, nil)

	note := filepath.Join(root, "busy.md")
	for range 12 {
		if err := os.WriteFile(note, []byte("revision"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
		time.Sleep(5 * time.Millisecond)
	}

	if !found.seen(t, note) {
		t.Fatal("the file was never reported")
	}
	// One batch for the burst, not twelve. A second batch can legitimately
	// follow if the writes straddled the window, so the bar is "far fewer than
	// the writes" rather than exactly one.
	if batches := found.count(); batches > 3 {
		t.Errorf("reported %d batches for one burst of writes", batches)
	}
}

// The app writes these files itself. Reporting its own save would have the
// interface reload in response to the user's typing.
func TestTheAppsOwnWritesAreNotReported(t *testing.T) {
	root := t.TempDir()

	ours := filepath.Join(root, "ours.md")
	theirs := filepath.Join(root, "theirs.md")

	found := start(t, root, func(path string) bool { return path == ours })

	if err := os.WriteFile(ours, []byte("saved by the app"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.WriteFile(theirs, []byte("saved by a person"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !found.seen(t, theirs) {
		t.Fatal("the other file was never reported, so the test proves nothing")
	}
	if found.seen(t, ours) {
		t.Error("the app was told about its own write")
	}
}

// Watching node_modules is how a watcher runs out of file descriptors.
func TestNoisyDirectoriesAreNotWatched(t *testing.T) {
	root := t.TempDir()

	for _, name := range []string{".git", "node_modules", ".obsidian"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}

	found := start(t, root, nil)

	buried := filepath.Join(root, "node_modules", "package.md")
	if err := os.WriteFile(buried, []byte("not a note"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Something the watcher does care about, so the wait below is not just a
	// timeout that would pass however the code behaved.
	real := filepath.Join(root, "real.md")
	if err := os.WriteFile(real, []byte("a note"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if !found.seen(t, real) {
		t.Fatal("a real note was not reported")
	}

	if found.seen(t, buried) {
		t.Error("something inside node_modules was reported")
	}
}

// A workspace folder that is gone should cost that workspace's live updates,
// not the whole service's startup.
func TestAMissingRootDoesNotStopTheWatch(t *testing.T) {
	root := t.TempDir()
	missing := filepath.Join(root, "not-here")

	found := &collector{}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	if _, err := Watch(ctx, []string{missing, root}, Options{OnChange: found.add}); err != nil {
		t.Fatalf("Watch: %v", err)
	}

	note := filepath.Join(root, "still-watched.md")
	if err := os.WriteFile(note, []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !found.seen(t, note) {
		t.Error("a missing root stopped the rest from being watched")
	}
}
