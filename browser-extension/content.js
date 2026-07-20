function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scanIliasPage() {
  const fileLinks = Array.from(
    document.querySelectorAll(
      'a.il_ContainerItemTitle[href*="ilObjFileGUI"], ' +
      'a.il_ContainerItemTitle[href*="cmd=sendfile"]'
    )
  );

  const folderLinks = Array.from(
    document.querySelectorAll(
      'a.il_ContainerItemTitle[href*="/go/fold/"], ' +
      'a.il_ContainerItemTitle[href*="ilObjFolderGUI"]'
    )
  );

  const assignmentLinks = Array.from(
    document.querySelectorAll(
      'a[href*="ilexercisehandlergui"], ' +
      'a[href*="ilAssignmentPresentationGUI"], ' +
      'a[href*="ass_id="]'
    )
  );

  return {
    source: 'unihub-ilias-extension',
    version: 1,
    scannedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    pageTitle: normalizeText(document.title),
    counts: {
      files: fileLinks.length,
      folders: folderLinks.length,
      assignments: assignmentLinks.length
    },
    html: document.documentElement.outerHTML
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'UNIHUB_SCAN_PAGE') {
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
      error: error instanceof Error ? error.message : String(error)
    });
  }
});