# START HERE: Phase 1 Implementation

## Quick Start Guide

This is your starting point for upgrading the HeySalad AI Shopper extension to Claude-style UX while preserving the mobile-to-extension QR flow.

---

## What You're About to Do

**Goal**: Migrate from popup to side panel (3-5 hours)

**What stays the same**:
- ✅ Mobile QR code generation
- ✅ Session polling (checks API every 2 seconds)
- ✅ Progress updates to mobile
- ✅ All existing shopping functionality

**What changes**:
- 📦 Popup → Side Panel (persistent, doesn't close)
- 🎨 New Chrome Material Design 3 styling
- 📁 Better file organization

---

## Prerequisites

1. **Chrome Canary** (for Side Panel API testing)
   - Download: https://www.google.com/chrome/canary/
   - Side Panel API requires Chrome 114+

2. **Current extension working**
   - Test mobile QR flow works in current version
   - Note: You'll preserve this exact functionality

3. **Sally Mobile app** (for testing)
   - Staging environment ready
   - Can scan QR codes

---

## Step-by-Step (30 minutes to first working version)

### Step 1: Create Directory Structure (2 min)

```bash
cd heysalad-payme/heysalad-ai-shopper

# Create new directories
mkdir -p sidepanel/components

# You'll create these files:
# sidepanel/sidepanel.html
# sidepanel/sidepanel.js
# sidepanel/sidepanel.css
# sidepanel/components/mobile-qr.js
```

### Step 2: Update manifest.json (3 min)

Open `manifest.json` and add:

```json
{
  "manifest_version": 3,
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

**Key changes**:
- Added `"side_panel"` config
- Added `"sidePanel"` permission
- Removed `"default_popup"` (side panel replaces it)

### Step 3: Copy Mobile QR Functions (5 min)

Create `sidepanel/components/mobile-qr.js`:

```bash
# Copy the mobile QR functions from popup.js (lines 1100-1401)
# See PHASE_1_SIDE_PANEL_MIGRATION.md for the complete code
```

**Critical functions to include**:
- `showExtensionQR()` - Generates QR with session token
- `startSessionPolling()` - Polls API every 2 seconds
- `startSessionTimer()` - 15-minute countdown
- `startShoppingFromMobile()` - Receives list from mobile
- `sendProgressUpdate()` - Sends progress to API
- `generateExtensionSessionToken()` - Creates unique token

### Step 4: Create Side Panel HTML (10 min)

Create `sidepanel/sidepanel.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Sally</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div id="main-section">
    <header class="panel-header">
      <h1>Sally</h1>
      <span class="badge">by HeySalad®</span>
    </header>
    
    <!-- ✅ KEEP - Mobile QR Section -->
    <section class="mobile-integration">
      <h3>Shop from Mobile</h3>
      <button class="btn-primary" id="show-qr-code-btn">
        📱 Show QR Code
      </button>
    </section>
    
    <!-- Shopping Form -->
    <section id="task-form">
      <h3>Or enter manually</h3>
      <select id="store-select">
        <option value="">Auto-detect</option>
        <option value="tesco">Tesco</option>
        <option value="sainsburys">Sainsbury's</option>
      </select>
      <textarea id="items-input" rows="8"></textarea>
      <button id="start-btn" class="btn-primary">🛒 Let Sally Shop!</button>
    </section>
  </div>
  
  <!-- ✅ KEEP - Extension QR Section -->
  <div id="extension-qr-section" class="hidden">
    <header class="panel-header">
      <h2>Scan with Mobile</h2>
      <button id="extension-qr-cancel-btn">✕</button>
    </header>
    <div class="qr-container">
      <div id="extension-qr-display"></div>
      <p id="extension-qr-status">⏳ Waiting for mobile...</p>
      <p id="extension-qr-timer">Expires in 15:00</p>
    </div>
  </div>
  
  <script src="../popup/qrcode.min.js"></script>
  <script src="components/mobile-qr.js"></script>
  <script src="sidepanel.js"></script>
</body>
</html>
```

### Step 5: Create Side Panel JS (5 min)

Create `sidepanel/sidepanel.js`:

```javascript
// Setup event listeners for mobile QR
document.addEventListener('DOMContentLoaded', () => {
  const showQRBtn = document.getElementById('show-qr-code-btn');
  const qrCancelBtn = document.getElementById('extension-qr-cancel-btn');
  
  if (showQRBtn) {
    showQRBtn.addEventListener('click', () => window.MobileQR.showExtensionQR());
  }
  if (qrCancelBtn) {
    qrCancelBtn.addEventListener('click', () => window.MobileQR.closeExtensionQR());
  }
  
  // ... rest of your existing popup.js logic
});
```

### Step 6: Add Side Panel Opening Logic (3 min)

Update `background/service-worker.js`:

```javascript
// Open side panel when extension icon clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[Sally] Failed to open side panel:', error);
  }
});
```

### Step 7: Test! (2 min)

1. Open Chrome Canary
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `heysalad-ai-shopper` directory
6. Click extension icon → Side panel should open!

---

## Testing the Mobile QR Flow

### Test 1: QR Generation

1. Click "📱 Show QR Code" in side panel
2. **Expected**: QR code displays, timer starts at 15:00
3. **Check console**: Should see `[Sally] Extension QR displayed, token: ext_...`

### Test 2: Mobile Scanning

1. Open Sally Mobile app (staging)
2. Navigate to "Shop with Sally"
3. Scan the QR code
4. **Expected**: Extension receives list, starts shopping
5. **Check console**: Should see `[Sally] Shopping list received!`

### Test 3: Progress Updates

1. While shopping, check mobile app
2. **Expected**: Real-time progress updates (<2 second delay)
3. **Check console**: Should see `[Sally] Progress update sent: X%`

### Test 4: Session Expiration

1. Generate QR code
2. Wait 15 minutes (or modify timer for testing)
3. **Expected**: "Session expired" message, polling stops

---

## Common Issues & Fixes

### Issue: Side panel doesn't open

**Fix**: Check Chrome version (need 114+)
```javascript
if (!chrome.sidePanel) {
  console.error('Side Panel API not available');
}
```

### Issue: QR code doesn't generate

**Fix**: Check if QRCode library loaded
```javascript
if (typeof QRCode === 'undefined') {
  console.error('QRCode library not loaded');
}
```

### Issue: Mobile not receiving progress

**Fix**: Check API endpoint and session ID
```javascript
console.log('[Sally] Session ID:', sessionId);
console.log('[Sally] API endpoint:', `sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/progress`);
```

### Issue: Polling not working

**Fix**: Check interval is running
```javascript
console.log('[Sally] Polling interval:', sessionPollInterval);
```

---

## Next Steps After Phase 1 Works

Once side panel + mobile QR flow is working:

1. ✅ **Phase 1 Complete** - Side panel with mobile integration
2. 📋 **Phase 2** - Add tab badges (see CLAUDE_STYLE_UX_TASKS.md)
3. 🎨 **Phase 3** - Add corner indicator
4. 💅 **Phase 4** - Polish with Chrome Material Design 3

---

## Need Help?

**Full implementation details**: See `PHASE_1_SIDE_PANEL_MIGRATION.md`

**Mobile integration context**: See `CLAUDE_STYLE_WITH_MOBILE_INTEGRATION.md`

**All tasks**: See `CLAUDE_STYLE_UX_TASKS.md`

**Architecture overview**: See `CLAUDE_STYLE_UX_UPGRADE_PLAN.md`

---

## Quick Commands

```bash
# Create directories
mkdir -p sidepanel/components

# Copy QRCode library (if needed)
cp popup/qrcode.min.js sidepanel/

# Test in Chrome Canary
open -a "Google Chrome Canary" --args --load-extension=$(pwd)

# Watch for changes (if using build tool)
npm run watch
```

---

**Estimated Time**: 30 minutes to first working version, 3-5 hours for complete Phase 1

**Status**: Ready to implement

**Priority**: HIGH - This is the foundation for all other improvements

Let's get started! 🚀
