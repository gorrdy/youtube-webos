/**
 * Makes an auto-translated subtitle track in the TV's UI language selectable.
 *
 * The webOS/leanback captions menu only lists the tracks present in the
 * `/player` response's `captionTracks`. Unlike the desktop web player, it does
 * not expose the "auto-translate" submenu built from `translationLanguages`.
 * So for a video whose captions are in another language there is no way to
 * pick a translation from the UI.
 *
 * We fix this by intercepting the `/player` JSON response (via the same
 * `JSON.parse` hook technique used by adblock) and injecting a synthetic
 * track. We clone an existing caption track — preserving all of its `baseUrl`
 * query params (auth / `pot` / signature) — and add `&tlang=<lang>`, the
 * parameter YouTube's timedtext server uses to machine-translate any track.
 * The clone then shows up as a normal, directly-selectable option in the
 * captions menu.
 */

interface CaptionTrackName {
  simpleText?: string;
  runs?: { text: string }[];
}

interface CaptionTrack {
  baseUrl: string;
  name: CaptionTrackName;
  vssId?: string;
  languageCode: string;
  kind?: string;
  rtl?: boolean;
  isTranslatable?: boolean;
  trackName?: string;
}

interface TranslationLanguage {
  languageCode: string;
  languageName?: CaptionTrackName;
}

interface AudioTrack {
  captionTrackIndices?: number[];
  defaultCaptionTrackIndex?: number;
}

export interface CaptionsTracklistRenderer {
  captionTracks?: CaptionTrack[];
  audioTracks?: AudioTrack[];
  translationLanguages?: TranslationLanguage[];
}

/**
 * YouTube language code for the TV's UI language, e.g. `cs` for `cs-CZ`.
 * Falls back to English.
 */
export function getTargetLanguage(language: string | undefined): string {
  const [primary = 'en', region = ''] = (language || 'en')
    .toLowerCase()
    .split('-');

  // YouTube still uses legacy/script codes for these.
  if (primary === 'he') return 'iw';
  if (primary === 'zh') {
    return ['tw', 'hk', 'mo', 'hant'].includes(region) ? 'zh-Hant' : 'zh-Hans';
  }
  return primary;
}

function isTargetLanguage(languageCode: string | undefined, target: string) {
  const code = (languageCode ?? '').toLowerCase();
  target = target.toLowerCase();
  return code === target || code.startsWith(target + '-');
}

function getLabel(renderer: CaptionsTracklistRenderer, target: string) {
  // `translationLanguages` doesn't list every language the timedtext server
  // can translate to (e.g. no Czech on webOS), so only use it for the name.
  const listed = renderer.translationLanguages?.find((l) =>
    isTargetLanguage(l.languageCode, target)
  )?.languageName;
  let name = listed?.simpleText ?? listed?.runs?.[0]?.text;

  if (!name && typeof Intl !== 'undefined' && 'DisplayNames' in Intl) {
    try {
      name = new Intl.DisplayNames([target], {
        type: 'language'
      }).of(target);
    } catch {
      // Unknown code, fall through.
    }
  }

  return `${name ?? target} (auto-translated)`;
}

/** Mirror the `name` shape of the source track so the renderer stays happy. */
function makeName(source: CaptionTrackName, label: string): CaptionTrackName {
  if (source && Array.isArray(source.runs)) {
    return { runs: [{ text: label }] };
  }
  return { simpleText: label };
}

function buildTranslatedUrl(baseUrl: string, target: string): string | null {
  try {
    // The app always runs on www.youtube.com.
    const url = new URL(baseUrl, 'https://www.youtube.com/');
    url.searchParams.set('tlang', target);
    return url.toString();
  } catch (err) {
    console.warn('[subtitles] Could not parse caption baseUrl', baseUrl, err);
    return null;
  }
}

export function injectTranslatedTrack(
  renderer: CaptionsTracklistRenderer,
  target: string
) {
  const tracks = renderer.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return;

  // The target language (native or auto-generated) is already offered.
  if (tracks.some((t) => isTargetLanguage(t.languageCode, target))) return;

  // Pick an existing track as the translation source and point it at YouTube's
  // machine translation. `buildTranslatedUrl` preserves the source's auth
  // query params.
  const source = tracks[0];
  if (!source) return;

  const baseUrl = buildTranslatedUrl(source.baseUrl, target);
  if (!baseUrl) return;
  const label = getLabel(renderer, target);
  // Build a clean track rather than spreading `...source`: the auth is
  // carried by `baseUrl`, and copying the source would drag along wrong fields
  // (e.g. `rtl: true` from an Arabic track, or `kind: "asr"`). A distinct
  // `vssId`/`languageCode` is required so the menu doesn't collapse it into the
  // source track as a duplicate.
  const newIndex =
    tracks.push({
      baseUrl,
      name: makeName(source.name, label),
      vssId: '.' + target,
      languageCode: target,
      isTranslatable: true,
      trackName: label
    }) - 1;

  // The caption menu is built from each audio track's `captionTrackIndices`,
  // not from `captionTracks` directly — so a freshly pushed track is invisible
  // until its index is registered here.
  const audioTracks = renderer.audioTracks;
  if (Array.isArray(audioTracks)) {
    for (const at of audioTracks) {
      if (
        Array.isArray(at.captionTrackIndices) &&
        !at.captionTrackIndices.includes(newIndex)
      ) {
        at.captionTrackIndices.push(newIndex);
      }
    }
  }

  console.info(
    `[subtitles] Injected auto-translated caption track (${target})`
  );
}
