const VP09_CODEC = 'vp09';

interface StreamingFormat {
  mimeType?: string;
  [key: string]: unknown;
}

interface StreamingData {
  formats?: StreamingFormat[];
  adaptiveFormats?: StreamingFormat[];
  [key: string]: unknown;
}

interface PlayerResponse {
  streamingData?: StreamingData;
  [key: string]: unknown;
}

export function isVp09MimeType(mimeType: string | undefined) {
  return mimeType?.includes(VP09_CODEC) ?? false;
}

function isVideoFormat(format: StreamingFormat) {
  return format.mimeType?.startsWith('video/') ?? false;
}

function isVp09Format(format: StreamingFormat) {
  return isVp09MimeType(format.mimeType);
}

function filterFormats(formats: StreamingFormat[] | undefined) {
  if (!formats) return 0;

  const hasVp09Video = formats.some(
    (format) => isVideoFormat(format) && isVp09Format(format)
  );
  if (!hasVp09Video) return 0;

  const originalLength = formats.length;
  formats.splice(
    0,
    formats.length,
    ...formats.filter(
      (format) => !isVideoFormat(format) || isVp09Format(format)
    )
  );

  return originalLength - formats.length;
}

/** Drops non-VP9 video formats when the response offers VP9. */
export function forceVp09(response: object) {
  const streamingData = (response as PlayerResponse).streamingData;
  if (!streamingData) return;

  const removedFormats = filterFormats(streamingData.formats);
  const removedAdaptiveFormats = filterFormats(streamingData.adaptiveFormats);
  const removedTotal = removedFormats + removedAdaptiveFormats;

  if (removedTotal > 0) {
    console.info(
      `[video-codec] Filtered ${removedTotal} non-VP09 video formats`
    );
  }
}
