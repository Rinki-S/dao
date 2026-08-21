import { useState } from 'react';
import { IconFolderOpen, IconLeaf } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';

export function WorkingDirectoryOnboarding({
  initialPath = '',
  hasWorkspace = false,
  onCancel,
  onComplete,
}) {
  const [path, setPath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState(hasWorkspace ? '' : 'Personal');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function chooseFolder() {
    if (!window.dao?.selectWorkingDirectory) {
      setError('Choose a folder from the Dao desktop app.');
      return;
    }
    setStatus('choosing');
    try {
      const result = DirectoryPickerResultSchema.parse(await window.dao.selectWorkingDirectory());
      if (!result.canceled) setPath(result.path);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to choose folder');
    } finally {
      setStatus('idle');
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!path || (!hasWorkspace && !workspaceName.trim())) return;
    setStatus('saving');
    setError('');
    try {
      await onComplete({
        path,
        strategy: 'start-fresh',
        workspace: workspaceName.trim() ? { name: workspaceName.trim(), description: '' } : null,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create workspace');
      setStatus('idle');
    }
  }

  return (
    <main className="dao-onboarding app-drag-region">
      <form className="dao-onboarding-card dao-corner app-no-drag" onSubmit={submit}>
        <span className="dao-onboarding-mark dao-corner">
          <IconLeaf aria-hidden="true" />
        </span>
        <p className="dao-eyebrow">A local place for long-term work</p>
        <h1>Start your path with Dao.</h1>
        <p className="dao-onboarding-copy">
          Choose one folder you control. Dao will keep workspaces, project folders, Markdown notes,
          and future formats there.
        </p>
        <button className="dao-directory-picker dao-corner" type="button" onClick={chooseFolder}>
          <IconFolderOpen aria-hidden="true" />
          <span>
            <strong>{path ? 'Working directory' : 'Choose a folder'}</strong>
            <small>{path || 'Nothing leaves this device by default.'}</small>
          </span>
        </button>
        {!hasWorkspace ? (
          <Field>
            <FieldLabel>Workspace name</FieldLabel>
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
          </Field>
        ) : null}
        {error ? (
          <p className="dao-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dao-onboarding-actions">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            disabled={!path || status !== 'idle' || (!hasWorkspace && !workspaceName.trim())}
            type="submit"
          >
            {status === 'saving' ? <Spinner aria-hidden="true" /> : null}
            {status === 'saving' ? 'Preparing Dao…' : 'Continue'}
          </Button>
        </div>
      </form>
    </main>
  );
}
