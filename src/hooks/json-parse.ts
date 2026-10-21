/**
 * A single `JSON.parse` hook for the features that rewrite YouTube's JSON
 * responses (ad blocking, Shorts removal, ...).
 *
 * Filters run in registration order, i.e. module import order. Each runs in
 * its own try/catch so a failing filter can't break parsing for the page, and
 * only objects and arrays reach them, never `null` or other primitives.
 */

export type ResponseFilter = (response: object) => void;

interface RegisteredFilter {
  name: string;
  filter: ResponseFilter;
}

let registry: JsonParseRegistry | null = null;

export class JsonParseRegistry {
  #filters: RegisteredFilter[] = [];

  private constructor() {
    const originalParse = JSON.parse;
    const filters = this.#filters;

    JSON.parse = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      const result: unknown = originalParse.apply(this, arguments as never);
      if (typeof result !== 'object' || result === null) return result;

      for (const { name, filter } of filters) {
        try {
          filter(result);
        } catch (err) {
          console.warn(`[JSON.parse] ${name} filter failed`, err);
        }
      }

      return result;
    };
  }

  static getInstance() {
    if (!registry) {
      registry = new JsonParseRegistry();
    }
    return registry;
  }

  addFilter(name: string, filter: ResponseFilter) {
    this.#filters.push({ name, filter });
  }
}
