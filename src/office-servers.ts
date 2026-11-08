import type { OfficeSnapshot, OfficeServer } from './shared.ts';
import type { OfficeConnector } from './connectors/types.ts';
import { publicSnapshot } from './boundary.ts';
import { profileName } from './session-store.ts';
import { teamEndpoint } from './protocol.ts';

export interface ServerDefinition extends OfficeServer {
  type: string;
  options: Record<string, unknown>;
}
const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
const label = (value: unknown, fallback: string) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, 80) || fallback
    : fallback;

export function serverDefinitions(config: any): ServerDefinition[] {
  const type = config.connector?.type ?? 'demo';
  const servers: ServerDefinition[] = [
    {
      id: 'default',
      name: label(
        config.serverName,
        type === 'openbot' ? 'Openbot' : type === 'demo' ? 'Demo office' : 'Office feed',
      ),
      type,
      options: config.connector?.options ?? {},
    },
  ];
  if (
    config.servers !== undefined &&
    (!Array.isArray(config.servers) || config.servers.length > 15)
  )
    throw new Error('Configure at most 15 additional Openbot servers.');
  const profiles = new Set(type === 'openbot' ? [profileName(servers[0].options.profile)] : []);
  for (const raw of config.servers ?? []) {
    if (
      typeof raw?.id !== 'string' ||
      !identifier.test(raw.id) ||
      ['__proto__', 'constructor', 'prototype'].includes(raw.id) ||
      servers.some((s) => s.id === raw.id)
    )
      throw new Error(
        'Server IDs must be unique and use 1–64 letters, numbers, underscores or hyphens.',
      );
    const options = raw.options;
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      typeof options.profile !== 'string'
    )
      throw new Error('Each additional server requires its own credential profile.');
    const profile = profileName(options.profile);
    if (profiles.has(profile)) throw new Error('Servers must use separate credential profiles.');
    profiles.add(profile);
    if (options.baseUrl !== undefined) teamEndpoint(options.baseUrl);
    servers.push({ id: raw.id, name: label(raw.name, raw.id), type: 'openbot', options });
  }
  return servers;
}
export function publicServers(definitions: ServerDefinition[]): OfficeServer[] {
  return definitions.map(({ id, name }) => ({ id, name }));
}
export function serverConfig(config: any, id: string) {
  const copy = structuredClone(config);
  if (id !== 'default') {
    copy.characters = copy.serverAppearance?.[id]?.characters ?? {};
    copy.deskSlots = copy.serverAppearance?.[id]?.deskSlots ?? {};
  }
  return copy;
}

/** One shared read-only feed per configured server; selections belong to subscribers. */
export class OfficeFeeds {
  readonly definitions: ServerDefinition[];
  private feeds = new Map<
    string,
    {
      snapshot: OfficeSnapshot;
      wire: string;
      listeners: Set<(wire: string) => void>;
      controller?: AbortController;
      timer?: ReturnType<typeof setTimeout>;
      generation: number;
    }
  >();
  private config: any;
  private factory: (type: string, options: Record<string, unknown>) => OfficeConnector;
  private save: (patch: any) => Promise<void>;
  private idleMs: number;
  constructor(
    config: any,
    factory: (type: string, options: Record<string, unknown>) => OfficeConnector,
    save: (patch: any) => Promise<void>,
    idleMs = 30_000,
  ) {
    this.config = config;
    this.factory = factory;
    this.save = save;
    this.idleMs = idleMs;
    this.definitions = serverDefinitions(config);
  }
  private feed(id: string) {
    const definition = this.definitions.find((s) => s.id === id);
    if (!definition) return;
    let feed = this.feeds.get(id);
    if (!feed) {
      const snapshot = publicSnapshot({
        connection: 'connecting',
        message: 'Connecting to ' + definition.name,
        config: this.config,
      });
      feed = { snapshot, wire: JSON.stringify(snapshot), listeners: new Set(), generation: 0 };
      this.feeds.set(id, feed);
    }
    if (!feed.controller) {
      const current = feed;
      const controller = (current.controller = new AbortController());
      const generation = ++current.generation;
      const publish = (value: OfficeSnapshot) => {
        if (controller.signal.aborted || generation !== current.generation) return;
        current.snapshot = publicSnapshot({
          ...value,
          config: { ...value.config, logo: this.config.logo, boss: this.config.boss },
        });
        const wire = JSON.stringify(current.snapshot);
        if (wire === current.wire) return;
        current.wire = wire;
        for (const listener of current.listeners) listener(wire);
      };
      publish({
        ...current.snapshot,
        connection: 'connecting',
        message: 'Connecting to ' + definition.name,
      });
      void Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) return;
          return this.factory(definition.type, definition.options).start({
            signal: controller.signal,
            config: serverConfig(this.config, id),
            emit: publish,
            saveAppearance: async (patch) => {
              if (controller.signal.aborted || generation !== current.generation) return;
              if (id === 'default') {
                Object.assign(this.config, patch);
                await this.save(patch);
              } else {
                this.config.serverAppearance ??= {};
                this.config.serverAppearance[id] = {
                  ...this.config.serverAppearance[id],
                  ...patch,
                };
                await this.save({ serverAppearance: { [id]: patch } });
              }
            },
          });
        })
        .catch(() =>
          publish({
            ...current.snapshot,
            connection: 'disconnected',
            message: 'Connector stopped. Check this server connection.',
          }),
        );
      this.scheduleIdle(id, current);
    }
    return feed;
  }
  private scheduleIdle(id: string, feed: NonNullable<ReturnType<OfficeFeeds['feed']>>) {
    clearTimeout(feed.timer);
    if (!feed.listeners.size) {
      feed.timer = setTimeout(() => {
        if (this.feeds.get(id) !== feed || feed.listeners.size) return;
        feed.controller?.abort();
        feed.controller = undefined;
      }, this.idleMs);
      feed.timer.unref();
    }
  }
  snapshot(id: string) {
    return this.feed(id)?.wire;
  }
  subscribe(id: string, listener: (wire: string) => void) {
    const feed = this.feed(id);
    if (!feed) return;
    clearTimeout(feed.timer);
    feed.listeners.add(listener);
    listener(feed.wire);
    return () => {
      feed.listeners.delete(listener);
      this.scheduleIdle(id, feed);
    };
  }
  close() {
    for (const feed of this.feeds.values()) {
      clearTimeout(feed.timer);
      feed.controller?.abort();
    }
    this.feeds.clear();
  }
}
