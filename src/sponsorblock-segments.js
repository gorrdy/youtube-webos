// Validation of segments from the SponsorBlock API. The API is a third-party
// mirror, so its responses must not be able to break playback (e.g. seek
// loops on tiny or overlapping segments, or skipping a whole video).

const MAX_SEGMENTS = 200;

// Longer than the 0.3 s look-back in `scheduleSkip`, so a skip can't land
// where the same segment is picked up again.
export const MIN_SEGMENT_LENGTH = 0.5;

/**
 * Returns the usable segments for `videoID` from a `/skipSegments/<hash>`
 * response, sorted by start time.
 * @param {unknown} results Parsed API response
 * @param {string} videoID
 * @param {string[]} categories Known category names
 */
export function getValidSegments(results, videoID, categories) {
  if (!Array.isArray(results)) return [];

  const result = results.find((v) => v?.videoID === videoID);
  if (!result || !Array.isArray(result.segments)) return [];

  return result.segments
    .filter((seg) => {
      if (!seg || !categories.includes(seg.category)) return false;
      if (!Array.isArray(seg.segment) || seg.segment.length !== 2) return false;
      const [start, end] = seg.segment;
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end - start >= MIN_SEGMENT_LENGTH
      );
    })
    .slice(0, MAX_SEGMENTS)
    .sort((a, b) => a.segment[0] - b.segment[0]);
}
