# Mobile-to-Extension Integration Flow

## Visual Flow Diagram

This document shows exactly how the mobile-to-extension QR flow works and how it's preserved in the new side panel UX.

---

## Current Flow (Popup) → New Flow (Side Panel)

### Step 1: User Opens Extension

**Current (Popup)**:
```
User clicks extension icon
  ↓
Popup opens (400px width)
  ↓
Shows "📱 Show QR Code" button
```

**New (Side Panel)**:
```
User clicks extension icon
  ↓
Side panel opens (400px width, persistent)
  ↓
Shows "📱 Show QR Code" button
  ↓
✅ SAME BUTTON, SAME FUNCTION
```

---

### Step 2: QR Code Generation

**Current (Popup)**:
```javascript
// popup/popup.js line 1100
showExtensionQR()
  ↓
sessionToken = generateExtensionSessionToken()
  // Returns: "ext_1738012345_abc123def456"
  ↓
QRCode.generate("heysalad://extension-link?token=ext_1738012345_abc123def456")
  ↓
Display QR in popup
  ↓
Start polling API every 2 seconds
  ↓
Start 15-minute countdown timer
```

**New (Side Panel)**:
```javascript
// sidepanel/components/mobile-qr.js
showExtensionQR()
  ↓
sessionToken = generateExtensionSessionToken()
  // Returns: "ext_1738012345_abc123def456"
  ↓
QRCode.generate("heysalad://extension-link?token=ext_1738012345_abc123def456")
  ↓
Display QR in side panel
  ↓
Start polling API every 2 seconds
  ↓
Start 15-minute countdown timer
  ↓
✅ IDENTICAL LOGIC, JUST IN SIDE PANEL
```

---

### Step 3: Mobile Scans QR

**Mobile App Flow** (unchanged):
```
Sally Mobile App
  ↓
User taps "Shop with Sally"
  ↓
Camera opens
  ↓
Scans QR code: "heysalad://extension-link?token=ext_1738012345_abc123def456"
  ↓
Extracts token: "ext_1738012345_abc123def456"
  ↓
Sends shopping list to API:
  POST sally-api.heysalad-o.workers.dev/api/extension/token/ext_1738012345_abc123def456
  Body: {
    shopping_list: {
      items: [
        { name: "Milk", quantity: 2 },
        { name: "Bread", quantity: 1 }
      ]
    },
    store: "tesco"
  }
  ↓
API stores shopping list
  ↓
Mobile shows "Sent to extension! ✓"
```

---

### Step 4: Extension Receives List

**Current (Popup)**:
```javascript
// popup/popup.js line 1150
setInterval(async () => {
  const response = await fetch(
    `sally-api.heysalad-o.workers.dev/api/extension/token/${sessionToken}`
  );
  const data = await response.json();
  
  if (data.status === 'ready' && data.shopping_list) {
    // Shopping list received!
    clearInterval(sessionPollInterval);
    startShoppingFromMobile(data.shopping_list, data.store);
  }
}, 2000); // Poll every 2 seconds
```

**New (Side Panel)**:
```javascript
// sidepanel/components/mobile-qr.js
setInterval(async () => {
  const response = await fetch(
    `sally-api.heysalad-o.workers.dev/api/extension/token/${sessionToken}`
  );
  const data = await response.json();
  
  if (data.status === 'ready' && data.shopping_list) {
    // Shopping list received!
    clearInterval(sessionPollInterval);
    startShoppingFromMobile(data.shopping_list, data.store);
  }
}, 2000); // Poll every 2 seconds
  ↓
✅ IDENTICAL POLLING LOGIC
```

---

### Step 5: Extension Starts Shopping

**Current (Popup)**:
```javascript
// popup/popup.js line 1250
startShoppingFromMobile(shoppingList, store)
  ↓
Populate form with items
  ↓
Send to background script:
  chrome.runtime.sendMessage({
    type: 'START_SHOPPING',
    data: {
      store: 'tesco',
      items: [
        { name: "Milk", quantity: 2 },
        { name: "Bread", quantity: 1 }
      ],
      sessionId: 'ext_1738012345_abc123def456'
    }
  })
  ↓
Background script starts autonomous shopping
```

**New (Side Panel)**:
```javascript
// sidepanel/components/mobile-qr.js
startShoppingFromMobile(shoppingList, store)
  ↓
Populate form with items
  ↓
Send to background script:
  chrome.runtime.sendMessage({
    type: 'START_SHOPPING',
    data: {
      store: 'tesco',
      items: [
        { name: "Milk", quantity: 2 },
        { name: "Bread", quantity: 1 }
      ],
      sessionId: 'ext_1738012345_abc123def456'
    }
  })
  ↓
Background script starts autonomous shopping
  ↓
✅ IDENTICAL SHOPPING LOGIC
```

---

### Step 6: Progress Updates to Mobile

**Current (Popup)**:
```javascript
// popup/popup.js line 1300
sendProgressUpdate(sessionId, {
  itemsAdded: 1,
  itemsFailed: 0,
  totalItems: 2,
  percentage: 50,
  items: [
    { name: "Milk", quantity: 2, status: "added" },
    { name: "Bread", quantity: 1, status: "pending" }
  ]
})
  ↓
POST sally-api.heysalad-o.workers.dev/api/extension/token/ext_1738012345_abc123def456/progress
  ↓
API broadcasts to mobile via WebSocket
  ↓
Mobile shows: "Adding items... 50% (1/2)"
```

**New (Side Panel)**:
```javascript
// sidepanel/components/mobile-qr.js
sendProgressUpdate(sessionId, {
  itemsAdded: 1,
  itemsFailed: 0,
  totalItems: 2,
  percentage: 50,
  items: [
    { name: "Milk", quantity: 2, status: "added" },
    { name: "Bread", quantity: 1, status: "pending" }
  ]
})
  ↓
POST sally-api.heysalad-o.workers.dev/api/extension/token/ext_1738012345_abc123def456/progress
  ↓
API broadcasts to mobile via WebSocket
  ↓
Mobile shows: "Adding items... 50% (1/2)"
  ↓
✅ IDENTICAL PROGRESS UPDATES
```

---

## Key Differences: Popup vs Side Panel

| Feature | Popup | Side Panel |
|---------|-------|------------|
| **Opens when** | Click icon | Click icon |
| **Stays open** | ❌ Closes on outside click | ✅ Stays open |
| **QR Generation** | ✅ Same function | ✅ Same function |
| **Session Polling** | ✅ Every 2 seconds | ✅ Every 2 seconds |
| **Progress Updates** | ✅ Sends to API | ✅ Sends to API |
| **Mobile Integration** | ✅ Works | ✅ Works (identical) |
| **Width** | 400px | 400px |
| **Persistence** | ❌ Closes easily | ✅ Persistent |
| **Multi-tab** | ❌ Limited | ✅ Full support |

---

## Timeline Comparison

### Popup Flow (Current)
```
0:00 - User clicks extension icon
0:01 - Popup opens
0:02 - User clicks "Show QR Code"
0:03 - QR displays, polling starts
0:05 - Mobile scans QR
0:06 - Mobile sends list to API
0:08 - Extension polls API, receives list (2-second delay)
0:09 - Shopping starts
0:10 - First progress update sent
0:11 - Mobile receives progress (WebSocket, <100ms)
0:30 - Shopping complete
```

### Side Panel Flow (New)
```
0:00 - User clicks extension icon
0:01 - Side panel opens
0:02 - User clicks "Show QR Code"
0:03 - QR displays, polling starts
0:05 - Mobile scans QR
0:06 - Mobile sends list to API
0:08 - Extension polls API, receives list (2-second delay)
0:09 - Shopping starts
0:10 - First progress update sent
0:11 - Mobile receives progress (WebSocket, <100ms)
0:30 - Shopping complete
  ↓
✅ IDENTICAL TIMING
```

---

## Code Mapping: Where Functions Move

### From popup/popup.js → To sidepanel/components/mobile-qr.js

| Function | Old Location | New Location | Changes |
|----------|--------------|--------------|---------|
| `showExtensionQR()` | popup.js:1100 | mobile-qr.js:10 | None |
| `startSessionPolling()` | popup.js:1150 | mobile-qr.js:50 | None |
| `startSessionTimer()` | popup.js:1200 | mobile-qr.js:90 | None |
| `startShoppingFromMobile()` | popup.js:1250 | mobile-qr.js:120 | None |
| `sendProgressUpdate()` | popup.js:1300 | mobile-qr.js:150 | None |
| `generateExtensionSessionToken()` | popup.js:1350 | mobile-qr.js:180 | None |
| `closeExtensionQR()` | popup.js:1370 | mobile-qr.js:190 | None |
| `refreshExtensionQR()` | popup.js:1390 | mobile-qr.js:200 | None |

**Total changes to mobile functions**: 0 (zero)  
**Total lines of mobile code**: ~300 lines  
**Percentage preserved**: 100%

---

## API Endpoints (Unchanged)

### 1. Check for Shopping List
```
GET sally-api.heysalad-o.workers.dev/api/extension/token/${token}

Response:
{
  "status": "ready",
  "shopping_list": {
    "items": [
      { "name": "Milk", "quantity": 2 },
      { "name": "Bread", "quantity": 1 }
    ]
  },
  "store": "tesco"
}
```

### 2. Notify Shopping Started
```
POST sally-api.heysalad-o.workers.dev/api/extension/token/${token}/start

Response:
{
  "success": true
}
```

### 3. Send Progress Update
```
POST sally-api.heysalad-o.workers.dev/api/extension/token/${token}/progress

Body:
{
  "itemsAdded": 1,
  "itemsFailed": 0,
  "totalItems": 2,
  "percentage": 50,
  "items": [
    { "name": "Milk", "quantity": 2, "status": "added" },
    { "name": "Bread", "quantity": 1, "status": "pending" }
  ]
}

Response:
{
  "success": true
}
```

---

## Session Token Format (Unchanged)

```javascript
// Format: ext_${timestamp}_${random}
const sessionToken = generateExtensionSessionToken();
// Example: "ext_1738012345_abc123def456"

// Breakdown:
// - "ext_" prefix (identifies extension sessions)
// - "1738012345" (timestamp in base36)
// - "_" separator
// - "abc123def456" (random string)

// Properties:
// - Unique per session
// - 15-minute expiration
// - Used for API polling
// - Used for progress updates
```

---

## WebSocket Integration (Unchanged)

```
Extension                    API                      Mobile App
    |                         |                           |
    |-- POST /progress ------>|                           |
    |   (itemsAdded: 1)       |                           |
    |                         |-- WebSocket push -------->|
    |                         |   (50% complete)          |
    |                         |                           |
    |                         |                     [Shows progress]
    |                         |                           |
    |-- POST /progress ------>|                           |
    |   (itemsAdded: 2)       |                           |
    |                         |-- WebSocket push -------->|
    |                         |   (100% complete)         |
    |                         |                           |
    |                         |                     [Shows "Complete!"]
```

**Latency**: <100ms from extension to mobile  
**Protocol**: WebSocket (persistent connection)  
**Fallback**: HTTP polling (if WebSocket fails)

---

## Testing Checklist

### ✅ QR Generation
- [ ] Click "Show QR Code" in side panel
- [ ] QR code displays correctly
- [ ] Session token is generated (format: ext_...)
- [ ] Timer starts at 15:00
- [ ] Console shows: `[Sally] Extension QR displayed, token: ext_...`

### ✅ Mobile Scanning
- [ ] Open Sally Mobile app
- [ ] Navigate to "Shop with Sally"
- [ ] Scan QR code
- [ ] Mobile shows "Sent to extension! ✓"
- [ ] Extension receives list within 2 seconds
- [ ] Console shows: `[Sally] Shopping list received!`

### ✅ Shopping Starts
- [ ] Items populate in side panel form
- [ ] Shopping starts automatically
- [ ] Progress bar appears
- [ ] Items show status (pending/added/failed)
- [ ] Console shows: `[Sally] Starting autonomous shopping`

### ✅ Progress Updates
- [ ] Extension sends progress every few seconds
- [ ] Mobile app shows real-time progress
- [ ] Progress bar updates in side panel
- [ ] Console shows: `[Sally] Progress update sent: X%`

### ✅ Session Expiration
- [ ] Timer counts down from 15:00
- [ ] Session expires after 15 minutes
- [ ] Polling stops
- [ ] "Refresh" button generates new QR
- [ ] Console shows: `[Sally] Session expired`

### ✅ Error Handling
- [ ] API errors don't crash extension
- [ ] Failed items show error status
- [ ] User can retry shopping
- [ ] Session cleanup on errors

---

## Summary

**What's changing**: Container (popup → side panel)  
**What's staying**: Content (mobile QR flow)  
**Code changes to mobile functions**: 0 (zero)  
**API changes**: 0 (zero)  
**Mobile app changes**: 0 (zero)  

**Result**: Mobile integration works identically, just in a better container.

---

**Next Step**: Read START_HERE_PHASE_1.md to begin implementation
