const ILIAS_ORIGIN =
  'https://ilias3.uni-stuttgart.de';

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(
      value,
      window.location.href
    );

    if (url.origin !== ILIAS_ORIGIN) {
      return null;
    }

    url.hash = '';

    return url.href;
  } catch {
    return null;
  }
}

function getFolderUrls() {
  const anchors = Array.from(
    document.querySelectorAll(
      'a.il_ContainerItemTitle[href*="/go/fold/"], ' +
      'a.il_ContainerItemTitle[href*="ilObjFolderGUI"]'
    )
  );

  const urls = anchors
    .map((anchor) =>
      canonicalizeUrl(
        anchor.getAttribute('href') ?? ''
      )
    )
    .filter(Boolean);

  return [...new Set(urls)];
}

function scanIliasPage() {
  const fileLinks = Array.from(
    document.querySelectorAll(
      'a.il_ContainerItemTitle[href*="ilObjFileGUI"], ' +
      'a.il_ContainerItemTitle[href*="cmd=sendfile"]'
    )
  );

  const folderUrls = getFolderUrls();

  const assignmentLinks = Array.from(
    document.querySelectorAll(
      'a[href*="ilexercisehandlergui"], ' +
      'a[href*="ilAssignmentPresentationGUI"], ' +
      'a[href*="ass_id="]'
    )
  );

  return {
    source: 'unihub-ilias-extension',
    version: 2,
    scannedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    pageTitle: normalizeText(document.title),
    counts: {
      files: fileLinks.length,
      folders: folderUrls.length,
      assignments: assignmentLinks.length
    },
    folderUrls,
    html: document.documentElement.outerHTML
  };
}

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (
      message?.type !==
      'UNIHUB_SCAN_PAGE'
    ) {
      return;
    }

    try {
      sendResponse({
        ok: true,
        payload: scanIliasPage()
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }
);

window.setTimeout(() => {
  chrome.runtime.sendMessage({
    type: 'UNIHUB_PAGE_READY',
    pageUrl: window.location.href
  });
}, 500);