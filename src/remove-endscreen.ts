import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import { removeEndscreen } from './response-filters/endscreen';

JsonParseRegistry.getInstance().addFilter('endscreen', (res) => {
  if (configRead('removeEndscreen')) removeEndscreen(res);
});
