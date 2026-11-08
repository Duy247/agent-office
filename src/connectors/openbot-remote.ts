import { setTimeout as delay } from 'node:timers/promises';
import { loadProtectedSession, saveProtectedSession } from '../session-store.ts';
import { RemotePeer } from '../remote-peer.ts';
import { negotiate } from '../protocol.ts';
import { OfficeStore } from '../state.ts';
import type { OfficeConnector } from './types.ts';
import type { RemoteSession } from '../remote-account.ts';

export function remoteConnector(options: Record<string, unknown>): OfficeConnector {
  return {
    async start({ signal, config, emit, saveAppearance }) {
      const office = new OfficeStore(config);
      const publish = () =>
        emit({ ...office.snapshot(), source: { id: 'openbot', label: 'Openbot', mode: 'live' } });
      let peer: RemotePeer | undefined,
        retry = 1000;
      const stop = () => peer?.close();
      signal.addEventListener('abort', stop, { once: true });
      try {
        while (!signal.aborted) {
          let timer: ReturnType<typeof setInterval> | undefined;
          let active = true;
          try {
            const session = (await loadProtectedSession(options.profile)) as RemoteSession;
            if (session.authKind !== 'remote') throw new Error('sign-in-required');
            if (typeof options.hostId === 'string' && options.hostId !== session.serverId)
              throw new Error('Saved remote session does not match this server.');
            peer = new RemotePeer(session);
            await peer.connect(signal);
            if (signal.aborted) break;
            await saveProtectedSession(session, options.profile);
            const current = peer;
            const support = await current.request('/v1/compatibility');
            negotiate(support);
            const identity = await current.request('/v1/identity');
            if (
              identity.serverId !== session.serverId ||
              identity.fingerprint !== session.fingerprint
            )
              throw new Error('Remote host identity mismatch.');
            let lastSnapshot = Date.now(),
              polling = false;
            const refresh = async () => {
              if (polling || signal.aborted || !active) return;
              polling = true;
              try {
                const roster = await current.request('/v1/agents');
                if (!active || signal.aborted) return;
                if (!Array.isArray(roster)) throw new Error('Invalid remote roster.');
                office.roster(roster);
                office.layout(await current.request('/v1/sidebar-layout'));
                if (support.capabilities.includes('channel-chats-v1')) {
                  try {
                    office.channels(await current.request('/v1/channels'));
                  } catch (e) {
                    if (e instanceof Error && /HTTP (403|404)/.test(e.message)) office.channels([]);
                    else throw e;
                  }
                }
                for (const agent of roster) {
                  if (!active || signal.aborted) return;
                  office.event({
                    type: 'queue-changed',
                    snapshot: await current.request(
                      `/v1/agents/${encodeURIComponent(agent.id)}/queue`,
                    ),
                  });
                  if (support.capabilities.includes('agent-tasks-v1'))
                    office.event({
                      type: 'agent-tasks-changed',
                      snapshot: await current.request('/v1/agent-tasks/list', {
                        agentId: agent.id,
                      }),
                    });
                }
                if (active && !signal.aborted) {
                  await saveAppearance({
                    characters: config.characters,
                    deskSlots: config.deskSlots,
                  });
                  publish();
                }
              } finally {
                polling = false;
              }
            };
            office.resetRuntime();
            current.on('event', (event) => {
              if (!active || signal.aborted) return;
              if (
                [
                  'agents-changed',
                  'bots-changed',
                  'sidebar-layout-changed',
                  'channels-changed',
                ].includes(event?.type)
              )
                void refresh().catch(() => current.close());
              office.event(event);
              if (event?.type === 'runtime-snapshot') {
                lastSnapshot = Date.now();
                retry = 1000;
                office.connection('connected', 'Live from Openbot', support.appVersion);
              }
              publish();
            });
            await refresh();
            current.requestSnapshot();
            timer = setInterval(() => {
              if (Date.now() - lastSnapshot > 20_000) {
                current.close();
                return;
              }
              try {
                current.requestSnapshot();
              } catch {
                current.close();
              }
              void refresh().catch(() => current.close());
            }, 5000);
            await current.closed;
            office.connection('disconnected', 'Remote Openbot disconnected · last known state');
            publish();
          } catch (error) {
            const needsLogin =
              error instanceof Error &&
              /sign-in-required|protected session|HTTP 401/.test(error.message);
            office.connection(
              needsLogin ? 'sign-in-required' : 'disconnected',
              needsLogin
                ? 'Connect this server locally to sign in again.'
                : 'Remote Openbot unavailable · retrying',
            );
            publish();
          } finally {
            active = false;
            clearInterval(timer);
            peer?.close();
            peer = undefined;
          }
          if (!signal.aborted) await delay(retry, undefined, { signal }).catch(() => {});
          retry = Math.min(retry * 2, 15_000);
        }
      } finally {
        signal.removeEventListener('abort', stop);
        peer?.close();
      }
    },
  };
}
