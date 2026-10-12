# Sally Roadmap

Success is measured by two numbers in PostHog (project **HeySalad AI**, EU): **shop failure rate** and **shop duration**.

## 1.0.29 — Restore reliability (API-first)
The extension worked against the old API contract; fix the API to match it first.

API:
- [ ] Require auth on `classify` and `compose`.
- [ ] Return `shouldAdd` in the match response (extension falls back to strict word-match without it).
- [ ] Stop an AI `clarify` response overriding the user's parsed list.
- [ ] Longer access-token lifetime / refresh (sessions die after 15 min).
- [ ] PostHog events: `list_parsed`, `item_matched`, `cart_item_added`, `cart_add_failed` (with `reason`), `session_expired`, `llm_call_completed` (cost, latency).

Extension (only these two):
- [ ] Update Ocado selectors for the current page.
- [ ] Restore the missing 1.0.28 constants that break install.

Exit: a test Ocado shop (~£40) passes end-to-end.

## v2 — Smarter, faster, fewer failures
OpenAI models only.

**Target:** a £40 Ocado shop in **under 10 minutes** with **< 5% of items failing**, measured in PostHog.

Ideas:
- Per-user memory: learn from past picks, brand swaps and rejected items.
- Local matching for easy items; a small, fast OpenAI model only for unclear ones.
- Parallel product searches.
- Read the page/DOM structure instead of brittle CSS selectors.
- Vision fallback using a general OpenAI vision model when a layout confuses Sally.
- Eval set of real lists → expected products, run on every prompt/model change.

Deferred: custom YOLO CV model (only worth it for real-world camera use such as shelf/fridge scanning).
