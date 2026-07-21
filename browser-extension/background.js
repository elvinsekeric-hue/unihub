const ILIAS_ORIGIN =
  'https://ilias3.uni-stuttgart.de';

const BRIDGE_URL =
  'http://127.0.0.1:43127/api/ilias-scan';

const MAX_PAGES = 250;
const PAGE_SETTLE_DELAY_MS = 700;

const EMPTY_STATE = {
  running: false,
  tabId: null,
  startUrl: null,
  currentUrl: null,
  queue: [],
  visited: [],
  processedPages: 0,
  discoveredFolders: 0,
  startedAt: null,
  finishedAt: null,
  lastError: null
};

let processing = false;

chrome.runtime.onInstalled.addListener(
  async () => {
    console.log(
      'UniHub ILIAS Bridge wurde installiert.'
    );

    const stored =
      await chrome.storage.local.get(
        'unihubCrawlState'
      );

    if (!stored.unihubCrawlState) {
      await saveState(EMPTY_STATE);
    }
  }
);

function canonicalizeUrl(value) {
  try {
    const url = new URL(value);

    if (url.origin !== ILIAS_ORIGIN) {
      return null;
    }

    url.hash = '';

    return url.href;
  } catch {
    return null;
  }
}

function getIliasRefId(value) {
  try {
    const url = new URL(value);

    const queryRefId =
      url.searchParams.get('ref_id');

    if (queryRefId) {
      return queryRefId;
    }

    const pathMatch = url.pathname.match(
      /\/go\/(?:fold|crs)\/(\d+)/i
    );

    return pathMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function isSameIliasPage(left, right) {
  const leftRefId = getIliasRefId(left);
  const rightRefId = getIliasRefId(right);

  if (leftRefId && rightRefId) {
    return leftRefId === rightRefId;
  }

  return (
    canonicalizeUrl(left) ===
    canonicalizeUrl(right)
  );
}

async function loadState() {
  const result =
    await chrome.storage.local.get(
      'unihubCrawlState'
    );

  return {
    ...EMPTY_STATE,
    ...(result.unihubCrawlState ?? {})
  };
}

async function saveState(state) {
  await chrome.storage.local.set({
    unihubCrawlState: state
  });

  chrome.runtime.sendMessage({
    type: 'UNIHUB_CRAWL_STATE_CHANGED',
    state
  }).catch(() => {
    // Das Popup ist möglicherweise geschlossen.
  });
}

async function postScan(payload) {
  const response = await fetch(
    BRIDGE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const message =
      await response.text();

    throw new Error(
      message ||
        `Bridge-Fehler ${response.status}`
    );
  }

  return response.json();
}

function addDiscoveredFolders(
  state,
  folderUrls
) {
  const known = new Set([
    ...state.visited,
    ...state.queue,
    state.currentUrl
  ]);

  const newUrls = [];

  for (const candidate of folderUrls) {
    const url = canonicalizeUrl(candidate);

    if (!url || known.has(url)) {
      continue;
    }

    known.add(url);
    newUrls.push(url);
  }

  return {
    ...state,
    queue: [
      ...state.queue,
      ...newUrls
    ],
    discoveredFolders:
      state.discoveredFolders +
      newUrls.length
  };
}

async function stopWithError(error) {
  const state = await loadState();

  await saveState({
    ...state,
    running: false,
    currentUrl: null,
    lastError:
      error instanceof Error
        ? error.message
        : String(error),
    finishedAt:
      new Date().toISOString()
  });

  processing = false;
}

async function finishCrawl(state) {
  await saveState({
    ...state,
    running: false,
    currentUrl: null,
    finishedAt:
      new Date().toISOString()
  });

  processing = false;
}

async function processCurrentPage(
  tabId
) {
  if (processing) {
    return;
  }

  processing = true;

  try {
    let state = await loadState();

    if (
      !state.running ||
      state.tabId !== tabId ||
      !state.currentUrl
    ) {
      processing = false;
      return;
    }

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        PAGE_SETTLE_DELAY_MS
      )
    );

    const response =
      await chrome.tabs.sendMessage(
        tabId,
        {
          type: 'UNIHUB_SCAN_PAGE'
        }
      );

    if (!response?.ok) {
      throw new Error(
        response?.error ??
          'Die ILIAS-Seite konnte nicht gelesen werden.'
      );
    }

    const payload = {
  ...response.payload,
  crawlStartUrl: state.startUrl
};

const scannedUrl =
  canonicalizeUrl(payload.pageUrl);

if (!scannedUrl) {
  throw new Error(
    'Die geladene ILIAS-Seite besitzt keine gültige URL.'
  );
}

    /*
     * Dieser Request wird erst beantwortet,
     * nachdem UniHub die Seite in SQLite
     * gespeichert hat.
     */
    await postScan(payload);

    state = addDiscoveredFolders(
      state,
      payload.folderUrls ?? []
    );

    state = {
  ...state,
  visited: [
    ...state.visited,
    state.currentUrl
  ],
  currentUrl: null,
  processedPages:
    state.processedPages + 1,
  lastError: null
};

    await saveState(state);

    processing = false;

    await processNextPage();
  } catch (error) {
    await stopWithError(error);
  }
}

async function processNextPage() {
  if (processing) {
    return;
  }

  let state = await loadState();

  if (!state.running) {
    return;
  }

  if (
    state.processedPages >= MAX_PAGES
  ) {
    await stopWithError(
      new Error(
        `Sicherheitslimit von ${MAX_PAGES} Seiten erreicht.`
      )
    );

    return;
  }

  let nextUrl = null;
  let remainingQueue = [
    ...state.queue
  ];

  while (
    remainingQueue.length > 0 &&
    !nextUrl
  ) {
    const candidate =
      canonicalizeUrl(
        remainingQueue.shift()
      );

    if (
      candidate &&
      !state.visited.includes(candidate)
    ) {
      nextUrl = candidate;
    }
  }

  if (!nextUrl) {
    await finishCrawl({
      ...state,
      queue: remainingQueue
    });

    return;
  }

  state = {
    ...state,
    queue: remainingQueue,
    currentUrl: nextUrl
  };

  await saveState(state);

  const tab =
    await chrome.tabs.get(state.tabId);

  const currentTabUrl =
    canonicalizeUrl(tab.url ?? '');

  if (
  currentTabUrl &&
  isSameIliasPage(
    currentTabUrl,
    nextUrl
  )
) {
  await processCurrentPage(
    state.tabId
  );

  return;
}

  await chrome.tabs.update(
    state.tabId,
    {
      url: nextUrl,
      active: true
    }
  );
}

async function startCrawl(
  tabId,
  startUrl
) {
  const normalizedStartUrl =
    canonicalizeUrl(startUrl);

  if (!normalizedStartUrl) {
    throw new Error(
      'Ungültige ILIAS-Startseite.'
    );
  }

  const state = {
    ...EMPTY_STATE,
    running: true,
    tabId,
    startUrl: normalizedStartUrl,
    queue: [normalizedStartUrl],
    startedAt:
      new Date().toISOString()
  };

  processing = false;

  await saveState(state);
  await processNextPage();

  return state;
}

async function stopCrawl() {
  const state = await loadState();

  processing = false;

  await saveState({
    ...state,
    running: false,
    currentUrl: null,
    finishedAt:
      new Date().toISOString()
  });
}

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (
      message?.type ===
      'UNIHUB_PAGE_READY'
    ) {
      const tabId = sender.tab?.id;

      if (!tabId) {
        return;
      }

      loadState()
        .then((state) => {
          if (
  state.running &&
  state.tabId === tabId &&
  state.currentUrl
) {
  return processCurrentPage(tabId);
}
        })
        .catch(stopWithError);

      return;
    }

    if (
      message?.type ===
      'UNIHUB_START_CRAWL'
    ) {
      startCrawl(
        message.tabId,
        message.startUrl
      )
        .then((state) =>
          sendResponse({
            ok: true,
            state
          })
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          })
        );

      return true;
    }

    if (
      message?.type ===
      'UNIHUB_STOP_CRAWL'
    ) {
      stopCrawl()
        .then(() =>
          sendResponse({ ok: true })
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: String(error)
          })
        );

      return true;
    }

    if (
      message?.type ===
      'UNIHUB_GET_CRAWL_STATE'
    ) {
      loadState()
        .then((state) =>
          sendResponse({
            ok: true,
            state
          })
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: String(error)
          })
        );

      return true;
    }
  }
);
chrome.tabs.onUpdated.addListener(
  async (tabId, changeInfo, tab) => {
    if (
      changeInfo.status !== 'complete' ||
      !tab.url?.startsWith(ILIAS_ORIGIN)
    ) {
      return;
    }

    try {
      const state = await loadState();

      if (
        state.running &&
        state.tabId === tabId &&
        state.currentUrl
      ) {
        await processCurrentPage(tabId);
      }
    } catch (error) {
      await stopWithError(error);
    }
  }
);