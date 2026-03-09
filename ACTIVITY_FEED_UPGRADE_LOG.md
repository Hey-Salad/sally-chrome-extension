# HeySalad AI Shopper Activity Feed Upgrade Log

This log records the upgrade that makes the side panel feel more like a live Sally companion instead of a static form.

## Goal

- Add a conversational activity feed to the side panel
- Reuse real extension events instead of inventing fake status copy
- Make auth, QR, shopping, and error states visible in one persistent place

## Step 1: Add the feed surface

Updated [sidepanel/sidepanel.html](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.html):

- added a new `Sally Live` activity card
- added `#activity-feed`
- added `#clear-activity-btn`

Why:
- the panel now has a persistent narrative surface above the plan and shopping controls

## Step 2: Style the feed like a lightweight conversation timeline

Updated [sidepanel/sidepanel.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.css):

- added activity card layout
- added timeline item styles
- added tone styles for:
  - info
  - success
  - warning
  - error
- kept the styling compact so it still feels like a side panel, not a full-page chat app

Why:
- Sally needs to feel alive while shopping, but not visually noisy

## Step 3: Add feed state management

Updated [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- added `activityEvents`
- added `activityStateSnapshot`
- added `loadActivityFeed()`
- added `clearActivityFeed()`
- added `addActivityEvent()`
- added `renderActivityFeed()`
- added `formatActivityTime()`
- added `escapeHtml()`

Storage:
- feed events are stored in `chrome.storage.local.activityFeed`
- feed is capped to the most recent 30 events

Why:
- the side panel now preserves a short conversation history instead of only showing the current form state

## Step 4: Connect real events into the feed

Wired these flows into the activity feed in [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- magic link sent
- signed in
- signed out
- shopping started
- shopping stopped
- shopping completed
- QR generated
- QR imported
- waiting for mobile
- mobile list received
- starting mobile shopping
- in-panel notices

Why:
- users can now understand what Sally is doing without interpreting raw task UI

## Step 5: Add item-level shopping narration

Also in [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- added `logTaskActivity(previousTask, nextTask)`

This logs high-value item transitions:
- searching
- added
- failed

Why:
- this gives the panel a lightweight “chat” feel during active shopping without needing to build a full LLM chat experience yet

## Step 6: Reset feed state safely between runs

Added task snapshot resets when:
- a new shopping run starts
- a task is stopped
- a task completes
- the user starts a new task

Why:
- prevents stale per-item status tracking from leaking into the next run

## Verification

Ran:

- `node --check heysalad-ai-shopper/popup/popup.js`
- `node --check heysalad-ai-shopper/sidepanel/sidepanel.js`

Result:
- syntax checks passed

## Manual validation still needed

1. Reload the unpacked extension
2. Open the side panel
3. Sign in and verify auth events appear in `Sally Live`
4. Start a manual shopping session and verify item-level updates appear in the feed
5. Generate a mobile QR and verify the feed reflects the handoff
6. Clear the activity feed and verify the empty state returns

## Recommended next iteration

- add assistant-style suggested replies or quick actions inside the feed
- add substitution approval cards driven by backend confidence
- add richer timeline grouping by session or store
