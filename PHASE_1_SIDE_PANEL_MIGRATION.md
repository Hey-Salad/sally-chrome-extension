# Phase 1: Side Panel Migration - Implementation Guide

## Overview

This guide walks you through migrating the HeySalad AI Shopper extension from popup to side panel **while preserving all mobile-to-extension QR functionality**.

**Status**: Ready to implement  
**Estimated Time**: 3-5 hours  
**Priority**: HIGH - Foundation for all other improvements

---

## What We're Preserving (Mobile Integration)

### ✅ Critical Functions to Keep

From `popup/popup.js` lines 1100-1401:

1. **Extension QR Generation** (`showExtensionQR()`)
   - Generates session token: `ext_${timestamp}_${random}`
   - Creates QR code with `heysalad://extension-link?token=${token}`
   - 15-minute session expiration
   - Stores session in chrome.storage.local

2. **Session Polling** (`startSessionPolling()`)
   - Polls API every 2 seconds
   - Endpoint: `sally-api.heysalad-o.workers.dev/api/extension/token/${token}`
   - Checks for shopping list from mobile
   - Handles session expiration

3. **Progress Updates** (`sendProgressUpdate()`)
   - Sends progress to API for mobile to see
   - Endpoint: `POST /api/extension/token/${token}/progress`
   - Real-time updates during shopping

4. **Shopping from Mobile** (`startShoppingFromMobile()`)
   - Receives list from mobile via API
   - Populates form with items
   - Starts autonomous shopping
   - Sends progress updates back to mobile

---

## Step-by-Step Implementation

### Step 1: Create Side Panel Directory Structure

```bash
cd heysalad-ai-shopper
mkdir -p sidepanel/components
```

**Files to create**:
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.js`
- `sidepanel/sidepanel.css`
- `sidepanel/components/mobile-qr.js` (extracted mobile functions)

### Step 2: Update manifest.json

Add side panel configuration while keeping popup as fallback:

```json
{
  "manifest_version": 3,
  "name": "Sally by HeySalad®",
  "version": "2.0.0",
  
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  
  "action": {
    "default_title": "Sally - AI Shopping Assistant"
  },
  
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting",
    "tabs",
    "notifications"
  ]
}
```

**Key Changes**:
- Added `"side_panel"` configuration
- Added `"sidePanel"` permission
- Removed `"default_popup"` from action (side panel replaces it)
- Kept all other permissions

### Step 3: Create sidepanel.html

Migrate from `popup/popup.html` with mobile QR sections preserved:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sally - AI Shopping Assistant</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <!-- Auth Section (same as popup) -->
  <div id="auth-section" class="hidden">
    <!-- Keep existing auth UI -->
  </div>
  
  <!-- Main Section -->
  <div id="main-section" class="hidden">
    <header class="panel-header">
      <h1>Sally</h1>
      <span class="badge">by HeySalad®</span>
      <button id="logout-btn" class="btn-icon">🚪</button>
    </header>
    
    <!-- ✅ KEEP - Mobile Integration Section -->
    <section class="mobile-integration">
      <h3>Shop from Mobile</h3>
      <button class="btn-primary" id="show-qr-code-btn">
        📱 Show QR Code
      </button>
      <p class="hint">Scan with Sally Mobile to send your shopping list</p>
    </section>
    
    <!-- Shopping Form -->
    <section id="task-form">
      <h3>Or enter manually</h3>
      <select id="store-select">
        <option value="">Auto-detect store</option>
        <option value="tesco">Tesco</option>
        <option value="sainsburys">Sainsbury's</option>
        <option value="asda">ASDA</option>
        <option value="ocado">Ocado</option>
        <option value="waitrose">Waitrose</option>
      </select>
      
      <textarea 
        id="items-input" 
        placeholder="Enter items (one per line)&#10;e.g. 2x Milk&#10;Bread&#10;Eggs"
        rows="8"
      ></textarea>
      
      <button id="start-btn" class="btn-primary">
        🛒 Let Sally Shop!
      </button>
    </section>
    
    <!-- Shopping Progress -->
    <section id="task-status" class="hidden">
      <h3 id="task-store">Shopping...</h3>
      <div class="progress-bar">
        <div id="progress-fill"></div>
      </div>
      <p id="progress-text">0 of 0 items</p>
      <div id="items-list"></div>
      <button id="stop-btn" class="btn-secondary">Stop Shopping</button>
    </section>
    
    <!-- Stats -->
    <section class="stats">
      <div class="stat-item">
        <span class="stat-value" id="stat-items">0</span>
        <span class="stat-label">Items Added</span>
      </div>
      <div class="stat-item">
        <span class="stat-value" id="stat-sessions">0</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-item">
        <span class="stat-value" id="stat-time">0 min</span>
        <span class="stat-label">Time Saved</span>
      </div>
    </section>
  </div>
  
  <!-- ✅ KEEP - Extension QR Section (Mobile-to-Extension) -->
  <div id="extension-qr-section" class="hidden">
    <header class="panel-header">
      <h2>Scan with Mobile</h2>
      <button id="extension-qr-cancel-btn" class="btn-icon">✕</button>
    </header>
    
    <div class="qr-container">
      <div id="extension-qr-display"></div>
      <p id="extension-qr-status" class="qr-status">
        ⏳ Waiting for mobile to scan...
      </p>
      <p id="extension-qr-timer" class="qr-timer">
        Expires in 15:00
      </p>
    </div>
    
    <div class="qr-instructions">
      <h4>How it works:</h4>
      <ol>
        <li>Open Sally Mobile app</li>
        <li>Tap "Shop with Sally"</li>
        <li>Scan this QR code</li>
        <li>Sally will shop automatically!</li>
      </ol>
    </div>
    
    <button id="extension-qr-refresh-btn" class="btn-secondary">
      🔄 Generate New Code
    </button>
  </div>
  
  <!-- Scripts -->
  <script src="../popup/qrcode.min.js"></script>
  <script src="components/mobile-qr.js"></script>
  <script src="sidepanel.js"></script>
</body>
</html>
```

### Step 4: Extract Mobile QR Functions

Create `sidepanel/components/mobile-qr.js` with the critical functions:

```javascript
/**
 * Mobile QR Integration Module
 * Handles mobile-to-extension QR flow
 */

let extensionSession = null;
let sessionPollInterval = null;
let sessionTimerInterval = null;

// ✅ KEEP - Show extension QR code for mobile to scan
async function showExtensionQR() {
  console.log('[Sally] Showing extension QR code');
  
  try {
    const sessionToken = generateExtensionSessionToken();
    const now = Date.now();
    const expiresAt = now + (15 * 60 * 1000); // 15 minutes
    
    extensionSession = {
      session_id: sessionToken,
      created_at: now,
      expires_at: expiresAt,
      status: 'waiting'
    };
    
    await chrome.storage.local.set({ extensionSession });
    
    const qrData = `heysalad://extension-link?token=${sessionToken}`;
    const qrDisplay = document.getElementById('extension-qr-display');
    qrDisplay.innerHTML = '';
    
    new QRCode(qrDisplay, {
      text: qrData,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    
    // Hide main section, show QR section
    document.getElementById('main-section').classList.add('hidden');
    document.getElementById('extension-qr-section').classList.remove('hidden');
    
    startSessionPolling(sessionToken);
    startSessionTimer(expiresAt);
    
    console.log('[Sally] Extension QR displayed, token:', sessionToken);
  } catch (error) {
    console.error('[Sally] QR generation error:', error);
    alert('Failed to generate QR code: ' + error.message);
  }
}

// ✅ KEEP - Poll API for shopping list from mobile
async function startSessionPolling(sessionToken) {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  
  const statusEl = document.getElementById('extension-qr-status');
  
  sessionPollInterval = setInterval(async () => {
    try {
      if (extensionSession && extensionSession.expires_at < Date.now()) {
        clearInterval(sessionPollInterval);
        statusEl.textContent = '⏰ Session expired. Please generate a new QR code.';
        statusEl.className = 'qr-status error';
        return;
      }
      
      const response = await fetch(
        `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionToken}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.status === 'ready' && data.shopping_list) {
        clearInterval(sessionPollInterval);
        clearInterval(sessionTimerInterval);
        
        statusEl.textContent = '✅ Shopping list received! Starting...';
        statusEl.className = 'qr-status success';
        
        document.getElementById('extension-qr-section').classList.add('hidden');
        document.getElementById('main-section').classList.remove('hidden');
        
        await startShoppingFromMobile(data.shopping_list, data.store);
      }
    } catch (error) {
      console.error('[Sally] Session polling error:', error);
    }
  }, 2000);
}

// ✅ KEEP - Countdown timer
function startSessionTimer(expiresAt) {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  
  const timerEl = document.getElementById('extension-qr-timer');
  
  const updateTimer = () => {
    const remaining = expiresAt - Date.now();
    
    if (remaining <= 0) {
      clearInterval(sessionTimerInterval);
      timerEl.textContent = 'Expired';
      timerEl.className = 'qr-timer expired';
      return;
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  updateTimer();
  sessionTimerInterval = setInterval(updateTimer, 1000);
}

// ✅ KEEP - Start shopping from mobile list
async function startShoppingFromMobile(shoppingList, store) {
  console.log('[Sally] Starting shopping from mobile:', { store, items: shoppingList.items });
  
  const sessionId = extensionSession?.session_id;
  
  // Populate form
  const itemsText = shoppingList.items.map(item => 
    item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name
  ).join('\n');
  
  document.getElementById('items-input').value = itemsText;
  document.getElementById('store-select').value = store || '';
  
  await startShoppingWithProgressUpdates(sessionId, shoppingList.items, store);
}

// ✅ KEEP - Shopping with progress updates
async function startShoppingWithProgressUpdates(sessionId, items, store) {
  console.log('[Sally] Starting autonomous shopping with progress updates');
  
  try {
    if (sessionId) {
      await fetch(
        `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    await sendProgressUpdate(sessionId, {
      itemsAdded: 0,
      itemsFailed: 0,
      totalItems: items.length,
      percentage: 0,
      items: items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        status: 'pending'
      }))
    });
    
    const response = await chrome.runtime.sendMessage({
      type: 'START_SHOPPING',
      data: {
        store,
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity || 1
        })),
        sessionId
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to start shopping');
    }
    
    const progressListener = (message) => {
      if (message.type === 'SHOPPING_PROGRESS' && message.sessionId === sessionId) {
        sendProgressUpdate(sessionId, message.progress);
      } else if (message.type === 'SHOPPING_COMPLETE' && message.sessionId === sessionId) {
        chrome.runtime.onMessage.removeListener(progressListener);
      }
    };
    
    chrome.runtime.onMessage.addListener(progressListener);
    
  } catch (error) {
    console.error('[Sally] Failed to start shopping:', error);
    
    await sendProgressUpdate(sessionId, {
      itemsAdded: 0,
      itemsFailed: items.length,
      totalItems: items.length,
      percentage: 0,
      items: items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        status: 'failed'
      })),
      error: error.message
    });
    
    alert('Failed to start shopping: ' + error.message);
  }
}

// ✅ KEEP - Send progress to API
async function sendProgressUpdate(sessionId, progress) {
  if (!sessionId) return;
  
  try {
    const response = await fetch(
      `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/progress`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progress)
      }
    );
    
    if (response.ok) {
      console.log('[Sally] Progress update sent:', progress.percentage + '%');
    }
  } catch (error) {
    console.error('[Sally] Failed to send progress update:', error);
  }
}

// ✅ KEEP - Generate session token
function generateExtensionSessionToken() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  const randomStr2 = Math.random().toString(36).substring(2, 15);
  return `ext_${timestamp}_${randomStr}${randomStr2}`;
}

// ✅ KEEP - Close QR
function closeExtensionQR() {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  
  document.getElementById('extension-qr-section').classList.add('hidden');
  document.getElementById('main-section').classList.remove('hidden');
  
  extensionSession = null;
}

// ✅ KEEP - Refresh QR
async function refreshExtensionQR() {
  closeExtensionQR();
  await showExtensionQR();
}

// Export functions for use in sidepanel.js
window.MobileQR = {
  showExtensionQR,
  closeExtensionQR,
  refreshExtensionQR
};
```

### Step 5: Create sidepanel.js

Main side panel script that imports mobile QR functions:

```javascript
/**
 * Sally by HeySalad® - Side Panel Script
 * Migrated from popup.js with mobile QR integration preserved
 */

// DOM Elements
const mainSection = document.getElementById('main-section');
const authSection = document.getElementById('auth-section');
const taskForm = document.getElementById('task-form');
const taskStatus = document.getElementById('task-status');
const storeSelect = document.getElementById('store-select');
const itemsInput = document.getElementById('items-input');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const logoutBtn = document.getElementById('logout-btn');

let currentUser = null;
let currentTask = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
  await checkTaskStatus();
  await loadStats();
  setupEventListeners();
});

function setupEventListeners() {
  // Mobile QR buttons (using imported functions)
  const showQRBtn = document.getElementById('show-qr-code-btn');
  const qrCancelBtn = document.getElementById('extension-qr-cancel-btn');
  const qrRefreshBtn = document.getElementById('extension-qr-refresh-btn');
  
  if (showQRBtn) {
    showQRBtn.addEventListener('click', () => window.MobileQR.showExtensionQR());
  }
  if (qrCancelBtn) {
    qrCancelBtn.addEventListener('click', () => window.MobileQR.closeExtensionQR());
  }
  if (qrRefreshBtn) {
    qrRefreshBtn.addEventListener('click', () => window.MobileQR.refreshExtensionQR());
  }
  
  // Shopping buttons
  if (startBtn) {
    startBtn.addEventListener('click', handleStartShopping);
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', handleStopShopping);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUTH_CHECK' });
    if (response.isAuthenticated) {
      currentUser = response.user;
      showMainSection();
    } else {
      showAuthSection();
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showAuthSection();
  }
}

async function checkTaskStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TASK_STATUS' });
    if (response.task) {
      currentTask = response.task;
      if (currentTask.status === 'shopping') {
        showTaskStatus();
        updateTaskUI(currentTask);
      }
    }
  } catch (error) {
    console.error('Task status error:', error);
  }
}

async function loadStats() {
  try {
    const data = await chrome.storage.local.get(['sallyStats']);
    const stats = data.sallyStats || { totalItems: 0, totalSessions: 0 };
    
    document.getElementById('stat-items').textContent = stats.totalItems || 0;
    document.getElementById('stat-sessions').textContent = stats.totalSessions || 0;
    
    const minutesSaved = Math.round((stats.totalItems || 0) * 0.5);
    document.getElementById('stat-time').textContent = minutesSaved > 0 ? `${minutesSaved} min` : '0 min';
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

async function handleStartShopping() {
  const store = storeSelect.value;
  const itemsText = itemsInput.value.trim();
  
  if (!itemsText) {
    alert('Please enter at least one item');
    return;
  }
  
  const items = parseItems(itemsText);
  if (items.length === 0) {
    alert('Please enter valid items');
    return;
  }
  
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="spinner"></span> Starting...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_SHOPPING',
      data: { store: store || undefined, items }
    });
    
    if (response.success) {
      currentTask = {
        id: response.taskId,
        store: response.store,
        items: items.map(i => ({ ...i, status: 'pending' })),
        status: 'shopping'
      };
      showTaskStatus();
      updateTaskUI(currentTask);
    } else {
      alert(response.error || 'Failed to start shopping');
    }
  } catch (error) {
    console.error('Start shopping error:', error);
    alert('An error occurred. Please try again.');
  } finally {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span>🛒 Let Sally Shop!</span>';
  }
}

async function handleStopShopping() {
  if (!confirm('Stop shopping?')) return;
  
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_SHOPPING' });
    currentTask = null;
    showTaskForm();
  } catch (error) {
    console.error('Stop error:', error);
  }
}

async function handleLogout() {
  try {
    await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
    currentUser = null;
    currentTask = null;
    showAuthSection();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function parseItems(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const items = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    let name = trimmed;
    let quantity = 1;
    
    const prefixMatch = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
    if (prefixMatch) {
      quantity = parseInt(prefixMatch[1], 10);
      name = prefixMatch[2].trim();
    }
    
    if (name && quantity > 0) {
      items.push({ name, quantity });
    }
  }
  
  return items;
}

function showAuthSection() {
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
}

function showMainSection() {
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

function showTaskForm() {
  taskForm.classList.remove('hidden');
  taskStatus.classList.add('hidden');
}

function showTaskStatus() {
  taskForm.classList.add('hidden');
  taskStatus.classList.remove('hidden');
}

function updateTaskUI(task) {
  if (!task) return;
  currentTask = task;
  
  const storeNames = {
    tesco: 'Tesco',
    sainsburys: "Sainsbury's",
    asda: 'ASDA',
    ocado: 'Ocado',
    waitrose: 'Waitrose'
  };
  
  document.getElementById('task-store').textContent = 
    `🤖 Sally is shopping at ${storeNames[task.store] || task.store}`;
  
  const total = task.items?.length || 0;
  const completed = (task.itemsAdded || 0) + (task.itemsFailed || 0);
  const percent = total > 0 ? (completed / total) * 100 : 0;
  
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${completed} of ${total} items`;
  
  const itemsList = document.getElementById('items-list');
  itemsList.innerHTML = '';
  
  if (task.items) {
    for (const item of task.items) {
      const row = document.createElement('div');
      row.className = 'item-row';
      
      const icon = item.status === 'added' ? '✓' : 
                   item.status === 'failed' ? '✗' : 
                   item.status === 'searching' ? '⏳' : '○';
      
      row.innerHTML = `
        <span class="item-status ${item.status}">${icon}</span>
        <span class="item-name">${item.name} ${item.quantity > 1 ? `(×${item.quantity})` : ''}</span>
      `;
      
      itemsList.appendChild(row);
    }
  }
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TASK_UPDATED') {
    updateTaskUI(message.task);
  } else if (message.type === 'SHOPPING_COMPLETE') {
    showTaskComplete(message.task);
  } else if (message.type === 'AUTH_SUCCESS') {
    currentUser = message.user;
    showMainSection();
  }
});

function showTaskComplete(task) {
  taskStatus.classList.add('hidden');
  taskForm.classList.remove('hidden');
  
  const added = task.itemsAdded || 0;
  const total = task.items?.length || 0;
  
  alert(`Shopping complete! Added ${added} of ${total} items to your cart.`);
  
  itemsInput.value = '';
  currentTask = null;
}
```

### Step 6: Update background/service-worker.js

Add side panel opening logic:

```javascript
// Add to background/service-worker.js

// Open side panel when extension icon clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[Sally] Failed to open side panel:', error);
  }
});

// Handle message to open side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          await chrome.sidePanel.open({ tabId: tabs[0].id });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      }
    });
    return true; // Keep channel open for async response
  }
  
  // ... rest of existing message handlers
});
```

### Step 7: Create sidepanel.css

Style the side panel with Chrome Material Design 3:

```css
:root {
  /* Chrome colors */
  --chrome-primary: #1a73e8;
  --chrome-surface: #ffffff;
  --chrome-surface-variant: #f1f3f4;
  --chrome-on-surface: #202124;
  --chrome-on-surface-variant: #5f6368;
  --chrome-outline: #dadce0;
  --chrome-error: #d93025;
  --chrome-success: #1e8e3e;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  
  /* Typography */
  --font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.1);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--chrome-on-surface);
  background: var(--chrome-surface);
  width: 400px;
  min-height: 600px;
  overflow-y: auto;
}

.hidden {
  display: none !important;
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--chrome-outline);
  background: var(--chrome-surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.panel-header h1 {
  font-size: var(--font-size-lg);
  font-weight: 500;
  color: var(--chrome-on-surface);
}

.badge {
  font-size: var(--font-size-sm);
  color: var(--chrome-on-surface-variant);
  background: var(--chrome-surface-variant);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

/* Mobile Integration Section */
.mobile-integration {
  padding: var(--spacing-md);
  background: var(--chrome-surface-variant);
  border-bottom: 1px solid var(--chrome-outline);
}

.mobile-integration h3 {
  font-size: var(--font-size-md);
  font-weight: 500;
  margin-bottom: var(--spacing-sm);
}

.mobile-integration .hint {
  font-size: var(--font-size-sm);
  color: var(--chrome-on-surface-variant);
  margin-top: var(--spacing-sm);
}

/* Buttons */
.btn-primary {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--chrome-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #1557b0;
  box-shadow: var(--shadow-md);
}

.btn-primary:disabled {
  background: var(--chrome-surface-variant);
  color: var(--chrome-on-surface-variant);
  cursor: not-allowed;
}

.btn-secondary {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--chrome-surface-variant);
  color: var(--chrome-on-surface);
  border: 1px solid var(--chrome-outline);
  border-radius: var(--radius-md);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #e8eaed;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: background 0.2s ease;
}

.btn-icon:hover {
  background: var(--chrome-surface-variant);
}

/* Form */
#task-form {
  padding: var(--spacing-md);
}

#task-form h3 {
  font-size: var(--font-size-md);
  font-weight: 500;
  margin-bottom: var(--spacing-md);
}

select, textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--chrome-outline);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--chrome-on-surface);
  background: var(--chrome-surface);
  margin-bottom: var(--spacing-md);
  transition: border-color 0.2s ease;
}

select:focus, textarea:focus {
  outline: none;
  border-color: var(--chrome-primary);
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.1);
}

textarea {
  resize: vertical;
  min-height: 120px;
}

/* Progress */
.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--chrome-surface-variant);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin: var(--spacing-md) 0;
}

#progress-fill {
  height: 100%;
  background: var(--chrome-success);
  transition: width 0.3s ease;
}

/* Items List */
#items-list {
  margin: var(--spacing-md) 0;
}

.item-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
  margin-bottom: var(--spacing-xs);
}

.item-status {
  font-size: 16px;
}

.item-status.added {
  color: var(--chrome-success);
}

.item-status.failed {
  color: var(--chrome-error);
}

.item-status.searching {
  color: var(--chrome-primary);
}

.item-name {
  flex: 1;
  font-size: var(--font-size-sm);
}

/* Stats */
.stats {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-top: 1px solid var(--chrome-outline);
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 500;
  color: var(--chrome-primary);
}

.stat-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--chrome-on-surface-variant);
  margin-top: var(--spacing-xs);
}

/* QR Section */
.qr-container {
  padding: var(--spacing-lg);
  text-align: center;
}

#extension-qr-display {
  display: inline-block;
  padding: var(--spacing-md);
  background: white;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.qr-status {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-md);
  color: var(--chrome-on-surface-variant);
}

.qr-status.success {
  color: var(--chrome-success);
}

.qr-status.error {
  color: var(--chrome-error);
}

.qr-timer {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--chrome-on-surface-variant);
}

.qr-timer.expired {
  color: var(--chrome-error);
}

.qr-instructions {
  padding: var(--spacing-md);
  background: var(--chrome-surface-variant);
  border-radius: var(--radius-md);
  margin: var(--spacing-md);
  text-align: left;
}

.qr-instructions h4 {
  font-size: var(--font-size-md);
  font-weight: 500;
  margin-bottom: var(--spacing-sm);
}

.qr-instructions ol {
  margin-left: var(--spacing-lg);
  font-size: var(--font-size-sm);
  color: var(--chrome-on-surface-variant);
}

.qr-instructions li {
  margin-bottom: var(--spacing-xs);
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## Testing Checklist

### ✅ Mobile QR Flow Testing

1. **QR Generation**
   - [ ] Click "Show QR Code" button
   - [ ] QR code displays correctly
   - [ ] Session token is generated
   - [ ] Timer starts counting down from 15:00

2. **Mobile Scanning**
   - [ ] Open Sally Mobile app
   - [ ] Scan QR code with shopping list
   - [ ] Extension receives list via API polling
   - [ ] Items populate in form
   - [ ] Shopping starts automatically

3. **Progress Updates**
   - [ ] Extension sends progress to API
   - [ ] Mobile app receives real-time updates
   - [ ] Progress bar updates in side panel
   - [ ] Items show correct status (pending/added/failed)

4. **Session Expiration**
   - [ ] Timer counts down correctly
   - [ ] Session expires after 15 minutes
   - [ ] "Refresh" button generates new QR
   - [ ] Old session stops polling

5. **Error Handling**
   - [ ] API errors don't crash extension
   - [ ] Failed items show error status
   - [ ] User can retry shopping
   - [ ] Session cleanup on errors

### ✅ Side Panel Testing

1. **Opening**
   - [ ] Click extension icon opens side panel
   - [ ] Side panel stays open when clicking page
   - [ ] Side panel persists across tab switches
   - [ ] Side panel closes with X button

2. **UI**
   - [ ] All sections render correctly
   - [ ] Buttons are clickable
   - [ ] Forms are functional
   - [ ] Scrolling works smoothly

3. **State Persistence**
   - [ ] Shopping continues if side panel closed
   - [ ] Progress updates even when panel closed
   - [ ] Reopening panel shows current state

---

## Deployment Steps

1. **Test locally**:
   ```bash
   # Load unpacked extension in Chrome
   chrome://extensions/ → Developer mode → Load unpacked
   # Select heysalad-ai-shopper directory
   ```

2. **Test mobile flow**:
   - Generate QR in extension
   - Scan with Sally Mobile (staging)
   - Verify shopping works end-to-end

3. **Update version**:
   - Bump version to 2.0.0 in manifest.json
   - Update changelog

4. **Deploy to Chrome Web Store**:
   - Package extension
   - Upload to Chrome Web Store
   - Submit for review

---

## Rollback Plan

If issues occur:

1. **Keep popup as fallback**:
   - Don't delete `popup/` directory yet
   - Can revert manifest.json to use popup

2. **Feature flag**:
   ```javascript
   // In background/service-worker.js
   const USE_SIDE_PANEL = true; // Set to false to revert
   
   if (USE_SIDE_PANEL && chrome.sidePanel) {
     // Use side panel
   } else {
     // Use popup
   }
   ```

---

## Success Criteria

✅ Side panel opens and stays open  
✅ Mobile QR flow works identically to popup version  
✅ Session polling continues in background  
✅ Progress updates reach mobile app  
✅ No console errors  
✅ All existing features work  

---

**Next Phase**: Phase 2 - Tab Badges (see CLAUDE_STYLE_UX_TASKS.md)

**Questions?** Review CLAUDE_STYLE_WITH_MOBILE_INTEGRATION.md for full context.
