import { createHash, sign, verify } from 'node:crypto';
import { allowedRequest } from './protocol.ts';

// Independent implementation of the published Openbot Team v2 transport formats.
export const remoteCapabilities = [
  'open-providers-v1',
  'long-capability-lists-v1',
  'agent-runtime-snapshots',
  'sidebar-layout',
  'agent-tasks-v1',
  'agent-activity',
  'channel-chats-v1',
  'channel-attention-v1',
];
export function hostFingerprint(publicKey: string) {
  return createHash('sha256').update(publicKey).digest('base64url');
}
export function dtlsFingerprint(sdp: string) {
  const value = sdp.match(/^a=fingerprint:sha-256\s+([a-f0-9:]+)\s*$/im)?.[1]?.toUpperCase();
  if (!value || !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))
    throw new Error('Remote DTLS identity is unavailable.');
  return value;
}
export interface RemoteProof {
  hostId: string;
  sessionId: string;
  ticket: string;
  clientPublicKey: string;
  clientNonce: string;
  clientFingerprint: string;
  hostFingerprint: string;
}
export function proofTranscript(proof: RemoteProof, nonce = '') {
  return JSON.stringify([
    'openbot-team-v2-auth',
    proof.hostId,
    proof.sessionId,
    proof.ticket,
    proof.clientPublicKey,
    proof.clientNonce,
    nonce,
    proof.clientFingerprint,
    proof.hostFingerprint,
  ]);
}
export function clientProof(proof: RemoteProof, privateKey: string) {
  return sign(null, Buffer.from(proofTranscript(proof)), privateKey).toString('base64url');
}
export function verifyHostProof(proof: RemoteProof, frame: any, hostKey: string) {
  if (
    frame?.version !== 2 ||
    frame.type !== 'auth-ready' ||
    frame.clientNonce !== proof.clientNonce ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(frame.hostNonce ?? '') ||
    !/^[A-Za-z0-9_-]{64,256}$/.test(frame.signature ?? '') ||
    !verify(
      null,
      Buffer.from(proofTranscript(proof, frame.hostNonce)),
      hostKey,
      Buffer.from(frame.signature, 'base64url'),
    )
  )
    throw new Error('Remote host authentication failed.');
  return frame.hostNonce as string;
}
export function remoteReadPayload(path: string, body?: unknown) {
  const method = body === undefined ? 'GET' : 'POST';
  if (!allowedRequest(method, path, false))
    throw new Error('Blocked: remote request is outside the read-only allowlist.');
  return { method, path, body: body ?? {}, capabilities: remoteCapabilities };
}
export function signalAddress(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid remote Signal address.');
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'wss:' &&
      !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('Remote Signal requires an encrypted connection.');
  return url.href;
}

/** Ordered, bounded reassembly of the public OBW2 data-channel envelope. */
export class RemoteFrames {
  private messages = new Map<number, { bytes: Buffer; offset: number; at: number }>();
  push(data: string | Buffer, now = Date.now()): string | undefined {
    if (typeof data === 'string') {
      if (Buffer.byteLength(data) > 2 * 1024 * 1024) throw new Error('Remote frame too large.');
      return data;
    }
    for (const [id, message] of this.messages)
      if (now - message.at > 30_000) this.messages.delete(id);
    if (data.length < 17 || data.readUInt32BE(0) !== 0x4f425732 || data[16] !== 1)
      throw new Error('Invalid remote text frame.');
    const id = data.readUInt32BE(4),
      size = data.readUInt32BE(8),
      offset = data.readUInt32BE(12);
    if (
      size > 2 * 1024 * 1024 ||
      offset > size ||
      offset + data.length - 17 > size ||
      (size > 0 && data.length === 17)
    )
      throw new Error('Invalid remote frame size.');
    if (offset === 0) {
      if (
        this.messages.size >= 16 ||
        [...this.messages.values()].reduce((sum, x) => sum + x.bytes.length, 0) + size >
          8 * 1024 * 1024
      )
        throw new Error('Remote assembly limit exceeded.');
      this.messages.set(id, { bytes: Buffer.alloc(size), offset: 0, at: now });
    }
    const message = this.messages.get(id);
    if (!message || message.offset !== offset || message.bytes.length !== size)
      throw new Error('Remote frame sequence is invalid.');
    data.copy(message.bytes, offset, 17);
    message.offset += data.length - 17;
    message.at = now;
    if (message.offset !== size) return;
    this.messages.delete(id);
    return new TextDecoder('utf-8', { fatal: true }).decode(message.bytes);
  }
}
