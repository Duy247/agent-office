import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicLogo, publicSnapshot } from '../src/boundary.ts';

test('wall logos accept local images and safe placement without exposing extra settings', () => {
  for (const ext of ['svg', 'ico', 'png', 'jpg', 'jpeg', 'webp']) {
    const logo = { url: `/assets/local/brand.${ext}`, width: 3, position: [1, 2, 3] };
    assert.deepEqual(publicLogo({ ...logo, token: 'private' }), logo);
    assert.deepEqual(publicSnapshot({ config: { logo } }).config.logo, logo);
  }
  assert.deepEqual(
    publicLogo({
      url: '/assets/custom/logo.svg',
      width: -1,
      height: Infinity,
      rotation: [NaN, 0, 0],
    }),
    { url: '/assets/custom/logo.svg' },
  );
});

test('wall logos reject remote, traversal, query-string and executable paths', () => {
  for (const url of [
    'https://example.com/logo.svg',
    '//example.com/logo.ico',
    '/assets/../logo.svg',
    '/assets//logo.svg',
    '/assets/logo.svg?secret=x',
    '/assets/logo.html',
    '/assets/%2e%2e/logo.svg',
    'data:image/svg+xml,anything',
  ])
    assert.equal(publicLogo({ url }), undefined);
  assert.equal(publicSnapshot({ config: { logo: null } }).config.logo, undefined);
});
