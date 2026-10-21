import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import '../../src/hooks/json-stringify';

describe('JSON.stringify hook', () => {
  test('marks playback requests as inline no-ad, even when frozen', () => {
    const request = Object.freeze({
      videoId: 'abc',
      playbackContext: Object.freeze({
        contentPlaybackContext: Object.freeze({ html5Preference: 'X' })
      })
    });
    assert.equal(
      JSON.stringify(request),
      '{"videoId":"abc","playbackContext":{"contentPlaybackContext":{"html5Preference":"X","isInlinePlaybackNoAd":true}}}'
    );
  });

  test('does not modify the input', () => {
    const request = { playbackContext: { contentPlaybackContext: {} } };
    JSON.stringify(request);
    assert.deepEqual(request, {
      playbackContext: { contentPlaybackContext: {} }
    });
  });

  test('behaves like the native stringify for other values', () => {
    class Money {
      toJSON() {
        return '1.50 EUR';
      }
    }
    assert.equal(JSON.stringify({ a: 1, f() {} }), '{"a":1}');
    assert.equal(
      JSON.stringify({ price: new Money() }),
      '{"price":"1.50 EUR"}'
    );
    assert.equal(JSON.stringify(null), 'null');
    assert.equal(JSON.stringify([1, 'x']), '[1,"x"]');
  });
});
