import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowsOfficeRequest } from '../src/access.ts';
test('office defaults to loopback and only opts into an exact public proxy origin', () => {
  const host = 'office.example.com:10000',
    origin = `https://${host}`;
  assert.ok(allowsOfficeRequest('127.0.0.1:4318', undefined, 4318));
  assert.ok(!allowsOfficeRequest(host, undefined, 4318));
  assert.ok(allowsOfficeRequest(host, undefined, 4318, origin));
  assert.ok(allowsOfficeRequest(host, origin, 4318, origin));
  assert.ok(!allowsOfficeRequest(host, 'https://evil.example', 4318, origin));
  assert.ok(!allowsOfficeRequest('evil.example', undefined, 4318, origin));
  assert.ok(!allowsOfficeRequest('127.0.0.1:4318', origin, 4318, origin));
  for (const invalid of [
    'http://office.example.com',
    'https://name:secret@office.example.com',
    'https://office.example.com/private',
    'https://office.example.com/?token=x',
    '*',
  ])
    assert.ok(!allowsOfficeRequest('office.example.com', undefined, 4318, invalid));
});
