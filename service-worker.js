const SUPPORTED_ORIGINS = new Set([
  'https://chatgpt.com',
  'https://chat.openai.com'
]);

async function syncSidePanelForTab(tabId, urlString) {
  if (!urlString) {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
    return;
  }

  let origin;
  try {
    origin = new URL(urlString).origin;
  } catch {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
    return;
  }

  const isSupported = SUPPORTED_ORIGINS.has(origin);

  if (isSupported) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
}

// Let users open the side panel by clicking the toolbar icon.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('setPanelBehavior failed:', error));

// Enable or disable the side panel as tabs navigate.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const url = info.url || tab.url;
  try {
    await syncSidePanelForTab(tabId, url);
  } catch (error) {
    console.error('syncSidePanelForTab failed:', error);
  }
});