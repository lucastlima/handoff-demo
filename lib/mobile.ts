import { randomToken } from './handoff';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow' };
export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function scriptJson(value: unknown) { return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029'); }
const css = `*{box-sizing:border-box}body{margin:0;padding:32px 20px;background:#f4f6f9;color:#19354d;font:16px/1.6 Arial,sans-serif}.brand{font-size:21px;font-weight:700;letter-spacing:-.7px;margin-bottom:48px}.brand span{font-weight:400;color:#758899}main{max-width:480px;margin:0 auto}.card{background:white;border:1px solid #dae3eb;border-radius:18px;padding:30px 24px}.stamp{display:inline-block;background:#e9f2d6;color:#476229;border-radius:7px;padding:7px 11px;font-size:12px;letter-spacing:1px;font-weight:700}h1{font-size:30px;line-height:1.2;letter-spacing:-1px;margin:22px 0 12px}p{color:#6a7d8e}dl{margin:25px 0 0}dt{font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#698295;margin-top:20px}dd{margin:5px 0 0;overflow-wrap:anywhere}a.button,button{display:inline-block;padding:13px 20px;border-radius:8px;background:#193b57;color:white;text-decoration:none;border:0;font:inherit;cursor:pointer}pre{background:#142e44;color:#d5edab;padding:18px;font-size:12px;border-radius:8px;overflow-wrap:anywhere;white-space:pre-wrap}details{margin-top:26px}summary{cursor:pointer;font-size:14px;color:#536f84}.foot{font-size:12px;text-align:center;margin-top:22px;color:#8a98a5}.target{overflow-wrap:anywhere;font-size:14px}.error{background:#ffebee;color:#a6384c}`;
function page(title: string, content: string, script = '', immediate = false, status = 200) {
  const nonce = randomToken();
  const inlineScript = script ? `<script nonce="${nonce}">${script}</script>` : '';
  // The redirect script intentionally precedes styles and body; no load event, timer, or bundle.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">${immediate ? inlineScript : ''}<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · Handoff Lab</title><style>${css}</style></head><body><main><div class="brand">handoff <span>lab</span></div><section class="card">${content}</section><p class="foot">Made for the moment between devices.</p></main>${immediate ? '' : inlineScript}</body></html>`;
  return new Response(html, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` } });
}
export function redirectResponse(target: string, mode: string) {
  if (mode === 'server') return new Response(null, { status: 302, headers: { ...headers, Location: target } });
  return page('Continue in your app', `<span class="stamp">HANDOFF RECEIVED</span><h1>Your next step is ready.</h1><p>If your browser kept you here, tap below to continue.</p><p class="target">${escapeHtml(target)}</p><a class="button" href="${escapeHtml(target)}" rel="noreferrer">Open app or website ↗</a>`, `location.replace(${scriptJson(target)});`, true);
}
export function errorPage(message: string, status = 410) {
  return page('Link unavailable', `<span class="stamp error">LINK UNAVAILABLE</span><h1>Let’s try a fresh code.</h1><p>${escapeHtml(message)}</p><p>Return to the desktop and scan its latest QR code.</p>`, '', false, status);
}
export function payloadPage(q: string) {
  return page('Receiving your handoff', `<span class="stamp" id="stamp">CONNECTING</span><h1 id="title">Picking up where you left off.</h1><p id="description" role="status">Retrieving your payload…</p><dl id="fields"></dl><details id="details" hidden><summary>View JSON</summary><pre id="json"></pre></details><noscript><p>Enable JavaScript to receive this payload.</p></noscript>`, `
    const q = ${scriptJson(q)};
    history.replaceState(null, '', location.pathname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }), cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to receive this handoff.'); return data; })
      .then(data => {
        if (data.redirect) { location.replace(data.redirect); return; }
        document.getElementById('stamp').textContent = 'HANDOFF RECEIVED';
        document.getElementById('title').textContent = 'Right where you left off.';
        document.getElementById('description').textContent = 'Your payload made it. This link has now been used.';
        for (const [key, value] of Object.entries(data.payload)) {
          const label = document.createElement('dt'); label.textContent = key;
          const text = document.createElement('dd'); text.textContent = String(value);
          document.getElementById('fields').append(label, text);
        }
        document.getElementById('json').textContent = JSON.stringify(data.payload, null, 2);
        document.getElementById('details').hidden = false;
        document.title = 'Handoff received · Handoff Lab';
      }).catch(error => {
        document.getElementById('stamp').textContent = 'LINK UNAVAILABLE';
        document.getElementById('stamp').classList.add('error');
        document.getElementById('title').textContent = 'Let’s try a fresh code.';
        document.getElementById('description').textContent = error.name === 'AbortError' ? 'The connection timed out. Scan the latest desktop code. If it was already claimed, create a new handoff.' : error.message + ' Return to the desktop and scan a new code.';
      }).finally(() => clearTimeout(timeout));
  `);
}
