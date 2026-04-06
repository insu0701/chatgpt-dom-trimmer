const DEFAULTS = {
  keepVisible: 12,
  restoreBatch: 10,
  autoCollapse: true
};

const keepVisibleEl = document.getElementById("keepVisible");
const restoreBatchEl = document.getElementById("restoreBatch");
const autoCollapseEl = document.getElementById("autoCollapse");
const statusEl = document.getElementById("status");

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  keepVisibleEl.value = settings.keepVisible;
  restoreBatchEl.value = settings.restoreBatch;
  autoCollapseEl.checked = settings.autoCollapse;
}

async function saveSettings() {
  const settings = {
    keepVisible: Number(keepVisibleEl.value),
    restoreBatch: Number(restoreBatchEl.value),
    autoCollapse: autoCollapseEl.checked
  };
  await chrome.storage.local.set(settings);
  return settings;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    statusEl.textContent = "No active tab found.";
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    return response;
  } catch (err) {
    statusEl.textContent = "Active tab is not a ChatGPT page or content script is not ready.";
    return null;
  }
}

document.getElementById("apply").addEventListener("click", async () => {
  const settings = await saveSettings();
  const response = await sendToActiveTab({ type: "applySettings", settings });
  statusEl.textContent = response?.status || "Settings saved.";
});

document.getElementById("collapseNow").addEventListener("click", async () => {
  const settings = await saveSettings();
  const response = await sendToActiveTab({ type: "collapseNow", settings });
  statusEl.textContent = response?.status || "Collapse requested.";
});

document.getElementById("restoreOneBatch").addEventListener("click", async () => {
  const settings = await saveSettings();
  const response = await sendToActiveTab({ type: "restoreBatch", settings });
  statusEl.textContent = response?.status || "Restore requested.";
});

document.getElementById("restoreAll").addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "restoreAll" });
  statusEl.textContent = response?.status || "Restore all requested.";
});

loadSettings();