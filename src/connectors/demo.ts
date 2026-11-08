import type { OfficeSnapshot } from '../shared.ts';
import type { OfficeConnector } from './types.ts';
export function demoConnector(): OfficeConnector {
  return {
    async start({ signal, emit }) {
      const snapshot: OfficeSnapshot = {
        source: { id: 'demo', label: 'Demo', mode: 'demo' },
        connection: 'connected',
        version: null,
        updatedAt: new Date().toISOString(),
        message: 'Demo office: simulated activity, no AI services connected.',
        agents: ['Ari', 'Bo', 'Cam', 'Dee'].map((name, i) => ({
          id: 'demo-' + name.toLowerCase(),
          name,
          title: ['Designer', 'Engineer', 'Researcher', 'Coordinator'][i],
          provider: 'Demo',
          model: 'Simulated',
          groupId: 'demo-team',
          deskIndex: i,
          character: i,
          state: i === 1 ? 'working' : 'idle',
          queueCount: 0,
          activity: i === 1 ? 'Working (demo)' : 'Available (demo)',
          updatedAt: new Date().toISOString(),
        })),
        groups: [{ id: 'demo-team', name: 'Demo studio' }],
        recent: [],
        config: { title: '', reducedMotion: false },
      };
      let tick = 0;
      const publish = () => emit(structuredClone(snapshot));
      publish();
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          tick++;
          const agent = snapshot.agents[1];
          agent.state =
            tick % 4 === 1
              ? 'question'
              : tick % 4 === 2
                ? 'queued'
                : tick % 4 === 3
                  ? 'idle'
                  : 'working';
          agent.queueCount = agent.state === 'queued' ? 2 : 0;
          agent.activity = (
            {
              question: 'Waiting for an answer (demo)',
              queued: 'Queued work (demo)',
              idle: 'Available (demo)',
              working: 'Working (demo)',
            } as Record<string, string>
          )[agent.state];
          agent.updatedAt = snapshot.updatedAt = new Date().toISOString();
          publish();
        }, 7000);
        const stop = () => {
          clearInterval(timer);
          resolve();
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      });
    },
  };
}
