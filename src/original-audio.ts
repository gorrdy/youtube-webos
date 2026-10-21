import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import { preferOriginalAudio } from './response-filters/original-audio';

JsonParseRegistry.getInstance().addFilter('original-audio', (r) => {
  if (configRead('forceOriginalAudio')) preferOriginalAudio(r);
});
