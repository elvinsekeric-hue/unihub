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

function getCrawlUrls() {
  const anchors = Array.from(
    document.querySelectorAll(
      'a.il_ContainerItemTitle[href], ' +
      'h3.il_ContainerItemTitle a[href], ' +
      'a[href*="ilexercisehandlergui"], ' +
      'a[href*="ilExerciseHandlerGUI"], ' +
      'a[href*="ilAssignmentPresentationGUI"], ' +
      'a[href*="ilObjExerciseGUI"], ' +
      'a[href*="ass_id="]'
    )
  );

  const urls = anchors
    .filter((anchor) => {
      const href = (
        anchor.getAttribute('href') ?? ''
      ).toLocaleLowerCase('de-DE');

      const title = normalizeText(
        anchor.textContent
      ).toLocaleLowerCase('de-DE');

      /*
       * Dateien und direkte Downloads dürfen niemals
       * Teil der Crawl-Warteschlange werden.
       */
      const isFile =
        href.includes('ilobjfilegui') ||
        href.includes('cmd=sendfile') ||
        href.includes('/go/file/') ||
        href.includes('download');

      if (isFile) {
        return false;
      }

      const isFolder =
        href.includes('/go/fold/') ||
        href.includes('ilobjfoldergui');

      const isExercise =
        href.includes('ilexercisehandlergui') ||
        href.includes(
          'ilassignmentpresentationgui'
        ) ||
        href.includes('ilobjexercisegui') ||
        href.includes('ass_id=');

      /*
       * Rückfall nur für das eigentliche
       * Abgabeobjekt, nicht für Hausübungsblätter.
       */
      const isAssignmentContainer =
        title === 'abgabeordner' ||
        title.startsWith('abgabeordner ') ||
        title === 'übungsobjekt' ||
        title === 'uebungsobjekt';

      return (
        isFolder ||
        isExercise ||
        isAssignmentContainer
      );
    })
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

const folderLinks = Array.from(
  document.querySelectorAll(
    'a.il_ContainerItemTitle[href*="/go/fold/"], ' +
    'a.il_ContainerItemTitle[href*="ilObjFolderGUI"]'
  )
);

  const crawlUrls = getCrawlUrls();

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
    crawlStartUrl: null,
    pageTitle: normalizeText(document.title),
    counts: {
      files: fileLinks.length,
      folders: folderLinks.length,
      assignments: assignmentLinks.length
    },
    folderUrls: crawlUrls,
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