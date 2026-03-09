# HeySalad AI Shopper Next Best Move Log

This log records the follow-up UX hardening work completed after the side-panel migration.

## Goal

Make the extension feel closer to a polished browser companion by:

- reducing intrusive in-page UI
- visually grouping Sally-managed shopping tabs
- reducing blocking browser dialogs inside the side panel

## Step 1: Add Sally tab grouping

Updated [manifest.json](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/manifest.json):

- added the `tabGroups` permission

Updated [background/service-worker.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/background/service-worker.js):

- added `SALLY_TAB_GROUP_TITLE`
- added `SALLY_TAB_GROUP_COLOR`
- added `groupTabForSally(tabId, windowId)`
- grouped the active shopping tab when a task starts

Result:
- Sally-managed shopping tabs can now be visually organized into an orange `Sally` tab group.

## Step 2: Turn the page overlay into a compact corner indicator

Updated [content-scripts/base.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/content-scripts/base.js):

- changed the injected overlay to start in a minimized state
- added an `Open panel` action in the in-page UI
- wired `Open panel` to send `OPEN_SIDE_PANEL` to the background worker
- made the title area open the side panel as the preferred interaction
- removed the need for the old draggable-first interaction model

Updated [content-scripts/overlay.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/content-scripts/overlay.css):

- moved the injected UI to the top-left corner
- changed the styling from a large floating card to a compact glassy indicator
- added panel-focused header action styling
- kept the expandable details body for debugging or manual review

Result:
- the site gets a much lighter Sally presence
- users can open the real side panel instead of relying on a large floating widget

## Step 3: Replace the highest-friction side panel dialogs

Updated [sidepanel/sidepanel.html](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.html):

- added `#panel-notice`

Updated [sidepanel/sidepanel.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.css):

- added sticky notice styles for info, success, warning, and error states

Updated [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- added `showPanelNotice()`
- added `showUserNotice()`
- added `requestSoftConfirmation()`
- replaced the main `alert()` paths in shopping and QR flows with panel-native notices when running in the side panel
- replaced the most visible `confirm()` flows with soft-confirmation behavior in the side panel

Fallback behavior:
- if the old popup surface is ever used again, `alert()` and `confirm()` still work as a fallback

Result:
- the side panel no longer interrupts the user with the browser’s modal dialogs for the most common failure and confirmation cases

## Verification

Ran:

- `node --check heysalad-ai-shopper/popup/popup.js`
- `node --check heysalad-ai-shopper/content-scripts/base.js`
- `node --check heysalad-ai-shopper/background/service-worker.js`
- manifest JSON parse validation

Result:
- syntax checks passed
- manifest parsing passed

## Manual validation still needed in Chrome

1. Reload the unpacked extension
2. Start a shopping session and verify the active tab joins the orange `Sally` tab group
3. Confirm the in-page indicator opens the side panel
4. Confirm the indicator remains compact unless expanded
5. Trigger validation and QR errors and confirm they appear in-panel rather than as browser dialogs

## Recommended next iteration

- convert the saved-lists and shopping progress surfaces into a more conversational activity timeline
- add per-site permission states in the side panel
- add “Approve substitution” cards in-panel instead of simple pass/fail handling
