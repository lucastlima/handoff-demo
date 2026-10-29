import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

export const ROTATION_INTERVAL = 5;
export const MAX_QR_CODES = 4;

type TokenResponse = { q: string; issuedAt: number; expiresAt: number; serverNow: number };
type Session = { id: string; owner: string; validUntil: number };
type Token = { link: string; image: string | null; validUntil: number; rotateAt: number };
export type Phase = 'compose' | 'waiting' | 'complete' | 'expired';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!data) throw new Error('The service is unavailable. Please try again.');
  if (!response.ok) {
    throw new ApiError(data.error || 'Unable to complete the request.', response.status);
  }
  return data;
}

export function useHandoff(rotation: boolean, skipQr = false) {
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<Token | null>(null);
  const [phase, setPhase] = useState<Phase>('compose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [tokenNumber, setTokenNumber] = useState(1);
  const [sessionSeconds, setSessionSeconds] = useState(300);
  const [copied, setCopied] = useState(false);

  const runId = useRef(0);
  const busyRef = useRef(false);

  const rotationPaused = rotation && tokenNumber >= MAX_QR_CODES;

  const buildToken = useCallback(
    async (data: TokenResponse, sentAt: number): Promise<Token> => {
      // Subtract full round-trip so local clock skew never extends perceived validity.
      const validUntil = sentAt + data.expiresAt - data.serverNow;
      const link = `${location.origin}/handoff?q=${data.q}`;
      const image = skipQr
        ? null
        : await QRCode.toDataURL(link, {
            width: 320,
            margin: 3,
            errorCorrectionLevel: 'M',
            color: { dark: '#18181b', light: '#ffffff' },
          });
      if (validUntil <= performance.now()) {
        throw new Error('The code expired while loading. Generate a fresh code.');
      }
      return { link, image, validUntil, rotateAt: sentAt + ROTATION_INTERVAL * 1000 };
    },
    [skipQr]
  );

  const create = useCallback(
    async (payload: Record<string, string>) => {
      if (busyRef.current) return;
      const id = ++runId.current;
      busyRef.current = true;
      setBusy(true);
      setError('');
      setTokenNumber(1);
      setIsExpired(false);

      try {
        const sentAt = performance.now();
        const data = await api<
          TokenResponse & { id: string; owner: string; sessionExpiresAt: number }
        >('/api/sessions', { method: 'POST', body: JSON.stringify({ payload }) });
        if (id !== runId.current) return;

        const nextToken = await buildToken(data, sentAt);
        if (id !== runId.current) return;

        setSession({
          id: data.id,
          owner: data.owner,
          validUntil: sentAt + data.sessionExpiresAt - data.serverNow,
        });
        setToken(nextToken);
        setCopied(false);
        setPhase('waiting');
      } catch (e) {
        if (id === runId.current) {
          setError(e instanceof Error ? e.message : 'Unable to create handoff.');
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [buildToken]
  );

  const issueNext = useCallback(
    async (nextNumber: number) => {
      if (!session || busyRef.current) return;
      const id = runId.current;
      busyRef.current = true;
      setBusy(true);

      try {
        const sentAt = performance.now();
        const data = await api<TokenResponse>(`/api/sessions/${session.id}/tokens`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.owner}` },
        });
        if (id !== runId.current) return;

        const nextToken = await buildToken(data, sentAt);
        if (id !== runId.current) return;

        setToken(nextToken);
        setTokenNumber(nextNumber);
        setCopied(false);
        setIsExpired(false);
        setError('');
      } catch (e) {
        if (id === runId.current) {
          setError(e instanceof Error ? e.message : 'Unable to refresh the code.');
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [session, buildToken]
  );

  const refresh = useCallback(() => issueNext(1), [issueNext]);

  // Local countdown + 5s auto-rotation timer
  useEffect(() => {
    if (phase !== 'waiting' || !session) return;

    const tick = () => {
      const now = performance.now();
      const remaining = Math.max(0, Math.ceil((session.validUntil - now) / 1000));
      setSessionSeconds(remaining);

      if (remaining === 0) {
        setToken(null);
        setPhase('expired');
        return;
      }

      if (!token) return;
      const isAuto = rotation && tokenNumber < MAX_QR_CODES;
      setIsExpired(now > token.validUntil && !isAuto);

      if (isAuto && !document.hidden && now >= token.rotateAt && !busyRef.current) {
        void issueNext(tokenNumber + 1);
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [phase, session, token, rotation, tokenNumber, issueNext]);

  // 2s backend claim-status polling (pauses when tab is hidden or static token has long expired)
  useEffect(() => {
    if (phase !== 'waiting' || !session || !token) return;

    const id = runId.current;
    let inFlight = false;

    const poll = () => {
      if (inFlight || document.hidden) return;
      const isAuto = rotation && tokenNumber < MAX_QR_CODES;
      if (!isAuto && performance.now() > token.validUntil + 5000) return;

      inFlight = true;
      void api<{ status: 'waiting' | 'complete' | 'expired' }>(`/api/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${session.owner}` },
      })
        .then((data) => {
          if (id !== runId.current || data.status === 'waiting') return;
          setToken(null);
          setError('');
          setPhase(data.status);
        })
        .catch((e) => {
          if (id !== runId.current) return;
          if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
            setToken(null);
            setPhase('expired');
          } else {
            setError('Connection interrupted. Reconnect or generate a fresh code.');
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    poll();
    const interval = window.setInterval(poll, 2000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [phase, session, token, rotation, tokenNumber]);

  const finish = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (session) {
        await api(`/api/sessions/${session.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.owner}` },
        });
      }
      ++runId.current;
      setSession(null);
      setToken(null);
      setPhase('compose');
    } catch {
      setError('Unable to end the session. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [session]);

  const copy = useCallback(() => {
    if (!token || token.validUntil <= performance.now() || phase !== 'waiting') return;
    if (!navigator.clipboard) {
      setError('Clipboard access requires HTTPS. Copy the link below manually.');
      return;
    }
    void navigator.clipboard
      .writeText(token.link)
      .then(() => setCopied(true))
      .catch(() => setError('Copy was blocked. Copy the link below manually.'));
  }, [token, phase]);

  return {
    phase,
    token,
    busy,
    error,
    setError,
    isExpired,
    rotationPaused,
    tokenNumber,
    sessionSeconds,
    copied,
    create,
    refresh,
    finish,
    copy,
  };
}
