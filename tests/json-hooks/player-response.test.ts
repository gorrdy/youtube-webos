import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  removeProductQrCodes,
  removeStillWatchingPrompt
} from '../../src/response-filters/annoyances';
import { preferOriginalAudio } from '../../src/response-filters/original-audio';
import { forceVp09 } from '../../src/response-filters/vp9';

// `xtags` of the audio formats of a real video (iZ0qmq42RLs) with an
// automatically dubbed Hebrew track.
const XTAGS_ORIGINAL = 'ChEKBWFjb250EghvcmlnaW5hbAoNCgRsYW5nEgVlbi1VUw';
const XTAGS_DUBBED_AUTO = 'ChQKBWFjb250EgtkdWJiZWQtYXV0bwoKCgRsYW5nEgJpdw';

function dubbedResponse() {
  return {
    streamingData: {
      adaptiveFormats: [
        { itag: 137, mimeType: 'video/mp4' },
        {
          itag: 140,
          xtags: XTAGS_DUBBED_AUTO,
          audioTrack: { id: 'iw.10', audioIsDefault: true, isAutoDubbed: true }
        },
        {
          itag: 140,
          xtags: XTAGS_ORIGINAL,
          audioTrack: { id: 'en-US.4', audioIsDefault: false }
        }
      ]
    },
    captions: {
      playerCaptionsTracklistRenderer: {
        audioTracks: [{ audioTrackId: 'iw.10' }, { audioTrackId: 'en-US.4' }],
        defaultAudioTrackIndex: 0
      }
    }
  };
}

describe('preferOriginalAudio', () => {
  test('makes the original track the default over an automatic dub', () => {
    const r = dubbedResponse();
    preferOriginalAudio(r);
    const defaults = r.streamingData.adaptiveFormats
      .filter((f) => f.audioTrack)
      .map((f) => [f.audioTrack!.id, f.audioTrack!.audioIsDefault]);
    assert.deepEqual(defaults, [
      ['iw.10', false],
      ['en-US.4', true]
    ]);
    assert.equal(
      r.captions.playerCaptionsTracklistRenderer.defaultAudioTrackIndex,
      1
    );
  });

  test('changes nothing without an original track', () => {
    const r = dubbedResponse();
    r.streamingData.adaptiveFormats.pop();
    const before = JSON.parse(JSON.stringify(r));
    preferOriginalAudio(r);
    assert.deepEqual(r, before);
  });

  test('ignores responses without streaming data', () => {
    const r = { foo: 1 };
    preferOriginalAudio(r);
    assert.deepEqual(r, { foo: 1 });
  });
});

describe('removeProductQrCodes', () => {
  test('removes product QR codes but keeps the rest of the overlay', () => {
    const r = {
      playerOverlays: {
        playerOverlayRenderer: {
          timelyActionRenderers: [{ qr: 'merch' }],
          autoplay: {}
        }
      },
      transportControls: { share: { qrCodeRenderer: { qrCodeImage: 'share' } } }
    };
    removeProductQrCodes(r);
    assert.deepEqual(Object.keys(r.playerOverlays.playerOverlayRenderer), [
      'autoplay'
    ]);
    assert.ok(r.transportControls.share.qrCodeRenderer);
  });
});

describe('removeStillWatchingPrompt', () => {
  test('removes only the "Continue watching?" message', () => {
    const r = {
      messages: [{ youThereRenderer: {} }, { mealbarPromoRenderer: {} }]
    };
    removeStillWatchingPrompt(r);
    assert.deepEqual(r.messages, [{ mealbarPromoRenderer: {} }]);
  });

  test('ignores responses without messages', () => {
    const r = { foo: 1 };
    removeStillWatchingPrompt(r);
    assert.deepEqual(r, { foo: 1 });
  });
});

describe('forceVp09', () => {
  test('drops non-VP9 video formats when VP9 is offered', () => {
    const r = {
      streamingData: {
        adaptiveFormats: [
          { mimeType: 'video/mp4; codecs="av01.0.08M.08"' },
          { mimeType: 'video/webm; codecs="vp09.00.40.08"' },
          { mimeType: 'audio/webm; codecs="opus"' }
        ]
      }
    };
    forceVp09(r);
    assert.deepEqual(
      r.streamingData.adaptiveFormats.map((f) => f.mimeType.split(';')[0]),
      ['video/webm', 'audio/webm']
    );
  });

  test('keeps everything when there is no VP9', () => {
    const formats = [
      { mimeType: 'video/mp4; codecs="avc1"' },
      { mimeType: 'audio/mp4' }
    ];
    const r = { streamingData: { adaptiveFormats: [...formats] } };
    forceVp09(r);
    assert.deepEqual(r.streamingData.adaptiveFormats, formats);
  });
});
