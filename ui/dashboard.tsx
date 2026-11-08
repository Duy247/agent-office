import React, { useEffect, useMemo, useState } from 'react';
import type { OfficeSnapshot, OfficeServer } from '../src/shared.ts';
import { characterPortrait } from './characters.ts';
import {
  activityText,
  agentChannels,
  agentGroup,
  clock,
  matchesFilter,
  needsAttention,
  sortedAgents,
  stateLabels,
  type TeamFilter,
} from './sidebar-model.ts';

const Avatar = React.memo(function Avatar({
  character,
  large = false,
}: {
  character: number;
  large?: boolean;
}) {
  const [image, setImage] = useState('');
  useEffect(() => {
    try {
      setImage(characterPortrait(character));
    } catch {
      setImage('');
    }
  }, [character]);
  return image ? (
    <img className={'portrait' + (large ? ' large' : '')} src={image} alt="" />
  ) : (
    <span className="portrait" />
  );
});

export function Dashboard({
  state,
  servers,
  serverId,
  serverError,
  onServerChange,
  selected,
  onSelect,
  onClose,
  onLocate,
}: {
  state: OfficeSnapshot;
  servers: OfficeServer[];
  serverId: string;
  serverError: string;
  onServerChange: (id: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  onLocate: (id: string) => void;
}) {
  const [filter, setFilter] = useState<TeamFilter>('all');
  const roster = useMemo(() => sortedAgents(state.agents), [state.agents]);
  const agent = state.agents.find((a) => a.id === selected);
  const live = state.connection === 'connected';
  const channels = agent ? agentChannels(agent, state) : [];
  const filters: { id: TeamFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'working', label: 'Working' },
    { id: 'attention', label: 'Needs you' },
    { id: 'idle', label: 'Idle' },
  ];
  const visible = roster.filter((a) => matchesFilter(a, filter));
  return (
    <aside id="agent-dashboard" className="dashboard" aria-label={agent ? 'Agent details' : 'Team'}>
      <header className="panel-head">
        <div className="server-picker">
          <label htmlFor="office-server">Server</label>
          <select
            id="office-server"
            value={serverId}
            onChange={(e) => onServerChange(e.target.value)}
            disabled={!servers.length}
          >
            {!servers.some((s) => s.id === serverId) && (
              <option value={serverId}>
                {servers.length ? 'Server unavailable' : 'Loading servers'}
              </option>
            )}
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {serverError && (
          <p className="server-error" role="alert">
            {serverError}
          </p>
        )}

        <div className="head-line">
          {agent ? (
            <button className="back-button" onClick={() => onSelect(null)}>
              ← Team
            </button>
          ) : (
            <strong className="heading">Team</strong>
          )}
          <button className="close-panel" onClick={onClose} aria-label="Hide team sidebar">
            ×
          </button>
        </div>
        <div className="head-meta">
          {agent
            ? 'Agent details'
            : `${state.agents.length} ${state.agents.length === 1 ? 'agent' : 'agents'} in the office`}
          <span className={live ? 'source-health' : 'source-health stale'}>
            {state.source?.mode === 'demo'
              ? 'Demo'
              : live
                ? 'Connected'
                : state.connection === 'connecting'
                  ? 'Connecting'
                  : 'Stale'}
          </span>
        </div>
      </header>
      {!live && (
        <p className="stale-note" role="status">
          {state.connection === 'connecting'
            ? 'Connecting to Openbot.'
            : state.connection === 'sign-in-required'
              ? 'Sign-in required for this server. Connect it locally, then reload.'
              : 'Connection interrupted. Showing last known state.'}
        </p>
      )}
      {agent ? (
        <>
          <nav className="agent-tabs" aria-label="Select agent">
            {state.agents.map((a) => (
              <button key={a.id} aria-pressed={a.id === agent.id} onClick={() => onSelect(a.id)}>
                <Avatar character={a.character} />
                {a.name}
              </button>
            ))}
          </nav>
          <div className="inspector">
            <div className="profile">
              <Avatar character={agent.character} large />
              <div>
                <strong className="agent-name">{agent.name}</strong>
                <p className="role">{agent.title || 'Openbot agent'}</p>
                <span className={'state-label state-' + agent.state}>
                  {stateLabels[agent.state]}
                  {!live && ' · stale'}
                </span>
              </div>
            </div>
            <section
              className={'current-activity' + (needsAttention(agent.state) ? ' attention' : '')}
              aria-label="Current reported activity"
            >
              <div className="section-label">Reported activity</div>
              <p>{activityText(agent)}</p>
              <small>Last state change {clock(agent.updatedAt)}</small>
              {['question', 'approval', 'takeover'].includes(agent.state) && (
                <div className="action-note">Continue in Openbot.</div>
              )}
            </section>
            <dl className="details-grid">
              <div>
                <dt>Provider</dt>
                <dd>{agent.provider || 'Not reported'}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{agent.model || 'Not reported'}</dd>
              </div>
              <div>
                <dt>Office area</dt>
                <dd>{agentGroup(agent, state)}</dd>
              </div>
              <div>
                <dt>Last state change</dt>
                <dd>{clock(agent.updatedAt)}</dd>
              </div>
              <div className="full">
                <dt>Channels</dt>
                <dd>
                  {channels.length
                    ? channels.map((c) => c.name + (c.active ? ' · active' : '')).join(', ')
                    : 'No channels reported'}
                </dd>
              </div>
            </dl>
            <section className="queue-section">
              <div className="section-line">
                <strong>Queued work</strong>
                <span>{agent.queueCount}</span>
              </div>
              <p>
                {agent.queueCount
                  ? `${agent.queueCount} ${agent.queueCount === 1 ? 'item' : 'items'} waiting. Queue details are available in Openbot.`
                  : 'Nothing queued.'}
              </p>
            </section>
            <button className="locate-button" onClick={() => onLocate(agent.id)}>
              Locate in office ↗
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="filters" aria-label="Filter team">
            {filters.map((f) => (
              <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span>{roster.filter((a) => matchesFilter(a, f.id)).length}</span>
              </button>
            ))}
          </nav>
          <div className="agent-list">
            {visible.map((a) => (
              <button
                key={a.id}
                className={'agent-card' + (needsAttention(a.state) ? ' needs-input' : '')}
                onClick={() => onSelect(a.id)}
              >
                <div className="identity">
                  <Avatar character={a.character} />
                  <div className="identity-text">
                    <strong>{a.name}</strong>
                    <span title={a.title}>{a.title || 'Openbot agent'}</span>
                  </div>
                  <span className={'state-label state-' + a.state}>{stateLabels[a.state]}</span>
                </div>
                <p className="row-activity">{activityText(a)}</p>
                <div className="row-meta">
                  <span>{agentGroup(a, state)}</span>
                  <span>{a.queueCount ? `${a.queueCount} queued` : clock(a.updatedAt)}</span>
                </div>
              </button>
            ))}
            {!visible.length && (
              <p className="empty">
                {state.agents.length
                  ? 'No agents in this view.'
                  : 'No agents yet. Create agents in Openbot to see them here.'}
              </p>
            )}
          </div>
          <section className="channels-section" aria-label="Channels">
            <div className="section-line">
              <strong>Channels</strong>
              <span>{state.channels?.length || 0}</span>
            </div>
            {state.channels?.length ? (
              state.channels.map((c) => (
                <div className="channel-row" key={c.id}>
                  <div className="section-line">
                    <strong>{c.name}</strong>
                    <span className={c.active ? 'channel-active' : ''}>
                      {c.active ? 'In conference' : 'Inactive'}
                    </span>
                  </div>
                  <p>
                    {c.agentIds
                      .map((id) => state.agents.find((a) => a.id === id)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">No team channels reported.</p>
            )}
          </section>
        </>
      )}
      <footer className="panel-footer">
        {state.source?.label || 'Nightly Openbot'}
        <span>
          {live ? 'Updated ' : 'Last received '}
          {clock(state.updatedAt)}
        </span>
      </footer>
    </aside>
  );
}
