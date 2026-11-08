import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import { loadSession, discover, request } from '../probe.ts';
import { capabilities, sessionExpired } from '../protocol.ts';
import { OfficeStore } from '../state.ts';
import type { OfficeConnector } from './types.ts';
import { avatarPathPattern, validAvatarImage } from '../avatars.ts';
export function openbotConnector(options: Record<string, unknown>): OfficeConnector {
  let current: { base: string; token: string; protocol: number } | undefined;
  let delegate: OfficeConnector | undefined;
  return {
    async avatar(id, version) {
      if (delegate) return delegate.avatar?.(id, version);
      if (!current) return;
      const path = `/v1/agents/${encodeURIComponent(id)}/avatar?v=${encodeURIComponent(version)}`;
      if (!avatarPathPattern.test(path)) return;
      const response = await fetch(current.base + path, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: 'Bearer ' + current.token,
          'OpenBot-Protocol-Version': String(current.protocol),
          'OpenBot-App-Version': '0.1.0',
          'OpenBot-Capabilities': capabilities.join(','),
        },
      });
      if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024)
        return;
      const reader = response.body?.getReader();
      if (!reader) return;
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 2 * 1024 * 1024) return;
          parts.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const image = {
        bytes: Buffer.concat(parts),
        mimeType: response.headers.get('content-type')?.split(';')[0] ?? '',
      };
      return validAvatarImage(image) ? image : undefined;
    },
    async start({ signal, config, emit, saveAppearance }) {
      if (options.transport === 'remote') {
        const { remoteConnector } = await import('./openbot-remote.ts');
        delegate = remoteConnector(options);
        return delegate.start({ signal, config, emit, saveAppearance });
      }
      const office = new OfficeStore(config);
      let ws: WebSocket | undefined;
      const publish = () =>
        emit({ ...office.snapshot(), source: { id: 'openbot', label: 'Openbot', mode: 'live' } });
      const stop = () => {
        current = undefined;
        ws?.terminate();
      };
      signal.addEventListener('abort', stop, { once: true });
      let retry = 1000;
      while (!signal.aborted) {
        try {
          const session = await loadSession(options);
          if (sessionExpired(session.sessionExpiresAt)) throw new Error('sign-in-required');
          const host = await discover(session, options);
          current = { base: host.base, token: session.sessionToken, protocol: host.protocol };
          if (signal.aborted) break;
          const read = (path: string, body?: unknown) =>
            request(host.base, path, session.sessionToken, body, false, host.protocol);
          let alive = true,
            polling = false;
          async function refresh() {
            if (polling || !alive) return;
            polling = true;
            try {
              const roster = await read('/v1/agents');
              if (!Array.isArray(roster)) throw new Error('Invalid roster');
              office.roster(roster);
              office.layout(await read('/v1/sidebar-layout'));
              if (host.support.capabilities.includes('channel-chats-v1')) {
                try {
                  const channels = await read('/v1/channels');
                  if (Array.isArray(channels)) office.channels(channels);
                } catch (e) {
                  if (e instanceof Error && /HTTP (403|404)/.test(e.message)) office.channels([]);
                  else throw e;
                }
              } else office.channels([]);
              await saveAppearance({ characters: config.characters, deskSlots: config.deskSlots });
              for (const a of roster) {
                if (!alive) break;
                const queue = await read(`/v1/agents/${encodeURIComponent(a.id)}/queue`);
                office.event({ type: 'queue-changed', snapshot: queue });
                if (host.support.capabilities.includes('agent-tasks-v1'))
                  office.event({
                    type: 'agent-tasks-changed',
                    snapshot: await read('/v1/agent-tasks/list', { agentId: a.id }),
                  });
              }
              publish();
            } finally {
              polling = false;
            }
          }
          office.resetRuntime();
          await refresh();
          if (signal.aborted) break;
          await new Promise<void>((resolve, reject) => {
            ws = new WebSocket(
              host.base.replace(/^http/, 'ws') + '/v1/events',
              ['openbot-team-v1', 'openbot-token.' + session.sessionToken],
              { maxPayload: 4 * 1024 * 1024, handshakeTimeout: 5000 },
            );
            let lastSnapshot = Date.now();
            const timer = setInterval(() => {
              if (Date.now() - lastSnapshot > 20000) {
                office.connection('disconnected', 'Openbot feed stopped · last known state');
                publish();
                ws?.terminate();
                return;
              }
              if (ws?.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'runtime-snapshot-request' }));
              void refresh().catch(() => {
                ws?.close();
              });
            }, 5000);
            ws.on('open', () => {
              retry = 1000;
              ws!.send(
                JSON.stringify({
                  type: 'agent-event-scope',
                  includeConversations: false,
                  capabilities: capabilities.filter((c) => host.support.capabilities.includes(c)),
                }),
              );
              ws!.send(JSON.stringify({ type: 'runtime-snapshot-request' }));
            });
            ws.on('message', (data) => {
              try {
                const event = JSON.parse(data.toString());
                if (
                  event.type === 'bots-changed' ||
                  event.type === 'agents-changed' ||
                  event.type === 'sidebar-layout-changed' ||
                  event.type === 'channels-changed'
                )
                  void refresh().catch(() => ws?.close());
                office.event(event);
                if (event.type === 'runtime-snapshot') {
                  lastSnapshot = Date.now();
                  office.connection('connected', 'Live from Openbot', host.support.appVersion);
                }
                publish();
              } catch {
                /* Ignore malformed events; do not log payloads. */
              }
            });
            ws.on('error', () => {});
            ws.on('close', () => {
              current = undefined;
              alive = false;
              clearInterval(timer);
              resolve();
            });
          });
          office.connection('disconnected', 'Openbot disconnected · last known state');
          publish();
        } catch (e) {
          current = undefined;
          const needsLogin = e instanceof Error && /session|sign-in|HTTP 401/.test(e.message);
          const incompatibility =
            e instanceof Error &&
            /requires Openbot Team protocol|Runtime snapshots and sidebar layout are required/.test(
              e.message,
            )
              ? e.message
              : null;
          office.connection(
            needsLogin ? 'sign-in-required' : 'disconnected',
            needsLogin
              ? 'Run npm run connect to sign in to Openbot'
              : (incompatibility ?? 'Waiting for Openbot · retrying automatically'),
          );
          publish();
        }
        if (!signal.aborted)
          try {
            await delay(retry, undefined, { signal });
          } catch {}
        retry = Math.min(15000, retry * 2);
      }
      signal.removeEventListener('abort', stop);
    },
  };
}
