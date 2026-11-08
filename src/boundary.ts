import type { OfficeSnapshot, OfficeState } from './shared.ts';
const states = new Set<OfficeState>([
  'idle',
  'working',
  'queued',
  'question',
  'approval',
  'takeover',
  'failed',
  'unknown',
]);
const clean = (v: unknown, n = 160) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '';
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const number = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
/** Second privacy boundary shared by every connector: never spread a source payload. */
export function publicSnapshot(raw: any): OfficeSnapshot {
  const groups = (Array.isArray(raw?.groups) ? raw.groups : [])
    .filter((g: any) => clean(g?.id))
    .map((g: any) => ({ id: clean(g.id), name: clean(g.name) }));
  const agents = (Array.isArray(raw?.agents) ? raw.agents : [])
    .filter((a: any) => clean(a?.id))
    .map((a: any) => ({
      id: clean(a.id),
      name: clean(a.name) || 'Agent',
      title: clean(a.title),
      provider: clean(a.provider),
      model: clean(a.model),
      groupId: groups.some((g: any) => g.id === a.groupId) ? a.groupId : 'unassigned',
      deskIndex: Math.max(0, Math.floor(number(a.deskIndex))),
      character: Math.max(0, Math.floor(number(a.character))) % 8,
      state: states.has(a.state) ? a.state : 'unknown',
      queueCount: Math.max(0, Math.floor(number(a.queueCount))),
      activity: clean(a.activity),
      updatedAt: date(a.updatedAt),
      ...(a.desk && Number.isFinite(a.desk.x) && Number.isFinite(a.desk.y)
        ? { desk: { x: a.desk.x, y: a.desk.y } }
        : {}),
    }));
  const connection = ['connecting', 'connected', 'disconnected', 'sign-in-required'].includes(
    raw?.connection,
  )
    ? raw.connection
    : 'disconnected';
  return {
    connection,
    version: clean(raw?.version) || null,
    updatedAt: date(raw?.updatedAt),
    message: clean(raw?.message),
    agents,
    groups,
    recent: (Array.isArray(raw?.recent) ? raw.recent : [])
      .slice(0, 12)
      .filter((e: any) =>
        [
          'turn-started',
          'turn-completed',
          'prompt',
          'approval',
          'browser-takeover-requested',
          'agent-input-resolved',
        ].includes(e?.kind),
      )
      .map((e: any) => ({ at: date(e.at) ?? '', agentId: clean(e.agentId), kind: e.kind })),
    config: {
      title: clean(raw?.config?.title),
      reducedMotion: raw?.config?.reducedMotion === true,
    },
    ...(raw?.source
      ? {
          source: {
            id: clean(raw.source.id),
            label: clean(raw.source.label),
            mode: raw.source.mode === 'demo' ? 'demo' : 'live',
          },
        }
      : {}),
  };
}
