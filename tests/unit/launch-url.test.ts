import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getLaunchURL, isSameOrigin } from '../../src/utils';

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

describe('getLaunchURL', () => {
  const isDefault = (url: URL) =>
    url.origin === YOUTUBE &&
    url.pathname === '/tv' &&
    url.searchParams.has('env_forceFullAnimation');

  test('opens the TV page by default', () => {
    assert.ok(isDefault(getLaunchURL({})));
    assert.ok(isDefault(getLaunchURL(undefined)));
  });

  test('keeps a full YouTube TV URL', () => {
    const url = getLaunchURL({
      contentTarget: 'https://www.youtube.com/tv?foo=1#/watch?v=abc'
    });
    assert.equal(url.href, 'https://www.youtube.com/tv?foo=1#/watch?v=abc');
  });

  test('ignores full URLs outside YouTube TV', () => {
    for (const contentTarget of [
      'https://www.youtube.com@example.com/',
      'https://www.youtube.com.example.com/',
      'https://www.youtube.com/redirect?q=https://example.com/',
      'https://www.youtube.com/logout',
      'javascript:alert(1)'
    ]) {
      const url = getLaunchURL({ contentTarget });
      assert.ok(isDefault(url), contentTarget);
      assert.equal(url.searchParams.has('q'), false, contentTarget);
    }
  });

  test('adds partial params to the TV page', () => {
    assert.equal(
      getLaunchURL({ contentTarget: 'v=abc' }).searchParams.get('v'),
      'abc'
    );
    assert.equal(
      getLaunchURL({ contentTarget: 'v=v=abc' }).searchParams.get('v'),
      'abc'
    );
    assert.equal(
      getLaunchURL({
        target: 'pairingCode=x&dialLaunch=watch'
      }).searchParams.get('dialLaunch'),
      'watch'
    );
  });

  test('handles voice launches', () => {
    const url = getLaunchURL({
      contentTarget: { intent: 'SearchContent', intentParam: 'cats' }
    });
    assert.equal(url.searchParams.get('va'), 'search');
    assert.equal(url.searchParams.get('vq'), 'cats');
  });

  test('falls back to the TV page for malformed params', () => {
    assert.ok(isDefault(getLaunchURL({ contentTarget: null })));
    assert.ok(isDefault(getLaunchURL({ contentTarget: { intent: 123 } })));
    assert.ok(isDefault(getLaunchURL({ contentTarget: 42 })));
  });
});
