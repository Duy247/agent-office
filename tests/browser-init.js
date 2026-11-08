// Synthetic snapshots used only by an isolated verification browser.
// This file is never bundled or served by the dashboard.
const mode = new URL(location.href).searchParams.get('fixture');
if (mode) {
  const kinds = ['working', 'question', 'approval', 'takeover', 'failed', 'queued'];
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
    agents:
      mode === 'empty'
        ? []
        : kinds.map((state, i) => ({
            id: 'test-' + i,
            name: ['Ari', 'Bo', 'Cam', 'Dee', 'Eli', 'Fin'][i],
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
  window.EventSource = class {
    constructor() {
      this.update = (e) => this.onmessage?.({ data: JSON.stringify(e.detail) });
      window.addEventListener('office-fixture-update', this.update);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(fixture) }), 50);
    }
    close() {
      window.removeEventListener('office-fixture-update', this.update);
    }
  };
}
