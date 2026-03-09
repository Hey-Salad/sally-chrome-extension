# Sally Consumer Extension: Phase 1-3 Implementation

Date: 2026-03-08

This document captures the first implementation pass for making `heysalad-ai-shopper` safer, smarter, and monetizable without another full architectural reset.

## Objective

Ship three things together:

1. Phase 1: remove unsafe client-side AI usage from the Chrome extension.
2. Phase 2: move product intelligence to the backend and make model choice configurable.
3. Phase 3: introduce paid gating for autonomous shopping using Sally subscription status.

## What Changed

### Phase 1: Security hardening

Files:
- [manifest.json](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/manifest.json)
- [content-scripts/base.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/content-scripts/base.js)

Changes:
- Removed `https://api.openai.com/*` from Chrome extension host permissions.
- Removed direct OpenAI calls from the content script.
- Removed extension-side API key fallback usage in the content script.
- Kept a local rule-based validation fallback in the content script for final safety checks.

Result:
- The extension no longer needs a raw OpenAI key.
- The Chrome Store package no longer requests direct OpenAI network access.

### Phase 2: Smarter backend AI routing

Files:
- [shopping-agent/src/index.ts](/Users/chilumbam/heysalad-payme/shopping-agent/src/index.ts)
- [shopping-agent/src/types.ts](/Users/chilumbam/heysalad-payme/shopping-agent/src/types.ts)
- [shopping-agent/wrangler.toml](/Users/chilumbam/heysalad-payme/shopping-agent/wrangler.toml)

Changes:
- Added configurable backend model selection:
  - `AI_CHAT_MODEL`
  - `AI_MATCHING_MODEL`
- Updated chat/tool orchestration to use `AI_CHAT_MODEL`.
- Updated product matching to use `AI_MATCHING_MODEL`.
- Extended `/api/match-product` to return:
  - `bestIndex`
  - `confidence`
  - `reason`
  - `shouldAdd`
  - `validationConfidence`
  - `validationReason`
  - `model`
- Added rule-based rejection of obvious bad matches on the backend, for example:
  - apples vs apple juice
  - tomatoes vs tomato sauce
  - chicken vs chicken stock

Result:
- AI matching is now server-side.
- Future model upgrades do not require a Chrome Store release.
- You can test stronger OpenAI models later by changing worker configuration instead of rewriting the extension.

### Phase 3: Paid gating for autonomous shopping

Files:
- [background/service-worker.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/background/service-worker.js)
- [popup/popup.html](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.html)
- [popup/popup.css](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.css)
- [popup/popup.js](/Users/chilumbam/heysalad-payme/heysalad-ai-shopper/popup/popup.js)

Changes:
- Added background worker subscription lookup via Sally API:
  - calls `/api/subscriptions/status`
  - derives an extension plan object
- Added an automation entitlement gate before shopping starts.
- Allowed autonomous shopping only for `premium` or `pro`.
- Added popup plan UI:
  - current extension access tier
  - free vs paid state
  - upgrade CTA
- Preserved login flow and shopping flow, but now free users are blocked from autonomous shopping with a clear upgrade message.

Result:
- The monetization boundary is enforced in the extension control path.
- Free users can still sign in and use the extension UI, but autonomous shopping becomes a paid capability.

## Deployment Order

1. Deploy `shopping-agent` first.
2. Verify `/api/match-product` returns `shouldAdd` and `model`.
3. Update and republish the Chrome extension.
4. Confirm paid users can start autonomous shopping.
5. Confirm free users receive the upgrade-required flow.

## Recommended Environment Configuration

For `shopping-agent`:

- `AI_CHAT_MODEL=gpt-4o`
- `AI_MATCHING_MODEL=gpt-4o-mini`

You can move to a stronger matching model later without changing the extension package.

## What This Does Not Solve Yet

This pass does not yet implement:

- server-signed extension sessions
- per-user usage quotas or metered billing
- backend-side cart planning memory by user history
- ranked alternative suggestions rendered in the popup
- store-specific structured extraction models

Those are the next production-grade steps after this pass is stable.

## Recommended Next Iteration

1. Add signed extension session tokens from Sally API to `shopping-agent`.
2. Add per-plan quotas such as:
   - free: no autonomous runs
   - premium: 10 runs/month
   - pro: unlimited
3. Add a backend planning endpoint that returns:
   - primary match
   - approved substitutes
   - max price guardrails
   - dietary exclusions
4. Add analytics on:
   - attempted runs
   - paid conversion prompts
   - product-match rejection rates
   - store-specific failure rates

## Summary

This implementation changes the extension from:

- client-side AI
- exposed model access
- no monetization boundary

to:

- backend AI orchestration
- configurable models
- subscription-aware autonomous shopping

This is the right foundation for charging users and improving intelligence safely.
