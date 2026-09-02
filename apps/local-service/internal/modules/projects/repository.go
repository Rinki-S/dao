package projects

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/files"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

// ErrParentNotFound distinguishes an unknown parent folder from an unknown
// folder, which both surface as sql.ErrNoRows otherwise.
var ErrParentNotFound = errors.New("parent project not found")

// ErrParentCycle guards the one move that cannot be represented on disk: a
// folder cannot be placed inside itself or inside its own descendant.
var ErrParentCycle = errors.New("project cannot be moved inside itself")

// ErrFolderNotEmpty says the folder still holds something this app did not put
// there, so deleting it would mean deleting somebody's file as a side effect.
//
// A refusal by design rather than a breakage, and one the person can act on —
// which is why it is a named error carrying the name of what is in the way,
// instead of one more thing that could not be done.
var ErrFolderNotEmpty = errors.New("folder is not empty")

type Repository struct {
	db       *sql.DB
	indexer  search.Indexer
	activity *activities.Repository
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{db: db, indexer: indexer, activity: activity}
}

const projectSelectColumns = `
	id, workspace_id, parent_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
`

func (r *Repository) List() ([]Project, error) {
	rows, err := r.db.Query(`
		SELECT
			` + projectSelectColumns + `
		FROM projects
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}

	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}

		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (r *Repository) Create(req CreateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	id := ulid.Make().String()

	// A folder nests under its parent on disk, so the parent's own path is the
	// root to build from. Without a parent that is the workspace root.
	parentPath, err := r.folderParentPath(req.WorkspaceID, req.ParentID)
	if err != nil {
		return Project{}, err
	}

	folderPath := files.ProjectFolderPath(parentPath, req.Name, "")

	project := Project{
		ID:          id,
		WorkspaceID: req.WorkspaceID,
		ParentID:    req.ParentID,
		Name:        req.Name,
		Description: req.Description,
		FolderPath:  folderPath,
		Status:      "active",
		StartedAt:   nil,
		EndedAt:     nil,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	if err := files.EnsureDir(project.FolderPath); err != nil {
		return Project{}, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
			INSERT INTO projects (
				id, workspace_id, parent_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
			)
			VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			)
		`,
		project.ID,
		project.WorkspaceID,
		project.ParentID,
		project.Name,
		project.Description,
		project.FolderPath,
		project.Status,
		project.StartedAt,
		project.EndedAt,
		project.CreatedAt,
		project.UpdatedAt,
		project.DeletedAt,
		project.Version,
		project.SyncStatus,
	)
	if err != nil {
		return Project{}, err
	}

	projectID := project.ID
	if err := r.indexer.IndexTx(tx, search.IndexEntry{
		EntityType:  "project",
		EntityID:    project.ID,
		WorkspaceID: project.WorkspaceID,
		ProjectID:   &projectID,
		Title:       project.Name,
		Body:        project.Description,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
	}); err != nil {
		return Project{}, err
	}

	metadata, err := json.Marshal(map[string]string{
		"name": project.Name,
	})
	if err != nil {
		return Project{}, err
	}

	if _, err := r.activity.CreateTx(tx, activities.CreateActivityRequest{
		WorkspaceID:  project.WorkspaceID,
		ProjectID:    &projectID,
		EntityType:   "project",
		EntityID:     project.ID,
		Action:       "created",
		MetadataJSON: string(metadata),
	}); err != nil {
		return Project{}, err
	}

	if err := tx.Commit(); err != nil {
		return Project{}, err
	}

	return project, nil
}

func (r *Repository) Update(id string, req UpdateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	project, err := scanProject(r.db.QueryRow(`
		SELECT
			`+projectSelectColumns+`
		FROM projects
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Project{}, err
	}

	if req.Name != nil {
		project.Name = *req.Name
	}
	if req.Description != nil {
		project.Description = *req.Description
	}

	// The name is the directory name and the parent is the directory it sits
	// in, so renaming and reparenting are the same operation: recompute the
	// path. One os.Rename carries every descendant file with it; only the paths
	// recorded for those descendants have to be caught up afterwards.
	previousPath := project.FolderPath
	parentDir := filepath.Dir(previousPath)

	if req.ParentID.Set {
		if req.ParentID.Value != nil && *req.ParentID.Value == project.ID {
			return Project{}, ErrParentCycle
		}

		project.ParentID = req.ParentID.Value

		parentDir, err = r.folderParentPath(project.WorkspaceID, project.ParentID)
		if err != nil {
			return Project{}, err
		}

		// Comparing paths catches a move into any descendant, not just a direct
		// child, without walking the tree.
		if parentDir == previousPath || strings.HasPrefix(parentDir, previousPath+string(os.PathSeparator)) {
			return Project{}, ErrParentCycle
		}
	}

	nextPath := files.ProjectFolderPath(parentDir, project.Name, previousPath)
	moved := nextPath != previousPath

	if moved {
		if err := os.Rename(previousPath, nextPath); err != nil {
			return Project{}, err
		}

		project.FolderPath = nextPath
	}

	committed := false
	defer func() {
		if moved && !committed {
			_ = os.Rename(nextPath, previousPath)
		}
	}()

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
		SET name = ?, description = ?, parent_id = ?, folder_path = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, project.Name, project.Description, project.ParentID, project.FolderPath, now, id)
	if err != nil {
		return Project{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Project{}, err
	}
	if rowsAffected == 0 {
		return Project{}, sql.ErrNoRows
	}

	project.UpdatedAt = now
	project.Version += 1
	project.SyncStatus = "local"

	projectID := project.ID
	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  "project",
		EntityID:    project.ID,
		WorkspaceID: project.WorkspaceID,
		ProjectID:   &projectID,
		Title:       project.Name,
		Body:        project.Description,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
	}); err != nil {
		return Project{}, err
	}

	if moved {
		if err := rewriteDescendantPaths(tx, project.WorkspaceID, previousPath, nextPath); err != nil {
			return Project{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return Project{}, err
	}

	committed = true

	return project, nil
}

// rewriteDescendantPaths moves every stored path that lived under previousPath
// to the same position under nextPath. The directory itself has already been
// moved by a single os.Rename, so the files are in place and only the rows are
// behind.
//
// The prefix match is done in Go rather than with SQL LIKE because a folder
// name is user input: a '%' or '_' in a path would silently widen the pattern.
func rewriteDescendantPaths(tx *sql.Tx, workspaceID string, previousPath string, nextPath string) error {
	prefix := previousPath + string(os.PathSeparator)

	rewrite := func(table string, column string) error {
		rows, err := tx.Query(
			`SELECT id, `+column+` FROM `+table+` WHERE workspace_id = ? AND deleted_at IS NULL`,
			workspaceID,
		)
		if err != nil {
			return err
		}

		type move struct {
			id   string
			path string
		}

		moves := []move{}

		for rows.Next() {
			var id string
			var path string
			if err := rows.Scan(&id, &path); err != nil {
				rows.Close()
				return err
			}

			if strings.HasPrefix(path, prefix) {
				moves = append(moves, move{id: id, path: nextPath + path[len(previousPath):]})
			}
		}

		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}

		// Collected first: SQLite will not take writes on this connection while
		// the read cursor is still open.
		rows.Close()

		for _, item := range moves {
			if _, err := tx.Exec(
				`UPDATE `+table+` SET `+column+` = ? WHERE id = ?`,
				item.path, item.id,
			); err != nil {
				return err
			}
		}

		return nil
	}

	if err := rewrite("projects", "folder_path"); err != nil {
		return err
	}

	return rewrite("notes", "file_path")
}

// Delete removes a folder, and empties its directory before removing that too.
//
// Deleting a folder used to be a change of mind about how notes were filed and
// nothing more: the rows moved, the directory and every file in it stayed
// exactly where they were. So a note the app now listed at the workspace root
// was still sitting in a folder in Finder, and the folder the app said it had
// removed was still there. Both halves of the sentence on the confirm button
// were false.
//
// What the folder held moves up to the workspace root, which is where the rows
// have always said it goes:
//
//   - its notes, unless they were asked for by name, in which case their files
//     go with them
//   - its subfolders, whole — one rename carries everything inside
//
// Then the directory itself, which by now holds nothing the app put there.
//
// The filesystem work happens before the commit, for the reason deleting a note
// does the same: a move that cannot happen has to abort the whole thing rather
// than leave the app describing a folder that is still on disk. Everything
// before the final removal is reversible and is reversed if anything later
// fails.
func (r *Repository) Delete(id string, req DeleteProjectRequest) error {
	var workspaceID, folderPath string
	if err := r.db.QueryRow(`
		SELECT workspace_id, folder_path FROM projects WHERE id = ? AND deleted_at IS NULL
	`, id).Scan(&workspaceID, &folderPath); err != nil {
		return err
	}

	rootPath, err := r.folderParentPath(workspaceID, nil)
	if err != nil {
		return err
	}

	now := time.Now().UTC().Format(time.RFC3339)

	// Undone in reverse if the delete does not reach its commit, so a failure
	// halfway leaves the folder exactly as it was found.
	undo := []func(){}
	committed := false
	defer func() {
		if committed {
			return
		}
		for i := len(undo) - 1; i >= 0; i-- {
			undo[i]()
		}
	}()

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
		SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	// Subfolders first: they are whole directories, and moving one carries
	// every note under it, so the notes handled below are only the ones that
	// were directly in this folder.
	if err := liftSubfolders(tx, &undo, workspaceID, id, rootPath, now); err != nil {
		return err
	}

	if req.DeleteNotes {
		if err := deleteFolderNotes(tx, id, now); err != nil {
			return err
		}
	} else {
		if err := liftFolderNotes(tx, &undo, id, rootPath, now); err != nil {
			return err
		}
	}

	if err := r.indexer.DeleteTx(tx, "project", id); err != nil {
		return err
	}

	if err := removeEmptiedDir(folderPath); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	committed = true

	return nil
}

// liftSubfolders moves a deleted folder's children to the workspace root.
//
// Without this they kept a parent that no longer exists, which took them out of
// the tree the sidebar builds — present in the database, absent from the app,
// and still on disk inside a directory about to be removed.
func liftSubfolders(
	tx *sql.Tx, undo *[]func(), workspaceID string, parentID string, rootPath string, now string,
) error {
	rows, err := tx.Query(`
		SELECT id, name, folder_path FROM projects
		WHERE parent_id = ? AND deleted_at IS NULL
	`, parentID)
	if err != nil {
		return err
	}

	type folder struct{ id, name, path string }
	folders := []folder{}

	for rows.Next() {
		var item folder
		if err := rows.Scan(&item.id, &item.name, &item.path); err != nil {
			rows.Close()
			return err
		}
		folders = append(folders, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	// Collected first: SQLite will not take writes on this connection while the
	// read cursor is still open.
	rows.Close()

	for _, item := range folders {
		nextPath := files.ProjectFolderPath(rootPath, item.name, "")

		if err := os.Rename(item.path, nextPath); err != nil {
			return err
		}

		previousPath, movedTo := item.path, nextPath
		*undo = append(*undo, func() { _ = os.Rename(movedTo, previousPath) })

		if _, err := tx.Exec(`
			UPDATE projects
			SET parent_id = NULL, folder_path = ?, updated_at = ?, version = version + 1,
			    sync_status = 'local'
			WHERE id = ?
		`, nextPath, now, item.id); err != nil {
			return err
		}

		// The directory moved in one go, so everything under it is already in
		// place and only the stored paths are behind.
		if err := rewriteDescendantPaths(tx, workspaceID, item.path, nextPath); err != nil {
			return err
		}
	}

	return nil
}

// liftFolderNotes moves a deleted folder's notes to the workspace root, files
// included. The rows have always said the notes end up there; this is the half
// that makes it true of the folder somebody can actually open.
func liftFolderNotes(
	tx *sql.Tx, undo *[]func(), projectID string, rootPath string, now string,
) error {
	notes, err := folderNotePaths(tx, projectID)
	if err != nil {
		return err
	}

	for id, path := range notes {
		// Keeping the file's own name rather than re-deriving it from the
		// title: the name is what the person sees in Finder, and a note that
		// moved should not also be renamed. Only a collision at the root
		// changes it, and only by a number.
		base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		nextPath := files.FreePath(rootPath, base, ".md", "")

		if err := os.Rename(path, nextPath); err != nil {
			return err
		}

		previousPath, movedTo := path, nextPath
		*undo = append(*undo, func() { _ = os.Rename(movedTo, previousPath) })

		if _, err := tx.Exec(`
			UPDATE notes
			SET project_id = NULL, file_path = ?, updated_at = ?, version = version + 1,
			    sync_status = 'local'
			WHERE id = ?
		`, nextPath, now, id); err != nil {
			return err
		}
	}

	_, err = tx.Exec(`
		UPDATE search_index SET project_id = NULL
		WHERE entity_type = 'note' AND project_id = ?
	`, projectID)

	return err
}

// deleteFolderNotes removes the notes filed in a folder along with it, files
// included — the same bargain a note struck on its own.
func deleteFolderNotes(tx *sql.Tx, projectID string, now string) error {
	notes, err := folderNotePaths(tx, projectID)
	if err != nil {
		return err
	}

	if _, err := tx.Exec(`
		UPDATE notes
		SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE project_id = ? AND deleted_at IS NULL
	`, now, now, projectID); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		DELETE FROM search_index WHERE entity_type = 'note' AND project_id = ?
	`, projectID); err != nil {
		return err
	}

	for _, path := range notes {
		// Already gone is not a failure — somebody deleting it in the folder
		// asked for this in a different way.
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}

	return nil
}

func folderNotePaths(tx *sql.Tx, projectID string) (map[string]string, error) {
	rows, err := tx.Query(`
		SELECT id, file_path FROM notes WHERE project_id = ? AND deleted_at IS NULL
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := map[string]string{}

	for rows.Next() {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			return nil, err
		}
		paths[id] = path
	}

	return paths, rows.Err()
}

// Files the operating system leaves in a directory whether anybody asked for
// them or not. They are regenerated on sight and are not a reason to refuse to
// remove a folder somebody emptied.
var throwawayFiles = map[string]bool{".DS_Store": true, ".localized": true}

// removeEmptiedDir removes a directory the app has just taken its own contents
// out of.
//
// os.Remove rather than os.RemoveAll, and the difference is the whole point: a
// folder still holding something is one holding something this app did not put
// there — a PDF, a scan, a sketch. Refusing to delete the folder is the right
// answer then, and it is an answer the person can act on. Recursively deleting
// their file because it was in the way is not.
func removeEmptiedDir(dir string) error {
	err := os.Remove(dir)
	if err == nil || errors.Is(err, os.ErrNotExist) {
		return nil
	}

	entries, readErr := os.ReadDir(dir)
	if readErr != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || !throwawayFiles[entry.Name()] {
			// Named, because "the folder is not empty" sends somebody looking
			// and "receipt.pdf is still in it" tells them where to look.
			return fmt.Errorf("%w: %s", ErrFolderNotEmpty, entry.Name())
		}
	}

	for _, entry := range entries {
		if removeErr := os.Remove(filepath.Join(dir, entry.Name())); removeErr != nil {
			return err
		}
	}

	return os.Remove(dir)
}

// folderParentPath resolves where a folder's directory lives: inside its
// parent folder, or at the workspace root when it has none.
func (r *Repository) folderParentPath(workspaceID string, parentID *string) (string, error) {
	if parentID != nil {
		var folderPath string
		if err := r.db.QueryRow(`
			SELECT folder_path
			FROM projects
			WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
		`, *parentID, workspaceID).Scan(&folderPath); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrParentNotFound
			}

			return "", err
		}

		return folderPath, nil
	}

	var rootPath string
	if err := r.db.QueryRow(`
		SELECT root_path
		FROM workspaces
		WHERE id = ? AND deleted_at IS NULL
	`, workspaceID).Scan(&rootPath); err != nil {
		return "", err
	}

	return rootPath, nil
}

type projectScanner interface {
	Scan(dest ...any) error
}

func scanProject(scanner projectScanner) (Project, error) {
	var project Project

	if err := scanner.Scan(
		&project.ID,
		&project.WorkspaceID,
		&project.ParentID,
		&project.Name,
		&project.Description,
		&project.FolderPath,
		&project.Status,
		&project.StartedAt,
		&project.EndedAt,
		&project.CreatedAt,
		&project.UpdatedAt,
		&project.DeletedAt,
		&project.Version,
		&project.SyncStatus,
	); err != nil {
		return Project{}, err
	}

	return project, nil
}
