/* ═══════════════════════════════════════════════════════════════
   AplRate — Pesticide Shop Rate Finder
   app.js — Full Application Logic
═══════════════════════════════════════════════════════════════ */

'use strict';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const State = {
  items: [],           // [{ item, size, saleRate, purchaseRate }]
  mode: 'cash',        // 'cash' | 'credit'
  purchaseVisible: false,
  selectedItem: null,
  searchQuery: '',
  focusedIdx: -1,
  filteredItems: [],
  settings: {
    cashProfitMargin: 0,     // % above purchase rate for cash sale
    creditExtraPercent: 5,   // % more than cash rate for credit
    roundUp: true,
  }
};

// ═══════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const DOM = {
  body: document.body,
  searchInput: $('searchInput'),
  searchClear: $('searchClear'),
  searchDropdown: $('searchDropdown'),
  dropdownInner: $('dropdownInner'),
  itemCount: $('itemCount'),
  modeBadge: $('modeBadge'),
  modeLabel: $('modeLabel'),
  purchaseToggleBtn: $('purchaseToggleBtn'),
  importBtn: $('importBtn'),
  settingsBtn: $('settingsBtn'),
  emptyImportBtn: $('emptyImportBtn'),

  resultArea: $('resultArea'),
  resItemName: $('resItemName'),
  resItemSize: $('resItemSize'),
  resSaleRate: $('resSaleRate'),
  resPurchaseRate: $('resPurchaseRate'),
  ratePurchaseBox: $('ratePurchaseBox'),
  resultMeta: $('resultMeta'),

  emptyState: $('emptyState'),
  itemsTableWrap: $('itemsTableWrap'),
  itemsTableBody: $('itemsTableBody'),
  thPurchase: $('thPurchase'),

  importModal: $('importModal'),
  importModalClose: $('importModalClose'),
  dropZone: $('dropZone'),
  browseBtn: $('browseBtn'),
  fileInput: $('fileInput'),
  importProgress: $('importProgress'),
  progressFill: $('progressFill'),
  progressText: $('progressText'),
  importPreview: $('importPreview'),
  previewTitle: $('previewTitle'),
  previewTable: $('previewTable'),
  cancelImport: $('cancelImport'),
  confirmImport: $('confirmImport'),

  settingsOverlay: $('settingsOverlay'),
  settingsPanel: $('settingsPanel'),
  settingsClose: $('settingsClose'),
  cashProfitMargin: $('cashProfitMargin'),
  creditExtraPercent: $('creditExtraPercent'),
  roundUpToggle: $('roundUpToggle'),
  saveSettings: $('saveSettings'),
  clearAllData: $('clearAllData'),

  toastContainer: $('toastContainer'),
  syncBadge: $('syncBadge'),
  syncIcon: $('syncIcon'),
  syncLabel: $('syncLabel'),
};

// Reveal banner (created dynamically)
let revealBanner = null;

// Pending import data
let pendingImportData = null;

// ═══════════════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════════════
const FB_CONFIG = {
  apiKey: "AIzaSyBpz9TkoglQt_vydB4riXDsnkjEOy0KVY8",
  authDomain: "rate-list-d2064.firebaseapp.com",
  projectId: "rate-list-d2064",
  storageBucket: "rate-list-d2064.firebasestorage.app",
  messagingSenderId: "103279660523",
  appId: "1:103279660523:web:0b684da4cd3fd859c09dae",
};

let db = null;
const FB_DOC_PATH = { collection: 'shopData', doc: 'items' };

function initFirebase() {
  try {
    const app = firebase.initializeApp(FB_CONFIG);
    db = firebase.firestore();
    setSyncStatus('syncing', '⟳', 'Connecting...');
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    setSyncStatus('error', '✕', 'Offline');
    return false;
  }
}

function setSyncStatus(cls, icon, label) {
  if (!DOM.syncBadge) return;
  DOM.syncBadge.className = 'sync-badge ' + cls;
  DOM.syncIcon.textContent = icon;
  DOM.syncLabel.textContent = label;
}

// Save items array to Firestore
async function saveToFirestore(items) {
  if (!db) return;
  setSyncStatus('syncing', '⟳', 'Saving...');
  try {
    await db.collection(FB_DOC_PATH.collection)
      .doc(FB_DOC_PATH.doc)
      .set({ list: items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    setSyncStatus('synced', '✓', 'Saved');
  } catch (e) {
    console.error('Firestore save error:', e);
    setSyncStatus('error', '✕', 'Save failed');
    showToast('⚠️ Cloud save failed — data saved locally', 'warning');
  }
}

// Load items from Firestore once
async function loadFromFirestore() {
  if (!db) return false;
  setSyncStatus('syncing', '⟳', 'Loading...');
  try {
    const snap = await db.collection(FB_DOC_PATH.collection)
      .doc(FB_DOC_PATH.doc)
      .get();
    if (snap.exists && snap.data().list && snap.data().list.length > 0) {
      State.items = snap.data().list;
      // Also cache locally
      try { localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(State.items)); } catch (e) {}
      setSyncStatus('synced', '✓', `${State.items.length} items`);
      return true;
    } else {
      setSyncStatus('synced', '✓', 'Empty cloud');
      return false;
    }
  } catch (e) {
    console.error('Firestore load error:', e);
    setSyncStatus('error', '✕', 'Offline');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE (localStorage — used as offline cache)
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  items: 'aplrate_items',
  settings: 'aplrate_settings',
  mode: 'aplrate_mode',
};

function saveItems() {
  // Save to localStorage (instant cache)
  try { localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(State.items)); } catch (e) {}
  // Save to Firestore (cloud)
  saveToFirestore(State.items);
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.items);
    if (raw) State.items = JSON.parse(raw);
  } catch (e) { State.items = []; }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(State.settings)); } catch (e) {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) State.settings = { ...State.settings, ...JSON.parse(raw) };
  } catch (e) {}
}

function saveMode() {
  try { localStorage.setItem(STORAGE_KEYS.mode, State.mode); } catch (e) {}
}

function loadMode() {
  try {
    const m = localStorage.getItem(STORAGE_KEYS.mode);
    if (m === 'cash' || m === 'credit') State.mode = m;
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// RATE CALCULATION
// ═══════════════════════════════════════════════════════════════
function roundRate(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return State.settings.roundUp ? Math.ceil(num) : Math.round(num);
}

/**
 * Get the display sale rate for an item based on current mode.
 * If saleRate is stored directly, use it (from Excel).
 * Credit mode adds creditExtraPercent on top.
 */
function getSaleRate(item) {
  const margin   = State.settings.cashProfitMargin  || 0;
  const extra    = State.settings.creditExtraPercent || 0;
  const purchase = parseFloat(item.purchaseRate) || 0;
  const stored   = parseFloat(item.saleRate)    || 0;

  // Step 1: Cash base rate
  // If profit margin is set AND item has a purchase rate → calculate from purchase
  // Otherwise use the stored sale rate directly
  let base = (margin > 0 && purchase > 0)
    ? purchase * (1 + margin / 100)
    : stored;

  // Step 2: Add credit extra % on top for credit mode
  if (State.mode === 'credit') {
    if (extra > 0) {
      base = base * (1 + extra / 100);
    }
    // Round to nearest 10 range (e.g. 57 -> 60, 53 -> 50)
    return Math.round(base / 10) * 10;
  }

  return roundRate(base);
}


function getPurchaseRate(item) {
  return roundRate(parseFloat(item.purchaseRate) || 0);
}

function formatRate(val) {
  const n = Number(val);
  if (n === 0) return '—';
  return '₹ ' + n.toLocaleString('en-IN');
}

// ═══════════════════════════════════════════════════════════════
// SEARCH ENGINE
// ═══════════════════════════════════════════════════════════════
function normalise(str) {
  return (str || '').toLowerCase().trim();
}

function searchItems(query) {
  if (!query) return State.items.slice(0, 60);
  const q = normalise(query);
  const results = [];
  const startsWith = [];
  const contains = [];
  for (const item of State.items) {
    const name = normalise(item.item);
    const size = normalise(item.size);
    const combined = name + ' ' + size;
    if (name.startsWith(q)) startsWith.push(item);
    else if (combined.includes(q)) contains.push(item);
  }
  return [...startsWith, ...contains].slice(0, 50);
}

function highlightMatch(text, query) {
  if (!query) return text;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${q})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ═══════════════════════════════════════════════════════════════
// UI — SEARCH
// ═══════════════════════════════════════════════════════════════
function renderDropdown(query) {
  const items = searchItems(query);
  State.filteredItems = items;
  State.focusedIdx = -1;

  if (items.length === 0) {
    DOM.dropdownInner.innerHTML = `<div class="dropdown-no-results">No items found for "<strong>${query}</strong>"</div>`;
  } else {
    DOM.dropdownInner.innerHTML = items.map((item, i) => {
      const displayRate = getSaleRate(item);
      return `
        <div class="dropdown-item" data-idx="${i}" role="option">
          <div class="dropdown-item-left">
            <div class="dropdown-item-name">${highlightMatch(item.item || '—', query)}</div>
          </div>
          <div class="dropdown-item-rate">${formatRate(displayRate)}</div>
        </div>
      `;
    }).join('');

    DOM.dropdownInner.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx);
        selectItem(State.filteredItems[idx]);
      });
    });
  }

  DOM.searchDropdown.classList.add('open');
}

function closeDropdown() {
  DOM.searchDropdown.classList.remove('open');
  State.focusedIdx = -1;
}

function selectItem(item) {
  if (!item) return;
  State.selectedItem = item;
  DOM.searchInput.value = item.item + (item.size ? ` (${item.size})` : '');
  DOM.searchClear.classList.add('visible');
  closeDropdown();
  renderResultCard(item);
}

function renderResultCard(item) {
  const saleRate = getSaleRate(item);
  const purchaseRate = getPurchaseRate(item);
  const isCredit = State.mode === 'credit';
  const extra = State.settings.creditExtraPercent || 0;

  DOM.resItemName.textContent = item.item || '—';
  DOM.resSaleRate.textContent = formatRate(saleRate);
  DOM.resPurchaseRate.textContent = formatRate(purchaseRate);

  let metaText = isCredit
    ? `Credit rate (+${extra}% over cash)`
    : `Cash rate`;
  if (State.settings.roundUp) metaText += ' · Rounded up';
  DOM.resultMeta.textContent = metaText;

  DOM.ratePurchaseBox.style.display = State.purchaseVisible ? 'block' : 'none';
  DOM.resultArea.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// UI — MODE (CASH / CREDIT)
// ═══════════════════════════════════════════════════════════════
function applyMode() {
  DOM.body.classList.toggle('mode-cash', State.mode === 'cash');
  DOM.body.classList.toggle('mode-credit', State.mode === 'credit');
  DOM.modeLabel.textContent = State.mode === 'cash' ? 'CASH' : 'CREDIT';

  // Re-render if item is selected
  if (State.selectedItem) renderResultCard(State.selectedItem);
  // Re-render table
  renderTable();
  // Re-render dropdown if open
  if (DOM.searchDropdown.classList.contains('open')) {
    renderDropdown(State.searchQuery);
  }
  saveMode();
}

function toggleMode() {
  State.mode = State.mode === 'cash' ? 'credit' : 'cash';
  applyMode();
  showToast(State.mode === 'cash' ? '💚 Switched to Cash Mode' : '🔴 Switched to Credit Mode',
    State.mode === 'cash' ? 'success' : 'info');
}

// ═══════════════════════════════════════════════════════════════
// UI — PURCHASE RATE VISIBILITY
// ═══════════════════════════════════════════════════════════════
function setPurchaseVisible(visible) {
  if (visible && !State.purchaseVisible) {
    const pw = prompt("Enter Password to view Purchase Rates:");
    if (pw !== "12345") {
      showToast("❌ Incorrect Password", "error");
      return;
    }
  }

  State.purchaseVisible = visible;
  DOM.purchaseToggleBtn.classList.toggle('active', visible);
  DOM.ratePurchaseBox.style.display = (visible && State.selectedItem) ? 'block' : 'none';

  // Show/hide purchase column in table
  DOM.thPurchase.style.display = visible ? '' : 'none';
  document.querySelectorAll('.col-purchase').forEach(el => {
    el.style.display = visible ? '' : 'none';
  });

  // Show/hide reveal banner
  if (!revealBanner) {
    revealBanner = document.createElement('div');
    revealBanner.className = 'purchase-reveal-banner';
    revealBanner.textContent = '🔓 Purchase Rate Visible';
    document.body.appendChild(revealBanner);
  }
  revealBanner.classList.toggle('visible', visible);
}

// ═══════════════════════════════════════════════════════════════
// UI — ITEMS TABLE (with inline editing and row actions)
// ═══════════════════════════════════════════════════════════════
function renderTable() {
  const hasItems = State.items.length > 0;
  DOM.emptyState.style.display = hasItems ? 'none' : 'block';
  DOM.itemsTableWrap.style.display = hasItems ? 'block' : 'none';
  DOM.itemCount.textContent = `${State.items.length} item${State.items.length !== 1 ? 's' : ''}`;

  if (!hasItems) return;

  DOM.itemsTableBody.innerHTML = State.items.map((item, idx) => {
    const saleRate = getSaleRate(item);
    const purchaseRate = getPurchaseRate(item);
    return `
      <tr data-idx="${idx}">
        <td class="td-editable" data-field="item" data-idx="${idx}" title="Click to edit name">
          <span class="td-text">${item.item || '—'}</span>
        </td>
        <td class="td-editable td-rate" data-field="saleRate" data-idx="${idx}" title="Click to edit sale rate">
          <span class="td-text">${formatRate(saleRate)}</span>
        </td>
        <td class="col-purchase td-editable td-purchase" data-field="purchaseRate" data-idx="${idx}" title="Click to edit purchase rate" style="display:${State.purchaseVisible ? '' : 'none'}">
          <span class="td-text">${formatRate(purchaseRate)}</span>
        </td>
        <td class="td-actions" style="text-align: right; white-space: nowrap;">
          <button class="row-action-btn btn-edit-row" data-idx="${idx}" title="Edit Name">✏️</button>
          <button class="row-action-btn btn-delete-row" data-idx="${idx}" title="Delete Product">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach click-to-edit listeners
  DOM.itemsTableBody.querySelectorAll('.td-editable').forEach(cell => {
    cell.addEventListener('click', () => startEdit(cell));
  });

  // Attach row edit button listeners
  DOM.itemsTableBody.querySelectorAll('.btn-edit-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const cell = DOM.itemsTableBody.querySelector(`tr[data-idx="${idx}"] td[data-field="item"]`);
      if (cell) startEdit(cell);
    });
  });

  // Attach row delete button listeners
  DOM.itemsTableBody.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const item = State.items[idx];
      if (item && confirm(`Delete "${item.item}"?`)) {
        State.items.splice(idx, 1);
        saveItems();
        renderTable();
        // If this was the selected item in result card, hide it
        if (State.selectedItem && State.selectedItem.item === item.item) {
          State.selectedItem = null;
          DOM.resultArea.style.display = 'none';
          DOM.searchInput.value = '';
          State.searchQuery = '';
          DOM.searchClear.classList.remove('visible');
        }
        showToast('🗑️ Item deleted', 'info');
      }
    });
  });
}

function hasDuplicateName(name, excludeIdx = -1) {
  const normName = (name || '').toLowerCase().trim();
  return State.items.some((item, idx) => {
    if (idx === excludeIdx) return false;
    return (item.item || '').toLowerCase().trim() === normName;
  });
}

function startEdit(cell) {
  if (cell.classList.contains('editing')) return;
  const idx = parseInt(cell.dataset.idx);
  const field = cell.dataset.field;
  const item = State.items[idx];
  if (!item) return;

  // Current raw value
  const currentVal = field === 'item' ? (item.item || '') : (parseFloat(item[field]) || 0);

  cell.classList.add('editing');
  cell.innerHTML = `
    <input
      class="inline-edit-input"
      type="${field === 'item' ? 'text' : 'number'}"
      value="${currentVal}"
      ${field !== 'item' ? 'min="0" step="0.01"' : ''}
    />
  `;

  const input = cell.querySelector('.inline-edit-input');
  input.focus();
  input.select();

  function commit() {
    const raw = input.value.trim();
    if (raw === '') { cancelEdit(cell, item, field); return; }

    if (field === 'item') {
      if (hasDuplicateName(raw, idx)) {
        showToast(`❌ Error: Product "${raw}" already exists!`, 'error', 4000);
        cancelEdit(cell, item, field);
        return;
      }
      State.items[idx].item = raw;
    } else {
      State.items[idx][field] = parseFloat(raw) || 0;
    }
    saveItems(); // saves to localStorage + Firestore
    renderTable();
    // If this was the selected item, refresh result card
    if (State.selectedItem && State.selectedItem === item) {
      State.selectedItem = State.items[idx];
      renderResultCard(State.selectedItem);
    }
    showToast('✅ Saved', 'success', 1500);
  }

  function cancelEdit(cell, item, field) {
    renderTable();
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { renderTable(); }
  });

  input.addEventListener('blur', commit);
}


// ═══════════════════════════════════════════════════════════════
// UI — SETTINGS
// ═══════════════════════════════════════════════════════════════
function openSettings() {
  DOM.cashProfitMargin.value = State.settings.cashProfitMargin || '';
  DOM.creditExtraPercent.value = State.settings.creditExtraPercent || '';
  DOM.roundUpToggle.checked = State.settings.roundUp !== false;
  DOM.settingsOverlay.classList.add('open');
  DOM.settingsPanel.classList.add('open');
}

function closeSettings() {
  DOM.settingsOverlay.classList.remove('open');
  DOM.settingsPanel.classList.remove('open');
}

function saveSettingsFromUI() {
  const margin = parseFloat(DOM.cashProfitMargin.value) || 0;
  const extra = parseFloat(DOM.creditExtraPercent.value) || 0;
  const roundUp = DOM.roundUpToggle.checked;

  State.settings.cashProfitMargin = margin;
  State.settings.creditExtraPercent = extra;
  State.settings.roundUp = roundUp;
  saveSettings();
  closeSettings();
  renderTable();
  if (State.selectedItem) renderResultCard(State.selectedItem);
  showToast('✅ Settings saved', 'success');
}

// ═══════════════════════════════════════════════════════════════
// UI — IMPORT MODAL
// ═══════════════════════════════════════════════════════════════
function openImportModal() {
  DOM.importModal.classList.add('open');
  resetImportModal();
}

function closeImportModal() {
  DOM.importModal.classList.remove('open');
  resetImportModal();
}

function resetImportModal() {
  DOM.dropZone.style.display = 'block';
  DOM.importProgress.style.display = 'none';
  DOM.importPreview.style.display = 'none';
  DOM.progressFill.style.width = '0%';
  DOM.fileInput.value = '';
  pendingImportData = null;
}

function setProgress(pct, text) {
  DOM.importProgress.style.display = 'block';
  DOM.progressFill.style.width = pct + '%';
  DOM.progressText.textContent = text;
}

// ─── Column name normaliser ───
function normaliseColName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const COL_MAPS = {
  item:         ['item', 'itemname', 'name', 'product', 'productname', 'chemical', 'pesticide', 'description'],
  size:         ['size', 'pack', 'packing', 'qty', 'quantity', 'unit', 'weight', 'volume'],
  saleRate:     ['salerate', 'saleprice', 'sale', 'mrp', 'rate', 'price', 'sellingrate', 'sellrate', 'saleamount', 'sp'],
  purchaseRate: ['purchaserate', 'purchaseprice', 'purchase', 'buyprice', 'cost', 'costprice', 'purchaseamount', 'pp', 'buyrate'],
};

function detectColumn(header) {
  const h = normaliseColName(header);
  for (const [key, aliases] of Object.entries(COL_MAPS)) {
    if (aliases.includes(h)) return key;
  }
  return null;
}

function parseRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return [];

  // First row = headers
  const headers = rawRows[0];
  const colMap = {}; // colKey -> colIndex

  headers.forEach((h, i) => {
    const key = detectColumn(String(h));
    if (key && !(key in colMap)) colMap[key] = i;
  });

  if (!('item' in colMap) && !('saleRate' in colMap)) {
    // Try to auto-detect by position if standard format
    if (headers.length >= 3) {
      colMap.item = 0;
      colMap.size = 1;
      colMap.saleRate = 2;
      if (headers.length >= 4) colMap.purchaseRate = 3;
    }
  }

  const items = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const itemName = (row[colMap.item] || '').toString().trim();
    if (!itemName) continue;

    const saleRaw = parseFloat(row[colMap.saleRate]) || 0;
    const purchaseRaw = parseFloat(row[colMap.purchaseRate]) || 0;

    items.push({
      item: itemName,
      size: colMap.size !== undefined ? (row[colMap.size] || '').toString().trim() : '',
      saleRate: saleRaw,
      purchaseRate: purchaseRaw,
    });
  }
  return items;
}

// ─── Excel Parsing ───
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        resolve(raw);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── CSV Parsing ───
async function parseCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const rows = text.split('\n').map(line => line.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ─── PDF Parsing ───
async function parsePdf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        let allText = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          allText += content.items.map(s => s.str).join(' ') + '\n';
        }
        // Try to parse as tab/space separated
        const lines = allText.split('\n').filter(l => l.trim());
        const rows = lines.map(line => line.split(/\s{2,}|\t/).map(c => c.trim()));
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── File Handler ───
async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  DOM.dropZone.style.display = 'none';
  DOM.importInfo && (DOM.importInfo.style.display = 'none');
  setProgress(20, 'Reading file...');

  let rawRows = [];
  try {
    if (ext === 'xlsx' || ext === 'xls') {
      rawRows = await parseExcel(file);
    } else if (ext === 'csv') {
      rawRows = await parseCsv(file);
    } else if (ext === 'pdf') {
      if (typeof pdfjsLib === 'undefined') {
        showToast('PDF.js not loaded. Please try Excel format.', 'error');
        resetImportModal();
        DOM.dropZone.style.display = 'block';
        return;
      }
      rawRows = await parsePdf(file);
    } else {
      showToast('Unsupported file format. Use .xlsx, .xls, .csv or text PDF.', 'error');
      resetImportModal();
      DOM.dropZone.style.display = 'block';
      return;
    }

    setProgress(70, 'Parsing items...');
    const items = parseRows(rawRows);
    setProgress(100, `Found ${items.length} items`);

    if (items.length === 0) {
      showToast('No items found. Check column headers: Item, Size, Sale Rate, Purchase Rate', 'warning');
      resetImportModal();
      DOM.dropZone.style.display = 'block';
      return;
    }

    // Show preview
    pendingImportData = items;
    showImportPreview(items, file.name);

  } catch (err) {
    console.error(err);
    showToast('Error reading file: ' + err.message, 'error');
    resetImportModal();
    DOM.dropZone.style.display = 'block';
  }
}

function showImportPreview(items, filename) {
  DOM.importProgress.style.display = 'none';
  DOM.importPreview.style.display = 'block';
  DOM.previewTitle.textContent = `Preview: ${items.length} items from "${filename}"`;

  const preview = items.slice(0, 10);
  DOM.previewTable.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>Size</th>
        <th>Sale Rate</th>
        <th>Purchase Rate</th>
      </tr>
    </thead>
    <tbody>
      ${preview.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.item}</td>
          <td>${item.size || '—'}</td>
          <td>₹ ${item.saleRate || 0}</td>
          <td>₹ ${item.purchaseRate || 0}</td>
        </tr>
      `).join('')}
      ${items.length > 10 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:8px;">... and ${items.length - 10} more items</td></tr>` : ''}
    </tbody>
  `;
}

function confirmImport() {
  if (!pendingImportData || pendingImportData.length === 0) return;
  State.items = pendingImportData;
  saveItems();
  renderTable();
  closeImportModal();
  showToast(`✅ Imported ${State.items.length} items successfully!`, 'success');
  DOM.searchInput.focus();
}

// ─── Drag & Drop ───
DOM.dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.dropZone.classList.add('dragging');
});

DOM.dropZone.addEventListener('dragleave', () => DOM.dropZone.classList.remove('dragging'));

DOM.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${TOAST_ICONS[type] || ''}</span> ${message}`;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
const keysDown = new Set();

document.addEventListener('keydown', e => {
  keysDown.add(e.key.toLowerCase());

  // Alt + C → Toggle Cash / Credit
  if (e.altKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    toggleMode();
    return;
  }

  // Alt + P → Show Purchase Rate
  if (e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    setPurchaseVisible(!State.purchaseVisible);
    return;
  }

  // Ctrl + K → Focus search
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    DOM.searchInput.focus();
    DOM.searchInput.select();
    return;
  }

  // Ctrl + I → Open Import
  if (e.ctrlKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    openImportModal();
    return;
  }

  // Ctrl + , → Open Settings
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault();
    openSettings();
    return;
  }

  // Arrow Up/Down in dropdown
  if (DOM.searchDropdown.classList.contains('open')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (State.focusedIdx >= 0 && State.filteredItems[State.focusedIdx]) {
        selectItem(State.filteredItems[State.focusedIdx]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key.toLowerCase());
});

function moveFocus(dir) {
  const items = DOM.dropdownInner.querySelectorAll('.dropdown-item');
  if (items.length === 0) return;
  const prev = State.focusedIdx;
  State.focusedIdx = Math.max(-1, Math.min(items.length - 1, State.focusedIdx + dir));
  if (prev >= 0) items[prev].classList.remove('focused');
  if (State.focusedIdx >= 0) {
    items[State.focusedIdx].classList.add('focused');
    items[State.focusedIdx].scrollIntoView({ block: 'nearest' });
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

// ─── Search Input ───
DOM.searchInput.addEventListener('input', () => {
  const q = DOM.searchInput.value.trim();
  State.searchQuery = q;
  DOM.searchClear.classList.toggle('visible', q.length > 0);

  if (State.items.length === 0) return;

  if (q.length === 0) {
    closeDropdown();
    DOM.resultArea.style.display = 'none';
    State.selectedItem = null;
    return;
  }

  renderDropdown(q);
});

DOM.searchInput.addEventListener('focus', () => {
  if (State.searchQuery && State.items.length > 0) {
    renderDropdown(State.searchQuery);
  }
});

document.addEventListener('click', e => {
  if (!DOM.searchDropdown.contains(e.target) && e.target !== DOM.searchInput) {
    closeDropdown();
  }
});

DOM.searchClear.addEventListener('click', () => {
  DOM.searchInput.value = '';
  State.searchQuery = '';
  DOM.searchClear.classList.remove('visible');
  DOM.resultArea.style.display = 'none';
  State.selectedItem = null;
  closeDropdown();
  DOM.searchInput.focus();
});

// ─── Mode Badge Click ───
DOM.modeBadge.addEventListener('click', toggleMode);

// ─── Purchase Toggle Button ───
DOM.purchaseToggleBtn.addEventListener('click', () => {
  setPurchaseVisible(!State.purchaseVisible);
});

// ─── Import Modal ───
DOM.importBtn.addEventListener('click', openImportModal);
DOM.emptyImportBtn.addEventListener('click', openImportModal);
DOM.importModalClose.addEventListener('click', closeImportModal);
DOM.importModal.addEventListener('click', e => {
  if (e.target === DOM.importModal) closeImportModal();
});
DOM.browseBtn.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});
DOM.cancelImport.addEventListener('click', () => {
  resetImportModal();
  DOM.dropZone.style.display = 'block';
});
DOM.confirmImport.addEventListener('click', confirmImport);

// ─── Add Product Modal ───
const addProductModal = $('addProductModal');
const addProductForm  = $('addProductForm');
const apItemName      = $('apItemName');
const apSaleRate      = $('apSaleRate');
const apPurchaseRate  = $('apPurchaseRate');

function openAddProduct() {
  addProductForm.reset();
  addProductModal.classList.add('open');
  setTimeout(() => apItemName.focus(), 100);
}

function closeAddProduct() {
  addProductModal.classList.remove('open');
  addProductForm.reset();
}

$('addProductCancel').addEventListener('click', closeAddProduct);

// Wire up all "Add Product" trigger buttons
$('emptyAddBtn').addEventListener('click', openAddProduct);
$('addProductBtn').addEventListener('click', openAddProduct);

addProductForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = apItemName.value.trim();
  const sale = parseFloat(apSaleRate.value) || 0;
  const purchase = parseFloat(apPurchaseRate.value) || 0;

  if (!name) { apItemName.focus(); return; }
  if (!sale)  { apSaleRate.focus(); return; }

  if (hasDuplicateName(name)) {
    showToast(`❌ Error: Product "${name}" already exists!`, 'error', 4000);
    apItemName.focus();
    apItemName.select();
    return;
  }

  State.items.push({ item: name, saleRate: sale, purchaseRate: purchase });
  saveItems();
  renderTable();
  closeAddProduct();
  showToast(`✅ "${name}" added!`, 'success');
  DOM.searchInput.focus();
});

// ─── Settings ───
DOM.settingsBtn.addEventListener('click', openSettings);
DOM.settingsClose.addEventListener('click', closeSettings);
DOM.settingsOverlay.addEventListener('click', closeSettings);
DOM.saveSettings.addEventListener('click', saveSettingsFromUI);

DOM.clearAllData.addEventListener('click', () => {
  if (confirm('Clear all item data? This cannot be undone.')) {
    State.items = [];
    saveItems();
    State.selectedItem = null;
    DOM.resultArea.style.display = 'none';
    DOM.searchInput.value = '';
    State.searchQuery = '';
    DOM.searchClear.classList.remove('visible');
    closeDropdown();
    renderTable();
    closeSettings();
    showToast('🗑 All data cleared', 'info');
  }
});


// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  loadSettings();
  loadMode();

  // 1. Load from localStorage immediately (instant UI)
  loadItems();
  applyMode();
  renderTable();
  if (State.items.length > 0) {
    setTimeout(() => DOM.searchInput.focus(), 100);
  }

  // 2. Init Firebase and load fresh data from cloud
  initFirebase();
  const loaded = await loadFromFirestore();
  if (loaded) {
    applyMode();
    renderTable();
    if (State.items.length > 0) {
      setTimeout(() => DOM.searchInput.focus(), 100);
    }
  }
}

init();
