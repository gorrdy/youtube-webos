import { CustomEventTarget, TypedCustomEvent } from '../custom-event-target';

export interface StringConvertible {
  toString(): string;
}

export type FetchTarget = Request | StringConvertible;

let registry: FetchRegistry | null = null;

export interface RequestInfo {
  url: URL;
  resource: FetchTarget;
  init?: RequestInit | undefined;
}

interface EventMap {
  request: CustomEvent<RequestInfo>;
  response: CustomEvent<Response>;
}

export class FetchRegistry extends CustomEventTarget<EventMap> {
  #originalFetch: typeof fetch;
  #fetchCount = 0;

  private constructor() {
    super();

    this.#originalFetch = window.fetch.bind(window);
    window.fetch = this.#customFetch;
  }

  static #redact(init: RequestInit) {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = /^(authorization|cookie)$/i.test(name)
        ? '<redacted>'
        : value;
    });
    return { ...init, headers };
  }

  static async #dumpBody(resource: Request | Response) {
    if (
      !resource?.constructor?.name ||
      !['Request', 'Response'].includes(resource.constructor.name)
    )
      return null;

    const blob = await resource.clone().blob();
    if (!blob.size) return null;

    const fr = new FileReader();

    const res = new Promise((resolve) => {
      fr.addEventListener('load', () => {
        resolve(fr.result);
      });
    });

    fr.readAsDataURL(blob);

    return res;
  }

  #customFetch = async (resource: FetchTarget, init?: RequestInit) => {
    if (window.__ytaf_debug__) {
      // Logs are readable from the dev-mode inspector: keep tokens out.
      console.debug(
        `Request ${this.#fetchCount}:`,
        resource instanceof Request ? resource.url : resource
      );
      init &&
        console.debug(
          `Options  ${this.#fetchCount}:`,
          FetchRegistry.#redact(init)
        );

      if (resource instanceof Request) {
        const reqBody = await FetchRegistry.#dumpBody(resource);
        reqBody && console.debug(`Request Body ${this.#fetchCount}:`, reqBody);
      }
    }

    const url = new URL(
      resource instanceof Request ? resource.url : resource.toString(),
      document.location.href
    );
    const reqAllowed = this.dispatchEvent(
      new TypedCustomEvent('request', {
        detail: { url, resource, init },
        cancelable: true
      })
    );
    if (!reqAllowed) {
      console.info(
        `Fetch request ${this.#fetchCount} was cancelled by listener.`,
        resource,
        init
      );
      throw new TypeError('Failed to fetch');
    }

    // @ts-expect-error
    const res = await this.#originalFetch(resource, init);

    if (window.__ytaf_debug__) {
      console.debug(`Response ${this.#fetchCount}:`, res);

      const resBody = await FetchRegistry.#dumpBody(res);
      resBody && console.debug(`Response Body ${this.#fetchCount}:`, resBody);
    }

    const resAllowed = this.dispatchEvent(
      new TypedCustomEvent('response', { detail: res, cancelable: true })
    );

    if (!resAllowed) {
      console.info(
        `Fetch response ${this.#fetchCount} was cancelled by listener.`,
        res
      );
      throw new TypeError('Failed to fetch');
    }

    this.#fetchCount++;

    return res;
  };

  static getInstance() {
    if (!registry) {
      registry = new FetchRegistry();
    }
    return registry;
  }

  [Symbol.dispose]() {
    window.fetch = this.#originalFetch;
    registry = null;
  }
}

registry = FetchRegistry.getInstance();
