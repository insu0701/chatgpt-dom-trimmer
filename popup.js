const DEFAULTS = {
  keepVisible: 12,
  restoreBatch: 10,
  autoCollapse: true
};

const keepVisibleEl = document.getElementById("keepVisible");
const restoreBatchEl = document.getElementById("restoreBatch");
const autoCollapseEl = document.getElementById("autoCollapse");

const unsupportedEl = document.getElementById("unsupported");
const controlsEl = document.getElementById("controls");
const statusEl = document.getElementById("status");

const collapseNowBtn = document.getElementById("collapseNow");
const restoreOneBatchBtn = document.getElementById("restoreOneBatch");
const restoreAllBtn = document.getElementById("restoreAll");

function setStatus(message) {
  statusEl.textContent = message;
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function currentSettings() {
  return {
    keepVisible: clampInt(keepVisibleEl.value, DEFAULTS.keepVisible, 4, 200),
    restoreBatch: clampInt(restoreBatchEl.value, DEFAULTS.restoreBatch, 1, 200),
    autoCollapse: autoCollapseEl.checked
  };
}

function setSupportedUI(isSupported) {
  unsupportedEl.classList.toggle("hidden", isSupported);

  collapseNowBtn.disabled = !isSupported;
  restoreOneBatchBtn.disabled = !isSupported;
  restoreAllBtn.disabled = !isSupported;

  keepVisibleEl.disabled = !isSupported;
  restoreBatchEl.disabled = !isSupported;
  autoCollapseEl.disabled = !isSupported;

  if (!isSupported) {
    setStatus("Not on a supported ChatGPT tab.");
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  keepVisibleEl.value = settings.keepVisible;
  restoreBatchEl.value = settings.restoreBatch;
  autoCollapseEl.checked = settings.autoCollapse;
}

async function persistSettings() {
  const settings = currentSettings();
  await chrome.storage.local.set(settings);
  setStatus("Settings saved.");
  return settings;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

async function detectSupportedTab() {
  try {
    await sendToActiveTab({ type: "ping" });
    setSupportedUI(true);
    setStatus("Ready.");
    return true;
  } catch {
    setSupportedUI(false);
    return false;
  }
}

async function saveThen(message) {
  const settings = await persistSettings();
  return sendToActiveTab({
    ...message,
    settings
  });
}

keepVisibleEl.addEventListener("change", async () => {
  try {
    await persistSettings();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

restoreBatchEl.addEventListener("change", async () => {
  try {
    await persistSettings();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

autoCollapseEl.addEventListener("change", async () => {
  try {
    await persistSettings();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

collapseNowBtn.addEventListener("click", async () => {
  try {
    const response = await saveThen({ type: "collapseNow" });
    setStatus(response?.status || "Collapse requested.");
  } catch (err) {
    setStatus("Open a ChatGPT tab, then try again.");
  }
});

restoreOneBatchBtn.addEventListener("click", async () => {
  try {
    const response = await saveThen({ type: "restoreBatch" });
    setStatus(response?.status || "Restore requested.");
  } catch (err) {
    setStatus("Open a ChatGPT tab, then try again.");
  }
});

restoreAllBtn.addEventListener("click", async () => {
  try {
    const response = await sendToActiveTab({ type: "restoreAll" });
    setStatus(response?.status || "Restore all requested.");
  } catch (err) {
    setStatus("Open a ChatGPT tab, then try again.");
  }
});

requestAnimationFrame(async () => {
  try {
    await loadSettings();
    await detectSupportedTab();
  } catch (err) {
    setSupportedUI(false);
    setStatus(`Error: ${err.message}`);
  }
});