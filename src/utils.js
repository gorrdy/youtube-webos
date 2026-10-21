const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

export function extractLaunchParams() {
  if (!window.launchParams) return {};

  try {
    const params = JSON.parse(window.launchParams);
    return params && typeof params === 'object' ? params : {};
  } catch (err) {
    console.warn('Ignoring invalid launch params', err);
    return {};
  }
}

/**
 * Whether `target` is a full URL on `origin`. A prefix check isn't enough:
 * `https://www.youtube.com.example.com/` and `https://www.youtube.com@example.com/`
 * both start with YouTube's origin. Launch params can come from other devices
 * (casting), so they must not be able to navigate the app elsewhere.
 * @param {string} target
 * @param {string} origin
 */
export function isSameOrigin(target, origin) {
  try {
    return new URL(target).origin === origin;
  } catch {
    return false;
  }
}

function getYTURL() {
  const ytURL = new URL('https://www.youtube.com/tv#/');
  ytURL.searchParams.append('env_forceFullAnimation', '1');
  ytURL.searchParams.append('env_enableWebSpeech', '1');
  ytURL.searchParams.append('env_enableVoice', '1');
  return ytURL;
}

/**
 * Creates a new URLSearchPrams with the contents of `a` and `b`
 * @param {URLSearchParams} a
 * @param {URLSearchParams} b
 * @returns {URLSearchParams}
 */
function concatSearchParams(a, b) {
  return new URLSearchParams([...a.entries(), ...b.entries()]);
}

/**
 * Parses `target` if it's an absolute URL, otherwise returns null.
 * @param {string} target
 */
function parseAbsoluteURL(target) {
  try {
    return new URL(target);
  } catch {
    return null;
  }
}

/**
 * The URL to open for launch params. Launch params can come from other
 * devices (casting), so they must not be able to navigate the app anywhere
 * but YouTube's TV page.
 * @param {any} params
 * @returns {URL}
 */
export function getLaunchURL(params) {
  let ytURL = getYTURL();

  // We use our custom "target" param, since launches with "contentTarget"
  // parameter do not respect "handlesRelaunch" appinfo option. We still
  // fallback to "contentTarget" if our custom param is not specified.
  //
  let { target, contentTarget = target } = params ?? {};

  /** TODO: Handle google assistant
   * Sample: {contentTarget: "v=v=<ID>", storeCaller: "voice", subReason: "voiceAgent", voiceEngine: "googleAssistant"}
   */

  switch (contentTarget === null ? 'null' : typeof contentTarget) {
    case 'string': {
      const url = parseAbsoluteURL(contentTarget);
      if (url) {
        // Normalized, so the check and the navigation can't disagree.
        if (
          isSameOrigin(url.href, ytURL.origin) &&
          url.pathname === ytURL.pathname
        ) {
          console.info('Launching from direct contentTarget');
          ytURL = url;
        } else {
          console.warn('Ignoring contentTarget outside YouTube TV');
        }
      } else {
        // Out of app dial launch with second screen on home: { contentTarget: 'pairingCode=<UUID>&theme=cl&dialLaunch=watch' }
        console.info('Launching from partial contentTarget');
        if (contentTarget.indexOf('v=v=') === 0)
          contentTarget = contentTarget.substring(2);

        ytURL.search = concatSearchParams(
          ytURL.searchParams,
          new URLSearchParams(contentTarget)
        );
      }
      break;
    }
    case 'object': {
      const { intent, intentParam } = contentTarget;
      if (typeof intent !== 'string') {
        console.warn('Ignoring voice launch without intent');
        break;
      }
      console.info('Voice launch');

      // Ctrl+F tvhtml5LaunchUrlComponentChanged & REQUEST_ORIGIN_GOOGLE_ASSISTANT in base.js for info
      const search = ytURL.searchParams;
      // contentTarget.intent's seen so far: PlayContent, SearchContent
      const voiceContentIntent = intent
        .match(CONTENT_INTENT_REGEX)?.[0]
        ?.toLowerCase();

      search.set('inApp', true);
      search.set('vs', 9); // Voice System is VOICE_SYSTEM_LG_THINKQ
      voiceContentIntent && search.set('va', voiceContentIntent);

      // order is important
      search.append('launch', 'voice');
      voiceContentIntent === 'search' && search.append('launch', 'search');

      search.set('vq', intentParam);
      break;
    }
    default: {
      console.info('Default launch');
    }
  }

  return ytURL;
}

export function handleLaunch(params) {
  // Only the keys: values can hold a DIAL pairing code.
  console.info('handleLaunch', Object.keys(params ?? {}));

  let url;
  try {
    url = getLaunchURL(params);
  } catch (err) {
    console.warn('Invalid launch params, opening YouTube', err);
    url = getYTURL();
  }

  window.location.href = url.toString();
}

/**
 * Wait for a child element to be added for which a predicate is true.
 *
 * When `observeAttributes` is false, the predicate is checked only when a node
 * is first added. If you want the predicate to run every time an attribute is
 * modified, set `observeAttributes` to true.
 * @template {Node} T
 * @param {Element} parent Root of tree to watch
 * @param {(node: Node) => node is T} predicate Function that checks whether its argument is the desired element
 * @param {boolean} observeAttributes Also run predicate on attribute changes
 * @param {AbortSignal=} abortSignal Signal that can be used to stop waiting
 * @return {Promise<T>} Matched element
 */
export async function waitForChildAdd(
  parent,
  predicate,
  observeAttributes,
  abortSignal
) {
  return new Promise((resolve, reject) => {
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        switch (mut.type) {
          case 'attributes': {
            if (predicate(mut.target)) {
              obs.disconnect();
              resolve(mut.target);
              return;
            }
            break;
          }
          case 'childList': {
            for (const node of mut.addedNodes) {
              if (predicate(node)) {
                obs.disconnect();
                resolve(node);
                return;
              }
            }
            break;
          }
        }
      }
    });

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        obs.disconnect();
        reject(new Error('aborted'));
      });
    }

    obs.observe(parent, {
      subtree: true,
      attributes: observeAttributes,
      childList: true
    });
  });
}
