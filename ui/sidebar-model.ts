import type { OfficeAgent, OfficeSnapshot, OfficeState } from '../src/shared.ts';

export type TeamFilter = 'all' | 'working' | 'attention' | 'idle';
export const stateLabels: Record<OfficeState, string> = {
  idle: 'Available',
  working: 'Working',
  queued: 'Queued',
  question: 'Needs answer',
  approval: 'Needs approval',
  takeover: 'Browser takeover',
  failed: 'Failed',
  unknown: 'Checking',
};
export function needsAttention(state: OfficeState) {
  return ['question', 'approval', 'takeover', 'failed'].includes(state);
}
export function matchesFilter(agent: OfficeAgent, filter: TeamFilter) {
  return (
    filter === 'all' ||
    (filter === 'attention' ? needsAttention(agent.state) : agent.state === filter)
  );
}
export function sortedAgents(agents: OfficeAgent[]) {
  const rank = (a: OfficeAgent) =>
    needsAttention(a.state)
      ? 0
      : a.state === 'working'
        ? 1
        : a.state === 'queued'
          ? 2
          : a.state === 'idle'
            ? 3
            : 4;
  return [...agents].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export function activityText(agent: OfficeAgent) {
  return agent.activity?.trim() || stateLabels[agent.state];
}
export function clock(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not reported';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
export function agentGroup(agent: OfficeAgent, snapshot: OfficeSnapshot) {
  return snapshot.groups.find((g) => g.id === agent.groupId)?.name || 'Shared office';
}
export function agentChannels(agent: OfficeAgent, snapshot: OfficeSnapshot) {
  return (snapshot.channels || []).filter((c) => c.agentIds.includes(agent.id));
}
