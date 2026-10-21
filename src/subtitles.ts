import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import {
  getTargetLanguage,
  injectTranslatedTrack,
  type CaptionsTracklistRenderer
} from './response-filters/translated-subtitles';

const TARGET_LANGUAGE = getTargetLanguage(navigator.language);

JsonParseRegistry.getInstance().addFilter('subtitles', (r) => {
  if (!configRead('forceTranslatedSubtitles')) return;

  // @ts-expect-error TS doesn't allow optional chaining on `object`. See: https://github.com/microsoft/TypeScript/issues/37700
  const renderer = r.captions?.playerCaptionsTracklistRenderer as
    | CaptionsTracklistRenderer
    | undefined;
  if (renderer) injectTranslatedTrack(renderer, TARGET_LANGUAGE);
});
