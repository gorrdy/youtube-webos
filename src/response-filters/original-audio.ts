/**
 * Prefers the original audio track over dubbed ones, including YouTube's
 * automatic dubbing, by rewriting which track `/player` responses mark as the
 * default.
 *
 * Each audio format carries `xtags`, a base64 protobuf with an `acont` tag
 * (`original`, `dubbed`, `dubbed-auto`, ...). Unlike `displayName` it isn't
 * localized.
 */

interface AudioTrackInfo {
  id?: string;
  audioIsDefault?: boolean;
}

interface AdaptiveFormat {
  xtags?: string;
  audioTrack?: AudioTrackInfo;
}

interface CaptionsAudioTrack {
  audioTrackId?: string;
}

/** Returns the `acont` value from a format's `xtags`, e.g. `original`. */
function getAudioContent(xtags: string | undefined): string | null {
  if (!xtags) return null;

  let raw: string;
  try {
    const b64 = xtags.replace(/-/g, '+').replace(/_/g, '/');
    raw = atob(b64 + '==='.slice((b64.length + 3) % 4));
  } catch {
    return null;
  }

  // ... "acont" 0x12 <length> <value> ...
  const key = raw.indexOf('acont');
  if (key === -1 || raw.charCodeAt(key + 5) !== 0x12) return null;
  const length = raw.charCodeAt(key + 6);
  return raw.substr(key + 7, length);
}

export function preferOriginalAudio(response: unknown) {
  // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
  const formats = response?.streamingData?.adaptiveFormats as unknown;
  if (!Array.isArray(formats)) return;

  const audioFormats = (formats as AdaptiveFormat[]).filter(
    (format) => format?.audioTrack
  );
  const originalId = audioFormats.find(
    (format) => getAudioContent(format.xtags) === 'original'
  )?.audioTrack?.id;
  if (!originalId) return;

  let changed = false;
  for (const format of audioFormats) {
    const audioTrack = format.audioTrack!;
    const isDefault = audioTrack.id === originalId;
    if (audioTrack.audioIsDefault !== isDefault) {
      audioTrack.audioIsDefault = isDefault;
      changed = true;
    }
  }

  // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
  const renderer = response?.captions?.playerCaptionsTracklistRenderer as
    | { audioTracks?: CaptionsAudioTrack[]; defaultAudioTrackIndex?: number }
    | undefined;
  const index =
    renderer?.audioTracks?.findIndex(
      (track) => track.audioTrackId === originalId
    ) ?? -1;
  if (renderer && index !== -1 && renderer.defaultAudioTrackIndex !== index) {
    renderer.defaultAudioTrackIndex = index;
    changed = true;
  }

  if (changed) {
    console.info(`[original-audio] Preferring original audio ${originalId}`);
  }
}
