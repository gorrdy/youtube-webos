const SHELF_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';

// Deeper than any real response; guards against stack overflows.
const MAX_DEPTH = 60;

// Lists that held only Shorts. Shelves YouTube sends empty on purpose (e.g.
// filled later via a continuation) must stay.
const emptiedLists = new WeakSet();

/**
 * Removes Shorts from every list in a response: home, search, subscriptions,
 * channels and their continuations. The Shorts player itself (`entries`)
 * isn't a list of tiles and stays untouched, so a Short that is opened
 * directly still plays.
 *
 * @param {any} r Parsed JSON response, modified in place.
 */
export function removeShortsFromResponse(r) {
  walk(r, 0);
}

function walk(node, depth) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    let kept = 0;
    for (const item of node) {
      walk(item, depth + 1);
      if (!isShortsTile(item) && !isShortsShelf(item)) node[kept++] = item;
    }
    if (node.length > 0 && kept === 0) emptiedLists.add(node);
    node.length = kept;
    return;
  }

  for (const key in node) walk(node[key], depth + 1);
}

/** A tile that opens a Short, in the older or the newer tile format. */
function isShortsTile(item) {
  return (
    item?.tileRenderer?.onSelectCommand?.reelWatchEndpoint != null ||
    item?.lockupViewModel?.rendererContext?.commandContext?.onTap
      ?.innertubeCommand?.reelWatchEndpoint != null ||
    item?.reelItemRenderer != null ||
    item?.shortsLockupViewModel != null
  );
}

/** A Shorts shelf, or a shelf we emptied by removing its Shorts. */
function isShortsShelf(item) {
  const shelf = item?.shelfRenderer;
  if (item?.reelShelfRenderer) return true;
  if (!shelf) return false;
  if (shelf.tvhtml5ShelfRendererType == SHELF_SHORTS) return true;

  const items = shelf.content?.horizontalListRenderer?.items;
  return items != null && emptiedLists.has(items);
}
