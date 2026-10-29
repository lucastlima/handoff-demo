import { ArrowLeft, Check, Copy, ExternalLink, Plus, RotateCw, Share2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { MAX_QR_CODES, useHandoff } from '@/hooks/use-handoff';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const [previewAnyway, setPreviewAnyway] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const rotationId = useId();
  const isMobile = useIsMobile();
  const handoff = useHandoff(rotation, isMobile);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

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

  function copyDemoUrl() {
    if (!navigator.clipboard) return;
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setUrlCopied(true);
        window.setTimeout(() => setUrlCopied(false), 2000);
      })
      .catch(() => {});
  }

  function shareDemoUrl() {
    if (!navigator.share) return;
    void navigator.share({ title: 'QR Handoff Demo', url: window.location.href }).catch(() => {});
  }

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
      void handoff.create(payload);
    } catch (error) {
      handoff.setError(error instanceof Error ? error.message : 'Check your payload.');
    }
  }

  const showMobileGate = isMobile && !previewAnyway;

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

        {isMobile && previewAnyway && (
          <div className="mobile-preview-banner">
            <span>Previewing composer on mobile — QR rendering is disabled on mobile screens.</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (handoff.phase !== 'compose') void handoff.finish();
                setPreviewAnyway(false);
              }}
            >
              Exit mobile preview
            </button>
          </div>
        )}

        <div className="workbench">
          {showMobileGate ? (
            <section className="panel mobile-gate">
              <span className="status-badge">Mobile browser</span>
              <h2>Open this demo on a desktop screen</h2>
              <p>
                This prototype starts a session on desktop and displays a rotating QR code for your
                phone camera to scan. Since you are already on a phone, open this URL on your laptop
                or desktop to try the full two-device flow.
              </p>

              <div className="gate-actions">
                <button type="button" className="btn btn-primary" onClick={copyDemoUrl}>
                  {urlCopied ? <Check size={15} /> : <Copy size={15} />}
                  {urlCopied ? 'Copied URL' : 'Copy URL for desktop'}
                </button>
                {canShare && (
                  <button type="button" className="btn btn-outline" onClick={shareDemoUrl}>
                    <Share2 size={15} /> Send to desktop
                  </button>
                )}
              </div>

              {originUrl && (
                <div className="url-readout">
                  <input
                    className="share-link"
                    aria-label="Demo URL"
                    value={originUrl}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                </div>
              )}

              <div className="gate-escape">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPreviewAnyway(true)}
                >
                  Preview payload composer anyway (without QR) →
                </button>
              </div>
            </section>
          ) : handoff.phase === 'compose' ? (
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
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Remove field ${index + 1}`}
                        disabled={rows.length <= 1}
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="field-toolbar">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={rows.length >= 20}
                    onClick={() => setRows([...rows, { key: '', value: '' }])}
                  >
                    <Plus size={14} /> Add field
                  </button>

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
                      <strong>HTTP 302 redirect active.</strong> Redeeming the token redirects
                      immediately instead of rendering the payload viewer (triggers iOS Universal
                      Links / Android App Links when installed).
                    </p>
                    <p className="callout-meta">Allowed hosts: {hosts.join(', ')}</p>
                  </div>
                )}

                <div className="rule" />

                <div className="setting-line">
                  <label htmlFor={rotationId} className="setting-copy">
                    <span className="setting-title">Auto-rotate token every 5 seconds</span>
                    <span className="setting-desc">
                      Each token stays valid for 15s so in-flight scans still succeed.
                    </span>
                  </label>
                  <input
                    id={rotationId}
                    type="checkbox"
                    className="checkbox"
                    checked={rotation}
                    onChange={(e) => setRotation(e.target.checked)}
                  />
                </div>

                <div role="alert">
                  {handoff.error && <p className="error-box">{handoff.error}</p>}
                </div>

                <div className="editor-footer">
                  <span className={bytes > 2048 ? 'byte-count over' : 'byte-count'}>
                    {bytes.toLocaleString()} / 2,048 B
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={bytes > 2048 || handoff.busy}
                    onClick={submit}
                  >
                    {handoff.busy
                      ? 'Creating session…'
                      : isMobile
                        ? 'Create handoff link'
                        : 'Generate QR code'}
                  </button>
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
                    <h2>
                      {handoff.isExpired
                        ? 'Token expired'
                        : isMobile
                          ? 'Handoff link ready'
                          : 'Scan with phone camera'}
                    </h2>
                    <p className="scan-subtitle">
                      {handoff.isExpired
                        ? 'This token passed its 15-second TTL. Open the link below to verify the backend 410 response.'
                        : isMobile
                          ? 'QR rendering is hidden on mobile devices. Open the single-use link below to test the claim flow.'
                          : 'Scan the QR code on your phone, or open the link in a new tab to test the claim flow locally.'}
                    </p>
                  </div>

                  {!isMobile && (
                    <div className={`qr-frame ${handoff.isExpired ? 'expired' : ''}`}>
                      {handoff.token?.image ? (
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
                  )}

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
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RotateCw size={14} /> Resume ({MAX_QR_CODES} more)
                      </button>
                    </div>
                  ) : (
                    <p className="token-meta">
                      {rotation
                        ? `Token ${handoff.tokenNumber}/${MAX_QR_CODES} · rotates every 5s · 15s TTL`
                        : 'Static token · 15s TTL (auto-rotation off)'}
                    </p>
                  )}

                  <div className="scan-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handoff.copy}
                      disabled={!handoff.token || handoff.isExpired}
                    >
                      {handoff.copied ? <Check size={14} /> : <Copy size={14} />}
                      {handoff.copied ? 'Copied' : 'Copy link'}
                    </button>
                    {handoff.token && (
                      <a
                        className="btn btn-outline btn-sm"
                        href={handoff.token.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in tab <ExternalLink size={13} />
                      </a>
                    )}
                    {!handoff.rotationPaused && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => void handoff.refresh()}
                        disabled={handoff.busy}
                      >
                        <RotateCw size={14} /> Issue new token
                      </button>
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
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handoff.finish()}
                    disabled={handoff.busy}
                  >
                    Start new handoff
                  </button>
                </div>
              )}

              <div role="alert">
                {handoff.error && <p className="error-box">{handoff.error}</p>}
              </div>
            </section>
          )}

          <aside className="sidebar">
            {!showMobileGate && (
              <section className="sidebar-card">
                <div className="sidebar-heading">
                  <h2>Request JSON</h2>
                  <span className="mono-meta">
                    {rows.length} {rows.length === 1 ? 'key' : 'keys'} · {bytes} B
                  </span>
                </div>
                <pre className="json-preview">{JSON.stringify(payload, null, 2)}</pre>
              </section>
            )}

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
