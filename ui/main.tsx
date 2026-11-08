import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OfficeSnapshot } from '../src/shared.ts';
import './style.css';
import { createOffice3D } from './office3d.ts';
import { characterPortrait } from './characters.ts';
const blank: OfficeSnapshot = {
  connection: 'connecting',
  version: null,
  updatedAt: null,
  message: 'Connecting to the office',
  agents: [],
  groups: [],
  recent: [],
  config: { title: 'The office', reducedMotion: false },
};
const color: Record<string, string> = {
  idle: '#46694d',
  working: '#3564b6',
  queued: '#79602d',
  question: '#906021',
  approval: '#994b35',
  takeover: '#7c4d91',
  failed: '#a53531',
  unknown: '#626962',
};
const label: Record<string, string> = {
  idle: 'Available',
  working: 'Working',
  queued: 'Queued',
  question: 'Needs answer',
  approval: 'Approval',
  takeover: 'Browser takeover',
  failed: 'Failed',
  unknown: 'Checking',
};
const clock = (s: string | null) =>
  s
    ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
function OfficeCanvas({
  state,
  selected,
  onSelect,
  viewVersion,
  focusRequest,
}: {
  state: OfficeSnapshot;
  selected: string | null;
  onSelect: (id: string) => void;
  viewVersion: number;
  focusRequest: { id: string; version: number } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    api = useRef<ReturnType<typeof createOffice3D> | null>(null),
    select = useRef(onSelect),
    [error, setError] = useState('');
  select.current = onSelect;
  useEffect(() => {
    try {
      api.current = createOffice3D(canvas.current!, (id) => select.current(id), setError);
    } catch {
      setError(
        '3D rendering is unavailable. Enable graphics acceleration in your browser and reload.',
      );
    }
    return () => {
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    api.current?.update(state, selected);
  }, [state, selected]);
  useEffect(() => {
    api.current?.resetView();
  }, [viewVersion]);
  useEffect(() => {
    if (focusRequest) api.current?.focusAgent(focusRequest.id);
  }, [focusRequest]);
  return (
    <>
      <canvas
        ref={canvas}
        aria-label="3D office. Drag to rotate, scroll to zoom. Use Agents for keyboard selection."
        role="img"
      />
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
function Avatar({ character, large = false }: { character: number; large?: boolean }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    try {
      setImage(characterPortrait(character));
    } catch {
      setImage('');
    }
  }, [character]);
  return image ? (
    <img className={large ? 'portrait large' : 'portrait'} src={image} alt="" />
  ) : (
    <span className="portrait" />
  );
}
function App() {
  const [state, setState] = useState(blank),
    [selected, setSelected] = useState<string | null>(null),
    [quiet, setQuiet] = useState(false),
    [showTeam, setShowTeam] = useState(false),
    [viewVersion, setViewVersion] = useState(0),
    [focusRequest, setFocusRequest] = useState<{ id: string; version: number } | null>(null);
  useEffect(() => {
    const stream = new EventSource('/api/events');
    stream.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data));
      } catch {}
    };
    stream.onerror = () =>
      setState((s) => ({
        ...s,
        connection: 'disconnected',
        message: 'Dashboard connection lost · retrying',
      }));
    return () => stream.close();
  }, []);
  const agent = state.agents.find((a) => a.id === selected) ?? null;
  const live = state.connection === 'connected';
  const closePanel = () => {
    setSelected(null);
    setShowTeam(false);
  };
  return (
    <main className="office-screen" aria-label="Office">
      <OfficeCanvas
        state={{
          ...state,
          config: { ...state.config, reducedMotion: quiet || state.config.reducedMotion },
        }}
        selected={selected}
        onSelect={setSelected}
        viewVersion={viewVersion}
        focusRequest={focusRequest}
      />
      {!live && (
        <div className="banner" role="status">
          {state.message}.{' '}
          {state.connection === 'sign-in-required'
            ? 'Run npm run connect to reconnect.'
            : 'Showing last known state.'}
        </div>
      )}
      <div className="controls">
        <span
          className={'connection ' + (live ? 'live' : 'stale')}
          title={state.updatedAt ? 'Last update ' + clock(state.updatedAt) : state.message}
        >
          <i />
          {state.source?.mode === 'demo'
            ? 'Demo'
            : live
              ? 'Connected'
              : state.connection === 'connecting'
                ? 'Connecting'
                : 'Disconnected'}
        </span>
        <button
          aria-expanded={showTeam || !!agent}
          onClick={() => {
            if (showTeam || agent) closePanel();
            else setShowTeam(true);
          }}
        >
          Agents
        </button>
        <button aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>
          {quiet ? 'Resume motion' : 'Pause motion'}
        </button>
        <button onClick={() => setViewVersion((v) => v + 1)}>Reset view</button>
        <a href="/credits.html" target="_blank" rel="noreferrer">
          Credits
        </a>
      </div>
      {(showTeam || agent) && (
        <aside aria-label="Agent details">
          <button className="close" onClick={closePanel} aria-label="Close agent details">
            ×
          </button>
          {agent ? (
            <div className="inspector">
              <div className="avatar-large" style={{ borderColor: color[agent.state] }}>
                <Avatar character={agent.character} large />
              </div>
              <strong className="agent-name">{agent.name}</strong>
              <p className="role">{agent.title || 'Openbot agent'}</p>
              <span className="pill" style={{ color: color[agent.state] }}>
                <i style={{ background: color[agent.state] }} />
                {label[agent.state]}
                {!live ? ' · stale' : ''}
              </span>
              <button
                className="focus-agent"
                onClick={() =>
                  setFocusRequest((r) => ({ id: agent.id, version: (r?.version ?? 0) + 1 }))
                }
              >
                Find in office
              </button>
              <dl>
                <dt>Provider</dt>
                <dd>{agent.provider || 'Not reported'}</dd>
                <dt>Model</dt>
                <dd>{agent.model || 'Not reported'}</dd>
                <dt>Activity</dt>
                <dd>{agent.activity}</dd>
                <dt>Queued work</dt>
                <dd>{agent.queueCount}</dd>
                <dt>Last state change</dt>
                <dd>{clock(agent.updatedAt)}</dd>
              </dl>
              {['question', 'approval', 'takeover'].includes(agent.state) && (
                <div className="action-note">Continue in Openbot.</div>
              )}
            </div>
          ) : (
            <div className="team-list">
              {state.agents.length ? (
                state.agents.map((a) => (
                  <button key={a.id} onClick={() => setSelected(a.id)} className="team-row">
                    <span className="mini-avatar">
                      <Avatar character={a.character} />
                    </span>
                    <span>
                      <strong>{a.name}</strong>
                      <small>{a.title || a.provider}</small>
                    </span>
                    <i style={{ background: color[a.state] }} title={label[a.state]} />
                    <span className="sr-only">{label[a.state]}</span>
                  </button>
                ))
              ) : (
                <div className="empty">No agents. Create agents in Openbot.</div>
              )}
            </div>
          )}
        </aside>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
