import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { readSettings, updateLocalConfig } from './config.ts';
import { loadProtectedSession, saveProtectedSession } from './session-store.ts';
const settings = await readSettings();
const defaultOptions = settings.connector?.options ?? {};
import {
  allowedRequest,
  capabilities,
  invitation,
  localEndpoint,
  negotiate,
  summarize,
  teamEndpoint,
} from './protocol.ts';

const reportFile = new URL('../connection-proof.json', import.meta.url);
let stopping = false;
let socket: WebSocket | undefined;
let protocol = 9;
const report: any = {
  stage: 'connection-proof',
  authenticated: false,
  observations: {},
  reconnects: 0,
  evidence: {
    runtimeSnapshot: false,
    activeWork: false,
    inputRequest: false,
    workFinished: false,
    reconnected: false,
  },
};
const output = (message: string) => console.log(new Date().toISOString(), message);

function powershell(script: string, input?: string) {
  const p = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
  if (p.status !== 0) throw new Error('Windows helper failed. No credential details were logged.');
  return p.stdout.trim();
}
async function saveSession(s: object, options: any = defaultOptions) {
  await saveProtectedSession(s, options.profile);
}
async function loadSession(options: any = defaultOptions) {
  return loadProtectedSession(options.profile);
}
async function request(
  base: string,
  path: string,
  token?: string,
  body?: unknown,
  authenticating = false,
): Promise<any> {
  const method = body === undefined ? 'GET' : 'POST';
  if (!allowedRequest(method, path, authenticating))
    throw new Error('Blocked: endpoint is outside the read-only allowlist.');
  const response = await fetch(teamEndpoint(base) + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      'OpenBot-Protocol-Version': String(protocol),
      'OpenBot-App-Version': '0.1.0',
      'OpenBot-Capabilities': capabilities.join(','),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Team API ${path} returned HTTP ${response.status}.`);
  return response.json();
}
async function discover(
  expected?: { serverId: string; fingerprint: string },
  options: any = defaultOptions,
) {
  const explicit = typeof options.baseUrl === 'string' ? teamEndpoint(options.baseUrl) : null;
  let ports: number[] = [];
  if (!explicit) {
    if (process.platform !== 'win32')
      throw new Error(
        'Set connector.options.baseUrl or pass --server. Automatic Openbot discovery is Windows-only.',
      );
    const raw = powershell(
      "$ids=@(Get-Process OpenBot -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id); @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $ids -and $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort -Unique) | ConvertTo-Json -Compress",
    );
    ports = raw ? [JSON.parse(raw)].flat() : [];
  }
  const endpoints = explicit
    ? [explicit]
    : ports.map((port) => localEndpoint('http://127.0.0.1:' + port));
  let incompatible: string | undefined;
  for (const base of endpoints) {
    try {
      const support = await request(base, '/v1/compatibility');
      const identity = await request(base, '/v1/identity');
      if (
        expected &&
        (identity.serverId !== expected.serverId || identity.fingerprint !== expected.fingerprint)
      ) {
        if (explicit)
          throw new Error('Openbot server identity does not match this saved credential profile.');
        continue;
      }
      try {
        protocol = negotiate(support);
      } catch (e) {
        incompatible = e instanceof Error ? e.message : 'Unsupported Team API';
        continue;
      }
      return { base, support, identity };
    } catch (e) {
      if (explicit) throw e; /* Unrelated loopback listeners are not Team APIs. */
    }
  }
  throw new Error(
    incompatible ??
      'No matching Openbot Team API found. Open Openbot and check that its server is enabled.',
  );
}
async function connect() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Paste the member Private invitation here. It is not saved or logged.');
    const invite = invitation(await rl.question('Invitation: '));
    const host = await discover(invite);
    const preview = await request(
      host.base,
      '/v1/invitations/preview',
      undefined,
      { inviteToken: invite.token },
      true,
    );
    if (preview.emailBound)
      throw new Error(
        'This invitation requires account sign-in. Use a Private link without an email restriction.',
      );
    const username = 'office-' + randomBytes(4).toString('hex');
    const password = randomBytes(32).toString('base64url');
    const auth = await request(
      host.base,
      '/v1/join',
      undefined,
      { inviteToken: invite.token, username, password },
      true,
    );
    if (!auth.sessionToken || !auth.sessionExpiresAt)
      throw new Error('Host did not return a usable member session.');
    await saveSession({
      serverId: invite.serverId,
      fingerprint: invite.fingerprint,
      username,
      password,
      sessionToken: auth.sessionToken,
      sessionExpiresAt: auth.sessionExpiresAt,
    });
    output('A separate dashboard member session is saved in protected OS credential storage.');
    output('Openbot still owns all agents. Run Start connection proof.cmd next.');
  } finally {
    rl.close();
  }
}
async function accountConnect() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let accountToken: string | undefined;
  const accountPaths = new Set([
    '/v1/auth/email/start',
    '/v1/auth/email/verify',
    '/v1/team-auth/ticket',
    '/v1/auth/logout',
  ]);
  async function accountRequest(path: string, body: object = {}) {
    if (!accountPaths.has(path)) throw new Error('Account endpoint not permitted.');
    const response = await fetch(
      teamEndpoint(
        typeof defaultOptions.accountApiUrl === 'string'
          ? defaultOptions.accountApiUrl
          : 'https://api.openbot.run',
      ) + path,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          ...(accountToken ? { Authorization: 'Bearer ' + accountToken } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok)
      throw new Error(`Account sign-in step ${path} returned HTTP ${response.status}.`);
    return response.status === 204 ? {} : ((await response.json()) as any);
  }
  try {
    const host = await discover();
    console.log('Sign in as the owner/member of the local Openbot server.');
    console.log(
      'This creates a new dashboard session; it does not read Openbot saved credentials.',
    );
    console.log('Press Enter after your email to request one sign-in code from Openbot.');
    const email = (await rl.question('Openbot account email: ')).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    const challenge = await accountRequest('/v1/auth/email/start', { email });
    const code = (await rl.question('Code from Openbot email: ')).replace(/\s/g, '');
    const signedIn = await accountRequest('/v1/auth/email/verify', {
      challengeId: challenge.challengeId,
      code,
    });
    if (typeof signedIn.sessionToken !== 'string')
      throw new Error('Account sign-in returned no session.');
    accountToken = signedIn.sessionToken;
    const ticket = await accountRequest('/v1/team-auth/ticket', {
      serverId: host.identity.serverId,
    });
    if (typeof ticket.ticket !== 'string')
      throw new Error('Account service returned no Team API ticket.');
    const auth = await request(
      host.base,
      '/v1/auth/account',
      undefined,
      { accountTicket: ticket.ticket },
      true,
    );
    if (!auth.sessionToken || !auth.sessionExpiresAt)
      throw new Error('Team API returned no usable session.');
    await saveSession({
      serverId: host.identity.serverId,
      fingerprint: host.identity.fingerprint,
      sessionToken: auth.sessionToken,
      sessionExpiresAt: auth.sessionExpiresAt,
      authKind: 'account',
    });
    await updateLocalConfig({ connector: { type: 'openbot', options: defaultOptions } });
    output('Dashboard Team API session saved in protected OS credential storage.');
    output('Account sign-in token is not stored. Only the local Team API session is saved.');
  } finally {
    if (accountToken) {
      try {
        await accountRequest('/v1/auth/logout');
        output('Temporary account sign-in session closed.');
      } catch {
        output(
          'Could not close the temporary account session. Revoke the new session from your Openbot account devices list.',
        );
      }
    }
    accountToken = undefined;
    rl.close();
  }
}
async function watch() {
  const session = await loadSession();
  try {
    const previous = JSON.parse(await readFile(reportFile, 'utf8'));
    if (previous.authenticated === true && typeof previous.reconnects === 'number') {
      report.reconnects = previous.reconnects;
      report.evidence.reconnected = previous.reconnects > 0;
    }
  } catch {
    /* First run has no saved proof. */
  }
  let connectedBefore = false;
  let retry = 1000;
  while (!stopping) {
    try {
      const host = await discover(session);
      if (Date.parse(session.sessionExpiresAt) < Date.now() + 60000) {
        if (session.authKind === 'account')
          throw new Error('Dashboard session expired. Run Connect dashboard.cmd to sign in again.');
        const auth = await request(
          host.base,
          '/v1/auth/login',
          undefined,
          { username: session.username, password: session.password },
          true,
        );
        session.sessionToken = auth.sessionToken;
        session.sessionExpiresAt = auth.sessionExpiresAt;
        await saveSession(session);
      }
      const roster = await request(host.base, '/v1/agents', session.sessionToken);
      const layout = await request(host.base, '/v1/sidebar-layout', session.sessionToken);
      if (!Array.isArray(roster) || !Array.isArray(layout.sections))
        throw new Error('Unexpected roster or sidebar response.');
      Object.assign(report, {
        appVersion: host.support.appVersion,
        protocol,
        authenticated: true,
        agents: roster.length,
        groups: layout.sections.length,
        connected: true,
        lastConnectedAt: new Date().toISOString(),
      });
      if (connectedBefore) {
        report.reconnects++;
        report.evidence.reconnected = true;
      }
      connectedBefore = true;
      retry = 1000;
      output(
        `Authenticated with Openbot ${host.support.appVersion}; ${roster.length} agents; ${layout.sections.length} groups.`,
      );
      if (host.support.capabilities.includes('agent-tasks-v1'))
        for (const agent of roster) {
          if (agent.id === 'workflows') continue;
          try {
            const tasks = await request(host.base, '/v1/agent-tasks/list', session.sessionToken, {
              agentId: agent.id,
            });
            output(JSON.stringify(summarize({ type: 'agent-tasks-changed', snapshot: tasks })));
          } catch {
            output('Task listing unavailable for one roster entry.');
          }
        }
      await writeFile(reportFile, JSON.stringify(report, null, 2));
      await new Promise<void>((resolve) => {
        socket = new WebSocket(
          host.base.replace(/^http/, 'ws') + '/v1/events',
          ['openbot-team-v1', 'openbot-token.' + session.sessionToken],
          { maxPayload: 4 * 1024 * 1024, handshakeTimeout: 5000 },
        );
        const timer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'runtime-snapshot-request' }));
        }, 10000);
        socket.on('open', () => {
          socket!.send(
            JSON.stringify({
              type: 'agent-event-scope',
              includeConversations: false,
              capabilities,
            }),
          );
          socket!.send(JSON.stringify({ type: 'runtime-snapshot-request' }));
        });
        socket.on('message', (data) => {
          try {
            const safe = summarize(JSON.parse(data.toString()));
            if (!safe) return;
            const key = safe.type;
            report.observations[key] = (report.observations[key] ?? 0) + 1;
            if (key === 'runtime-snapshot') {
              report.latestRuntime = safe;
              report.evidence.runtimeSnapshot = true;
              if (safe.activeTurns! > 0) report.evidence.activeWork = true;
              if (safe.prompts! > 0) report.evidence.inputRequest = true;
              if (report.evidence.activeWork && safe.activeTurns === 0)
                report.evidence.workFinished = true;
            }
            if (key === 'turn-started') report.evidence.activeWork = true;
            if (key === 'turn-completed') report.evidence.workFinished = true;
            if (key === 'prompt') report.evidence.inputRequest = true;
            if (key === 'agent-tasks-changed' && safe.running! > 0)
              report.evidence.activeWork = true;
            if (key === 'agent-tasks-changed' && report.evidence.activeWork && safe.running === 0)
              report.evidence.workFinished = true;
            output(JSON.stringify(safe));
            // Serialize writes through the microtask chain; output never includes raw payloads.
            reportWrites = reportWrites
              .then(() => writeFile(reportFile, JSON.stringify(report, null, 2)))
              .catch(() => {});
          } catch {
            output('Ignored an invalid event.');
          }
        });
        socket.on('error', () => {});
        socket.on('close', () => {
          clearInterval(timer);
          report.connected = false;
          output('Disconnected; state is stale. Waiting to reconnect.');
          resolve();
        });
      });
    } catch (e) {
      report.connected = false;
      output(e instanceof Error ? e.message : 'Connection failed.');
    }
    if (!stopping) await new Promise((r) => setTimeout(r, retry));
    retry = Math.min(retry * 2, 15000);
  }
  await reportWrites;
  report.connected = false;
  await writeFile(reportFile, JSON.stringify(report, null, 2));
}
let reportWrites = Promise.resolve();
export { loadSession, discover, request };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on('SIGINT', () => {
    stopping = true;
    socket?.close();
  });
  try {
    const command = process.argv[2] ?? 'discover';
    if (command === 'connect') await accountConnect();
    else if (command === 'connect-invite') await connect();
    else if (command === 'watch') await watch();
    else if (command === 'discover') {
      const host = await discover();
      console.log(
        JSON.stringify(
          {
            appVersion: host.support.appVersion,
            protocol,
            base: host.base,
            runtimeSnapshots: host.support.capabilities.includes('agent-runtime-snapshots'),
            sidebarLayout: host.support.capabilities.includes('sidebar-layout'),
            authenticated: false,
          },
          null,
          2,
        ),
      );
    } else throw new Error('Use discover, connect, or watch.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Diagnostic failed.');
    process.exitCode = 1;
  }
}
