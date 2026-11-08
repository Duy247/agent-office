import type { OfficeAgent, OfficeSnapshot, OfficeState } from './shared.ts';
export type { OfficeAgent, OfficeSnapshot, OfficeState } from './shared.ts';
export const idOf = (v: any) =>
  typeof v?.agentId === 'string' ? v.agentId : typeof v?.botId === 'string' ? v.botId : '';
const labels: Record<OfficeState, string> = {
  idle: 'Available',
  working: 'Working',
  queued: 'Work queued',
  question: 'Waiting for your answer',
  approval: 'Needs your approval',
  takeover: 'Needs browser takeover',
  failed: 'Work failed',
  unknown: 'Waiting for state',
};
const clean = (v: unknown, max = 120) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '';
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
export class OfficeStore {
  state: OfficeSnapshot = {
    connection: 'connecting',
    version: null,
    updatedAt: null,
    message: 'Connecting to Openbot',
    agents: [],
    groups: [],
    recent: [],
    config: { title: 'The office', reducedMotion: false },
  };
  config: any = {};
  private turns = new Map<string, string>();
  private tasks = new Map<string, { running: boolean; queued: number; failed: boolean }>();
  private queues = new Map<string, number>();
  private attention = new Map<string, { agentId: string; kind: OfficeState }>();
  private failed = new Set<string>();
  private runtimeReady = false;
  constructor(config: any = {}) {
    this.config = config;
    this.state.config = {
      title: clean(config.title) || 'The office',
      reducedMotion: config.reducedMotion === true,
    };
  }
  resetRuntime() {
    this.turns.clear();
    this.tasks.clear();
    this.queues.clear();
    this.attention.clear();
    this.failed.clear();
    this.runtimeReady = false;
    this.refresh();
  }
  connection(value: OfficeSnapshot['connection'], message: string, version?: string) {
    this.state.connection = value;
    this.state.message = message;
    if (version) this.state.version = clean(version);
  }
  roster(values: any[]) {
    this.config.characters ??= {};
    const used = new Set(
      Object.values(this.config.characters).filter(
        (v: any) => Number.isInteger(v) && v >= 0 && v < 8,
      ),
    );
    for (const v of values
      .filter((v) => typeof v?.id === 'string')
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const chosen = this.config.characters[v.id];
      if (Number.isInteger(chosen) && chosen >= 0 && chosen < 8) continue;
      const seed = hash(v.id) % 8;
      const character =
        Array.from({ length: 8 }, (_, i) => (seed + i) % 8).find((i) => !used.has(i)) ?? seed;
      this.config.characters[v.id] = character;
      used.add(character);
    }
    this.state.agents = values
      .filter((v) => v && typeof v.id === 'string')
      .map((v) => {
        const old = this.state.agents.find((a) => a.id === v.id);
        return {
          id: v.id,
          name: clean(v.name) || 'Unnamed agent',
          title: clean(v.title),
          provider: clean(v.provider),
          model: clean(v.model),
          groupId: old?.groupId ?? 'unassigned',
          deskIndex: old?.deskIndex ?? 0,
          state: old?.state ?? 'unknown',
          queueCount: 0,
          activity: 'Waiting for state',
          updatedAt: old?.updatedAt ?? null,
          character: this.config.characters[v.id],
          ...(this.config.desks?.[v.id] ? { desk: this.config.desks[v.id] } : {}),
        };
      });
    this.refresh();
  }
  layout(value: any) {
    const sections = Array.isArray(value?.sections) ? value.sections : [];
    this.state.groups = sections
      .filter((g: any) => typeof g.id === 'string')
      .map((g: any) => ({
        id: g.id,
        name: clean(this.config.groups?.[g.id]?.name ?? g.name) || 'Team',
      }));
    for (const a of this.state.agents)
      a.groupId = this.state.groups.some((g) => g.id === value.agentAssignments?.[a.id])
        ? value.agentAssignments[a.id]
        : 'unassigned';
    this.config.deskSlots ??= {};
    for (const a of this.state.agents) {
      const saved = this.config.deskSlots[a.id];
      if (saved?.groupId !== a.groupId || !Number.isInteger(saved?.index) || saved.index < 0) {
        const used = new Set(
          Object.values(this.config.deskSlots)
            .filter((s: any) => s.groupId === a.groupId)
            .map((s: any) => s.index),
        );
        let index = 0;
        while (used.has(index)) index++;
        this.config.deskSlots[a.id] = { groupId: a.groupId, index };
      }
      a.deskIndex = this.config.deskSlots[a.id].index;
    }
    this.refresh();
  }
  event(e: any) {
    if (!e || typeof e.type !== 'string') return;
    const agentId = idOf(e),
      now = new Date().toISOString();
    switch (e.type) {
      case 'runtime-snapshot': {
        const s = e.snapshot;
        if (!s || !Array.isArray(s.activeTurns)) return;
        this.runtimeReady = true;
        this.turns.clear();
        for (const t of s.activeTurns)
          if (typeof t.turnId === 'string') this.turns.set(t.turnId, idOf(t));
        // An incomplete attention snapshot must not clear known pending requests.
        if (s.attentionComplete !== false) this.attention.clear();
        for (const [key, kind] of [
          ['pendingPrompts', 'question'],
          ['pendingApprovals', 'approval'],
          ['pendingBrowserTakeovers', 'takeover'],
        ] as const)
          for (const p of s[key] ?? [])
            this.attention.set(String(p.requestId), { agentId: idOf(p), kind });
        this.failed = new Set((s.failedTurns ?? []).map(idOf));
        break;
      }
      case 'turn-started':
        if (typeof e.turnId === 'string') this.turns.set(e.turnId, agentId);
        this.failed.delete(agentId);
        break;
      case 'turn-completed':
        this.turns.delete(e.turnId);
        if (e.status === 'failed') this.failed.add(agentId);
        else this.failed.delete(agentId);
        break;
      case 'prompt':
        this.attention.set(String(e.requestId), { agentId, kind: 'question' });
        break;
      case 'approval':
        this.attention.set(String(e.approval?.requestId), {
          agentId: idOf(e.approval),
          kind: 'approval',
        });
        break;
      case 'browser-takeover-requested':
        this.attention.set(String(e.request?.requestId), {
          agentId: idOf(e.request),
          kind: 'takeover',
        });
        break;
      case 'agent-input-resolved':
      case 'browser-takeover-resolved':
        this.attention.delete(String(e.requestId));
        break;
      case 'queue-changed': {
        const s = e.snapshot;
        if (!s) return;
        this.queues.set(
          idOf(s),
          (s.deliveries ?? []).filter((d: any) => d.status === 'queued').length,
        );
        break;
      }
      case 'agent-tasks-changed': {
        const s = e.snapshot;
        if (!s || !Array.isArray(s.tasks)) return;
        this.tasks.set(idOf(s), {
          running: s.tasks.some((t: any) => t.state === 'running' || !!t.activeTurnId),
          queued:
            s.tasks.filter((t: any) => t.state === 'queued').length +
            s.tasks.reduce(
              (n: number, t: any) =>
                n + (Array.isArray(t.queuedMessages) ? t.queuedMessages.length : 0),
              0,
            ),
          failed: s.tasks.some((t: any) => t.state !== 'closed' && t.outcome === 'failed'),
        });
        break;
      }
      default:
        return;
    }
    this.refresh();
    this.state.updatedAt = now;
    if (
      [
        'turn-started',
        'turn-completed',
        'prompt',
        'approval',
        'browser-takeover-requested',
        'agent-input-resolved',
      ].includes(e.type) &&
      agentId
    ) {
      if (this.state.recent[0]?.kind !== e.type || this.state.recent[0]?.agentId !== agentId)
        this.state.recent.unshift({ at: now, agentId, kind: e.type });
      this.state.recent = this.state.recent.slice(0, 12);
    }
  }
  private refresh() {
    const active = new Set(this.turns.values());
    for (const a of this.state.agents) {
      const task = this.tasks.get(a.id);
      const attentions = [...this.attention.values()].filter((p) => p.agentId === a.id);
      a.queueCount = (this.queues.get(a.id) ?? 0) + (task?.queued ?? 0);
      const previous = a.state;
      a.state = attentions.some((p) => p.kind === 'approval')
        ? 'approval'
        : attentions.some((p) => p.kind === 'takeover')
          ? 'takeover'
          : attentions.length
            ? 'question'
            : active.has(a.id) || task?.running
              ? 'working'
              : this.failed.has(a.id) || task?.failed
                ? 'failed'
                : a.queueCount
                  ? 'queued'
                  : this.runtimeReady
                    ? 'idle'
                    : 'unknown';
      a.activity = labels[a.state];
      if (a.state !== previous) a.updatedAt = new Date().toISOString();
    }
  }
  snapshot(): OfficeSnapshot {
    return structuredClone(this.state);
  }
}
