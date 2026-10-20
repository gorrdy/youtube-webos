import { configRead } from './config';

/**
 * Removes interruptions that YouTube attaches to `/player` and `/next`
 * responses.
 *
 * - Product QR codes ("timely actions") that pop up over the video when merch
 *   is mentioned (webosbrew/youtube-webos#385). QR codes the user opens
 *   (share, description) are left alone.
 * - The "Video paused. Continue watching?" prompt
 *   (webosbrew/youtube-webos#86, #428). The TV client only shows it when the
 *   player response carries a `youThereRenderer` message.
 */

function removeProductQrCodes(response: unknown) {
  // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
  const overlay = response?.playerOverlays?.playerOverlayRenderer as
    | Record<string, unknown>
    | undefined;
  if (overlay?.timelyActionRenderers) {
    delete overlay.timelyActionRenderers;
    console.info('[annoyances] Removed product QR codes');
  }
}

function removeStillWatchingPrompt(response: unknown) {
  // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
  const messages = response?.messages as unknown;
  if (!Array.isArray(messages)) return;

  const filtered = messages.filter((message) => !message?.youThereRenderer);
  if (filtered.length !== messages.length) {
    (response as { messages: unknown[] }).messages = filtered;
    console.info('[annoyances] Removed "Continue watching?" prompt');
  }
}

const origParse = JSON.parse;
JSON.parse = function (this: unknown) {
  // eslint-disable-next-line prefer-rest-params
  const r = origParse.apply(this, arguments as never);

  try {
    if (configRead('hideProductQrCodes')) removeProductQrCodes(r);
    if (configRead('disableStillWatchingPrompt')) removeStillWatchingPrompt(r);
  } catch (err) {
    console.warn('[annoyances] Failed to process response', err);
  }

  return r;
};
