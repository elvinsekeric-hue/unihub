const scanButton = document.querySelector('#scan');
const resultElement = document.querySelector('#result');

function showError(message) {
  resultElement.className = 'error';
  resultElement.textContent = message;
}

scanButton.addEventListener('click', async () => {
  resultElement.className = '';
  resultElement.textContent = 'ILIAS-Seite wird gelesen …';

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.url?.startsWith('https://ilias3.uni-stuttgart.de/')) {
    showError('Öffne zuerst eine Seite in ILIAS.');
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'UNIHUB_SCAN_PAGE'
    });

    if (!response?.ok) {
      showError(response?.error ?? 'Die Seite konnte nicht gelesen werden.');
      return;
    }

    const bridgeResponse = await fetch(
  "http://127.0.0.1:43127/api/ilias-scan",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(response.payload)
  }
);

if (!bridgeResponse.ok) {
  throw new Error("UniHub Bridge nicht erreichbar.");
}

    const { counts, pageTitle } = response.payload;

    resultElement.innerHTML = `
      <strong>${pageTitle}</strong><br>
      ${counts.files} Dateien<br>
      ${counts.folders} Ordner<br>
      ${counts.assignments} Abgaben
    `;
  } catch (error) {
    showError(
      'Erweiterung neu laden und die ILIAS-Seite einmal aktualisieren.'
    );
  }
});