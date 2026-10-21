import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { removeAds } from '../../src/response-filters/ads';
import { removeEndscreen } from '../../src/response-filters/endscreen';
import { removeShortsFromResponse } from '../../src/response-filters/shorts';

describe('removeAds', () => {
  test('removes player ads', () => {
    const r = { adPlacements: [1], adSlots: [2], playerAds: [3], keep: true };
    removeAds(r);
    assert.deepEqual(r, { keep: true });
  });

  test('removes the masthead and ad tiles from home', () => {
    const r = {
      contents: {
        tvBrowseRenderer: {
          content: {
            tvSurfaceContentRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { tvMastheadRenderer: {} },
                    { adSlotRenderer: {} },
                    {
                      shelfRenderer: {
                        content: {
                          horizontalListRenderer: {
                            items: [{ adSlotRenderer: {} }, { tileRenderer: 1 }]
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    };
    removeAds(r);
    const contents =
      r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content
        .sectionListRenderer.contents;
    assert.equal(contents.length, 1);
    assert.deepEqual(
      contents[0].shelfRenderer!.content.horizontalListRenderer.items,
      [{ tileRenderer: 1 }]
    );
  });

  test('removes ad Shorts entries', () => {
    const ad = {
      command: { reelWatchEndpoint: { adClientParams: { isAd: true } } }
    };
    const r = { entries: [ad, { command: {} }] };
    removeAds(r);
    assert.deepEqual(r.entries, [{ command: {} }]);
  });
});

describe('removeShortsFromResponse', () => {
  test('removes Shorts tiles and shelves', () => {
    const shortsTile = {
      tileRenderer: { onSelectCommand: { reelWatchEndpoint: {} } }
    };
    const videoTile = {
      tileRenderer: { onSelectCommand: { watchEndpoint: {} } }
    };
    const r = {
      a: { gridRenderer: { items: [shortsTile, videoTile] } },
      b: {
        sectionListRenderer: {
          contents: [
            {
              shelfRenderer: {
                tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS'
              }
            },
            { shelfRenderer: { tvhtml5ShelfRendererType: 'OTHER' } }
          ]
        }
      }
    };
    removeShortsFromResponse(r);
    assert.deepEqual(r.a.gridRenderer.items, [videoTile]);
    assert.equal(r.b.sectionListRenderer.contents.length, 1);
  });

  // Newer tile format, as seen in TV search results.
  const lockup = (endpoint: string) => ({
    lockupViewModel: {
      rendererContext: {
        commandContext: { onTap: { innertubeCommand: { [endpoint]: {} } } }
      }
    }
  });
  const shelf = (title: string, items: unknown[]) => ({
    shelfRenderer: {
      title,
      content: { horizontalListRenderer: { items } }
    }
  });

  test('removes Shorts lockups and shelves left with only Shorts', () => {
    const r = {
      contents: {
        sectionListRenderer: {
          contents: [
            shelf('results', [
              lockup('reelWatchEndpoint'),
              lockup('watchEndpoint'),
              lockup('reelWatchEndpoint')
            ]),
            shelf('only shorts', [
              lockup('reelWatchEndpoint'),
              lockup('reelWatchEndpoint')
            ]),
            shelf('filled later', [])
          ]
        }
      }
    };
    removeShortsFromResponse(r);
    const shelves = r.contents.sectionListRenderer.contents;
    assert.deepEqual(
      shelves.map((s) => s.shelfRenderer.title),
      ['results', 'filled later']
    );
    assert.deepEqual(
      shelves[0].shelfRenderer.content.horizontalListRenderer.items,
      [lockup('watchEndpoint')]
    );
  });

  test('keeps the Shorts player sequence', () => {
    const r = {
      entries: [
        { command: { reelWatchEndpoint: { videoId: 'a' } } },
        { command: { reelWatchEndpoint: { videoId: 'b' } } }
      ]
    };
    removeShortsFromResponse(r);
    assert.equal(r.entries.length, 2);
  });
});

describe('removeEndscreen', () => {
  test('removes the end screen renderer', () => {
    const r: Record<string, unknown> = {
      endscreen: { endscreenRenderer: {} },
      keep: 1
    };
    removeEndscreen(r);
    assert.deepEqual(r, { keep: 1 });
  });

  test('leaves other end screens alone', () => {
    const r = { endscreen: { other: {} } };
    removeEndscreen(r);
    assert.deepEqual(r, { endscreen: { other: {} } });
  });
});
