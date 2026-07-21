const ILIAS_PREFIX =
  'https://ilias3.uni-stuttgart.de/';

const BRIDGE_URL =
  'http://127.0.0.1:43127/api/ilias-scan';

const scanButton =
  document.querySelector('#scan');

const crawlButton =
  document.querySelector('#crawl');

const stopButton =
  document.querySelector('#stop');

const resultElement =
  document.querySelector('#result');

const crawlStatusElement =
  document.querySelector(
    '#crawl-status'
  );

let stateTimer = null;

function showError(message) {
  resultElement.className = 'error';
  resultElement.textContent = message;
}

async function getActiveIliasTab() {
  const [tab] =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

  if (
    !tab?.id ||
    !tab.url?.startsWith(
      ILIAS_PREFIX
    )
  ) {
    throw new Error(
      'Öffne zuerst eine Seite in ILIAS.'
    );
  }

  return tab;
}

async function sendManualScan(
  payload
) {
  const response = await fetch(
    BRIDGE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const message =
      await response.text();

    throw new Error(
      message ||
        'UniHub Bridge nicht erreichbar.'
    );
  }
}

async function loadCrawlState() {
  const response =
    await chrome.runtime.sendMessage({
      type:
        'UNIHUB_GET_CRAWL_STATE'
    });

  if (!response?.ok) {
    return;
  }

  renderCrawlState(response.state);
}

function renderCrawlState(state) {
  const running =
    Boolean(state?.running);

  crawlButton.hidden = running;
  stopButton.hidden = !running;
  scanButton.disabled = running;

  if (!state?.startedAt) {
    crawlStatusElement.className = '';
    crawlStatusElement.textContent =
      'Kein automatischer Scan aktiv.';

    return;
  }

  const totalKnown =
    state.processedPages +
    state.queue.length +
    (state.currentUrl ? 1 : 0);

  const percentage =
    totalKnown > 0
      ? Math.round(
          state.processedPages /
            totalKnown *
            100
        )
      : 0;

  if (state.lastError) {
    crawlStatusElement.className =
      'error';

    crawlStatusElement.innerHTML = `
      <strong>Scan abgebrochen</strong>
      <small>${state.lastError}</small>
    `;

    return;
  }

  if (!running) {
    crawlStatusElement.className =
      'success';

    crawlStatusElement.innerHTML = `
      <strong>Kursscan abgeschlossen</strong>
      <small>
        ${state.processedPages}
        Seiten verarbeitet ·
        ${state.discoveredFolders}
        Ordner entdeckt
      </small>
      <div class="progress">
        <span style="width: 100%"></span>
      </div>
    `;

    return;
  }

  crawlStatusElement.className = '';

  crawlStatusElement.innerHTML = `
    <strong>
      Automatischer Scan läuft
    </strong>
    <small>
      ${state.processedPages}
      Seiten verarbeitet ·
      ${state.queue.length}
      Seiten in der Warteschlange
    </small>
    <div class="progress">
      <span style="width: ${percentage}%"></span>
    </div>
  `;
}

scanButton.addEventListener(
  'click',
  async () => {
    resultElement.className = '';
    resultElement.textContent =
      'ILIAS-Seite wird gelesen …';

    try {
      const tab =
        await getActiveIliasTab();

      const response =
        await chrome.tabs.sendMessage(
          tab.id,
          {
            type:
              'UNIHUB_SCAN_PAGE'
          }
        );

      if (!response?.ok) {
        throw new Error(
          response?.error ??
            'Die Seite konnte nicht gelesen werden.'
        );
      }

      await sendManualScan(
        response.payload
      );

      const {
        counts,
        pageTitle
      } = response.payload;

      resultElement.className =
        'success';

      resultElement.innerHTML = `
        <strong>${pageTitle}</strong><br>
        ${counts.files} Dateien<br>
        ${counts.folders} Ordner<br>
        ${counts.assignments} Abgaben
      `;
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }
);

crawlButton.addEventListener(
  'click',
  async () => {
    resultElement.className = '';
    resultElement.textContent =
      'Kursscan wird gestartet …';

    try {
      const tab =
        await getActiveIliasTab();

      const response =
        await chrome.runtime.sendMessage({
          type:
            'UNIHUB_START_CRAWL',
          tabId: tab.id,
          startUrl: tab.url
        });

      if (!response?.ok) {
        throw new Error(
          response?.error ??
            'Der Kursscan konnte nicht gestartet werden.'
        );
      }

      resultElement.className =
        'success';

      resultElement.textContent =
        'Der Browser durchsucht den Kurs jetzt automatisch.';

      renderCrawlState(
        response.state
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }
);

stopButton.addEventListener(
  'click',
  async () => {
    await chrome.runtime.sendMessage({
      type: 'UNIHUB_STOP_CRAWL'
    });

    await loadCrawlState();
  }
);

chrome.runtime.onMessage.addListener(
  (message) => {
    if (
      message?.type ===
      'UNIHUB_CRAWL_STATE_CHANGED'
    ) {
      renderCrawlState(
        message.state
      );
    }
  }
);

loadCrawlState();

stateTimer = window.setInterval(
  loadCrawlState,
  500
);

window.addEventListener(
  'unload',
  () => {
    if (stateTimer) {
      window.clearInterval(
        stateTimer
      );
    }
  }
);