import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import { removeAds } from './response-filters/ads';

JsonParseRegistry.getInstance().addFilter('adblock', (r) => {
  if (configRead('enableAdBlock')) removeAds(r);
});
