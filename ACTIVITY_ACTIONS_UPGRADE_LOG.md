# HeySalad AI Shopper Activity Actions Upgrade Log

This log records the upgrade that turns the `Sally Live` feed into an actionable control surface.

## Goal

- let users act from the feed instead of bouncing back to the form
- reduce friction after warnings, completions, and mobile handoff states
- make the panel feel more like an agent workspace

## Step 1: Add action button styling

Updated [sidepanel/sidepanel.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/sidepanel/sidepanel.css):

- added `.activity-actions`
- added `.activity-action`
- added `.activity-action.secondary`

Why:
- feed items now support direct next-step buttons without looking like generic form controls

## Step 2: Add feed action rendering

Updated [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- added `renderActivityActions()`
- feed items now render action buttons when an event includes `actions`

Why:
- the activity feed is now operational, not just descriptive

## Step 3: Add action handling

Also in [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js):

- added `handleActivityFeedClick()`
- added `runActivityAction()`
- added `focusCurrentShoppingTab()`
- added `openUpgradeFlow()`
- added `getNoticeActions()`

Supported actions:
- `open-cart`
- `new-list`
- `focus-shopping-tab`
- `refresh-extension-qr`
- `close-qr-generator`
- `upgrade`
- `open-help`

Why:
- users can now move directly from Sally’s narrative to the next useful task

## Step 4: Attach actions to high-value events

Added action buttons for:

- shopping started
  - `Open tab`
- shopping complete
  - `Open cart`
  - `New list`
- shopping stopped
  - `New list`
- QR generated
  - `Back to panel`
- waiting for mobile
  - `Refresh QR`
- item failed
  - `Open tab`
  - `Review list`
- upgrade-required notices
  - `Upgrade`
- help-worthy errors
  - `Help`

Why:
- these are the most common “what do I do next?” states in the current Sally workflow

## Verification

Ran:

- `node --check heysalad-ai-shopper/popup/popup.js`
- `node --check heysalad-ai-shopper/sidepanel/sidepanel.js`

Result:
- syntax checks passed

## Manual validation still needed

1. Reload the unpacked extension
2. Complete a shopping run and test `Open cart`
3. Trigger an item failure and test `Open tab`
4. Trigger the upgrade gate and test `Upgrade`
5. Generate an extension QR and test `Refresh QR`

## Best next moves after this

1. Substitution approval cards
   - when confidence is medium rather than high, Sally should pause and ask for approval in-panel

2. Retry workflow for failed items
   - let the user retry only failed items instead of restarting the entire run

3. Session summaries
   - group feed items by shopping run with summary headers and outcomes

4. Permission states
   - show whether the current site is ready, unsupported, signed out, or blocked before the user starts shopping

5. Chrome Store release prep
   - manual QA on supported stores
   - refreshed screenshots showing the side panel and live feed
   - updated listing copy to match the new UX
