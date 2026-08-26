import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconCheck, IconCircleCheck } from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
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
import {
  connectOAuthProvider,
  getModelKeyStatus,
  getProviderSettings,
  listOAuthProviders,
  onCredentialEvent,
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
  const [keyStatus, setKeyStatus] = useState({
    available: false,
    present: false,
    kind: '',
    provider: '',
    expires: '',
  });
  const [providers, setProviders] = useState([]);
  const [wire, setWire] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState('');
  const [reconnectNeeded, setReconnectNeeded] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([getProviderSettings(), getModelKeyStatus(), listOAuthProviders()])
      .then(([provider, key, available]) => {
        if (!active) return;
        setSettings(provider);
        setKeyStatus(key);
        setProviders(available);
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

  // Renewal runs on a timer in the main process, so this panel is told about
  // it rather than asking. The only outcome worth interrupting for is one the
  // user has to act on.
  useEffect(
    () =>
      onCredentialEvent((event) => {
        if (event.type === 'needs-reconnect') {
          setReconnectNeeded(event.error);
        }
        if (event.type === 'refreshed') {
          setReconnectNeeded('');
          setKeyStatus((current) => ({ ...current, expires: event.expires }));
        }
      }),
    [],
  );

  async function save(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      const saved = await updateProviderSettings({ wire, baseUrl, model: modelName });

      // The key is handed to the running service rather than restarting it,
      // so there is no longer a note mid-flight to flush first.
      if (apiKey.trim()) {
        const result = await saveModelApiKey(apiKey);
        if (!result.ok) {
          setStatus('error');
          setMessage(result.error);
          return;
        }
        setApiKey('');
        setKeyStatus((current) => ({ ...current, present: true, kind: 'api-key', provider: '' }));
        setReconnectNeeded('');
      }

      setSettings(saved);
      setStatus('saved');
      setMessage('Saved');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save');
    }
  }

  /**
   * Sign in to a provider, then point Dao at where that credential works.
   *
   * The endpoint has to follow rather than lead: saving settings requires a
   * model, and a first-time user has not chosen one yet. So the defaults are
   * filled into the form, and persisted only when there is already a model to
   * persist them with — otherwise the user is asked for the one choice
   * signing in cannot make for them.
   */
  async function signIn(provider) {
    setConnecting(provider.id);
    setStatus('saving');
    setMessage('');
    setReconnectNeeded('');

    try {
      const result = await connectOAuthProvider(provider.id);

      if (!result.ok) {
        setStatus('error');
        setMessage(result.error);
        return;
      }

      setWire(provider.defaults.wire);
      setBaseUrl(provider.defaults.baseUrl);
      setApiKey('');
      setKeyStatus(await getModelKeyStatus());

      if (modelName.trim()) {
        setSettings(
          await updateProviderSettings({
            wire: provider.defaults.wire,
            baseUrl: provider.defaults.baseUrl,
            model: modelName,
          }),
        );
        setStatus('saved');
        // Not "signed in to X" — the alert above already says that, and
        // saying it twice reads as two separate things having happened.
        setMessage('Saved');
        return;
      }

      setStatus('saved');
      setMessage('Choose a model and save.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Sign-in failed');
    } finally {
      setConnecting('');
    }
  }

  async function disconnect() {
    setStatus('saving');
    setReconnectNeeded('');
    const result = await removeModelApiKey();

    if (!result.ok) {
      setStatus('error');
      setMessage(result.error);
      return;
    }

    setKeyStatus((current) => ({
      ...current,
      present: false,
      kind: '',
      provider: '',
      expires: '',
    }));
    setSettings((current) =>
      current ? { ...current, keyPresent: false, configured: false } : current,
    );
    setStatus('saved');
    setMessage('Disconnected');
  }

  if (!settings) {
    // Anything but a successful read leaves the panel with nothing to edit,
    // and saying so beats a spinner that never resolves.
    if (status === 'error') {
      return (
        <p className="py-4 text-destructive text-sm" role="alert">
          {message}
        </p>
      );
    }

    return <p className="py-4 text-muted-foreground text-sm">Loading…</p>;
  }

  const connectedTo = providers.find((provider) => provider.id === keyStatus.provider);

  return (
    <form className="flex flex-col gap-4 py-1" onSubmit={save}>
      {reconnectNeeded ? (
        <Alert variant="warning">
          {/* No aria-hidden: the icon carries the status. */}
          <IconAlertTriangle />
          <AlertTitle>Sign in again to keep using this model</AlertTitle>
          <AlertDescription>{reconnectNeeded}</AlertDescription>
        </Alert>
      ) : null}

      {keyStatus.present && connectedTo ? (
        <Alert variant="success">
          <IconCircleCheck />
          <AlertTitle>Signed in to {connectedTo.label}</AlertTitle>
          <AlertDescription>
            {keyStatus.kind === 'oauth-token'
              ? 'Dao renews this in the background, including after the machine sleeps.'
              : 'A key belonging to your account, kept in the keychain.'}
          </AlertDescription>
          <AlertAction>
            <Button size="xs" type="button" variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {providers.length > 0 && !connectedTo ? (
        <Field>
          <FieldLabel>Sign in</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                disabled={connecting !== '' && connecting !== provider.id}
                loading={connecting === provider.id}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => signIn(provider)}
              >
                Sign in to {provider.label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Opens your browser. The credential comes back to Dao on a local address and goes
            straight into the keychain — it is never shown here.
          </p>
        </Field>
      ) : null}

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
            ? 'Encrypted by macOS and never shown again. It takes effect without a restart.'
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
          {/* A signed-in provider is disconnected from its own alert, so this
              is only for a key that was typed in here. */}
          {keyStatus.present && !connectedTo ? (
            <Button size="sm" type="button" variant="ghost" onClick={disconnect}>
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
