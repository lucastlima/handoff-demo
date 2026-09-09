import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Monitor,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useHandoff } from '@/hooks/use-handoff';
import { DEFAULT_HOSTS, validatePayload } from '../../lib/handoff';

const example = [
  { key: 'name', value: 'Alex Morgan' },
  { key: 'reference', value: 'DEMO-2048' },
  { key: 'message', value: 'Pick up where you left off.' },
];

const REDIRECT_PRESETS = [
  { label: 'Add app redirect', url: 'https://maps.apple.com/?q=London' },
  {
    label: 'Add mystery redirect',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
] as const;

export default function HandoffDemo() {
  const [rows, setRows] = useState(example);
  const [rotation, setRotation] = useState(true);
  const [mode, setMode] = useState('server');
  const [hosts, setHosts] = useState(DEFAULT_HOSTS);
  const handoff = useHandoff(rotation);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ allowedRedirectHosts?: string[] }>)
      .then((data) => {
        if (Array.isArray(data.allowedRedirectHosts)) setHosts(data.allowedRedirectHosts);
      })
      .catch(() => { });
  }, []);
  const payload = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const currentRedirect = rows.find((r) => r.key === 'redirect')?.value;
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;

  function setRedirect(url: string) {
    if (rows.some((r) => r.key === 'redirect')) {
      setRows(rows.map((r) => (r.key === 'redirect' ? { ...r, value: url } : r)));
    } else if (rows.length < 20) {
      setRows([...rows, { key: 'redirect', value: url }]);
    }
  }
  function submit() {
    try {
      const keys = rows.map((row) => row.key);
      if (new Set(keys).size !== keys.length) throw new Error('Each field needs a unique key.');
      validatePayload(payload, hosts);
      void handoff.create(payload, mode);
    } catch (error) {
      handoff.setError(error instanceof Error ? error.message : 'Check your payload.');
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'configure_handoff_payload',
            description:
              'Replace the desktop draft fields. Does not create a handoff or a QR link.',
            inputSchema: {
              type: 'object',
              properties: {
                payload: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  minProperties: 1,
                  maxProperties: 20,
                },
              },
              required: ['payload'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            execute(input: unknown) {
              if (handoff.phase !== 'compose')
                throw new Error('End the current handoff before changing the draft.');
              const data = input as { payload?: unknown };
              validatePayload(data?.payload, hosts);
              const entries = Object.entries(data.payload as Record<string, string>);
              setRows(entries.map(([key, value]) => ({ key, value })));
              return { configured: true, fields: entries.length };
            },
          },
          { signal: lifecycle.signal }
        )
      ).catch(() => { });
    } catch { }
    return () => lifecycle.abort();
  }, [handoff.phase, hosts]);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <ArrowLeftRight size={21} />
          </span>
          handoff<span className="brand-suffix">lab</span>
        </a>
        <span className="demo-tag">DESKTOP → MOBILE</span>
        <span className="top-note">
          <span className="status-dot" /> A little less friction.
        </span>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">THE HANDOFF PLAYGROUND</p>
            <h1>
              Start here.
              <br />
              <span>Continue anywhere.</span>
            </h1>
          </div>
          <p className="heading-note">
            Build a payload. Scan a code.
            <br />
            Take the next step on your phone.
          </p>
        </div>
        <nav className="steps" aria-label="Progress">
          <span className={handoff.phase === 'compose' ? 'active' : ''}>
            <b>01</b> Compose payload
          </span>
          <span className="step-line" />
          <span className={handoff.phase !== 'compose' ? 'active' : ''}>
            <b>02</b> Scan & continue
          </span>
        </nav>
        <div className="editor-grid">
          {handoff.phase === 'compose' ? (
            <section className="panel editor">
              <fieldset disabled={handoff.busy} className="editor-fields">
                <div className="panel-heading">
                  <div>
                    <h2>Your payload</h2>
                    <p>The details you want to take with you.</p>
                  </div>
                  <Button variant="ghost" onClick={() => setRows(example)}>
                    Reset example
                  </Button>
                </div>
                <div className="field-head">
                  <span>KEY</span>
                  <span>VALUE</span>
                </div>
                <div className="field-rows">
                  {rows.map((row, index) => (
                    <div className="field-row" key={index}>
                      <input
                        aria-label={`Key ${index + 1}`}
                        value={row.key}
                        maxLength={64}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r))
                          )
                        }
                      />
                      <input
                        aria-label={`Value ${index + 1}`}
                        value={row.value}
                        maxLength={2048}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r))
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove field ${index + 1}`}
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="add-field"
                  disabled={rows.length >= 20}
                  onClick={() => setRows([...rows, { key: '', value: '' }])}
                >
                  <Plus size={17} /> Add a field
                </Button>
                <div className="payload-shortcuts">
                  {REDIRECT_PRESETS.map((preset) => (
                    <Button
                      key={preset.url}
                      variant="ghost"
                      onClick={() => setRedirect(preset.url)}
                      disabled={
                        currentRedirect === preset.url || (rows.length >= 20 && !currentRedirect)
                      }
                    >
                      <ArrowUpRight size={15} /> {preset.label}
                    </Button>
                  ))}
                </div>
                {'redirect' in payload && (
                  <div className="redirect-settings">
                    <h3>Redirect on scan</h3>
                    <RadioGroup
                      value={mode}
                      onValueChange={(v) => setMode(String(v))}
                      aria-label="Redirect method"
                      className="redirect-options"
                    >
                      <label>
                        <RadioGroupItem value="server" />
                        <span>
                          Server redirect <small>Direct HTTP response · default</small>
                        </span>
                      </label>
                      <label>
                        <RadioGroupItem value="browser" />
                        <span>
                          Instant browser redirect{' '}
                          <small>First inline script · no page-load wait</small>
                        </span>
                      </label>
                    </RadioGroup>
                    <p>Allowed destinations: {hosts.join(', ')}.</p>
                    <p>
                      Opening a redirect link uses it immediately, including some link previews.
                    </p>
                  </div>
                )}
                <div className="rule" />
                <div className="setting-line">
                  <div>
                    <h3>Keep your QR moving</h3>
                    <p>Rotate the link automatically every 5 seconds.</p>
                  </div>
                  <Switch
                    aria-label="Rotate QR code"
                    checked={rotation}
                    onCheckedChange={setRotation}
                  />
                </div>
                <div className="info-note">
                  <ShieldCheck size={18} />
                  <span>Each link lasts 15 seconds and can be used once.</span>
                </div>
                <div role="alert">
                  {handoff.error && <p className="error-box">{handoff.error}</p>}
                </div>
                <div className="editor-footer">
                  <span className={bytes > 2048 ? 'error-text' : 'byte-count'}>
                    {bytes} / 2,048 bytes
                  </span>
                  <Button
                    className="primary-action"
                    disabled={bytes > 2048 || handoff.busy}
                    onClick={submit}
                  >
                    {handoff.busy ? 'Creating…' : 'Create handoff'} <ArrowRight size={18} />
                  </Button>
                </div>
              </fieldset>
            </section>
          ) : (
            <section className="panel scan-panel">
              <div className="scan-top">
                <Button
                  variant="ghost"
                  disabled={handoff.busy}
                  onClick={() => void handoff.finish()}
                >
                  <ArrowLeft size={16} /> End & edit
                </Button>
                <span className="session-time">
                  <Clock size={14} /> {Math.floor(handoff.sessionSeconds / 60)}:
                  {String(handoff.sessionSeconds % 60).padStart(2, '0')}
                </span>
              </div>
              {handoff.phase === 'waiting' ? (
                <>
                  <span className={`live-pill ${handoff.isExpired ? 'expired' : ''}`}>
                    <span className={`status-dot ${handoff.isExpired ? 'error' : ''}`} />{' '}
                    {handoff.isExpired
                      ? 'CODE EXPIRED · SCAN TO TEST ERROR'
                      : 'WAITING FOR YOUR PHONE'}
                  </span>
                  <h2>{handoff.isExpired ? 'Code expired.' : 'Over to your phone.'}</h2>
                  <p className="scan-subtitle">
                    {handoff.isExpired
                      ? 'Scan this expired code to see the rejection error on your phone.'
                      : 'Open your camera and scan the code.'}
                  </p>
                  <div className={`qr-container ${handoff.isExpired ? 'expired' : ''}`}>
                    {handoff.token ? (
                      <img
                        src={handoff.token.image}
                        alt="Scan to receive this handoff on your phone"
                        width={320}
                        height={320}
                      />
                    ) : (
                      <div className="qr-empty">
                        <QrCode size={54} />
                        <p>{handoff.busy ? 'Generating a fresh code…' : 'No code active.'}</p>
                      </div>
                    )}
                  </div>
                  {handoff.rotationPaused ? (
                    <div className="max-rotations-card">
                      <div className="max-rotations-text">
                        <strong>Max rotations reached (4/4)</strong>
                        <p>
                          {handoff.isExpired
                            ? 'QRCode 4 is expired in the backend. Scan it with your phone to see the rejection error.'
                            : 'Auto-rotation paused. QRCode 4 is active in the backend.'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RefreshCw size={14} /> Restart for 4 more rotations
                      </Button>
                    </div>
                  ) : (
                    <p className="rotation-note">
                      <RefreshCw size={13} />{' '}
                      {rotation ? 'Refreshes every 5 seconds' : 'Automatic rotation is off'}
                    </p>
                  )}
                  <div className="scan-actions">
                    <Button
                      className="primary-action"
                      onClick={handoff.copy}
                      disabled={!handoff.token}
                    >
                      {handoff.copied ? <Check size={16} /> : <Copy size={16} />}
                      {handoff.copied ? 'Link copied' : 'Copy current link'}
                    </Button>
                    {!handoff.rotationPaused && (
                      <Button
                        variant="outline"
                        className="refresh-action"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RefreshCw size={16} /> Refresh
                      </Button>
                    )}
                  </div>
                  {handoff.token && (
                    <input
                      className="share-link"
                      aria-label="Current handoff link"
                      value={handoff.token.link}
                      readOnly
                      onFocus={(event) => event.target.select()}
                    />
                  )}
                  <p className="scan-fineprint">
                    A copied link keeps its original 15-second expiry.
                  </p>
                </>
              ) : (
                <div className="result-panel">
                  <div className="result-icon">
                    {handoff.phase === 'complete' ? (
                      <CheckCircle2 size={48} />
                    ) : (
                      <Clock size={48} />
                    )}
                  </div>
                  <h2>
                    {handoff.phase === 'complete'
                      ? 'The handoff is complete.'
                      : 'This session has ended.'}
                  </h2>
                  <p>
                    {handoff.phase === 'complete'
                      ? 'redirect' in payload
                        ? 'The redirect was issued. Check your phone to confirm the destination opened.'
                        : 'Your phone claimed the payload. All links for this handoff are now closed.'
                      : 'Create a new handoff to keep going.'}
                  </p>
                  <Button
                    className="primary-action"
                    onClick={() => void handoff.finish()}
                    disabled={handoff.busy}
                  >
                    Create another handoff <ArrowRight size={16} />
                  </Button>
                </div>
              )}
              <div role="alert">
                {handoff.error && <p className="error-box">{handoff.error}</p>}
              </div>
            </section>
          )}
          <aside className="preview-column">
            <section className="json-panel">
              <div className="json-heading">
                <span>
                  <Braces size={16} /> Payload preview
                </span>
                <span>JSON</span>
              </div>
              <pre>{JSON.stringify(payload, null, 2)}</pre>
              <div className="json-footer">
                <span className="status-dot" /> Stored temporarily. Carried securely.
              </div>
            </section>
            <section className="journey-card">
              <div className="journey-icons">
                <Monitor />
                <span />
                <ArrowRight size={18} />
                <span />
                <Smartphone />
              </div>
              <h3>One scan. Same context.</h3>
              <p>
                The code carries a short, single-use link. Your payload stays on the server until
                your phone claims it.
              </p>
              <div className="redirect-hint">
                <ArrowUpRight size={18} />
                <span>
                  Add a <code>redirect</code> field to continue to a website or app.
                </span>
              </div>
            </section>
          </aside>
        </div>
        <footer className="workspace-footer">
          <span>Made for the moment between devices.</span>
          <span>
            15s links <i>·</i> One-time use <i>·</i> 2 KB payloads
          </span>
        </footer>
      </main>
    </div>
  );
}
