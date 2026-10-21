import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  getTargetLanguage,
  injectTranslatedTrack,
  type CaptionsTracklistRenderer
} from '../../src/response-filters/translated-subtitles';

describe('getTargetLanguage', () => {
  test('maps the TV language to a YouTube language code', () => {
    assert.equal(getTargetLanguage('cs-CZ'), 'cs');
    assert.equal(getTargetLanguage('de'), 'de');
    assert.equal(getTargetLanguage('he-IL'), 'iw');
    assert.equal(getTargetLanguage('zh-TW'), 'zh-Hant');
    assert.equal(getTargetLanguage('zh-CN'), 'zh-Hans');
    assert.equal(getTargetLanguage(undefined), 'en');
  });
});

function englishOnly(): CaptionsTracklistRenderer {
  return {
    captionTracks: [
      {
        baseUrl:
          'https://www.youtube.com/api/timedtext?v=abc&sig=SECRET&lang=en&kind=asr',
        name: { simpleText: 'English (auto-generated)' },
        vssId: 'a.en',
        languageCode: 'en',
        kind: 'asr'
      }
    ],
    audioTracks: [{ captionTrackIndices: [0] }, { captionTrackIndices: [0] }],
    translationLanguages: [
      { languageCode: 'de', languageName: { simpleText: 'Němčina' } }
    ]
  };
}

describe('injectTranslatedTrack', () => {
  test('adds a translated track for a language missing from translationLanguages', () => {
    const renderer = englishOnly();
    injectTranslatedTrack(renderer, 'cs');

    const track = renderer.captionTracks![1]!;
    const url = new URL(track.baseUrl);
    assert.equal(url.searchParams.get('tlang'), 'cs');
    assert.equal(url.searchParams.get('sig'), 'SECRET');
    assert.equal(track.languageCode, 'cs');
    assert.equal(track.vssId, '.cs');
    assert.equal(track.kind, undefined);
    assert.match(track.trackName!, /\(auto-translated\)$/);
    assert.deepEqual(
      renderer.audioTracks!.map((a) => a.captionTrackIndices),
      [
        [0, 1],
        [0, 1]
      ]
    );
  });

  test('names the track from translationLanguages when listed', () => {
    const renderer = englishOnly();
    injectTranslatedTrack(renderer, 'de');
    assert.equal(
      renderer.captionTracks![1]!.trackName,
      'Němčina (auto-translated)'
    );
  });

  test('does nothing when the language is already offered', () => {
    const renderer = englishOnly();
    injectTranslatedTrack(renderer, 'en');
    assert.equal(renderer.captionTracks!.length, 1);
  });
});
