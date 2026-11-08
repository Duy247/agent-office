import { teamEndpoint } from './protocol.ts';
import { hostFingerprint } from './remote-wire.ts';

export interface RemoteSession {
  authKind: 'remote';
  serverId: string;
  fingerprint: string;
  hostPublicKey: string;
  accountApiUrl: string;
  accountToken: string;
  remoteSessionId?: string;
  remoteSessionExpiresAt?: number;
}
export class RemoteAccountError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 401 ? 'sign-in-required' : `Remote account operation returned HTTP ${status}.`,
    );
    this.status = status;
  }
}
export function remoteAccountRoute(method: string, path: string) {
  return (
    (method === 'GET' && path === '/v2/remote/hosts/') ||
    (method === 'POST' &&
      (path === '/v2/remote/sessions/' ||
        /^\/v2\/remote\/sessions\/[A-Za-z0-9_-]{1,128}\/(ticket|end)$/.test(path)))
  );
}
export async function accountRead(
  session: Pick<RemoteSession, 'accountApiUrl' | 'accountToken'>,
  path: string,
  body?: unknown,
) {
  const method = body === undefined ? 'GET' : 'POST';
  if (!remoteAccountRoute(method, path))
    throw new Error('Blocked: remote account operation is not permitted.');
  const response = await fetch(teamEndpoint(session.accountApiUrl) + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: 'Bearer ' + session.accountToken,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new RemoteAccountError(response.status);
  return response.status === 204 ? null : response.json();
}
export async function verifyRemoteMembership(session: RemoteSession) {
  const result = await accountRead(session, '/v2/remote/hosts/');
  const host = result?.hosts?.find((h: any) => h.hostId === session.serverId);
  if (!host || !['owner', 'admin', 'member'].includes(host.role))
    throw new Error('This account cannot access the selected remote server.');
  if (
    host.devicePublicKey !== session.hostPublicKey ||
    hostFingerprint(host.devicePublicKey) !== session.fingerprint
  )
    throw new Error('Remote host identity changed. Reconnect locally to verify its new identity.');
}
export async function ensureRemoteSession(session: RemoteSession) {
  if (session.remoteSessionId && (session.remoteSessionExpiresAt ?? 0) > Date.now() + 60_000)
    return;
  const result = await accountRead(session, '/v2/remote/sessions/', { hostId: session.serverId });
  if (
    result?.hostId !== session.serverId ||
    typeof result.sessionId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(result.sessionId) ||
    !Number.isSafeInteger(result.expiresAt) ||
    result.expiresAt <= Date.now()
  )
    throw new Error('Invalid remote session response.');
  session.remoteSessionId = result.sessionId;
  session.remoteSessionExpiresAt = result.expiresAt;
}
