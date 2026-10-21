/**
 * Colour buttons on the remote. webOS reports them as 403-406; YouTube
 * re-dispatches each press with its own code (e.g. red as 166), so a single
 * press can arrive twice with different codes.
 */
const colorCodeMap = new Map([
  [403, 'red'],
  [166, 'red'],

  [404, 'green'],
  [172, 'green'],

  [405, 'yellow'],
  [170, 'yellow'],

  [406, 'blue'],
  [167, 'blue'],
  [191, 'blue']
]);

/**
 * Returns the name of the color button associated with a code or null if not a color button.
 * @param {number} code KeyboardEvent.keyCode or KeyboardEvent.charCode property from event
 * @returns {'red' | 'green' | 'yellow' | 'blue' | null} Color name or null
 */
export function getKeyColor(code) {
  return colorCodeMap.get(code) ?? null;
}
