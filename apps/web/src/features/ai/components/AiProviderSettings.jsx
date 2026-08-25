import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { waitForAllPendingNoteSaves } from '@/features/notes/note-save-queue.js';
import {
  getModelKeyStatus,
  getProviderSettings,
  removeModelApiKey,
  saveModelApiKey,
  updateProviderSettings,
} from '../api.js';
import { PROVIDER_WIRES, WIRE_LABELS } from '../schemas.js';

const WIRE_OPTIONS = PROVIDER_WIRES.map((value) => ({ label: WIRE_LABELS[value], value }));

// Named so the reader can check it against what they are about to enable. A
// local-first app that starts sending a workspace to a third party owes the
// person a plain list of what leaves, not a paragraph of assurance.
const CONTENT_SENT = [
  'What you did today: which notes and tasks you touched, and when',
  'The text of the notes and tasks that day touched',
  'Nothing from other workspaces, and nothing from days you did not ask about',
];

function StatusLine({ tone, children }) {
  if (!children) return null;

  const Icon = tone === 'error' ? IconAlertTriangle : IconCheck;

  return (
    <p
      className={
        tone === 'error'
          ? 'flex items-center gap-1.5 text-destructive text-sm'
          : 'flex items-center gap-1.5 text-muted-foreground text-sm'
      }
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Where Dao's model lives, and what leaves this machine to reach it.
 *
 * The key is write-only throughout: it is typed here, handed to the desktop
 * bridge, and never read back. Once one is stored the field shows that a key
 * exists and offers to replace it, because there is nothing to display.
 */
export function AiProviderSettings() {
  const [settings, setSettings] = useState(null);
  const [keyStatus, setKeyStatus] = useState({ available: false, present: false });
  const [wire, setWire] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([getProviderSettings(), getModelKeyStatus()])
      .then(([provider, key]) => {
        if (!active) return;
        setSettings(provider);
        setKeyStatus(key);
        setWire(provider.wire || 'openai');
        setBaseUrl(provider.baseUrl);
        setModelName(provider.model);
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to read settings');
      });

    return () => {
      active = false;
    };
  }, []);

  async function save(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      const saved = await updateProviderSettings({ wire, baseUrl, model: modelName });

      // Saving a key restarts the service, so any note mid-flight is flushed
      // first — the same care the working-directory change takes.
      if (apiKey.trim()) {
        await waitForAllPendingNoteSaves();
        const result = await saveModelApiKey(apiKey);
        if (!result.ok) {
          setStatus('error');
          setMessage(result.error);
          return;
        }
        setApiKey('');
        setKeyStatus((current) => ({ ...current, present: true }));
      }

      setSettings(saved);
      setStatus('saved');
      setMessage('Saved');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save');
    }
  }

  async function forgetKey() {
    setStatus('saving');
    await waitForAllPendingNoteSaves();
    const result = await removeModelApiKey();

    if (!result.ok) {
      setStatus('error');
      setMessage(result.error);
      return;
    }

    setKeyStatus((current) => ({ ...current, present: false }));
    setSettings((current) =>
      current ? { ...current, keyPresent: false, configured: false } : current,
    );
    setStatus('saved');
    setMessage('Key removed');
  }

  if (!settings) {
    return <p className="py-4 text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <form className="flex flex-col gap-4 py-1" onSubmit={save}>
      <Field>
        <FieldLabel>Provider format</FieldLabel>
        <Select items={WIRE_OPTIONS} value={wire} onValueChange={setWire}>
          <SelectTrigger aria-label="Provider format" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {WIRE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <p className="text-muted-foreground text-sm">
          Most providers speak the OpenAI format, including local ones.
        </p>
      </Field>

      <Field>
        <FieldLabel>Base URL</FieldLabel>
        <Input
          placeholder="https://api.anthropic.com"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel>Model</FieldLabel>
        <Input
          placeholder="claude-sonnet-4-5"
          value={modelName}
          onChange={(event) => setModelName(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel>API key</FieldLabel>
        <Input
          autoComplete="off"
          placeholder={keyStatus.present ? 'Stored — type to replace' : 'sk-…'}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <p className="text-muted-foreground text-sm">
          {keyStatus.available
            ? 'Encrypted by macOS and never shown again. Saving one restarts the local service.'
            : 'This system cannot store secrets securely, so no key can be saved.'}
        </p>
      </Field>

      <div className="rounded-md border p-3">
        <p className="font-medium text-sm">What leaves this device</p>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 ps-4 text-muted-foreground text-sm">
          {CONTENT_SENT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4">
        <StatusLine tone={status === 'error' ? 'error' : 'ok'}>{message}</StatusLine>
        <div className="flex shrink-0 gap-2">
          {keyStatus.present ? (
            <Button size="sm" type="button" variant="ghost" onClick={forgetKey}>
              Forget key
            </Button>
          ) : null}
          <Button loading={status === 'saving'} size="sm" type="submit">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
