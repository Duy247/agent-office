import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AvatarDownloads } from './avatar-downloads.ts';
import { avatarPathPattern, imageMimes, type AvatarImage } from './avatars.ts';
import WebSocket from 'ws';
import { RTCPeerConnection, type RTCDataChannel } from 'werift';
import {
  accountRead,
  ensureRemoteSession,
  verifyRemoteMembership,
  RemoteAccountError,
  type RemoteSession,
} from './remote-account.ts';
import {
  clientProof,
  dtlsFingerprint,
  RemoteFrames,
  remoteReadPayload,
  signalAddress,
  verifyHostProof,
  type RemoteProof,
} from './remote-wire.ts';

/** Node-only remote transport. No browser credentials, media, file transfers or work commands. */
export class RemotePeer extends EventEmitter {
  private socket?: WebSocket;
  private pc?: RTCPeerConnection;
  private channels = new Map<string, RTCDataChannel>();
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      asset?: boolean;
    }
  >();
  private proof?: RemoteProof;
  private downloads = new AvatarDownloads();
  private avatarReads = 0;
  private hostNonce?: string;
  private authenticated = false;
  private stopped = false;
  private stage = 'starting';
  private mark(stage: string) {
    this.stage = stage;
    this.emit('stage', stage);
  }
  private sequence = 0;
  private connectionId = '';
  private resolveReady: () => void = () => {};
  private rejectReady: (error: Error) => void = () => {};
  private earlyEvents: any[] = [];
  private refresh?: ReturnType<typeof setTimeout>;
  readonly closed: Promise<void>;
  private resolveClosed!: () => void;
  private session: RemoteSession;
  constructor(session: RemoteSession) {
    super();
    this.session = session;
    this.closed = new Promise((resolve) => {
      this.resolveClosed = resolve;
    });
  }
  async connect(signal: AbortSignal) {
    if (signal.aborted) throw new Error('Remote connection cancelled.');
    const stop = () => this.close();
    signal.addEventListener('abort', stop, { once: true });
    void this.closed.then(() => signal.removeEventListener('abort', stop));
    try {
      await verifyRemoteMembership(this.session);
      this.mark('membership verified');
      if (signal.aborted || this.stopped) throw new Error('Remote connection cancelled.');
      await ensureRemoteSession(this.session);
      if (signal.aborted) throw new Error('Remote connection cancelled.');
      const keys = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const publicKey = keys.publicKey.trim();
      const issueTicket = () =>
        accountRead(this.session, `/v2/remote/sessions/${this.session.remoteSessionId}/ticket`, {
          clientPublicKey: publicKey,
        });
      let bootstrap;
      try {
        bootstrap = await issueTicket();
      } catch (error) {
        if (!(error instanceof RemoteAccountError) || ![404, 410].includes(error.status))
          throw error;
        delete this.session.remoteSessionId;
        delete this.session.remoteSessionExpiresAt;
        await ensureRemoteSession(this.session);
        bootstrap = await issueTicket();
      }
      if (
        typeof bootstrap?.ticket !== 'string' ||
        bootstrap.ticket.length > 8192 ||
        !Number.isFinite(bootstrap.expiresAt) ||
        bootstrap.expiresAt <= Date.now()
      )
        throw new Error('Invalid remote connection ticket.');
      if (signal.aborted || this.stopped) throw new Error('Remote connection cancelled.');
      const ready = new Promise<void>((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
      const timeout = setTimeout(() => this.fail('Remote server connection timed out.'), 45_000);
      void ready.finally(() => clearTimeout(timeout)).catch(() => {});
      const socket = (this.socket = new WebSocket(signalAddress(bootstrap.signalUrl), {
        maxPayload: 64 * 1024,
        handshakeTimeout: 15_000,
      }));
      socket.on('open', () => {
        socket.send(
          JSON.stringify({
            type: 'hello',
            version: 1,
            peer: 'client',
            token: bootstrap.ticket,
            waitForHost: true,
          }),
        );
      });
      socket.on('error', () => this.fail('Remote signaling connection failed.'));
      socket.on('close', () => this.fail('Remote signaling connection closed.'));
      let processing = Promise.resolve();
      const candidates: any[] = [];
      socket.on('message', (bytes) => {
        processing = processing
          .then(async () => {
            if (this.stopped) return;
            const frame = JSON.parse(bytes.toString());
            if (frame.version !== 1) throw new Error('Unsupported remote signaling version.');
            if (frame.type === 'error') throw new Error('Remote server refused the connection.');
            if (frame.type === 'ready' && !this.pc && frame.connectionId) {
              this.mark('signal ready');
              if (typeof frame.connectionId !== 'string' || !Array.isArray(frame.iceServers))
                throw new Error('Invalid remote connection.');
              this.connectionId = frame.connectionId;
              const pc = (this.pc = new RTCPeerConnection({
                iceServers: frame.iceServers,
                bundlePolicy: 'max-bundle',
                iceUseIpv6: false,
                iceAdditionalHostAddresses: ['127.0.0.1'],
                iceStunGatherTimeout: 2,
                iceTurnConnectTimeout: 3,
              }));
              pc.onconnectionstatechange = () => {
                if (['failed', 'closed', 'disconnected'].includes(pc.connectionState))
                  this.fail('Remote peer disconnected.');
              };
              // setLocalDescription gathers candidates into the offer. Do not send ICE
              // before the offer: Openbot's host has no peer connection to receive it yet.
              for (const [kind, name] of [
                ['rpc', 'openbot-team-v2-rpc'],
                ['events', 'openbot-team-v2-events'],
                ['files', 'openbot-team-v2-files'],
                ['desktop', 'openbot.remote-desktop.signal.v1'],
              ]) {
                const channel = pc.createDataChannel(name);
                this.channels.set(kind, channel);
                const decoder = new RemoteFrames();
                channel.onopen = () => {
                  if (
                    this.proof ||
                    this.stopped ||
                    ![...this.channels.values()].every((c) => c.readyState === 'open')
                  )
                    return;
                  try {
                    this.proof = {
                      hostId: this.session.serverId,
                      sessionId: this.session.remoteSessionId!,
                      ticket: bootstrap.ticket,
                      clientPublicKey: publicKey,
                      clientNonce: randomBytes(32).toString('base64url'),
                      clientFingerprint: dtlsFingerprint(pc.localDescription!.sdp),
                      hostFingerprint: dtlsFingerprint(pc.remoteDescription!.sdp),
                    };
                    this.mark('client proof sent');
                    this.send('rpc', {
                      version: 2,
                      type: 'auth-init',
                      ticket: bootstrap.ticket,
                      clientPublicKey: publicKey,
                      clientNonce: this.proof.clientNonce,
                      signature: clientProof(this.proof, keys.privateKey),
                    });
                  } catch {
                    this.fail('Remote authentication could not start.');
                  }
                };
                channel.onclose = () => this.fail('Remote data channel closed.');
                channel.onerror = () => this.fail('Remote data channel failed.');
                if (kind === 'desktop') continue;
                channel.onmessage = ({ data }) => {
                  try {
                    const text = decoder.push(typeof data === 'string' ? data : Buffer.from(data));
                    if (text === undefined) return;
                    if (kind === 'files') {
                      if (!this.authenticated) throw new Error('Unauthenticated avatar transfer.');
                      this.downloads.receive(text, this.avatarReads > 0, (frame) =>
                        this.send('files', frame),
                      );
                    } else {
                      if (typeof text !== 'string') throw new Error('Unexpected binary RPC.');
                      this.receive(kind, JSON.parse(text));
                    }
                  } catch {
                    this.fail('Remote protocol validation failed.');
                  }
                };
              }
              await pc.setLocalDescription(await pc.createOffer());
              if (!this.stopped)
                socket.send(
                  JSON.stringify({
                    type: 'offer',
                    version: 1,
                    channel: 'team',
                    connectionId: this.connectionId,
                    sdp: pc.localDescription!.sdp,
                  }),
                );
              this.mark('offer sent');
              // Reconnect before the one-hour TURN credential lifetime; no background media activity.
              this.refresh = setTimeout(() => this.close(), 40 * 60_000);
              this.refresh.unref();
            } else if (
              frame.connectionId === this.connectionId &&
              frame.channel === 'team' &&
              frame.type === 'answer'
            ) {
              this.mark('host answer received');
              dtlsFingerprint(frame.sdp);
              await this.pc!.setRemoteDescription({ type: 'answer', sdp: frame.sdp });
              for (const candidate of candidates.splice(0))
                await this.pc!.addIceCandidate(candidate);
            } else if (
              frame.connectionId === this.connectionId &&
              frame.channel === 'team' &&
              frame.type === 'ice-candidate'
            ) {
              const candidate = {
                candidate: frame.candidate,
                sdpMid: frame.sdpMid,
                sdpMLineIndex: frame.sdpMLineIndex,
              };
              if (this.pc?.remoteDescription) await this.pc.addIceCandidate(candidate);
              else {
                if (candidates.length >= 256) throw new Error('Too many remote candidates.');
                candidates.push(candidate);
              }
            } else if (frame.type === 'disconnect' && frame.connectionId === this.connectionId)
              this.fail('Remote host disconnected after ' + this.stage + '.');
          })
          .catch(() => this.fail('Remote signaling protocol failed.'));
      });
      await ready;
      if (signal.aborted) throw new Error('Remote connection cancelled.');
      return this;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  private send(kind: string, frame: unknown) {
    const channel = this.channels.get(kind);
    const text = JSON.stringify(frame);
    if (
      this.stopped ||
      channel?.readyState !== 'open' ||
      Buffer.byteLength(text) > 60 * 1024 ||
      channel.bufferedAmount > 1024 * 1024
    )
      throw new Error('Remote channel is not writable.');
    channel.send(text);
  }
  private receive(kind: string, frame: any) {
    if (frame?.version !== 2) throw new Error('Invalid remote transport version.');
    if (kind === 'rpc' && frame.type === 'auth-ready') {
      if (!this.proof || this.hostNonce || this.authenticated)
        throw new Error('Unexpected remote authentication.');
      this.hostNonce = verifyHostProof(this.proof, frame, this.session.hostPublicKey);
      this.mark('host proof verified');
      this.send('rpc', {
        version: 2,
        type: 'auth-complete',
        clientNonce: this.proof.clientNonce,
        hostNonce: this.hostNonce,
      });
    } else if (kind === 'rpc' && frame.type === 'auth-confirmed') {
      if (
        this.authenticated ||
        !this.hostNonce ||
        frame.hostNonce !== this.hostNonce ||
        frame.clientNonce !== this.proof?.clientNonce
      )
        throw new Error('Invalid authentication confirmation.');
      this.authenticated = true;
      this.mark('authentication confirmed');
      this.send('events', { version: 2, type: 'event-ack', throughSequence: 0 });
      this.resolveReady();
      for (const event of this.earlyEvents.splice(0)) this.receive('events', event);
    } else if (!this.authenticated) {
      if (kind === 'events' && this.hostNonce && this.earlyEvents.length < 8)
        this.earlyEvents.push(frame);
      else throw new Error('Remote peer sent unauthenticated data.');
    } else if (kind === 'rpc' && frame.type === 'response') {
      const pending = this.pending.get(frame.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(frame.requestId);
      if (frame.error)
        pending.reject(
          new Error(`Remote Team API returned HTTP ${Number(frame.error.status) || 500}.`),
        );
      else if (frame.result?.status >= 200 && frame.result.status < 300) {
        if (pending.asset) {
          const file = frame.result.file;
          if (
            !file ||
            typeof file.transferId !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(file.transferId) ||
            !Number.isSafeInteger(file.size) ||
            file.size < 1 ||
            !imageMimes.includes(file.mimeType) ||
            file.size > 2 * 1024 * 1024
          )
            pending.reject(new Error('Invalid avatar response.'));
          else void this.downloads.wait(file.transferId).then(pending.resolve, pending.reject);
        } else if (frame.result.file) pending.reject(new Error('Unexpected file response.'));
        else pending.resolve(frame.result.body);
      } else
        pending.reject(
          new Error(`Remote Team API returned HTTP ${Number(frame.result?.status) || 500}.`),
        );
    } else if (kind === 'events') {
      if (frame.type === 'event-reset') {
        if (!Number.isSafeInteger(frame.nextSequence) || frame.nextSequence < 1)
          throw new Error('Invalid remote sequence.');
        this.sequence = frame.nextSequence - 1;
        this.send('events', { version: 2, type: 'event-ack', throughSequence: this.sequence });
        this.requestSnapshot();
      } else if (frame.type === 'event') {
        if (
          !Number.isSafeInteger(frame.sequence) ||
          frame.sequence < 1 ||
          frame.sequence > this.sequence + 1
        )
          throw new Error('Remote event sequence gap.');
        if (frame.sequence > this.sequence) {
          this.sequence = frame.sequence;
          this.emit('event', frame.payload);
        }
        this.send('events', { version: 2, type: 'event-ack', throughSequence: this.sequence });
      } else throw new Error('Unexpected remote event control.');
    } else throw new Error('Unexpected remote RPC frame.');
  }
  requestAvatar(path: string): Promise<AvatarImage> {
    if (!avatarPathPattern.test(path))
      return Promise.reject(new Error('Avatar path is not permitted.'));
    if (this.avatarReads >= 4) return Promise.reject(new Error('Avatar download limit exceeded.'));
    this.avatarReads++;
    return this.request(path, undefined, true).finally(() => this.avatarReads--);
  }
  request(path: string, body?: unknown, asset = false): Promise<any> {
    const payload = remoteReadPayload(path, body);
    if (this.pending.size >= 64) return Promise.reject(new Error('Remote read limit exceeded.'));
    if (!this.authenticated || this.stopped)
      return Promise.reject(new Error('Remote session is disconnected.'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Remote read timed out.'));
      }, 15_000);
      this.pending.set(requestId, { resolve, reject, timer, asset });
      try {
        this.send('rpc', {
          version: 2,
          type: 'request',
          requestId,
          operation: 'http.request',
          payload,
        });
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error('Remote read could not be sent.'));
      }
    });
  }
  requestSnapshot() {
    this.send('events', {
      version: 2,
      type: 'event-control',
      control: { type: 'runtime-snapshot-request' },
    });
  }
  private fail(message: string) {
    if (!this.stopped) {
      this.rejectReady(new Error(message));
      this.close();
    }
  }
  close() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.refresh);
    this.rejectReady(new Error('Remote connection closed.'));
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Remote connection closed.'));
    }
    this.pending.clear();
    this.downloads.clear();
    this.earlyEvents = [];
    this.socket?.terminate();
    void this.pc?.close().catch(() => {});
    this.resolveClosed();
  }
}
