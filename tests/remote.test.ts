import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RTCPeerConnection } from 'werift';
import { RemotePeer } from '../src/remote-peer.ts';
import { accountRead, remoteAccountRoute, type RemoteSession } from '../src/remote-account.ts';
import {
  clientProof,
  dtlsFingerprint,
  hostFingerprint,
  proofTranscript,
  RemoteFrames,
  remoteReadPayload,
  signalAddress,
  verifyHostProof,
  type RemoteProof,
} from '../src/remote-wire.ts';

const keys = () =>
  generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
test('remote mutual proofs bind both identities, ticket, nonces and DTLS fingerprints', () => {
  const client = keys(),
    host = keys();
  const proof: RemoteProof = {
    hostId: 'host',
    sessionId: 'session',
    ticket: 'ticket',
    clientPublicKey: client.publicKey.trim(),
    clientNonce: 'x'.repeat(32),
    clientFingerprint: 'client-dtls',
    hostFingerprint: 'host-dtls',
  };
  assert.ok(
    verify(
      null,
      Buffer.from(proofTranscript(proof)),
      client.publicKey,
      Buffer.from(clientProof(proof, client.privateKey), 'base64url'),
    ),
  );
  const frame = {
    version: 2,
    type: 'auth-ready',
    clientNonce: proof.clientNonce,
    hostNonce: 'y'.repeat(32),
    signature: sign(
      null,
      Buffer.from(proofTranscript(proof, 'y'.repeat(32))),
      host.privateKey,
    ).toString('base64url'),
  };
  assert.equal(verifyHostProof(proof, frame, host.publicKey), frame.hostNonce);
  for (const change of [
    { hostId: 'other' },
    { ticket: 'other' },
    { sessionId: 'other' },
    { clientFingerprint: 'other' },
    { hostFingerprint: 'other' },
  ])
    assert.throws(() => verifyHostProof({ ...proof, ...change }, frame, host.publicKey));
  assert.throws(() => verifyHostProof(proof, { ...frame, clientNonce: 'other' }, host.publicKey));
  assert.throws(() => verifyHostProof(proof, frame, keys().publicKey));
});
test('remote policy permits only office reads and connection setup', () => {
  assert.equal(remoteReadPayload('/v1/agents').method, 'GET');
  assert.equal(remoteReadPayload('/v1/agent-tasks/list', { agentId: 'agent' }).method, 'POST');
  for (const path of [
    '/v1/agents/create',
    '/v1/agents/a/messages',
    '/v1/channels/a/messages',
    '/v1/approvals/answer',
    'https://foreign.example/v1/agents',
    '/v1/agents?token=bad',
  ])
    assert.throws(() => remoteReadPayload(path, {}));
  assert.ok(remoteAccountRoute('GET', '/v2/remote/hosts/'));
  assert.ok(remoteAccountRoute('POST', '/v2/remote/sessions/session/ticket'));
  for (const path of [
    '/v2/remote/hosts/delete',
    '/v2/remote/hosts/host/invites',
    '/v2/remote/sessions/../ticket',
  ])
    assert.equal(remoteAccountRoute('POST', path), false);
  assert.throws(() => signalAddress('ws://remote.example/signal'));
  assert.throws(() => signalAddress('wss://user:password@remote.example/signal'));
  assert.throws(() => dtlsFingerprint('a=fingerprint:sha-256 invalid'));
});
test('remote text fragmentation is contiguous, bounded and expires incomplete messages', () => {
  const decoder = new RemoteFrames();
  const chunk = (id: number, size: number, offset: number, text: string) => {
    const b = Buffer.alloc(17 + Buffer.byteLength(text));
    b.writeUInt32BE(0x4f425732);
    b.writeUInt32BE(id, 4);
    b.writeUInt32BE(size, 8);
    b.writeUInt32BE(offset, 12);
    b[16] = 1;
    b.write(text, 17);
    return b;
  };
  assert.equal(decoder.push(chunk(1, 5, 0, 'hel'), 0), undefined);
  assert.equal(decoder.push(chunk(1, 5, 3, 'lo'), 1), 'hello');
  assert.throws(() => decoder.push(chunk(2, 3, 1, 'a')));
  assert.throws(() => decoder.push(chunk(3, 3 * 1024 * 1024, 0, 'x')));
  decoder.push(chunk(4, 2, 0, 'a'), 0);
  assert.throws(() => decoder.push(chunk(4, 2, 1, 'b'), 31_000));
  assert.throws(() => decoder.push(Buffer.from('not an envelope')));
});

test(
  'remote transport completes actual WebRTC mutual authentication, reads and sequenced runtime events',
  { timeout: 30_000 },
  async () => {
    const host = keys();
    const operations: string[] = [];
    const peers: RTCPeerConnection[] = [];
    let accountBase = '',
      signalBase = '';
    const http = createServer((req, res) => {
      operations.push(req.method + ' ' + req.url);
      assert.equal(req.headers.authorization, 'Bearer test-dashboard-session');
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v2/remote/hosts/')
        res.end(
          JSON.stringify({
            hosts: [{ hostId: 'host', role: 'owner', devicePublicKey: host.publicKey }],
          }),
        );
      else if (req.url === '/v2/remote/sessions/ended/ticket') {
        res.statusCode = 410;
        res.end(JSON.stringify({ error: 'PRIVATE SERVER DETAIL' }));
      } else if (req.url === '/v2/remote/sessions/')
        res.end(
          JSON.stringify({
            hostId: 'host',
            sessionId: 'session',
            expiresAt: Date.now() + 60 * 60_000,
          }),
        );
      else if (req.url === '/v2/remote/sessions/session/ticket')
        res.end(
          JSON.stringify({
            ticket: 'test-signal-ticket',
            signalUrl: signalBase,
            expiresAt: Date.now() + 60_000,
          }),
        );
      else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    accountBase = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    const signal = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => signal.once('listening', resolve));
    signalBase = `ws://127.0.0.1:${(signal.address() as { port: number }).port}`;
    signal.on('connection', (socket) => {
      const pc = new RTCPeerConnection({
        iceServers: [],
        iceUseIpv6: false,
        iceInterfaceAddresses: { udp4: '127.0.0.1' },
      });
      peers.push(pc);
      let rpc: any,
        events: any,
        proof: RemoteProof,
        sequence = 0;
      pc.ondatachannel = ({ channel }) => {
        if (channel.label === 'openbot-team-v2-rpc') rpc = channel;
        if (channel.label === 'openbot-team-v2-events') events = channel;
        channel.onmessage = ({ data }) => {
          const frame = JSON.parse(String(data));
          if (frame.type === 'auth-init') {
            proof = {
              hostId: 'host',
              sessionId: 'session',
              ticket: frame.ticket,
              clientPublicKey: frame.clientPublicKey,
              clientNonce: frame.clientNonce,
              clientFingerprint: dtlsFingerprint(pc.remoteDescription!.sdp),
              hostFingerprint: dtlsFingerprint(pc.localDescription!.sdp),
            };
            assert.equal(frame.ticket, 'test-signal-ticket');
            assert.ok(
              verify(
                null,
                Buffer.from(proofTranscript(proof)),
                frame.clientPublicKey,
                Buffer.from(frame.signature, 'base64url'),
              ),
            );
            rpc.send(
              JSON.stringify({
                version: 2,
                type: 'auth-ready',
                clientNonce: proof.clientNonce,
                hostNonce: 'z'.repeat(32),
                signature: sign(
                  null,
                  Buffer.from(proofTranscript(proof, 'z'.repeat(32))),
                  host.privateKey,
                ).toString('base64url'),
              }),
            );
          } else if (frame.type === 'auth-complete') {
            assert.equal(frame.clientNonce, proof.clientNonce);
            assert.equal(frame.hostNonce, 'z'.repeat(32));
            rpc.send(JSON.stringify({ ...frame, type: 'auth-confirmed' }));
          } else if (frame.type === 'request') {
            assert.equal(frame.operation, 'http.request');
            operations.push(frame.payload.method + ' ' + frame.payload.path);
            assert.equal(frame.payload.path, '/v1/agents');
            rpc.send(
              JSON.stringify({
                version: 2,
                type: 'response',
                requestId: frame.requestId,
                result: { status: 200, body: [{ id: 'agent', name: 'Test agent' }] },
              }),
            );
          } else if (frame.type === 'event-control') {
            assert.equal(frame.control.type, 'runtime-snapshot-request');
            events.send(
              JSON.stringify({
                version: 2,
                type: 'event',
                sequence: ++sequence,
                payload: {
                  type: 'runtime-snapshot',
                  snapshot: { bots: [{ id: 'agent' }], activeTurns: [] },
                },
              }),
            );
          } else assert.equal(frame.type, 'event-ack');
        };
      };
      let chain = Promise.resolve(),
        offerReceived = false;
      socket.on('message', (data) => {
        chain = chain.then(async () => {
          const frame = JSON.parse(String(data));
          // Chrome's Openbot host rejects ICE delivered before its offer exists.
          if (frame.type === 'ice-candidate') assert.ok(offerReceived);
          if (frame.type === 'hello') {
            assert.equal(frame.token, 'test-signal-ticket');
            socket.send(
              JSON.stringify({
                version: 1,
                type: 'ready',
                connectionId: 'connection',
                iceServers: [],
              }),
            );
          }
          if (frame.type === 'offer') {
            offerReceived = true;
            await pc.setRemoteDescription({ type: 'offer', sdp: frame.sdp });
            await pc.setLocalDescription(await pc.createAnswer());
            socket.send(
              JSON.stringify({
                version: 1,
                type: 'answer',
                connectionId: 'connection',
                channel: 'team',
                sdp: pc.localDescription!.sdp,
              }),
            );
          }
        });
      });
    });
    const saved: RemoteSession = {
      authKind: 'remote',
      accountApiUrl: accountBase,
      accountToken: 'test-dashboard-session',
      serverId: 'host',
      hostPublicKey: host.publicKey,
      fingerprint: hostFingerprint(host.publicKey),
      remoteSessionId: 'ended',
      remoteSessionExpiresAt: Date.now() + 60 * 60_000,
    };
    const client = new RemotePeer(saved);
    try {
      await client.connect(AbortSignal.timeout(20_000));
      assert.deepEqual(await client.request('/v1/agents'), [{ id: 'agent', name: 'Test agent' }]);
      assert.throws(() => client.request('/v1/agents/a/messages', { text: 'never send' }));
      const event = new Promise<any>((resolve) => client.once('event', resolve));
      client.requestSnapshot();
      assert.equal((await event).type, 'runtime-snapshot');
      assert.deepEqual(operations, [
        'GET /v2/remote/hosts/',
        'POST /v2/remote/sessions/ended/ticket',
        'POST /v2/remote/sessions/',
        'POST /v2/remote/sessions/session/ticket',
        'GET /v1/agents',
      ]);
      await assert.rejects(
        () => accountRead(saved, '/v2/remote/hosts/delete', {}),
        /not permitted/,
      );
    } finally {
      client.close();
      for (const pc of peers) await pc.close();
      for (const socket of signal.clients) socket.terminate();
      await new Promise<void>((resolve) => signal.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  },
);
