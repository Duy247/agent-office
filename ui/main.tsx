import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OfficeSnapshot } from '../src/shared.ts';
import './style.css';
import { createOffice3D } from './office3d.ts';
import { Dashboard } from './dashboard.tsx';
import { clock } from './sidebar-model.ts';
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
        aria-label="3D office. Drag to rotate, scroll to zoom. Use the Team sidebar for keyboard selection."
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
const MemoOfficeCanvas = React.memo(OfficeCanvas);
function App() {
  const [state, setState] = useState(blank),
    [selected, setSelected] = useState<string | null>(null),
    [quiet, setQuiet] = useState(false),
    [showTeam, setShowTeam] = useState(true),
    [viewVersion, setViewVersion] = useState(0),
    [focusRequest, setFocusRequest] = useState<{ id: string; version: number } | null>(null);
  useEffect(() => {
    const stream = new EventSource('/api/events');
    let previous = '',
      reconnecting = false;
    stream.onmessage = (e) => {
      try {
        if (!reconnecting && previous === e.data) return;
        setState(JSON.parse(e.data));
        previous = e.data;
        reconnecting = false;
      } catch {}
    };
    stream.onerror = () => {
      reconnecting = true;
      setState((s) => ({
        ...s,
        connection: 'disconnected',
        message: 'Dashboard connection lost · retrying',
      }));
    };
    return () => stream.close();
  }, []);
  const sceneState = useMemo(
    () => ({
      ...state,
      config: { ...state.config, reducedMotion: quiet || state.config.reducedMotion },
    }),
    [state, quiet],
  );
  const live = state.connection === 'connected';
  const selectAgent = useCallback((id: string | null) => {
    setSelected(id);
    setShowTeam(true);
  }, []);
  const closePanel = useCallback(() => {
    setSelected(null);
    setShowTeam(false);
  }, []);
  const locateAgent = useCallback((id: string) => {
    setFocusRequest((r) => ({ id, version: (r?.version ?? 0) + 1 }));
  }, []);
  return (
    <main className={'office-screen' + (showTeam ? '' : ' panel-hidden')} aria-label="Office">
      <section className="office-stage" aria-label="Virtual office">
        <MemoOfficeCanvas
          state={sceneState}
          selected={selected}
          onSelect={selectAgent}
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
            aria-expanded={showTeam}
            aria-controls="agent-dashboard"
            onClick={() => {
              if (showTeam) closePanel();
              else setShowTeam(true);
            }}
          >
            Team
          </button>
          <button aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>
            {quiet ? 'Resume motion' : 'Pause motion'}
          </button>
          <button onClick={() => setViewVersion((v) => v + 1)}>Reset view</button>
          <a href="/credits.html" target="_blank" rel="noreferrer">
            Credits
          </a>
        </div>
      </section>
      {showTeam && (
        <Dashboard
          state={state}
          selected={selected}
          onSelect={selectAgent}
          onClose={closePanel}
          onLocate={locateAgent}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
