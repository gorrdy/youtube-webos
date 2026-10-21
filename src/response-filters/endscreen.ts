import kindOf from 'which-builtin-type';

function isObject(value: unknown): value is object {
  // @ts-expect-error - bad types
  return kindOf(value) === 'Object';
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
