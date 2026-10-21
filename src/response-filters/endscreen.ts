/** Plain object, as produced by `JSON.parse` (not an array or null). */
function isObject(value: unknown): value is object {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** Removes the end screen shown over the last seconds of a video. */
export function removeEndscreen(res: unknown) {
  if (
    isObject(res) &&
    'endscreen' in res &&
    isObject(res.endscreen) &&
    'endscreenRenderer' in res.endscreen
  ) {
    console.debug('Removed endscreen from JSON response', res.endscreen);
    delete res.endscreen;
  }
}
