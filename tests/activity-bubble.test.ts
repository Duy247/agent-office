import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workingBubbleText } from '../ui/activity-bubble.ts';
import type { OfficeState } from '../src/shared.ts';
test('activity bubbles appear only for live working agents, never idle, attention or stale states', () => {
  const agent = { state: 'working' as OfficeState, activity: 'Working', queueCount: 0 };
  assert.equal(workingBubbleText(agent, 'connected'), 'Working');
  for (const state of [
    'idle',
    'queued',
    'question',
    'approval',
    'takeover',
    'failed',
    'unknown',
  ] as OfficeState[])
    assert.equal(workingBubbleText({ ...agent, state }, 'connected'), null);
  for (const connection of ['connecting', 'disconnected', 'sign-in-required'] as const)
    assert.equal(workingBubbleText(agent, connection), null);
});
test('bubbles use reported activity, retain queued counts and safely fit concise plain text', () => {
  const agent = { state: 'working' as const, activity: 'Running tests', queueCount: 2 };
  assert.equal(workingBubbleText(agent, 'connected'), 'Running tests · 2 queued');
  assert.equal(
    workingBubbleText({ ...agent, activity: '  ', queueCount: 0 }, 'connected'),
    'Working',
  );
  assert.equal(
    workingBubbleText({ ...agent, activity: 'Compiling\nproject', queueCount: 0 }, 'connected'),
    'Compiling project',
  );
  assert.ok(
    workingBubbleText({ ...agent, activity: 'x'.repeat(200), queueCount: 0 }, 'connected')!
      .length <= 42,
  );
});
