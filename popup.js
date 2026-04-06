const DEFAULTS = {
  keepVisible: 12,
  restoreBatch: 10,
  autoCollapse: true
};

const loadingStateEl = document.getElementById("loadingState");
const unsupportedStateEl = document.getElementById("unsupportedState");
const supportedStateEl = document.getElementById("supportedState");

const keepVisibleEl = document.getElementById("keepVisible");
const restoreBatchEl = document.getElementById("restoreBatch");
const autoCollapseEl = document.getElementById("autoCollapse");

const collapseNowBtn = document.getElementById("collapseNow");
const restoreOneBatchBtn = document.getElementById("restoreOneBatch");
const restoreAllBtn = document.getElementById("restoreAll");
const actionButtons = [collapseNowBtn, restoreOneBatchBtn, restoreAllBtn];

const statusEl = document.getElementById("status");

let statusTimer = null;

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

function applySettingsToForm(settings) {
  keepVisibleEl.value = settings.keepVisible;
  restoreBatchEl.value = settings.restoreBatch;
  autoCollapseEl.checked = settings.autoCollapse;
}

function setView(mode) {
  loadingStateEl.classList.toggle("is-hidden", mode !== "loading");
  unsupportedStateEl.classList.toggle("is-hidden", mode !== "unsupported");
  supportedStateEl.classList.toggle("is-hidden", mode !== "supported");
}

function setStatus(message, tone = "neutral", sticky = false) {
  statusEl.textContent = message;
  statusEl.className = `status status--${tone}`;

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (!sticky && tone !== "error") {
    statusTimer = setTimeout(() => {
      statusEl.textContent = "Ready.";
      statusEl.className = "status status--neutral";
    }, 1400);
  }
}

function setBusy(isBusy) {
  actionButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  applySettingsToForm(settings);
  return settings;
}

async function persistSettings(showFeedback = false) {
  const settings = currentSettings();
  await chrome.storage.local.set(settings);

  if (showFeedback) {
    setStatus("Settings saved.", "success");
  }

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
    setView("supported");
    setStatus("Ready.", "neutral", true);
    return true;
  } catch {
    setView("unsupported");
    return false;
  }
}

async function runAction(button, message, includeSettings = true) {
  const originalText = button.textContent;

  try {
    setBusy(true);
    button.textContent = "Working…";

    let payload = { ...message };

    if (includeSettings) {
      const settings = await persistSettings(false);
      payload = { ...payload, settings };
    }

    const response = await sendToActiveTab(payload);
    setStatus(response?.status || "Done.", "success");
  } catch (err) {
    setStatus(err?.message ? `Error: ${err.message}` : "Open a ChatGPT tab, then try again.", "error", true);
  } finally {
    button.textContent = originalText;
    setBusy(false);
  }
}

keepVisibleEl.addEventListener("change", async () => {
  try {
    await persistSettings(true);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error", true);
  }
});

restoreBatchEl.addEventListener("change", async () => {
  try {
    await persistSettings(true);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error", true);
  }
});

autoCollapseEl.addEventListener("change", async () => {
  try {
    await persistSettings(true);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error", true);
  }
});

collapseNowBtn.addEventListener("click", async () => {
  await runAction(collapseNowBtn, { type: "collapseNow" }, true);
});

restoreOneBatchBtn.addEventListener("click", async () => {
  await runAction(restoreOneBatchBtn, { type: "restoreBatch" }, true);
});

restoreAllBtn.addEventListener("click", async () => {
  await runAction(restoreAllBtn, { type: "restoreAll" }, false);
});

requestAnimationFrame(async () => {
  try {
    await loadSettings();
    await detectSupportedTab();
  } catch (err) {
    setView("unsupported");
  }
});