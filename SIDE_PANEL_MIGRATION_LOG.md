# HeySalad AI Shopper Side Panel Migration Log

This document records the implementation steps taken to convert `heysalad-ai-shopper` from a popup-first Chrome extension into a side-panel-first experience while preserving QR-based mobile integration.

## Goal

- Move the primary extension UI into Chrome's native side panel.
- Keep the existing Sally Mobile QR handoff intact.
- Preserve current auth, shopping, sync, and task progress logic.
- Avoid page reflow or heavy injected UI.

## Step 1: Convert the extension entrypoint to a side panel

Updated [manifest.json](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/manifest.json):

- Removed `action.default_popup`
- Added `side_panel.default_path = "sidepanel/sidepanel.html"`
- Added the `sidePanel` permission

Why:
- This makes the extension open in Chrome's native side panel instead of a transient popup.
- The side panel stays available while users browse supermarket sites.

## Step 2: Create the side panel surface

Added [sidepanel/sidepanel.html](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.html).

Implementation choices:
- Recreated the full popup surface inside the side panel instead of rewriting flows.
- Preserved these sections:
  - auth
  - subscription plan card
  - shopping form
  - task progress
  - task completion
  - saved lists
  - QR generator
  - QR scanner
  - mobile-to-extension QR handoff
  - sync section

Why:
- This keeps working behavior intact while changing only the container surface.

## Step 3: Reuse the existing Sally extension logic

Added:
- [sidepanel/sidepanel.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.css)
- [sidepanel/sidepanel.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.js)

Implementation choices:
- `sidepanel.css` imports the existing popup stylesheet and adds side-panel-specific polish.
- `sidepanel.js` adds panel-only behavior such as the help link and marks the surface as `sidepanel`.
- `sidepanel.html` loads:
  - `../popup/jsqr.min.js`
  - `../popup/qrcode.min.js`
  - `../popup/qr-scanner.js`
  - `../popup/popup.js`

Why:
- This avoids forking the core UI logic.
- The QR and auth flows remain on the exact same JavaScript controller.

## Step 4: Wire the toolbar icon to the side panel

Updated [background/service-worker.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/background/service-worker.js).

Added:
- `configureSidePanel()`
- `openSidePanelForSender(sender)`
- startup/install side panel initialization
- `OPEN_SIDE_PANEL` message handling

Implementation choices:
- Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- Keep side panel behavior configured:
  - at worker load
  - on install
  - on browser startup

Why:
- Clicking the Sally icon should open the panel directly.
- Other extension surfaces can also request the panel explicitly.

## Step 5: Preserve QR-based mobile integration

Preserved in [sidepanel/sidepanel.html](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.html) by keeping all QR-related DOM IDs expected by [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js).

Preserved capabilities:
- Generate QR codes for mobile handoff
- Scan QR codes from mobile-produced shopping sessions
- Generate extension-link QR for Sally Mobile to connect back
- Poll Sally API token endpoints
- Start extension shopping from mobile-sent shopping lists
- Send progress updates back to mobile

Why:
- The mobile handoff is one of the strongest user-adoption features and should not be regressed during the side panel migration.

## Step 6: Add side-panel-specific UI polish

Added in [sidepanel/sidepanel.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.css):

- sticky surface indicator
- sticky header
- full-height panel layout
- subtle radial background treatment
- panel-friendly shadows and spacing

Why:
- The UI should feel persistent and native inside the side panel, not like a popup stretched vertically.

## Step 7: Verification

Ran:

- `node --check heysalad-ai-shopper/sidepanel/sidepanel.js`
- `node --check heysalad-ai-shopper/background/service-worker.js`
- JSON parse validation for `heysalad-ai-shopper/manifest.json`

Result:
- JavaScript syntax checks passed
- Manifest parsing passed

## What still needs manual browser validation

These should be tested in Chrome before store submission:

1. Reload the unpacked extension
2. Click the extension icon and confirm the side panel opens
3. Verify auth still works from the side panel
4. Verify manual shopping still starts from the side panel
5. Verify "Show QR Code" still generates the extension-link QR
6. Verify Sally Mobile can still scan that QR and push a list into the extension
7. Verify progress updates still appear in the side panel during shopping

## Recommended next iteration

- Add a lightweight in-page corner indicator that only opens the side panel
- Add `tabGroups` support for Sally-managed shopping tabs
- Replace more alert/confirm flows with panel-native UI
- Add a conversational activity feed inside the side panel
