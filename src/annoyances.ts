import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import {
  removeProductQrCodes,
  removeStillWatchingPrompt
} from './response-filters/annoyances';

JsonParseRegistry.getInstance().addFilter('annoyances', (r) => {
  if (configRead('hideProductQrCodes')) removeProductQrCodes(r);
  if (configRead('disableStillWatchingPrompt')) removeStillWatchingPrompt(r);
});
