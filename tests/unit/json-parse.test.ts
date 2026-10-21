import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { JsonParseRegistry } from '../../src/hooks/json-parse';

describe('JsonParseRegistry', () => {
  const registry = JsonParseRegistry.getInstance();
  const calls: string[] = [];

  // All tests share the global `JSON.parse`; only touch this file's objects.
  const isOurs = (r: object): r is Record<string, unknown> =>
    'registryTest' in r;

  registry.addFilter('first', (r) => {
    if (!isOurs(r)) return;
    calls.push('first');
    r.seenByFirst = true;
  });
  registry.addFilter('broken', (r) => {
    if (!isOurs(r)) return;
    calls.push('broken');
    throw new Error('expected test failure');
  });
  registry.addFilter('last', (r) => {
    if (!isOurs(r)) return;
    calls.push('last');
    r.seenByLast = true;
  });

  test('runs filters in registration order, despite a failing one', () => {
    calls.length = 0;
    assert.deepEqual(JSON.parse('{"registryTest":1}'), {
      registryTest: 1,
      seenByFirst: true,
      seenByLast: true
    });
    assert.deepEqual(calls, ['first', 'broken', 'last']);
  });

  test('passes primitives through without calling filters', () => {
    calls.length = 0;
    assert.equal(JSON.parse('null'), null);
    assert.equal(JSON.parse('5'), 5);
    assert.equal(JSON.parse('"x"'), 'x');
    assert.deepEqual(calls, []);
  });

  test('gives filters only the top-level value', () => {
    calls.length = 0;
    JSON.parse('[{"registryTest":1}]');
    assert.deepEqual(calls, []);
  });

  test('keeps the reviver working', () => {
    const r = JSON.parse('{"n":2}', (k, v) => (k === 'n' ? v * 10 : v));
    assert.equal(r.n, 20);
  });

  test('is a singleton', () => {
    assert.equal(JsonParseRegistry.getInstance(), registry);
  });
});
