function isPrimitive(
  value: unknown
): value is string | number | boolean | null | undefined | symbol | bigint {
  return Object(value) !== value;
}

const originalStringify = JSON.stringify;

type FunctionReplacer = (this: any, key: string, value: any) => any;
type WhitelistReplacer = (string | number)[] | null;

function stringify(
  value: unknown,
  replacer?: FunctionReplacer | WhitelistReplacer,
  space?: string | number
): string {
  if (!isPrimitive(value)) {
    // TODO: add below to a dump-level logger
    // console.debug('JSON.stringify', value, replacer, space);

    // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
    const playbackContext = value?.playbackContext as unknown;
    // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
    const ctx = playbackContext?.contentPlaybackContext as unknown;
    if (!isPrimitive(ctx)) {
      // Objects are sometimes frozen by YT to prevent modification. Shallow
      // copy only the path we modify; a deep clone (`structuredClone`) throws
      // on functions, drops `toJSON` and runs on every stringify call.
      value = {
        ...(value as Record<string, unknown>),
        playbackContext: {
          ...(playbackContext as Record<string, unknown>),
          contentPlaybackContext: {
            ...(ctx as Record<string, unknown>),
            isInlinePlaybackNoAd: true
          }
        }
      };
      console.info(`[JSON.stringify] Set isInlinePlaybackNoAd`);
    }
  }

  return originalStringify(value, replacer as any, space);
}

JSON.stringify = stringify;
