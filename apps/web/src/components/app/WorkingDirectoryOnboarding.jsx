import { useState } from 'react';
import { FolderOpen } from '@nine-thirty-five/material-symbols-react/rounded';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';

export function WorkingDirectoryOnboarding({ onComplete }) {
  const [selectedPath, setSelectedPath] = useState('');
  const [error, setError] = useState('');
  const [isChoosing, setIsChoosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleChooseDirectory() {
    if (!window.dao?.selectWorkingDirectory) {
      setError('Directory picker is only available in the desktop app.');
      return;
    }

    try {
      setIsChoosing(true);
      setError('');

      const result = DirectoryPickerResultSchema.parse(await window.dao.selectWorkingDirectory());

      if (!result.canceled) {
        setSelectedPath(result.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to choose directory');
    } finally {
      setIsChoosing(false);
    }
  }

  async function handleContinue() {
    if (!selectedPath) {
      setError('Choose a working directory before continuing.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onComplete(selectedPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save working directory');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Choose a working directory</CardTitle>
          <CardDescription>
            Dao stores workspace folders, project folders, notes, and future imported files in a
            directory you control.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {selectedPath || 'No directory selected'}
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              disabled={isChoosing || isSaving}
              type="button"
              variant="outline"
              onClick={handleChooseDirectory}
            >
              <FolderOpen data-icon="inline-start" />
              {isChoosing ? 'Choosing...' : 'Choose folder'}
            </Button>
            <Button disabled={!selectedPath || isSaving} type="button" onClick={handleContinue}>
              {isSaving ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
