import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isSameOrigin } from '../../src/utils';

const YOUTUBE = 'https://www.youtube.com';

describe('isSameOrigin', () => {
  test('accepts full YouTube URLs', () => {
    assert.equal(
      isSameOrigin('https://www.youtube.com/tv#/watch?v=abc', YOUTUBE),
      true
    );
    assert.equal(isSameOrigin('https://www.youtube.com/', YOUTUBE), true);
  });

  test('rejects other sites that start with the YouTube origin', () => {
    assert.equal(
      isSameOrigin('https://www.youtube.com.example.com/', YOUTUBE),
      false
    );
    assert.equal(
      isSameOrigin('https://www.youtube.com@example.com/', YOUTUBE),
      false
    );
    assert.equal(isSameOrigin('https://www.youtube.com:8443/', YOUTUBE), false);
    assert.equal(isSameOrigin('http://www.youtube.com/', YOUTUBE), false);
  });

  test('rejects partial launch params', () => {
    assert.equal(isSameOrigin('v=abc', YOUTUBE), false);
    assert.equal(
      isSameOrigin('pairingCode=x&dialLaunch=watch', YOUTUBE),
      false
    );
    assert.equal(isSameOrigin('', YOUTUBE), false);
  });
});
