const DEFAULTS = {
  keepVisible: 12,
  restoreBatch: 10,
  autoCollapse: true
};

let settings = { ...DEFAULTS };
let hiddenBatches = [];
let observer = null;
let scheduledCollapse = null;
let mutating = false;
let lastUrl = location.href;
let batchIdCounter = 1;

const TURN_SELECTORS = [
  'main li[data-message-author-role]',
  'main article[data-testid*="conversation-turn"]',
  'main div[data-testid*="conversation-turn"]',
  'main [data-testid*="conversation-turn"]'
];

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getScroller() {
  return document.scrollingElement || document.documentElement;
}

function withPreservedScroll(fn) {
  const scroller = getScroller();
  const previousBottomOffset = scroller.scrollHeight - scroller.scrollTop;
  fn();
  requestAnimationFrame(() => {
    const nextTop = Math.max(0, scroller.scrollHeight - previousBottomOffset);
    scroller.scrollTop = nextTop;
  });
}

function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(scheduledCollapse);
    scheduledCollapse = setTimeout(() => fn(...args), ms);
  };
}

function compareDomOrder(a, b) {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function isExcludedTurnNode(node) {
  if (!(node instanceof HTMLElement)) return true;
  if (!node.isConnected) return true;
  if (!node.closest('main')) return true;

  if (node.classList.contains('cgpt-trimmer-placeholder')) return true;
  if (node.closest('.cgpt-trimmer-placeholder')) return true;

  if (node.closest('form, nav, aside, header, footer, [role="dialog"]')) return true;

  const text = (node.innerText || '').trim();
  if (!text) return true;

  return false;
}

function getTurnNodes() {
  const raw = [];

  for (const selector of TURN_SELECTORS) {
    document.querySelectorAll(selector).forEach((el) => raw.push(el));
  }

  const deduped = [...new Set(raw)]
    .filter((el) => !isExcludedTurnNode(el))
    .sort(compareDomOrder);

  // Keep only top-level candidates so we do not double-count nested wrappers.
  const topLevel = deduped.filter((node, idx) => {
    return !deduped.some((other, j) => j !== idx && other.contains(node));
  });

  return topLevel;
}

function splitIntoChunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function partitionChunkByParent(chunk) {
  const groups = [];
  let current = null;

  for (const node of chunk) {
    const parent = node.parentNode;
    if (!parent) continue;

    if (!current || current.parent !== parent) {
      current = { parent, nodes: [node] };
      groups.push(current);
    } else {
      current.nodes.push(node);
    }
  }

  return groups;
}

function makePlaceholder(hiddenCount, batchId) {
  const wrap = document.createElement('div');
  wrap.className = 'cgpt-trimmer-placeholder';
  wrap.setAttribute('data-cgpt-trimmer-batch-id', String(batchId));

  const text = document.createElement('span');
  text.textContent = `${hiddenCount} older turn${hiddenCount === 1 ? '' : 's'} hidden`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cgpt-trimmer-restore-button';
  button.textContent = 'Restore batch';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    restoreBatchById(batchId);
  });

  wrap.appendChild(text);
  wrap.appendChild(button);
  return wrap;
}

function createHiddenBatch(chunk) {
  const batchId = batchIdCounter++;
  const parentGroups = partitionChunkByParent(chunk);
  const subgroups = [];

  for (const group of parentGroups) {
    const { parent, nodes } = group;
    const firstNode = nodes[0];
    if (!parent || !firstNode || !firstNode.isConnected) continue;

    const marker = document.createComment(`cgpt-trimmer-marker:${batchId}`);
    const placeholder = makePlaceholder(nodes.length, batchId);

    parent.insertBefore(marker, firstNode);
    parent.insertBefore(placeholder, firstNode);

    for (const node of nodes) {
      node.remove();
    }

    subgroups.push({
      parent,
      marker,
      placeholder,
      nodes
    });
  }

  return {
    id: batchId,
    subgroups
  };
}

function collapseOldTurns() {
  if (mutating) return 0;

  const turns = getTurnNodes();
  const keepVisible = clampInt(settings.keepVisible, DEFAULTS.keepVisible, 4, 200);
  const batchSize = clampInt(settings.restoreBatch, DEFAULTS.restoreBatch, 1, 200);
  const excess = turns.length - keepVisible;

  if (excess <= 0) return 0;

  const toCollapse = turns.slice(0, excess);
  const chunks = splitIntoChunks(toCollapse, batchSize);

  let collapsedCount = 0;

  withPreservedScroll(() => {
    mutating = true;
    try {
      for (const chunk of chunks) {
        const batch = createHiddenBatch(chunk);
        if (batch.subgroups.length > 0) {
          hiddenBatches.push(batch);
          collapsedCount += chunk.length;
        }
      }
    } finally {
      mutating = false;
    }
  });

  return collapsedCount;
}

function restoreBatchObject(batch) {
  if (!batch || !batch.subgroups?.length) return 0;

  let restored = 0;

  withPreservedScroll(() => {
    mutating = true;
    try {
      for (const subgroup of batch.subgroups) {
        const { marker, placeholder, nodes } = subgroup;
        const parent = marker.parentNode;
        if (!parent) continue;

        for (const node of nodes) {
          parent.insertBefore(node, marker);
          restored += 1;
        }

        placeholder.remove();
        marker.remove();
      }
    } finally {
      mutating = false;
    }
  });

  return restored;
}

function restoreNewestBatch() {
  if (!hiddenBatches.length) return 0;
  const batch = hiddenBatches.pop();
  return restoreBatchObject(batch);
}

function restoreBatchById(batchId) {
  const idx = hiddenBatches.findIndex((batch) => batch.id === batchId);
  if (idx === -1) return 0;

  const [batch] = hiddenBatches.splice(idx, 1);
  return restoreBatchObject(batch);
}

function restoreAll() {
  let restored = 0;
  while (hiddenBatches.length) {
    restored += restoreNewestBatch();
  }
  return restored;
}

function clearStateForNavigation() {
  hiddenBatches = [];
}

const scheduleCollapse = debounce(() => {
  if (!settings.autoCollapse) return;
  if (mutating) return;
  collapseOldTurns();
}, 500);

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      clearStateForNavigation();
    }

    if (mutating) return;
    scheduleCollapse();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function applySettings(nextSettings) {
  settings = {
    keepVisible: clampInt(nextSettings.keepVisible, settings.keepVisible, 4, 200),
    restoreBatch: clampInt(nextSettings.restoreBatch, settings.restoreBatch, 1, 200),
    autoCollapse: Boolean(nextSettings.autoCollapse)
  };

  chrome.storage.local.set(settings);

  if (settings.autoCollapse) {
    scheduleCollapse();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'ping') {
      sendResponse({ status: 'ok' });
      return;
    }

    if (message.type === 'applySettings') {
      applySettings(message.settings || {});
      sendResponse({ status: 'Settings applied.' });
      return;
    }

    if (message.type === 'collapseNow') {
      applySettings(message.settings || {});
      const n = collapseOldTurns();
      sendResponse({ status: `Collapsed ${n} turn(s).` });
      return;
    }

    if (message.type === 'restoreBatch') {
      if (message.settings) {
        applySettings(message.settings);
      }
      const n = restoreNewestBatch();
      sendResponse({ status: `Restored ${n} turn(s).` });
      return;
    }

    if (message.type === 'restoreAll') {
      const n = restoreAll();
      sendResponse({ status: `Restored ${n} turn(s).` });
      return;
    }

    sendResponse({ status: 'Unknown message type.' });
  } catch (err) {
    console.error('ChatGPT DOM Trimmer error:', err);
    sendResponse({ status: `Error: ${err.message}` });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  const next = { ...settings };

  if (changes.keepVisible) next.keepVisible = changes.keepVisible.newValue;
  if (changes.restoreBatch) next.restoreBatch = changes.restoreBatch.newValue;
  if (changes.autoCollapse) next.autoCollapse = changes.autoCollapse.newValue;

  settings = {
    keepVisible: clampInt(next.keepVisible, DEFAULTS.keepVisible, 4, 200),
    restoreBatch: clampInt(next.restoreBatch, DEFAULTS.restoreBatch, 1, 200),
    autoCollapse: Boolean(next.autoCollapse)
  };

  if (settings.autoCollapse) {
    scheduleCollapse();
  }
});

async function init() {
  settings = await chrome.storage.local.get(DEFAULTS);
  settings = {
    keepVisible: clampInt(settings.keepVisible, DEFAULTS.keepVisible, 4, 200),
    restoreBatch: clampInt(settings.restoreBatch, DEFAULTS.restoreBatch, 1, 200),
    autoCollapse: Boolean(settings.autoCollapse)
  };

  lastUrl = location.href;
  startObserver();

  if (settings.autoCollapse) {
    scheduleCollapse();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}