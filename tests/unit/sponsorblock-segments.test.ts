import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getValidSegments } from '../../src/sponsorblock-segments';

const CATEGORIES = ['sponsor', 'intro'];

const response = (segments: unknown) => [
  { videoID: 'other', segments: [{ category: 'sponsor', segment: [1, 9] }] },
  { videoID: 'abc', segments }
];

describe('getValidSegments', () => {
  test('returns the video’s segments sorted by start', () => {
    const segments = getValidSegments(
      response([
        { category: 'intro', segment: [50, 60] },
        { category: 'sponsor', segment: [10, 20] }
      ]),
      'abc',
      CATEGORIES
    );
    assert.deepEqual(
      segments.map((s: { segment: number[] }) => s.segment),
      [
        [10, 20],
        [50, 60]
      ]
    );
  });

  test('drops segments that could cause seek loops or bogus skips', () => {
    const segments = getValidSegments(
      response([
        { category: 'sponsor', segment: [100, 100.1] }, // shorter than the look-back
        { category: 'sponsor', segment: [100, 100] },
        { category: 'sponsor', segment: [20, 10] }, // end before start
        { category: 'sponsor', segment: [-5, 10] },
        { category: 'sponsor', segment: [10, Infinity] },
        { category: 'sponsor', segment: ['10', '20'] },
        { category: 'sponsor', segment: [10] },
        { category: 'unknown', segment: [10, 20] },
        { category: 'sponsor' },
        null,
        { category: 'sponsor', segment: [30, 40] }
      ]),
      'abc',
      CATEGORIES
    );
    assert.deepEqual(
      segments.map((s: { segment: number[] }) => s.segment),
      [[30, 40]]
    );
  });

  test('caps the number of segments', () => {
    const many = Array.from({ length: 10000 }, (_, i) => ({
      category: 'sponsor',
      segment: [i, i + 0.5]
    }));
    assert.equal(
      getValidSegments(response(many), 'abc', CATEGORIES).length,
      200
    );
  });

  test('ignores malformed responses', () => {
    for (const results of [null, {}, 'x', [{ videoID: 'abc' }], [null]]) {
      assert.deepEqual(getValidSegments(results, 'abc', CATEGORIES), []);
    }
  });
});
