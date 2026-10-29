import { ArrowLeft, Check, Copy, ExternalLink, Plus, RotateCw, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MAX_QR_CODES, useHandoff } from '@/hooks/use-handoff';
import { DEFAULT_HOSTS, validatePayload } from '../../lib/handoff';

const DEFAULT_FIELDS = [
  { key: 'account', value: 'alex@acme.dev' },
  { key: 'step', value: 'verify-device' },
  { key: 'return_to', value: '/settings/security' },
];

const REDIRECT_PRESETS = [
  { label: 'Apple Maps', url: 'https://maps.apple.com/?q=London' },
  { label: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
] as const;

export default function HandoffDemo() {
  const [rows, setRows] = useState(DEFAULT_FIELDS);
  const [rotation, setRotation] = useState(true);
  const [hosts, setHosts] = useState(DEFAULT_HOSTS);
  const rotationId = useId();
  const handoff = useHandoff(rotation);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ allowedRedirectHosts?: string[] }>)
      .then((data) => {
        if (Array.isArray(data.allowedRedirectHosts)) setHosts(data.allowedRedirectHosts);
      })
      .catch(() => {});
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

  function clearRedirect() {
    const next = rows.filter((r) => r.key !== 'redirect');
    setRows(next.length ? next : DEFAULT_FIELDS);
  }

  function submit() {
    try {
      const keys = rows.map((row) => row.key);
      if (new Set(keys).size !== keys.length) throw new Error('Each field needs a unique key.');
      validatePayload(payload, hosts);
      void handoff.create(payload, 'server');
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
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [handoff.phase, hosts]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-group">
            <a href="/" className="brand">
              qr-handoff
            </a>
            <span className="brand-sep" aria-hidden="true">
              /
            </span>
            <span className="brand-meta">Cloudflare Pages + D1</span>
          </div>
          <span className="top-meta">Desktop → Mobile prototype</span>
        </div>
      </header>

      <main className="workspace">
        <header className="page-intro">
          <h1>Desktop-to-mobile session handoff</h1>
          <p>
            Pass small JSON state or trigger an app redirect on your phone via short-lived,
            single-use capability tokens stored in SQLite (D1).
          </p>
        </header>

        <div className="workbench">
          {handoff.phase === 'compose' ? (
            <section className="panel editor">
              <fieldset disabled={handoff.busy} className="editor-fields">
                <div className="panel-heading">
                  <h2>Payload fields</h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRows(DEFAULT_FIELDS)}
                  >
                    Reset defaults
                  </button>
                </div>

                <div className="field-head" aria-hidden="true">
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>

                <div className="field-rows">
                  {rows.map((row, index) => (
                    <div className="field-row" key={index}>
                      <input
                        aria-label={`Key ${index + 1}`}
                        placeholder="key"
                        value={row.key}
                        maxLength={64}
                        spellCheck={false}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r))
                          )
                        }
                      />
                      <input
                        aria-label={`Value ${index + 1}`}
                        placeholder="value"
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
                        size="icon-sm"
                        className="remove-row-btn"
                        aria-label={`Remove field ${index + 1}`}
                        disabled={rows.length <= 1}
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <X size={15} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="field-toolbar">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rows.length >= 20}
                    onClick={() => setRows([...rows, { key: '', value: '' }])}
                  >
                    <Plus size={14} /> Add field
                  </Button>

                  <div className="preset-group">
                    <span className="preset-label">Redirect preset:</span>
                    {REDIRECT_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        className={`chip-button ${currentRedirect === preset.url ? 'active' : ''}`}
                        onClick={() => setRedirect(preset.url)}
                        disabled={rows.length >= 20 && !('redirect' in payload)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {'redirect' in payload && (
                      <button type="button" className="text-button" onClick={clearRedirect}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {'redirect' in payload && (
                  <div className="redirect-callout">
                    <p>
                      <strong>HTTP 302 redirect active.</strong> Scanning claims the token and
                      redirects immediately instead of rendering the payload viewer (triggers iOS
                      Universal Links / Android App Links when installed).
                    </p>
                    <p className="callout-meta">Allowed hosts: {hosts.join(', ')}</p>
                  </div>
                )}

                <div className="rule" />

                <div className="setting-line">
                  <label htmlFor={rotationId} className="setting-copy">
                    <span className="setting-title">Auto-rotate QR every 5 seconds</span>
                    <span className="setting-desc">
                      Each token stays valid for 15s so in-flight camera scans still succeed.
                    </span>
                  </label>
                  <Switch id={rotationId} checked={rotation} onCheckedChange={setRotation} />
                </div>

                <div role="alert">
                  {handoff.error && <p className="error-box">{handoff.error}</p>}
                </div>

                <div className="editor-footer">
                  <span className={bytes > 2048 ? 'byte-count over' : 'byte-count'}>
                    {bytes.toLocaleString()} / 2,048 B
                  </span>
                  <Button
                    className="primary-action"
                    disabled={bytes > 2048 || handoff.busy}
                    onClick={submit}
                  >
                    {handoff.busy ? 'Creating session…' : 'Generate QR code'}
                  </Button>
                </div>
              </fieldset>
            </section>
          ) : (
            <section className="panel scan-panel">
              <div className="scan-top">
                <button
                  type="button"
                  className="back-link"
                  disabled={handoff.busy}
                  onClick={() => void handoff.finish()}
                >
                  <ArrowLeft size={15} /> Back to editor
                </button>
                <span className="session-time">
                  Session TTL {Math.floor(handoff.sessionSeconds / 60)}:
                  {String(handoff.sessionSeconds % 60).padStart(2, '0')}
                </span>
              </div>

              {handoff.phase === 'waiting' ? (
                <div className="scan-body">
                  <div className="scan-header">
                    <span className={`status-badge ${handoff.isExpired ? 'expired' : 'live'}`}>
                      {handoff.isExpired ? 'Expired' : 'Active'}
                    </span>
                    <h2>{handoff.isExpired ? 'Token expired' : 'Scan with phone camera'}</h2>
                    <p className="scan-subtitle">
                      {handoff.isExpired
                        ? 'This token passed its 15-second TTL. Scan it or open the link below to verify the backend 410 response.'
                        : 'Scan the QR code on your phone, or open the link in a new tab to test the claim flow locally.'}
                    </p>
                  </div>

                  <div className={`qr-frame ${handoff.isExpired ? 'expired' : ''}`}>
                    {handoff.token ? (
                      <img
                        src={handoff.token.image}
                        alt="QR code for mobile handoff"
                        width={260}
                        height={260}
                      />
                    ) : (
                      <div className="qr-empty">
                        <p>{handoff.busy ? 'Issuing token…' : 'No active token'}</p>
                      </div>
                    )}
                  </div>

                  {handoff.rotationPaused ? (
                    <div className="rotation-paused">
                      <div>
                        <strong>
                          Paused after {MAX_QR_CODES} tokens ({handoff.tokenNumber}/{MAX_QR_CODES})
                        </strong>
                        <p>
                          {handoff.isExpired
                            ? 'Token #4 is now expired on the server so you can test replay/expiry handling.'
                            : 'Auto-rotation paused so token #4 can expire cleanly for testing.'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RotateCw size={14} /> Resume ({MAX_QR_CODES} more)
                      </Button>
                    </div>
                  ) : (
                    <p className="token-meta">
                      {rotation
                        ? `Token ${handoff.tokenNumber}/${MAX_QR_CODES} · rotates every 5s · 15s TTL`
                        : 'Static token · 15s TTL (auto-rotation off)'}
                    </p>
                  )}

                  <div className="scan-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handoff.copy}
                      disabled={!handoff.token || handoff.isExpired}
                    >
                      {handoff.copied ? <Check size={14} /> : <Copy size={14} />}
                      {handoff.copied ? 'Copied' : 'Copy link'}
                    </Button>
                    {handoff.token && (
                      <a
                        className="action-link"
                        href={handoff.token.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in tab <ExternalLink size={13} />
                      </a>
                    )}
                    {!handoff.rotationPaused && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RotateCw size={14} /> Issue new token
                      </Button>
                    )}
                  </div>

                  {handoff.token && (
                    <div className="url-readout">
                      <input
                        className="share-link"
                        aria-label="Current handoff link"
                        value={handoff.token.link}
                        readOnly
                        onFocus={(event) => event.target.select()}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="result-panel">
                  <span
                    className={`status-badge ${handoff.phase === 'complete' ? 'claimed' : 'expired'}`}
                  >
                    {handoff.phase === 'complete' ? 'Claimed' : 'Session ended'}
                  </span>
                  <h2>
                    {handoff.phase === 'complete'
                      ? 'Payload claimed on mobile'
                      : 'Session TTL elapsed'}
                  </h2>
                  <p>
                    {handoff.phase === 'complete'
                      ? 'redirect' in payload
                        ? 'The token was redeemed and the server returned an HTTP 302 redirect. Any overlapping tokens for this session are now invalidated.'
                        : 'The mobile client redeemed the token via POST /api/redeem, and the payload column was wiped from D1 in the same transaction.'
                      : 'The 5-minute session expired without being claimed.'}
                  </p>
                  <Button
                    className="primary-action"
                    onClick={() => void handoff.finish()}
                    disabled={handoff.busy}
                  >
                    Start new handoff
                  </Button>
                </div>
              )}

              <div role="alert">
                {handoff.error && <p className="error-box">{handoff.error}</p>}
              </div>
            </section>
          )}

          <aside className="sidebar">
            <section className="sidebar-card">
              <div className="sidebar-heading">
                <h2>Request JSON</h2>
                <span className="mono-meta">
                  {rows.length} {rows.length === 1 ? 'key' : 'keys'} · {bytes} B
                </span>
              </div>
              <pre className="json-preview">{JSON.stringify(payload, null, 2)}</pre>
            </section>

            <section className="sidebar-card">
              <div className="sidebar-heading">
                <h2>Implementation notes</h2>
              </div>
              <dl className="spec-list">
                <div>
                  <dt>Opaque 192-bit token</dt>
                  <dd>
                    The QR encodes only <code>/handoff?q=…</code>, keeping QR density constant up to
                    the 2 KB limit.
                  </dd>
                </div>
                <div>
                  <dt>Hashed at rest</dt>
                  <dd>
                    Only SHA-256 digests of tokens and session owner secrets are stored in D1.
                  </dd>
                </div>
                <div>
                  <dt>Sliding-window rotation</dt>
                  <dd>
                    Issuing a token every 5s with a 15s expiry keeps up to 3 overlapping tokens
                    valid during a scan.
                  </dd>
                </div>
                <div>
                  <dt>Atomic single-use claim</dt>
                  <dd>
                    Claiming marks the session consumed and overwrites <code>payload</code> with{' '}
                    <code>{'{}'}</code> in a single D1 batch.
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        <footer className="workspace-footer">
          <span>Cloudflare Pages Functions + D1 SQLite</span>
          <span>15s token TTL · 5m max session · single-use claim</span>
        </footer>
      </main>
    </div>
  );
}
