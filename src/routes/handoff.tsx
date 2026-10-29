import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

type RedeemResult = {
  payload: Record<string, string>;
  redirect: string | null;
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'redirecting'; url: string }
  | { kind: 'claimed'; payload: Record<string, string> }
  | { kind: 'error'; message: string };

const inflight = new Map<string, Promise<RedeemResult>>();

function redeemOnce(q: string) {
  const existing = inflight.get(q);
  if (existing) return existing;

  const request = fetch('/api/redeem', {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q }),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as Partial<RedeemResult> & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Unable to redeem this token.');
    return { payload: data.payload ?? {}, redirect: data.redirect ?? null };
  });

  inflight.set(q, request);
  return request;
}

export const Route = createFileRoute('/handoff')({
  component: HandoffClaimPage,
});

function HandoffClaimPage() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') ?? '';
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    if (!q) {
      setState({
        kind: 'error',
        message: 'Missing handoff token. Scan a QR code from the desktop session.',
      });
      return;
    }

    redeemOnce(q)
      .then((data) => {
        if (data.redirect) {
          setState({ kind: 'redirecting', url: data.redirect });
          window.location.replace(data.redirect);
          return;
        }
        document.title = 'Payload received — QR Handoff';
        setState({ kind: 'claimed', payload: data.payload });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof DOMException && err.name === 'TimeoutError'
            ? 'The request timed out. Scan the latest QR code on the desktop.'
            : err instanceof Error
              ? err.message
              : 'Unable to redeem this token.';
        setState({ kind: 'error', message });
      });
  }, []);

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
            <span className="brand-meta">mobile claim</span>
          </div>
        </div>
      </header>

      <main className="claim-shell">
        <section className="panel claim-card">
          {state.kind === 'loading' && (
            <>
              <span className="status-badge">Redeeming…</span>
              <h1>Claiming session payload</h1>
              <p className="scan-subtitle" role="status">
                Exchanging single-use token via <code>POST /api/redeem</code>…
              </p>
            </>
          )}

          {state.kind === 'redirecting' && (
            <>
              <span className="status-badge claimed">Claimed</span>
              <h1>Opening destination</h1>
              <p className="scan-subtitle">
                If your browser didn’t redirect automatically, continue below.
              </p>
              <p className="claim-url">{state.url}</p>
              <a className="action-link claim-cta" href={state.url} rel="noreferrer">
                Continue to destination ↗
              </a>
            </>
          )}

          {state.kind === 'claimed' && (
            <>
              <span className="status-badge claimed">Claimed</span>
              <h1>Payload received</h1>
              <p className="scan-subtitle">
                Token redeemed and stored payload cleared from D1 in the same transaction.
              </p>

              <dl className="claimed-fields">
                {Object.entries(state.payload).map(([key, value]) => (
                  <div key={key} className="claimed-row">
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <details className="raw-json-details">
                <summary>Raw JSON</summary>
                <pre className="json-preview">{JSON.stringify(state.payload, null, 2)}</pre>
              </details>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <span className="status-badge expired">Unavailable</span>
              <h1>Token unavailable</h1>
              <p className="scan-subtitle" role="alert">
                {state.message}
              </p>
              <p className="claim-hint">
                Return to the desktop window and scan the latest active QR code.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
