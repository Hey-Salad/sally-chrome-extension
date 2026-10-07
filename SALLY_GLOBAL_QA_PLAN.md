# Sally Global QA Plan

## Position

Sally should be store-agnostic by default, with first-class UK supermarket support and a store adapter model for global expansion.

The launch promise should be:

> Give Sally a grocery list. Sally builds the basket in your current supermarket tab, or picks a supported store when you do not specify one. You always confirm checkout.

This keeps Sally differentiated from generic AI shopping assistants because Sally executes inside the user's real browser session.

## Product Defaults

- Default user: household shopper doing recurring grocery shops.
- Default store choice: current supported supermarket tab.
- Fallback store choice: user's saved preferred store.
- Final fallback for UK users: Tesco.
- Default matching goal: exact match first, cheapest acceptable equivalent second.
- Default substitution policy: ask before adding materially different substitutions.
- Default monetisation: prove value before subscription gating.
- Mobile role: companion for lists, recipes, saved baskets, pairing, budgets, and history.
- Extension role: execution engine for supermarket automation.

## Store-Agnostic Routing

Sally should decide store using this order:

1. Use the current active tab when it is a supported supermarket.
2. Use the store explicitly requested by the user.
3. Use the user's saved preferred store.
4. Use stores available for the user's postcode/region when known.
5. Use the cheapest supported basket when the user asks for savings.
6. Use premium stores when the user asks for quality.
7. Use Tesco as the UK fallback.

For non-UK users, Sally should not pretend global support exists. It should say the store is not supported yet, offer list cleanup/recipe help, and invite the user to choose a supported store.

## Store Adapter Contract

Each store should have an adapter record with:

- Store id, display name, country, supported domains.
- Search URL builder.
- Cart/trolley URL builder.
- Product card selectors.
- Product title selector.
- Product price selector.
- Add-to-cart selector strategy.
- Quantity selector strategy.
- Login/auth blocker detection.
- Out-of-stock detection.
- Cart update confirmation strategy.
- Substitution sensitivity rules.
- Known failure modes.

The automation engine should call adapter methods instead of hard-coding store-specific selectors throughout the core flow.

## Test Levels

### 1. Unit Tests

Keep these green for every change:

- Item parsing.
- Product language normalization.
- Product fit scoring.
- Store routing.
- Task metrics.
- QR payload generation/parsing.
- Subscription/free-shop gating.

Current extension baseline:

- 117 passing tests.
- 4 skipped tests.

### 2. Adapter Contract Tests

For each supported store, test:

- Domain detection.
- Search URL generation.
- Cart URL generation.
- Product card extraction from saved HTML fixtures.
- Add button detection from saved HTML fixtures.
- Auth blocker detection from saved HTML fixtures.
- Out-of-stock detection from saved HTML fixtures.

Fixtures should be saved under:

```text
tests/fixtures/stores/<country>/<store>/<scenario>.html
```

Required scenarios:

- Search results with exact match.
- Search results with close substitute.
- Search results with unrelated false positives.
- Product out of stock.
- User not logged in.
- Quantity selector present.
- Add-to-cart button changed/disabled.
- Cookie or modal overlay present.

### 3. Browser Automation Tests

Use Playwright with the unpacked extension loaded.

Required flows:

- Open extension.
- Log in or use test auth state.
- Enter list.
- Select store.
- Start shopping.
- Verify overlay appears.
- Verify each item transitions through statuses.
- Verify cart/trolley page is opened at the end.
- Verify no checkout/payment is submitted.

Do not run real payments or real checkout in automated tests.

### 4. Manual Store Regression

Run the same basket across each supported UK store:

```text
milk
bread
eggs
bananas
chicken breast
toilet roll
tomatoes
```

Record:

- Items requested.
- Items found.
- Items added.
- Items skipped.
- Substitutions suggested.
- Time to basket.
- Console errors.
- Store login state.
- Cart total where available.
- Whether user intervention was required.

Pass criteria for a store:

- 80%+ of normal items added without intervention.
- 0 dangerous substitutions.
- 0 automatic checkout/payment attempts.
- Clear messaging for unavailable items.
- Recovery from one failed item without stopping the whole shop.

### 5. Global Expansion Tests

Before adding a non-UK store, complete an adapter spike:

- Country and currency handling.
- Domain and locale variants.
- Delivery/postcode requirements.
- Search page behaviour.
- Cart page behaviour.
- Legal/compliance notes.
- Anti-bot or unusual login constraints.

Global support should be advertised only per country/store once adapter tests pass.

## Priority Store Matrix

| Priority | Store | Country | Status Goal |
| --- | --- | --- | --- |
| P0 | Tesco | UK | Gold path |
| P0 | Sainsbury's | UK | Regression supported |
| P0 | Asda | UK | Regression supported |
| P1 | Ocado | UK | Regression supported |
| P1 | Waitrose | UK | Regression supported |
| P1 | Morrisons | UK | Regression supported |
| P2 | Aldi | UK | Best effort until online flow is proven |
| P3 | Walmart | US | Expansion candidate |
| P3 | Kroger | US | Expansion candidate |
| P3 | Carrefour | EU | Expansion candidate |
| P3 | Tesco IE | Ireland | Expansion candidate |

## Safety Rules

- Never submit checkout automatically.
- Never enter card details automatically.
- Never store supermarket passwords.
- Never add a low-confidence product without confirmation.
- Never hide failed items from the user.
- Always expose what Sally added and why.
- Always let the user stop the run.

## Launch Readiness

Sally is launch-ready for a store only when:

- Unit tests pass.
- Adapter fixture tests pass.
- Browser automation flow passes.
- Manual regression basket passes twice on separate days.
- Store-specific selector changes are documented.
- Privacy copy matches what the extension actually sends to backend services.

## Next Engineering Tasks

1. Extract store-specific behaviour into explicit adapter records.
2. Add saved HTML fixture tests for Tesco, Sainsbury's, Asda, Ocado, Waitrose, Morrisons, and Aldi.
3. Add Playwright extension smoke tests.
4. Add a manual regression results template.
5. Add a supported-store capability screen in the extension.
6. Add global unsupported-store messaging.
7. Add a store confidence score so the UI can say "fully supported", "beta", or "not supported yet".
