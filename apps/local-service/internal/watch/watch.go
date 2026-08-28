// Package watch reports changes a workspace's folder makes behind the app's
// back.
//
// The app's premise is that notes are ordinary files in an ordinary folder, so
// a person is invited to open that folder — in Finder, in another editor, in
// whatever syncs it between machines. Until something watches it, everything
// they do there is invisible to the app until the next restart, and worse than
// invisible: the app's next autosave writes over it from a copy it read before
// the change.
//
// This is the part that notices. What to do about a change is somebody else's
// decision, which is why the only thing that leaves here is a set of paths.
package watch

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// settle is how long the changes are allowed to keep arriving before they are
// reported.
//
// Saving one file is rarely one event. Editors write to a temporary file and
// rename it over the original, syncing tools touch a directory and then its
// contents, and a copy of a folder arrives as a burst. Reporting each event
// would mean reading the same file several times and telling the interface to
// redraw for every one of them.
const settle = 250 * time.Millisecond

// Options is what a caller decides. Separate from the watcher itself, which
// holds a lock and so is not a thing to pass around by value.
type Options struct {
	// OnChange receives the paths that settled, absolute and de-duplicated.
	// Called from the watcher's own goroutine, one batch at a time, so an
	// implementation does not have to be reentrant.
	OnChange func(paths []string)

	// Ignore reports a path the watcher should say nothing about. The app's own
	// writes come through here: a file this process just saved is a change
	// nobody needs to be told about, and reporting it would have the interface
	// reload in response to its own typing.
	Ignore func(path string) bool
}

// Watcher reports paths that changed under the directories it was given.
type Watcher struct {
	options Options
	watcher *fsnotify.Watcher
	mu      sync.Mutex
	pending map[string]struct{}
}

// Watch starts watching roots and returns once it is running. It stops when the
// context is cancelled.
//
// A failure to watch one root is not a failure to start: a workspace folder
// that has been deleted or unmounted should cost the app that workspace's live
// updates, not its startup.
func Watch(ctx context.Context, roots []string, options Options) (*Watcher, error) {
	created, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		options: options,
		watcher: created,
		pending: map[string]struct{}{},
	}

	for _, root := range roots {
		w.addTree(root)
	}

	go w.run(ctx)

	return w, nil
}

// addTree watches a directory and everything under it.
//
// fsnotify watches one directory, not a tree — on every platform it supports
// except Windows. So the tree is walked once here, and any directory that
// appears later is added when its creation is noticed.
func (w *Watcher) addTree(root string) {
	_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			// A directory that cannot be read is one this app cannot watch.
			// Skipping it is better than abandoning the rest of the tree.
			return nil
		}
		if !entry.IsDir() {
			return nil
		}
		if skipDir(entry.Name()) {
			return filepath.SkipDir
		}

		_ = w.watcher.Add(path)

		return nil
	})
}

// skipDir keeps the watch off directories that are never a workspace's content
// and are often enormous or noisy.
func skipDir(name string) bool {
	switch name {
	case ".git", "node_modules", ".obsidian", ".trash", ".Trash":
		return true
	}

	// Anything else beginning with a dot is configuration or somebody's cache.
	return strings.HasPrefix(name, ".") && name != "."
}

func (w *Watcher) run(ctx context.Context) {
	defer w.watcher.Close()

	// Stopped rather than started: with nothing pending there is nothing to
	// report, and a ticker running all night to find an empty set is a wakeup
	// per interval for the life of the process.
	timer := time.NewTimer(settle)
	if !timer.Stop() {
		<-timer.C
	}
	armed := false

	for {
		select {
		case <-ctx.Done():
			return

		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}

			// A new directory has to be watched too, and its contents may have
			// arrived before this event did — a folder dropped in whole is one
			// create for the folder and none for what is inside it, because
			// nothing was watching yet.
			if event.Has(fsnotify.Create) && isDir(event.Name) {
				w.addTree(event.Name)
			}

			if w.note(event.Name) && !armed {
				timer.Reset(settle)
				armed = true
			}

		case <-timer.C:
			armed = false
			w.flush()

		case _, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			// Errors here are about one path, not about the watch. Dropping
			// one means missing one change, which the next one will cover.
		}
	}
}

// note records a path to report, unless it is one nobody wants to hear about.
func (w *Watcher) note(path string) bool {
	if w.options.Ignore != nil && w.options.Ignore(path) {
		return false
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending[path] = struct{}{}

	return true
}

func (w *Watcher) flush() {
	w.mu.Lock()
	paths := make([]string, 0, len(w.pending))
	for path := range w.pending {
		paths = append(paths, path)
	}
	w.pending = map[string]struct{}{}
	w.mu.Unlock()

	if len(paths) == 0 || w.options.OnChange == nil {
		return
	}

	w.options.OnChange(paths)
}

func isDir(path string) bool {
	info, err := os.Stat(path)

	return err == nil && info.IsDir()
}
