import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

export const ROTATION_INTERVAL = 5;
export const MAX_QR_CODES = 4; // Up to 4 QR codes (QR1 -> QR2 -> QR3 -> QR4)

type TokenResponse = { q: string; issuedAt: number; expiresAt: number; serverNow: number };
type Session = { id: string; owner: string; sessionExpiresAt: number; validUntil: number };
type Token = { link: string; image: string; validUntil: number; rotateAt: number };
export type Phase = 'compose' | 'waiting' | 'complete' | 'expired';
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function api<T = Record<string, unknown>>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  let value: T & { error?: string };
  try {
    value = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error('The service is unavailable. Please try again.');
  }
  if (!response.ok)
    throw new ApiError(value.error || 'Unable to complete the request.', response.status);
  return value;
}
export function useHandoff(rotation: boolean) {
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<Token | null>(null);
  const [phase, setPhase] = useState<Phase>('compose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(300);
  const [copied, setCopied] = useState(false);
  const qrCodeCount = useRef(1);
  const generation = useRef(0),
    refreshing = useRef(false),
    phaseRef = useRef<Phase>('compose');
  const currentSession = useRef<Session | null>(null),
    currentToken = useRef<Token | null>(null);
  const moveTo = useCallback((value: Phase) => {
    phaseRef.current = value;
    setPhase(value);
  }, []);
  const renderToken = useCallback(
    async (data: TokenResponse, sent: number, generationId: number) => {
      // Subtract the full request round trip so clock skew never extends the visible lifetime.
      const validUntil = sent + data.expiresAt - data.serverNow;
      const link = `${location.origin}/handoff?q=${data.q}`;
      const image = await QRCode.toDataURL(link, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#122c40', light: '#ffffff' },
      });
      if (generationId !== generation.current || phaseRef.current !== 'waiting') return;
      if (validUntil <= performance.now())
        throw new Error('The code expired while loading. Generate a fresh code.');
      const next = { link, image, validUntil, rotateAt: sent + ROTATION_INTERVAL * 1000 };
      currentToken.current = next;
      setToken(next);
      setCopied(false);
      setIsExpired(false);
    },
    []
  );
  const create = useCallback(
    async (payload: Record<string, string>, mode: string) => {
      if (refreshing.current) return;
      const generationId = ++generation.current;
      refreshing.current = true;
      setBusy(true);
      setError('');
      qrCodeCount.current = 1;
      setRotationPaused(false);
      setIsExpired(false);
      try {
        const sent = performance.now();
        const data = await api<
          TokenResponse & { id: string; owner: string; sessionExpiresAt: number }
        >('/api/sessions', { method: 'POST', body: JSON.stringify({ payload, mode }) });
        if (generationId !== generation.current) return;
        const next = {
          id: data.id,
          owner: data.owner,
          sessionExpiresAt: data.sessionExpiresAt,
          validUntil: sent + data.sessionExpiresAt - data.serverNow,
        };
        currentSession.current = next;
        setSession(next);
        moveTo('waiting');
        await renderToken(data, sent, generationId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to create handoff.');
      } finally {
        refreshing.current = false;
        setBusy(false);
      }
    },
    [moveTo, renderToken]
  );
  const refresh = useCallback(async () => {
    const s = currentSession.current;
    if (!s || refreshing.current || phaseRef.current !== 'waiting') return;
    const generationId = generation.current;
    refreshing.current = true;
    setBusy(true);
    try {
      const sent = performance.now();
      const data = await api<TokenResponse>(`/api/sessions/${s.id}/tokens`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.owner}` },
      });
      await renderToken(data, sent, generationId);
      if (generationId === generation.current) setError('');
    } catch (e) {
      if (generationId === generation.current && phaseRef.current === 'waiting') {
        qrCodeCount.current = Math.max(1, qrCodeCount.current - 1);
        setError(e instanceof Error ? e.message : 'Unable to refresh the code.');
      }
    } finally {
      refreshing.current = false;
      setBusy(false);
    }
  }, [renderToken]);
  const manualRefresh = useCallback(async () => {
    qrCodeCount.current = 1;
    setRotationPaused(false);
    setIsExpired(false);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    if (phase !== 'waiting' || !session) return;
    let polling = false,
      lastPoll = 0,
      lastRefresh = 0,
      stopped = false,
      lastTokenKey = '';
    const generationId = generation.current;
    const update = () => {
      if (stopped || phaseRef.current !== 'waiting') return;
      const now = performance.now();
      const remaining = Math.max(0, Math.ceil((session.validUntil - now) / 1000));
      setSessionSeconds(remaining);
      if (!remaining) {
        currentToken.current = null;
        setToken(null);
        moveTo('expired');
        return;
      }
      const t = currentToken.current;
      const isAuto = rotation && qrCodeCount.current < MAX_QR_CODES;
      const isPaused = rotation && qrCodeCount.current >= MAX_QR_CODES;
      setRotationPaused(isPaused);

      // Only mark expired when auto-rotation is done (or off) and the token has passed its 15s validity
      const tokenExpired = Boolean(t && now > t.validUntil && (!rotation || isPaused));
      setIsExpired(tokenExpired);

      if (document.hidden) return;

      if (isAuto && t && now >= t.rotateAt && !refreshing.current && now - lastRefresh > 2000) {
        lastRefresh = now;
        qrCodeCount.current += 1;
        void refresh();
      }

      // Pause polling when not actively rotating and the current token is expired (+5s grace)
      const canClaim = isAuto || (t && now <= t.validUntil + 5000);
      if (!canClaim) return;
      if (t && t.link !== lastTokenKey) {
        lastTokenKey = t.link;
        lastPoll = 0;
      }
      if (!polling && now - lastPoll > 2000) {
        polling = true;
        lastPoll = now;
        void api<{ status: 'waiting' | 'complete' | 'expired' }>(`/api/sessions/${session.id}`, {
          headers: { Authorization: `Bearer ${session.owner}` },
        })
          .then((data) => {
            if (stopped || generationId !== generation.current) return;
            if (data.status !== 'waiting') {
              currentToken.current = null;
              setToken(null);
              setError('');
              moveTo(data.status);
            }
          })
          .catch((e) => {
            if (stopped || generationId !== generation.current) return;
            if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
              currentToken.current = null;
              setToken(null);
              moveTo('expired');
            } else
              setError(
                'Connection interrupted. Expired codes are hidden; reconnect or generate a fresh code.'
              );
          })
          .finally(() => {
            polling = false;
          });
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    const resume = () => {
      if (!document.hidden) {
        lastPoll = 0;
        update();
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [phase, session, rotation, refresh, moveTo]);
  const finish = useCallback(async () => {
    if (refreshing.current) return;
    const s = currentSession.current;
    setBusy(true);
    setError('');
    refreshing.current = true;
    try {
      if (s)
        await api(`/api/sessions/${s.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${s.owner}` },
        });
      ++generation.current;
      currentSession.current = null;
      currentToken.current = null;
      setSession(null);
      setToken(null);
      moveTo('compose');
    } catch {
      setError('Unable to end the session. Please try again.');
    } finally {
      refreshing.current = false;
      setBusy(false);
    }
  }, [moveTo]);
  const copy = useCallback(() => {
    const t = currentToken.current;
    if (!t || t.validUntil <= performance.now() || phaseRef.current !== 'waiting') return;
    // Start clipboard access inside the click handler, without awaiting a network request.
    if (!navigator.clipboard) {
      setError('Clipboard access needs HTTPS. Select and copy the link below.');
      return;
    }
    void navigator.clipboard
      .writeText(t.link)
      .then(() => setCopied(true))
      .catch(() => setError('Copy was blocked. Select and copy the link below.'));
  }, []);
  return {
    phase,
    token,
    busy,
    error,
    setError,
    isExpired,
    rotationPaused,
    sessionSeconds,
    copied,
    create,
    refresh: manualRefresh,
    finish,
    copy,
  };
}
