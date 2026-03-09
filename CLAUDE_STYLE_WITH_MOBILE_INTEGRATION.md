# Claude-Style UX with Mobile Integration Preserved

## Overview

This plan upgrades the HeySalad AI Shopper extension to Claude/Anthropic-style UX **while preserving** the existing mobile-to-extension QR flow that's already working.

**Key Principle**: The mobile integration is a killer feature - we're keeping it and making it even better with the new UX.

---

## What We're Keeping (Mobile Integration)

### ✅ Existing Mobile-to-Extension Flow
All of this stays and works in the new side panel:

1. **QR Code Generation** (Extension → Mobile)
   - User clicks "Show QR Code" in extension
   - Mobile app scans QR with shopping list
   - Extension receives list and starts shopping
   - Real-time progress updates via WebSocket

2. **Token-Based Sessions**
   - Session tokens: `ext_${timestamp}_${random}`
   - 15-minute expiration
   - API polling: `sally-api.heysalad-o.workers.dev/api/extension/token/${token}`
   - Progress updates: `POST /api/extension/token/${token}/progress`

3. **WebSocket Real-Time Updates**
   - `ShoppingWebSocketClient` in background worker
   - <100ms latency for progress updates
   - Automatic reconnection
   - Mobile app sees live shopping progress

4. **Existing API Endpoints**
   - `GET /api/extension/token/${token}` - Check for shopping list
   - `POST /api/extension/token/${token}/start` - Notify shopping started
   - `POST /api/extension/token/${token}/progress` - Send progress updates

---

## What We're Upgrading (UX)

### 🎨 New Claude-Style Interface

#### 1. Side Panel (Instead of Popup)
**Before**: Popup that closes when clicking outside
**After**: Persistent side panel that stays open

```javascript
// manifest.json
{
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "permissions": ["sidePanel", "storage", "activeTab", "scripting", "tabs"]
}
```

**Mobile Integration in Side Panel**:
- QR code section stays visible while browsing
- Real-time progress updates don't disappear
- User can switch tabs while Sally shops
- Mobile app progress shows in persistent panel

#### 2. Tab Badges (New)
**What**: Visual indicator on extension icon showing which tab is shopping

```javascript
// Badge states
const BADGE_STATES = {
  shopping: { text: '🛒', color: '#4CAF50', title: 'Sally is shopping' },
  ready: { text: '✓', color: '#FFA726', title: 'Ready to shop' },
  waiting_mobile: { text: '📱', color: '#2196F3', title: 'Waiting for mobile' },
  complete: { text: '✓', color: '#66BB6A', title: 'Shopping complete' }
};
```

**Mobile Integration**:
- Badge shows "📱" when waiting for mobile to send list
- Badge shows "🛒" when shopping from mobile list
- Badge updates in real-time as mobile sends progress

#### 3. Corner Indicator (Instead of Overlay)
**Before**: Intrusive floating overlay
**After**: Subtle top-left corner indicator

```css
.sally-corner-indicator {
  position: fixed;
  top: 16px;
  left: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px 16px;
  cursor: pointer;
}
```

**Mobile Integration**:
- Shows "Waiting for mobile..." when QR is active
- Shows "Shopping from mobile list..." when active
- Click opens side panel with full progress

---

## Implementation Plan with Mobile Integration

### Phase 1: Side Panel Migration (Keep Mobile Flow)

#### Step 1.1: Create Side Panel Structure
```bash
heysalad-ai-shopper/
├── sidepanel/
│   ├── sidepanel.html          # Migrated from popup.html
│   ├── sidepanel.js            # Migrated from popup.js
│   ├── sidepanel.css           # Migrated from popup.css
│   └── components/
│       ├── qr-generator.js     # ✅ KEEP - Mobile QR generation
│       ├── qr-scanner.js       # ✅ KEEP - Scan mobile QR
│       ├── shopping-progress.js # ✅ KEEP - Real-time progress
│       └── session-manager.js   # ✅ KEEP - Token sessions
```

#### Step 1.2: Migrate Mobile QR Functionality
**Keep these functions from popup.js**:

```javascript
// ✅ KEEP - QR Code Generation for Mobile
async function showExtensionQR() {
  const sessionToken = generateExtensionSessionToken();
  const qrData = `heysalad://extension-link?token=${sessionToken}`;
  
  // Generate QR in side panel (not popup)
  new QRCode(qrDisplay, {
    text: qrData,
    width: 256,
    height: 256
  });
  
  // Start polling for mobile list
  startSessionPolling(sessionToken);
  startSessionTimer(expiresAt);
}

// ✅ KEEP - Session Polling
async function startSessionPolling(sessionToken) {
  sessionPollInterval = setInterval(async () => {
    const response = await fetch(
      `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionToken}`
    );
    
    const data = await response.json();
    
    if (data.status === 'ready' && data.shopping_list) {
      // Start shopping with mobile list
      await startShoppingFromMobile(data.shopping_list, data.store);
    }
  }, 2000);
}

// ✅ KEEP - WebSocket Progress Updates
async function sendProgressUpdate(sessionId, progress) {
  await fetch(
    `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/progress`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress)
    }
  );
}
```

#### Step 1.3: Update Side Panel HTML
**Keep mobile integration UI**:

```html
<!-- sidepanel/sidepanel.html -->
<div class="side-panel">
  <!-- Header -->
  <header class="panel-header">
    <h1>Sally</h1>
    <span class="badge">by HeySalad®</span>
  </header>
  
  <!-- ✅ KEEP - Mobile QR Section -->
  <section class="mobile-integration">
    <button class="btn-primary" id="show-mobile-qr">
      📱 Shop from Mobile
    </button>
    
    <!-- QR Display (shown when button clicked) -->
    <div id="qr-section" class="hidden">
      <h3>Scan with Sally Mobile</h3>
      <div id="qr-display"></div>
      <p class="status" id="qr-status">⏳ Waiting for mobile...</p>
      <p class="timer" id="qr-timer">Expires in 15:00</p>
    </div>
  </section>
  
  <!-- Shopping List Form -->
  <section class="shopping-form">
    <h3>Or enter manually</h3>
    <textarea id="items-input" placeholder="Enter items..."></textarea>
    <button id="start-shopping">🛒 Start Shopping</button>
  </section>
  
  <!-- ✅ KEEP - Real-time Progress -->
  <section id="progress-section" class="hidden">
    <h3>Shopping in Progress</h3>
    <div class="progress-bar">
      <div id="progress-fill"></div>
    </div>
    <div id="items-list"></div>
  </section>
</div>
```

### Phase 2: Tab Badges with Mobile States

#### Step 2.1: Add Mobile-Specific Badge States
```javascript
// background/badge-controller.js (NEW FILE)

class BadgeController {
  constructor() {
    this.activeStates = new Map(); // tabId -> state
  }
  
  // ✅ NEW - Mobile waiting state
  setWaitingForMobile(tabId, sessionToken) {
    chrome.action.setBadgeText({ text: '📱', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#2196F3', tabId });
    chrome.action.setTitle({ 
      title: `Waiting for mobile (${sessionToken.slice(0, 8)}...)`, 
      tabId 
    });
    this.activeStates.set(tabId, 'waiting_mobile');
  }
  
  // ✅ NEW - Shopping from mobile
  setShoppingFromMobile(tabId, itemCount) {
    chrome.action.setBadgeText({ text: '🛒', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
    chrome.action.setTitle({ 
      title: `Shopping ${itemCount} items from mobile`, 
      tabId 
    });
    this.activeStates.set(tabId, 'shopping_mobile');
  }
  
  // ✅ KEEP - Regular shopping state
  setShopping(tabId, itemCount) {
    chrome.action.setBadgeText({ text: '🛒', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
    chrome.action.setTitle({ 
      title: `Shopping ${itemCount} items`, 
      tabId 
    });
    this.activeStates.set(tabId, 'shopping');
  }
  
  clearBadge(tabId) {
    chrome.action.setBadgeText({ text: '', tabId });
    this.activeStates.delete(tabId);
  }
}

// Export singleton
export const badgeController = new BadgeController();
```

#### Step 2.2: Update Background Worker
```javascript
// background/service-worker.js

import { badgeController } from './badge-controller.js';

// ✅ KEEP - Handle mobile QR session
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MOBILE_QR_GENERATED') {
    const { sessionToken, tabId } = message.data;
    badgeController.setWaitingForMobile(tabId, sessionToken);
  }
  
  if (message.type === 'MOBILE_LIST_RECEIVED') {
    const { itemCount, tabId } = message.data;
    badgeController.setShoppingFromMobile(tabId, itemCount);
  }
  
  // ... rest of message handlers
});
```

### Phase 3: Corner Indicator with Mobile Status

#### Step 3.1: Create Corner Indicator Component
```javascript
// content-scripts/corner-indicator.js

class SallyCornerIndicator {
  constructor() {
    this.indicator = null;
    this.state = 'idle';
  }
  
  create() {
    this.indicator = document.createElement('div');
    this.indicator.className = 'sally-corner-indicator';
    this.indicator.innerHTML = `
      <div class="indicator-icon">
        <img src="${chrome.runtime.getURL('icons/icon16.png')}" />
      </div>
      <div class="indicator-text">Sally</div>
      <div class="indicator-status">Ready</div>
    `;
    
    // Click opens side panel
    this.indicator.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    });
    
    document.body.appendChild(this.indicator);
  }
  
  // ✅ NEW - Mobile waiting state
  setWaitingForMobile(sessionToken) {
    this.state = 'waiting_mobile';
    this.indicator.querySelector('.indicator-status').textContent = 
      'Waiting for mobile...';
    this.indicator.className = 'sally-corner-indicator waiting';
  }
  
  // ✅ NEW - Shopping from mobile
  setShoppingFromMobile(itemCount, currentItem) {
    this.state = 'shopping_mobile';
    this.indicator.querySelector('.indicator-status').textContent = 
      `Shopping from mobile: ${currentItem}`;
    this.indicator.className = 'sally-corner-indicator shopping';
  }
  
  // ✅ KEEP - Regular shopping
  setShopping(currentItem) {
    this.state = 'shopping';
    this.indicator.querySelector('.indicator-status').textContent = 
      `Adding ${currentItem}...`;
    this.indicator.className = 'sally-corner-indicator shopping';
  }
  
  setComplete(itemsAdded) {
    this.state = 'complete';
    this.indicator.querySelector('.indicator-status').textContent = 
      `${itemsAdded} items added ✓`;
    this.indicator.className = 'sally-corner-indicator complete';
  }
}

// Initialize
const indicator = new SallyCornerIndicator();
indicator.create();

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_INDICATOR') {
    const { state, data } = message;
    
    switch (state) {
      case 'waiting_mobile':
        indicator.setWaitingForMobile(data.sessionToken);
        break;
      case 'shopping_mobile':
        indicator.setShoppingFromMobile(data.itemCount, data.currentItem);
        break;
      case 'shopping':
        indicator.setShopping(data.currentItem);
        break;
      case 'complete':
        indicator.setComplete(data.itemsAdded);
        break;
    }
  }
});
```

#### Step 3.2: Style Corner Indicator
```css
/* content-scripts/corner-indicator.css */

.sally-corner-indicator {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 999999;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sally-corner-indicator:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}

/* ✅ NEW - Mobile waiting state */
.sally-corner-indicator.waiting {
  border-left: 3px solid #2196F3;
}

.sally-corner-indicator.waiting .indicator-icon {
  animation: pulse 2s ease-in-out infinite;
}

/* ✅ KEEP - Shopping state */
.sally-corner-indicator.shopping {
  border-left: 3px solid #4CAF50;
}

.sally-corner-indicator.shopping .indicator-icon {
  animation: spin 1s linear infinite;
}

/* Complete state */
.sally-corner-indicator.complete {
  border-left: 3px solid #66BB6A;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

## Mobile Integration Flow (Updated for Side Panel)

### Flow 1: Mobile → Extension (QR Scan)

```
1. User opens extension side panel
2. User clicks "📱 Shop from Mobile"
3. Extension generates QR code with session token
   └─ Badge: 📱 "Waiting for mobile"
   └─ Corner indicator: "Waiting for mobile..."
   
4. User opens Sally Mobile app
5. User taps "Shop with Sally" → Scans QR
6. Mobile sends shopping list to API:
   POST /api/extension/token/${token}
   {
     "shopping_list": { "items": [...] },
     "store": "tesco"
   }
   
7. Extension polls API, receives list
   └─ Badge: 🛒 "Shopping 5 items from mobile"
   └─ Corner indicator: "Shopping from mobile: Milk"
   └─ Side panel: Shows real-time progress
   
8. Extension shops autonomously
9. Extension sends progress updates:
   POST /api/extension/token/${token}/progress
   {
     "itemsAdded": 3,
     "itemsFailed": 0,
     "totalItems": 5,
     "percentage": 60
   }
   
10. Mobile app shows live progress via WebSocket
11. Shopping completes
    └─ Badge: ✓ "Complete"
    └─ Corner indicator: "5 items added ✓"
    └─ Side panel: Shows summary
```

### Flow 2: Extension → Mobile (Progress Updates)

```
Extension (Side Panel)          API                    Mobile App
      |                          |                          |
      |-- POST /progress ------->|                          |
      |   (itemsAdded: 3)        |                          |
      |                          |-- WebSocket push ------->|
      |                          |   (60% complete)         |
      |                          |                          |
      |                          |                    [Shows progress]
```

---

## Key Benefits of This Approach

### ✅ Keeps What Works
1. **Mobile QR flow** - Unchanged, just better UI
2. **WebSocket updates** - Still <100ms latency
3. **Token sessions** - Same 15-minute expiration
4. **API endpoints** - No changes needed

### ✨ Adds Claude-Style Polish
1. **Persistent side panel** - No more popup closing
2. **Tab badges** - See which tab is shopping
3. **Corner indicator** - Less intrusive than overlay
4. **Native Chrome design** - Professional look

### 🚀 Enhanced Mobile Experience
1. **Better visibility** - Side panel stays open during shopping
2. **Multi-tab support** - Badge shows active tab
3. **Clearer status** - Corner indicator shows mobile state
4. **Smoother UX** - No popup interruptions

---

## Migration Checklist

### Phase 1: Side Panel (Week 1)
- [ ] Create `sidepanel/` directory
- [ ] Migrate popup.html → sidepanel.html
- [ ] Migrate popup.js → sidepanel.js (keep mobile functions)
- [ ] Update manifest.json with side_panel config
- [ ] Test QR generation in side panel
- [ ] Test session polling in side panel
- [ ] Test progress updates in side panel

### Phase 2: Badges (Week 1)
- [ ] Create `background/badge-controller.js`
- [ ] Add mobile badge states (📱, 🛒)
- [ ] Update service worker with badge logic
- [ ] Test badge updates during mobile flow
- [ ] Test badge persistence across tabs

### Phase 3: Corner Indicator (Week 2)
- [ ] Create `content-scripts/corner-indicator.js`
- [ ] Add mobile status states
- [ ] Style with glassmorphism
- [ ] Test indicator during mobile shopping
- [ ] Remove old overlay code

### Phase 4: Testing (Week 2)
- [ ] Test full mobile-to-extension flow
- [ ] Test extension-to-mobile progress updates
- [ ] Test WebSocket real-time updates
- [ ] Test session expiration
- [ ] Test multi-tab scenarios

---

## Next Steps

1. **Review this plan** - Confirm mobile integration is preserved
2. **Start Phase 1** - Migrate to side panel (keep mobile code)
3. **Test mobile flow** - Ensure QR scanning still works
4. **Add badges** - Enhance with tab indicators
5. **Polish UI** - Apply Chrome Material Design 3

**Key Principle**: Every change preserves the mobile integration. We're upgrading the container (popup → side panel), not changing the content (mobile flow stays).

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Status**: Ready for Implementation with Mobile Integration Preserved
