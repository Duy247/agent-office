export const capabilities = [
  'agent-runtime-snapshots',
  'sidebar-layout',
  'agent-tasks-v1',
  'agent-activity',
  'open-providers-v1',
  'channel-chats-v1',
  'channel-attention-v1',
];
export function sessionExpired(expiresAt: unknown, now = Date.now()) {
  return (
    typeof expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= now
  );
}
export function localEndpoint(value: string): string {
  const u = new URL(value);
  if (
    u.protocol !== 'http:' ||
    u.hostname !== '127.0.0.1' ||
    !u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/'
  ) {
    throw new Error('Only an HTTP 127.0.0.1 origin with a port is accepted.');
  }
  return u.origin;
}
export function teamEndpoint(value: string) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    !(
      u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
    )
  )
    throw new Error(
      'Openbot endpoint must be HTTPS, or HTTP on loopback, without credentials or a path.',
    );
  return u.origin;
}
export function invitation(value: string) {
  const u = new URL(value.trim());
  if (u.protocol === 'openbot:' && u.hostname === 'mobile-connect')
    throw new Error('Use a member Private link, not Mobile Connect.');
  const token = u.searchParams.get('invite');
  const serverId = u.searchParams.get('server');
  const fingerprint = u.searchParams.get('fingerprint');
  if (!token || !/^[A-Za-z0-9_-]{32,64}$/.test(token) || !serverId || !fingerprint)
    throw new Error(
      'Expected an Openbot Private invitation link with invite, server and fingerprint fields.',
    );
  return { token, serverId, fingerprint };
}
export function allowedRequest(method: string, path: string, authenticating = false) {
  if (
    method === 'GET' &&
    [
      '/v1/compatibility',
      '/v1/identity',
      '/v1/agents',
      '/v1/sidebar-layout',
      '/v1/channels',
    ].includes(path)
  )
    return true;
  if (method === 'GET' && /^\/v1\/agents\/[a-zA-Z0-9_-]{1,128}\/queue$/.test(path)) return true;
  if (
    method === 'GET' &&
    /^\/v1\/agents\/[A-Za-z0-9_-]{1,128}\/avatar\?v=[A-Za-z0-9_-]{1,128}$/.test(path)
  )
    return true;
  // Openbot documents task listing as a POST read, not a task mutation.
  if (method === 'POST' && path === '/v1/agent-tasks/list') return true;
  return (
    authenticating &&
    method === 'POST' &&
    ['/v1/invitations/preview', '/v1/join', '/v1/auth/login', '/v1/auth/account'].includes(path)
  );
}
export function negotiate(support: {
  protocol?: { minimum: number; maximum: number };
  capabilities?: string[];
}) {
  const min = support.protocol?.minimum ?? Infinity;
  const max = Math.min(9, support.protocol?.maximum ?? 0);
  if (min > max || max < 7) throw new Error('This connector requires Openbot Team protocol 7–9.');
  if (!capabilities.slice(0, 2).every((c) => support.capabilities?.includes(c)))
    throw new Error('Runtime snapshots and sidebar layout are required.');
  return max;
}
// Diagnostic output contains only counts and event types. Never return raw events,
// latestMessages, work.text, questions, approval commands, or provider credentials.
export function summarize(event: any) {
  if (!event || typeof event.type !== 'string') return null;
  if (event.type === 'agent-tasks-changed') {
    const tasks = Array.isArray(event.snapshot?.tasks) ? event.snapshot.tasks : [];
    return {
      type: event.type,
      tasks: tasks.length,
      running: tasks.filter((t: any) => t.state === 'running').length,
      queued: tasks.filter((t: any) => t.state === 'queued').length,
      completed: tasks.filter((t: any) => t.outcome === 'completed').length,
    };
  }
  if (event.type === 'runtime-snapshot') {
    const s = event.snapshot ?? {};
    const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return {
      type: 'runtime-snapshot',
      agents: count(s.bots ?? s.agents),
      activeTurns: count(s.activeTurns),
      work: count(s.work),
      prompts: count(s.pendingPrompts),
      approvals: count(s.pendingApprovals),
      browserTakeovers: count(s.pendingBrowserTakeovers),
      failures: count(s.failedTurns),
    };
  }
  if (
    [
      'turn-started',
      'turn-completed',
      'prompt',
      'approval',
      'agent-input-resolved',
      'browser-takeover-requested',
      'browser-takeover-resolved',
      'bots-changed',
      'agents-changed',
      'queue-changed',
      'queue-invalidated',
      'sidebar-layout-changed',
    ].includes(event.type)
  )
    return { type: event.type };
  return null;
}
