const ILIAS_ORIGIN =
  'https://ilias3.uni-stuttgart.de';

const BRIDGE_URL =
  'http://127.0.0.1:43127/api/ilias-scan';

  const FULL_SYNC_NEXT_URL =
  'http://127.0.0.1:43127/api/full-sync/next';

const FULL_SYNC_COMPLETE_URL =
  'http://127.0.0.1:43127/api/full-sync/complete';

const MULTI_SYNC_KEY =
  'unihubMultiCourseSync';

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

const EMPTY_MULTI_SYNC_STATE = {
  running: false,
  commandId: null,
  tabId: null,
  remainingUrls: [],
  completedUrls: [],
  startedAt: null,
  finishedAt: null,
  lastError: null
};

let commandPolling = false;

let processing = false;

const FULL_SYNC_POLL_ALARM =
  'unihub-full-sync-poll';

async function ensurePollAlarm() {
  try {
    const existing =
      await chrome.alarms.get(
        FULL_SYNC_POLL_ALARM
      );

    if (existing) {
      return;
    }

    await chrome.alarms.create(
      FULL_SYNC_POLL_ALARM,
      { periodInMinutes: 1 }
    );
  } catch {
    // Alarms nicht verfügbar – nur das Intervall-Polling bleibt.
  }
}

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

    await ensurePollAlarm();
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

function getQueryParam(value, name) {
  try {
    return new URL(value).searchParams.get(name);
  } catch {
    return null;
  }
}

function isSameIliasPage(left, right) {
  const leftRefId = getIliasRefId(left);
  const rightRefId = getIliasRefId(right);

  if (leftRefId && rightRefId) {
    /*
     * Unterschiedliche Ansichten derselben Übung
     * (Laufende/Kommende/Vergangene/Alle) sind
     * verschiedene Seiten – ebenso verschiedene
     * Abgaben (ass_id). Sonst würde der Crawler
     * mode=past und die Blatt-Detailseiten
     * überspringen.
     */
    const leftMode = getQueryParam(left, 'mode');
    const rightMode = getQueryParam(right, 'mode');
    const leftAssId = getQueryParam(left, 'ass_id');
    const rightAssId = getQueryParam(right, 'ass_id');

    if (leftMode !== rightMode) {
      return false;
    }

    if (leftAssId !== rightAssId) {
      return false;
    }

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

async function loadMultiSyncState() {
  const result =
    await chrome.storage.local.get(
      MULTI_SYNC_KEY
    );

  return {
    ...EMPTY_MULTI_SYNC_STATE,
    ...(result[MULTI_SYNC_KEY] ?? {})
  };
}

async function saveMultiSyncState(state) {
  await chrome.storage.local.set({
    [MULTI_SYNC_KEY]: state
  });
}

async function reportFullSyncCompletion(
  commandId,
  success,
  errorMessage = null
) {
  await fetch(
    FULL_SYNC_COMPLETE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        commandId,
        success,
        errorMessage
      })
    }
  );
}

async function getOrCreateIliasTab(
  firstUrl
) {
  const tabs =
    await chrome.tabs.query({
      url:
        'https://ilias3.uni-stuttgart.de/*'
    });

  const existingTab =
    tabs.find((tab) => tab.id);

  if (existingTab?.id) {
    await chrome.tabs.update(
      existingTab.id,
      {
        url: firstUrl,
        active: true
      }
    );

    return existingTab.id;
  }

  const tab =
    await chrome.tabs.create({
      url: firstUrl,
      active: true
    });

  if (!tab.id) {
    throw new Error(
      'Der ILIAS-Tab konnte nicht geöffnet werden.'
    );
  }

  return tab.id;
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
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const state = await loadState();

  await saveState({
    ...state,
    running: false,
    currentUrl: null,
    lastError: message,
    finishedAt:
      new Date().toISOString()
  });

  const multiState =
    await loadMultiSyncState();

  if (multiState.running) {
    await reportFullSyncCompletion(
      multiState.commandId,
      false,
      message
    ).catch(() => {
      // App möglicherweise geschlossen.
    });

    await saveMultiSyncState({
      ...multiState,
      running: false,
      lastError: message,
      finishedAt:
        new Date().toISOString()
    });
  }

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

  const multiState =
    await loadMultiSyncState();

  if (!multiState.running) {
    return;
  }

  const completedUrls = [
    ...multiState.completedUrls,
    state.startUrl
  ];

  if (
    multiState.remainingUrls.length > 0
  ) {
    const [
      nextUrl,
      ...remainingUrls
    ] = multiState.remainingUrls;

    await saveMultiSyncState({
      ...multiState,
      remainingUrls,
      completedUrls
    });

    await startCrawl(
      multiState.tabId,
      nextUrl
    );

    return;
  }

  await reportFullSyncCompletion(
    multiState.commandId,
    true
  );

  await saveMultiSyncState({
    ...multiState,
    running: false,
    completedUrls,
    finishedAt:
      new Date().toISOString()
  });
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

async function startMultiCourseSync(
  command
) {
  const urls = [
    ...new Set(
      (command.courseUrls ?? [])
        .map(canonicalizeUrl)
        .filter(Boolean)
    )
  ];

  if (urls.length === 0) {
    throw new Error(
      'Der Scan-Auftrag enthält keine gültigen Kursseiten.'
    );
  }

  const [firstUrl, ...remainingUrls] =
    urls;

  const tabId =
    await getOrCreateIliasTab(
      firstUrl
    );

  await saveMultiSyncState({
    ...EMPTY_MULTI_SYNC_STATE,
    running: true,
    commandId:
      command.commandId,
    tabId,
    remainingUrls,
    completedUrls: [],
    startedAt:
      new Date().toISOString()
  });

  await startCrawl(
    tabId,
    firstUrl
  );
}

async function recoverStaleMultiSync() {
  const multiState =
    await loadMultiSyncState();

  if (!multiState.running) {
    return false;
  }

  const crawlState = await loadState();

  /*
   * Kein aktiver Crawl mehr: Der Multi-Sync wurde
   * unterbrochen (z. B. UniHub geschlossen). Zustand
   * zurücksetzen, damit neue Aufträge angenommen werden.
   */
  if (!crawlState.running) {
    await reportFullSyncCompletion(
      multiState.commandId,
      false,
      'Die Synchronisierung wurde unterbrochen.'
    ).catch(() => {
      // App möglicherweise geschlossen.
    });

    await saveMultiSyncState(
      EMPTY_MULTI_SYNC_STATE
    );

    return 'cleaned';
  }

  /*
   * Der Crawl-State lebt noch. Der Service-Worker kann
   * mitten im Crawl eingeschlafen sein – dann den
   * laufenden Scan fortsetzen statt etwas Neues zu starten.
   */
  if (multiState.tabId) {
    try {
      const tab =
        await chrome.tabs.get(
          multiState.tabId
        );

      if (
        tab.url?.startsWith(
          ILIAS_ORIGIN
        )
      ) {
        if (
          crawlState.currentUrl &&
          tab.url &&
          isSameIliasPage(
            tab.url,
            crawlState.currentUrl
          )
        ) {
          /*
           * Der Tab zeigt bereits die zu scannende Seite –
           * der Scan wurde nur durch den schlafenden Worker
           * unterbrochen. Direkt fortsetzen.
           */
          await processCurrentPage(
            multiState.tabId
          );
        } else if (
          crawlState.currentUrl
        ) {
          /*
           * Der Tab steht auf einer anderen Seite.
           * Zurück zu currentUrl navigieren – der
           * onUpdated-Listener setzt den Scan fort.
           */
          await chrome.tabs.update(
            multiState.tabId,
            {
              url:
                crawlState.currentUrl,
              active: true
            }
          );
        } else {
          await processNextPage();
        }

        return 'resumed';
      }
    } catch {
      // Tab existiert nicht mehr.
    }
  }

  /*
   * Der Tab wurde geschlossen – der Crawl ist tot.
   */
  await saveState({
    ...crawlState,
    running: false,
    currentUrl: null,
    finishedAt:
      new Date().toISOString()
  });

  await reportFullSyncCompletion(
    multiState.commandId,
    false,
    'Der ILIAS-Tab wurde geschlossen.'
  ).catch(() => {
    // App möglicherweise geschlossen.
  });

  await saveMultiSyncState(
    EMPTY_MULTI_SYNC_STATE
  );

  return 'cleaned';
}

async function pollForFullSyncCommand() {
  if (commandPolling) {
    return;
  }

  commandPolling = true;

  try {
    const recovery =
      await recoverStaleMultiSync();

    /*
     * Ein fortgesetzter Crawl übernimmt die Kontrolle –
     * es darf kein neuer Auftrag parallel starten.
     */
    if (recovery === 'resumed') {
      return;
    }

    const response = await fetch(
      FULL_SYNC_NEXT_URL,
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    if (data.command) {
      await startMultiCourseSync(
        data.command
      );
    }
  } catch {
    // UniHub ist möglicherweise geschlossen.
  } finally {
    commandPolling = false;
  }
}

pollForFullSyncCommand();

setInterval(
  pollForFullSyncCommand,
  1500
);

chrome.alarms.onAlarm.addListener(
  (alarm) => {
    if (
      alarm.name ===
      FULL_SYNC_POLL_ALARM
    ) {
      pollForFullSyncCommand();
    }
  }
);

chrome.runtime.onStartup.addListener(
  async () => {
    await ensurePollAlarm();
    pollForFullSyncCommand();
  }
);