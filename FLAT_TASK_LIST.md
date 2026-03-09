# HeySalad AI Shopper - Claude-Style UX Upgrade Task List

**CRITICAL**: All mobile-to-extension QR functionality MUST be preserved throughout this upgrade.

---

## Setup & Configuration

- [ ] Create `sidepanel/` directory in extension root
- [ ] Create `sidepanel/components/` subdirectory
- [ ] Update `manifest.json` to add `"side_panel"` configuration with `"default_path": "sidepanel/sidepanel.html"`
- [ ] Add `"sidePanel"` to permissions array in `manifest.json`
- [ ] Remove `"default_popup"` from `"action"` in `manifest.json` (side panel replaces popup)
- [ ] Keep all existing permissions: `storage`, `activeTab`, `scripting`, `tabs`, `notifications`, `identity`
- [ ] Keep all existing `host_permissions` unchanged
- [ ] Test manifest.json validates with no errors

---

## Side Panel HTML Migration

- [ ] Create `sidepanel/sidepanel.html` by copying `popup/popup.html`
- [ ] Update HTML `<title>` to "Sally - Side Panel"
- [ ] Keep auth section (`#auth-section`) exactly as is
- [ ] Keep main section (`#main-section`) structure
- [ ] **PRESERVE**: Mobile integration section with "📱 Shop from Mobile" button (`#show-qr-code-btn`)
- [ ] **PRESERVE**: Extension QR section (`#extension-qr-section`) with QR display, status, timer
- [ ] **PRESERVE**: QR instructions list (4 steps: Open app, Tap button, Scan code, Auto-shop)
- [ ] **PRESERVE**: Extension QR cancel button (`#extension-qr-cancel-btn`)
- [ ] **PRESERVE**: Extension QR refresh button (`#extension-qr-refresh-btn`)
- [ ] Keep shopping form section (`#task-form`) with store select and items textarea
- [ ] Keep shopping progress section (`#task-status`) with progress bar and items list
- [ ] Keep shopping complete section (`#task-complete`) with summary
- [ ] Keep stats section with items/sessions/time counters
- [ ] Update CSS link to `<link rel="stylesheet" href="sidepanel.css">`
- [ ] Update script tags to load from correct paths: `../popup/qrcode.min.js`, `components/mobile-qr.js`, `sidepanel.js`
- [ ] Test HTML loads without errors in side panel

---

## Mobile QR Component Extraction

- [ ] Create `sidepanel/components/mobile-qr.js` file
- [ ] Copy `showExtensionQR()` function from `popup/popup.js` lines 1100-1150
- [ ] Copy `startSessionPolling()` function from `popup/popup.js` lines 1152-1200
- [ ] Copy `startSessionTimer()` function from `popup/popup.js` lines 1202-1230
- [ ] Copy `startShoppingFromMobile()` function from `popup/popup.js` lines 1232-1250
- [ ] Copy `startShoppingWithProgressUpdates()` function from `popup/popup.js` lines 1252-1320
- [ ] Copy `sendProgressUpdate()` function from `popup/popup.js` lines 1322-1350
- [ ] Copy `closeExtensionQR()` function from `popup/popup.js` lines 1352-1365
- [ ] Copy `refreshExtensionQR()` function from `popup/popup.js` lines 1367-1375
- [ ] Copy `generateExtensionSessionToken()` function from `popup/popup.js` lines 1377-1385
- [ ] Export all functions via `window.MobileQR = { showExtensionQR, closeExtensionQR, refreshExtensionQR }`
- [ ] Add JSDoc comments to each function explaining mobile integration purpose
- [ ] Test mobile-qr.js loads without errors

---

## Side Panel JavaScript Migration

- [ ] Create `sidepanel/sidepanel.js` file
- [ ] Copy DOM element references from `popup/popup.js` lines 1-30
- [ ] Copy `currentUser`, `currentTask`, `timerInterval` variables
- [ ] Add `extensionSession`, `sessionPollInterval`, `sessionTimerInterval` variables for mobile QR
- [ ] Copy `DOMContentLoaded` event listener and initialization
- [ ] Copy `checkAuthStatus()` function
- [ ] Copy `checkTaskStatus()` function
- [ ] Copy `loadStats()` function
- [ ] Copy `updateStats()` function
- [ ] Copy `loadSavedLists()` function
- [ ] Copy `setupEventListeners()` function
- [ ] **ADD**: Event listeners for mobile QR buttons using `window.MobileQR` functions
- [ ] Copy `handleLogin()` function
- [ ] Copy `handleVerifyToken()` function
- [ ] Copy `handleLogout()` function
- [ ] Copy `handleStartShopping()` function
- [ ] Copy `handleStopShopping()` function
- [ ] Copy `handleViewCart()` function
- [ ] Copy `handleNewTask()` function
- [ ] Copy `parseItems()` function
- [ ] Copy `showAuthSection()` function
- [ ] Copy `showMainSection()` function
- [ ] Copy `showTaskForm()` function
- [ ] Copy `showTaskStatus()` function
- [ ] Copy `showTaskComplete()` function
- [ ] Copy `updateTaskUI()` function
- [ ] Copy `showMessage()` and `hideMessage()` functions
- [ ] Copy `chrome.runtime.onMessage` listener for task updates
- [ ] Test sidepanel.js loads and initializes correctly

---

## Side Panel CSS Creation

- [ ] Create `sidepanel/sidepanel.css` file
- [ ] Define CSS variables for Chrome Material Design 3 colors (primary, surface, on-surface, outline, error, success)
- [ ] Define spacing variables (xs: 4px, sm: 8px, md: 16px, lg: 24px)
- [ ] Define typography variables (font-family: Roboto, font-sizes: 12px/14px/16px)
- [ ] Define border radius variables (sm: 4px, md: 8px, lg: 12px)
- [ ] Define shadow variables (sm, md)
- [ ] Set body width to 400px, min-height 600px
- [ ] Style `.panel-header` with sticky positioning, border-bottom, flex layout
- [ ] Style `.badge` with surface-variant background, small font
- [ ] **PRESERVE**: Style `.mobile-integration` section with surface-variant background
- [ ] **PRESERVE**: Style mobile QR button (`.btn-primary`) with Chrome blue, hover effects
- [ ] **PRESERVE**: Style `.qr-container` with centered layout, padding
- [ ] **PRESERVE**: Style `#extension-qr-display` with white background, border-radius, shadow
- [ ] **PRESERVE**: Style `.qr-status` with color variants (success: green, error: red, scanning: blue)
- [ ] **PRESERVE**: Style `.qr-timer` with small font, color variants
- [ ] **PRESERVE**: Style `.qr-instructions` with surface-variant background, ordered list
- [ ] Style `.btn-primary` with Chrome blue, white text, hover shadow
- [ ] Style `.btn-secondary` with surface-variant background, outline border
- [ ] Style `.btn-icon` with transparent background, hover effect
- [ ] Style form inputs (select, textarea) with outline border, focus state
- [ ] Style `.progress-bar` with surface-variant background, 8px height
- [ ] Style `#progress-fill` with success green, smooth transition
- [ ] Style `.item-row` with flex layout, gap, padding
- [ ] Style `.item-status` with color variants (added: green, failed: red, searching: blue)
- [ ] Style `.stats` section with flex layout, centered text
- [ ] Add `.hidden` utility class with `display: none !important`
- [ ] Test all styles render correctly in side panel

---

## Background Service Worker Updates

- [ ] Open `background/service-worker.js`
- [ ] Add `chrome.action.onClicked` listener to open side panel with `chrome.sidePanel.open({ tabId: tab.id })`
- [ ] Add message handler for `OPEN_SIDE_PANEL` type to open side panel programmatically
- [ ] **PRESERVE**: Keep all existing message handlers (`AUTH_CHECK`, `AUTH_LOGIN`, `START_SHOPPING`, etc.)
- [ ] **PRESERVE**: Keep WebSocket client initialization for real-time updates
- [ ] **PRESERVE**: Keep session polling logic for mobile QR flow
- [ ] Test side panel opens when extension icon clicked
- [ ] Test side panel opens from message handler

---

## Badge System Implementation

- [ ] Create `background/badge-controller.js` file
- [ ] Create `BadgeController` class with `activeStates` Map (tabId -> state)
- [ ] Add `setWaitingForMobile(tabId, sessionToken)` method: badge text '📱', color '#2196F3', title 'Waiting for mobile'
- [ ] Add `setShoppingFromMobile(tabId, itemCount)` method: badge text '🛒', color '#4CAF50', title 'Shopping X items from mobile'
- [ ] Add `setShopping(tabId, itemCount)` method: badge text '🛒', color '#4CAF50', title 'Shopping X items'
- [ ] Add `setReady(tabId)` method: badge text '✓', color '#FFA726', title 'Ready to shop'
- [ ] Add `setComplete(tabId)` method: badge text '✓', color '#66BB6A', title 'Shopping complete'
- [ ] Add `setError(tabId, error)` method: badge text '!', color '#D93025', title error message
- [ ] Add `clearBadge(tabId)` method to remove badge and clear state
- [ ] Export singleton instance: `export const badgeController = new BadgeController()`
- [ ] Test badge controller methods work correctly

---

## Badge Integration in Service Worker

- [ ] Import `badgeController` in `background/service-worker.js`
- [ ] Add message handler for `MOBILE_QR_GENERATED` to call `badgeController.setWaitingForMobile()`
- [ ] Add message handler for `MOBILE_LIST_RECEIVED` to call `badgeController.setShoppingFromMobile()`
- [ ] Update `START_SHOPPING` handler to call `badgeController.setShopping()`
- [ ] Update `SHOPPING_COMPLETE` handler to call `badgeController.setComplete()`
- [ ] Update error handlers to call `badgeController.setError()`
- [ ] Add `chrome.tabs.onRemoved` listener to call `badgeController.clearBadge()`
- [ ] Test badge updates correctly during mobile QR flow
- [ ] Test badge updates correctly during regular shopping
- [ ] Test badge clears when tab closes

---

## Corner Indicator Component

- [ ] Create `content-scripts/corner-indicator.js` file
- [ ] Create `SallyCornerIndicator` class with `indicator` DOM element and `state` property
- [ ] Add `create()` method to build indicator HTML with icon, text, status
- [ ] Add click handler to send `OPEN_SIDE_PANEL` message
- [ ] Append indicator to `document.body`
- [ ] Add `setWaitingForMobile(sessionToken)` method: status 'Waiting for mobile...', class 'waiting'
- [ ] Add `setShoppingFromMobile(itemCount, currentItem)` method: status 'Shopping from mobile: X', class 'shopping'
- [ ] Add `setShopping(currentItem)` method: status 'Adding X...', class 'shopping'
- [ ] Add `setComplete(itemsAdded)` method: status 'X items added ✓', class 'complete'
- [ ] Add `setError(error)` method: status error message, class 'error'
- [ ] Add `hide()` method to hide indicator
- [ ] Add `show()` method to show indicator
- [ ] Initialize indicator on script load
- [ ] Add `chrome.runtime.onMessage` listener for `UPDATE_INDICATOR` messages
- [ ] Test indicator creates and displays correctly

---

## Corner Indicator Styling

- [ ] Create `content-scripts/corner-indicator.css` file
- [ ] Style `.sally-corner-indicator` with fixed position (top: 16px, left: 16px), z-index 999999
- [ ] Add glassmorphism effect: `background: rgba(255, 255, 255, 0.95)`, `backdrop-filter: blur(10px)`
- [ ] Add border-radius 12px, padding 8px 16px
- [ ] Add box-shadow for depth
- [ ] Add flex layout with gap 8px, align-items center
- [ ] Add hover effect: increased shadow, translateY(-1px)
- [ ] Add cursor pointer
- [ ] Style `.sally-corner-indicator.waiting` with blue left border (3px solid #2196F3)
- [ ] Add pulse animation for waiting state icon
- [ ] Style `.sally-corner-indicator.shopping` with green left border (3px solid #4CAF50)
- [ ] Add spin animation for shopping state icon
- [ ] Style `.sally-corner-indicator.complete` with light green left border (3px solid #66BB6A)
- [ ] Style `.sally-corner-indicator.error` with red left border (3px solid #D93025)
- [ ] Define `@keyframes pulse` animation (opacity 1 -> 0.6 -> 1)
- [ ] Define `@keyframes spin` animation (rotate 0deg -> 360deg)
- [ ] Test indicator styles render correctly on all supported stores

---

## Corner Indicator Integration

- [ ] Update `manifest.json` to include `corner-indicator.js` and `corner-indicator.css` in content_scripts
- [ ] Update `background/service-worker.js` to send `UPDATE_INDICATOR` messages on state changes
- [ ] Send `UPDATE_INDICATOR` with state 'waiting_mobile' when QR generated
- [ ] Send `UPDATE_INDICATOR` with state 'shopping_mobile' when mobile list received
- [ ] Send `UPDATE_INDICATOR` with state 'shopping' during regular shopping
- [ ] Send `UPDATE_INDICATOR` with state 'complete' when shopping finishes
- [ ] Send `UPDATE_INDICATOR` with state 'error' on errors
- [ ] Test indicator updates correctly during mobile flow
- [ ] Test indicator updates correctly during regular shopping
- [ ] Test indicator click opens side panel

---

## Remove Old Overlay Code

- [ ] Open `content-scripts/base.js`
- [ ] Remove old floating overlay creation code
- [ ] Remove old overlay positioning logic
- [ ] Remove old overlay show/hide functions
- [ ] Keep all store detection logic
- [ ] Keep all shopping automation logic
- [ ] Keep all item search and add-to-cart logic
- [ ] Test shopping still works without old overlay

---

## Mobile QR Flow Testing

- [ ] Test clicking "📱 Shop from Mobile" button in side panel
- [ ] Verify QR code generates with session token format `ext_${timestamp}_${random}`
- [ ] Verify QR section shows with status "⏳ Waiting for mobile to scan..."
- [ ] Verify 15-minute countdown timer starts and updates every second
- [ ] Test session polling starts (checks API every 2 seconds)
- [ ] Test API endpoint: `GET /api/extension/token/${token}` returns 404 initially
- [ ] Simulate mobile sending list: `POST /api/extension/token/${token}` with shopping_list
- [ ] Verify extension receives list and populates form
- [ ] Verify shopping starts automatically with received items
- [ ] Verify progress updates sent: `POST /api/extension/token/${token}/progress`
- [ ] Verify badge shows '📱' during waiting
- [ ] Verify badge shows '🛒' during shopping from mobile
- [ ] Verify corner indicator shows "Waiting for mobile..." during waiting
- [ ] Verify corner indicator shows "Shopping from mobile: X" during shopping
- [ ] Test cancel button stops polling and returns to main section
- [ ] Test refresh button generates new QR code
- [ ] Test session expiration after 15 minutes
- [ ] Test expired session shows error message

---

## Regular Shopping Flow Testing

- [ ] Test entering items manually in side panel
- [ ] Test selecting store from dropdown
- [ ] Test clicking "🛒 Let Sally Shop!" button
- [ ] Verify shopping starts on current tab
- [ ] Verify badge shows '🛒' during shopping
- [ ] Verify corner indicator shows "Adding X..." during shopping
- [ ] Verify progress bar updates in side panel
- [ ] Verify items list updates with status icons (✓, ✗, ⏳)
- [ ] Verify shopping completes and shows summary
- [ ] Verify badge shows '✓' when complete
- [ ] Verify corner indicator shows "X items added ✓" when complete
- [ ] Test stop button cancels shopping
- [ ] Test view cart button opens store cart page
- [ ] Test new task button resets form

---

## Multi-Tab Testing

- [ ] Open side panel in tab 1 (Tesco)
- [ ] Start shopping in tab 1
- [ ] Verify badge shows on tab 1 only
- [ ] Switch to tab 2 (Sainsbury's)
- [ ] Verify no badge on tab 2
- [ ] Open side panel in tab 2
- [ ] Start shopping in tab 2
- [ ] Verify badge shows on tab 2
- [ ] Switch back to tab 1
- [ ] Verify badge still shows on tab 1
- [ ] Verify both shopping sessions continue independently
- [ ] Close tab 1
- [ ] Verify badge clears for tab 1
- [ ] Verify tab 2 shopping continues

---

## Cross-Store Testing

- [ ] Test mobile QR flow on Tesco
- [ ] Test mobile QR flow on Sainsbury's
- [ ] Test mobile QR flow on ASDA
- [ ] Test mobile QR flow on Ocado
- [ ] Test mobile QR flow on Waitrose
- [ ] Test regular shopping on Tesco
- [ ] Test regular shopping on Sainsbury's
- [ ] Test regular shopping on ASDA
- [ ] Test regular shopping on Ocado
- [ ] Test regular shopping on Waitrose
- [ ] Verify corner indicator displays correctly on all stores
- [ ] Verify badge updates correctly on all stores

---

## Authentication Testing

- [ ] Test side panel shows auth section when not logged in
- [ ] Test magic link login flow
- [ ] Test token verification flow
- [ ] Test side panel shows main section after login
- [ ] Test logout clears session and returns to auth section
- [ ] Test mobile QR flow works when logged in
- [ ] Test mobile QR flow works when not logged in (should prompt on mobile)

---

## Performance Testing

- [ ] Measure side panel load time (target: <100ms)
- [ ] Measure badge update latency (target: <50ms)
- [ ] Measure corner indicator update latency (target: <50ms)
- [ ] Measure QR code generation time (target: <500ms)
- [ ] Measure session polling overhead (should not impact browsing)
- [ ] Profile memory usage during shopping (target: <50MB)
- [ ] Test side panel with 50+ items in list
- [ ] Test side panel with 10+ saved lists
- [ ] Verify no memory leaks after multiple shopping sessions

---

## Error Handling Testing

- [ ] Test side panel when API is unreachable
- [ ] Test mobile QR flow when API returns 500 error
- [ ] Test shopping when store website changes layout
- [ ] Test shopping when item not found
- [ ] Test shopping when cart is full
- [ ] Test shopping when network disconnects mid-session
- [ ] Verify error messages are user-friendly
- [ ] Verify errors don't crash extension
- [ ] Verify errors are logged to console for debugging

---

## Accessibility Testing

- [ ] Test side panel with keyboard navigation only
- [ ] Verify all buttons are keyboard accessible (Tab, Enter)
- [ ] Verify all form inputs are keyboard accessible
- [ ] Test with screen reader (NVDA or JAWS)
- [ ] Verify all interactive elements have ARIA labels
- [ ] Verify focus indicators are visible
- [ ] Test color contrast ratios meet WCAG 2.1 AA (4.5:1 for text)
- [ ] Test with high contrast mode enabled
- [ ] Test with 200% zoom
- [ ] Verify no keyboard traps

---

## Browser Compatibility Testing

- [ ] Test on Chrome 120+ (latest stable)
- [ ] Test on Chrome 119 (previous stable)
- [ ] Test on Edge 120+ (Chromium-based)
- [ ] Test on Brave 1.60+ (Chromium-based)
- [ ] Test on Chrome Canary (bleeding edge)
- [ ] Verify Side Panel API is supported (Chrome 114+)
- [ ] Test fallback behavior on older Chrome versions (<114)

---

## Documentation Updates

- [ ] Update README.md with new side panel feature
- [ ] Document keyboard shortcuts (if any added)
- [ ] Document mobile QR flow in user guide
- [ ] Document badge states and meanings
- [ ] Document corner indicator states
- [ ] Create troubleshooting guide for common issues
- [ ] Add screenshots of new UI to README
- [ ] Update CHANGELOG.md with version 2.0.0 changes

---

## Deployment Preparation

- [ ] Update version in `manifest.json` to "2.0.0"
- [ ] Create release notes highlighting new features
- [ ] Create migration guide for existing users
- [ ] Test extension package builds correctly
- [ ] Verify all files are included in package
- [ ] Verify package size is reasonable (<5MB)
- [ ] Test installing packaged extension
- [ ] Test updating from v1.0.7 to v2.0.0

---

## Chrome Web Store Submission

- [ ] Prepare store listing description highlighting new features
- [ ] Create promotional images (1280x800, 640x400, 440x280)
- [ ] Create screenshots showing side panel (1280x800 or 640x400)
- [ ] Create video demo of mobile QR flow (optional but recommended)
- [ ] Update privacy policy if needed
- [ ] Submit extension for review
- [ ] Monitor review status
- [ ] Respond to any reviewer feedback

---

## Post-Launch Monitoring

- [ ] Monitor Chrome Web Store reviews for issues
- [ ] Monitor error logs in background service worker
- [ ] Track side panel usage metrics (if analytics added)
- [ ] Track mobile QR flow usage metrics
- [ ] Monitor API endpoint performance
- [ ] Collect user feedback on new UX
- [ ] Create issues for any bugs reported
- [ ] Plan hotfix release if critical bugs found

---

**Total Tasks**: 250+  
**Estimated Time**: 2-3 weeks for full implementation and testing  
**Priority**: HIGH - Foundation for all future improvements  
**Status**: Ready to start  

**CRITICAL REMINDER**: Every task must preserve the mobile-to-extension QR functionality. This is a killer feature that differentiates Sally from competitors.
