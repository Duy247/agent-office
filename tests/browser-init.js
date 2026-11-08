// Synthetic snapshots used only by an isolated verification browser.
// This file is never bundled or served by the dashboard.
const mode = new URL(location.href).searchParams.get('fixture');
if (mode) {
  const kinds = ['working', 'question', 'approval', 'takeover', 'failed', 'queued', 'idle'];
  const fixture = {
    connection: mode === 'stale' ? 'disconnected' : 'connected',
    version: 'TEST FIXTURE',
    updatedAt: new Date().toISOString(),
    message: 'Openbot disconnected · last known state',
    config: { title: 'Verification office', reducedMotion: true },
    groups:
      mode === 'empty'
        ? []
        : [
            { id: 'one', name: 'Product' },
            { id: 'two', name: 'Operations' },
          ],
    recent: [],
    channels:
      mode === 'empty'
        ? []
        : [
            {
              id: 'channel-test',
              name: 'Project Falcon',
              agentIds: ['test-0', 'test-1'],
              active: true,
            },
          ],
    agents:
      mode === 'empty'
        ? []
        : kinds.map((state, i) => ({
            id: 'test-' + i,
            name: ['Ari', 'Bo', 'Cam', 'Dee', 'Eli', 'Fin', 'Gia'][i],
            title: 'Test teammate',
            provider: 'example',
            model: 'example-model',
            groupId: i < 3 ? 'one' : 'two',
            deskIndex: i % 3,
            state,
            activity: state,
            queueCount: i === 5 ? 3 : 0,
            character: i,
            updatedAt: new Date().toISOString(),
          })),
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    if (String(input) === '/api/servers')
      return Promise.resolve(
        new Response(
          JSON.stringify({
            defaultId: 'default',
            servers: [
              { id: 'default', name: 'Studio' },
              { id: 'other', name: 'Other office' },
              { id: 'locked', name: 'Needs sign-in' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    return originalFetch(input, options);
  };
  window.EventSource = class {
    constructor(url) {
      const server = new URL(url, location.href).searchParams.get('server');
      const data =
        server === 'locked'
          ? { ...fixture, connection: 'sign-in-required', agents: [], groups: [], channels: [] }
          : server === 'other'
            ? {
                ...fixture,
                agents: [{ ...fixture.agents[0], name: 'Other server agent', character: 7 }],
                groups: [],
                channels: [],
              }
            : fixture;
      this.update = (e) => this.onmessage?.({ data: JSON.stringify(e.detail) });
      window.addEventListener('office-fixture-update', this.update);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(data) }), 50);
      this.late = () => this.onmessage?.({ data: JSON.stringify(data) });
    }
    close() {
      window.removeEventListener('office-fixture-update', this.update);
      if (mode === 'servers') setTimeout(this.late, 100);
    }
  };
}
