import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import { removeShortsFromResponse } from './response-filters/shorts';

JsonParseRegistry.getInstance().addFilter('shorts', (r) => {
  if (configRead('removeShorts')) removeShortsFromResponse(r);
});
