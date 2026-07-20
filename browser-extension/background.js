chrome.runtime.onInstalled.addListener(() => {
  console.log('UniHub ILIAS Bridge wurde installiert.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'UNIHUB_STORE_SCAN') {
    return;
  }

  const payload = message.payload;

  if (
    !payload ||
    payload.source !== 'unihub-ilias-extension' ||
    typeof payload.pageUrl !== 'string' ||
    !payload.pageUrl.startsWith('https://ilias3.uni-stuttgart.de/')
  ) {
    sendResponse({
      ok: false,
      error: 'Ungültige ILIAS-Daten.'
    });
    return;
  }

  chrome.storage.local
    .set({
      latestIliasScan: payload
    })
    .then(() => sendResponse({ ok: true }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: String(error)
      })
    );

  return true;
});