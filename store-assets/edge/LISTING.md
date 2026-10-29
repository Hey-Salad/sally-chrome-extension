# Microsoft Edge Add-ons listing — Sally by HeySalad®

Paste the sections below into Partner Center. Do not submit this package from the repository automation. The product name is Sally.

This package is version **1.0.28**, the version live on the Chrome Web Store:

https://chromewebstore.google.com/detail/sally-by-heysalad%C2%AE/bocfhkkokpfjcgchdkenflanjbkmdika

The Chrome Web Store listing was not changed.

## Properties

| Field | Value |
| --- | --- |
| Extension name | Sally by HeySalad® |
| Short description | Taken from `manifest.json` `description`. Do not edit it in Partner Center. |
| Category | Shopping |
| Language | English (United Kingdom) |
| Website | https://sally.heysalad.app/ |
| Support contact | sally@heysalad.app |
| Mature content | No |

`https://heysalad.app/help` currently redirects to the HeySalad homepage, so it is not a support URL. Use the email above.

## Short description

This is the manifest `description`. Edge shows it as the short description. It is 99 characters.

```
Save time on repeat shopping. Chat with Sally to plan lists, build carts, and run shopping tasks.
```

## Description

Partner Center requires 250 to 10,000 characters. Paste this as the English (United Kingdom) description.

```
Sally is your AI shopping assistant for repeat grocery shopping in Microsoft Edge. Chat with Sally to plan what you need, turn a recipe or a rough idea into a list, and run that list on a supported supermarket website.

Sally runs in Microsoft Edge and uses the supermarket session you already signed in to. You do not give Sally your store password. You decide when a shop starts, you can pause or stop it, and you review the cart before you buy anything. Sally adds matching products to the cart. Sally does not enter card details and does not place the supermarket order.

How Sally works:
1. Open a supported supermarket website in Microsoft Edge.
2. Open Sally from the toolbar. Sally opens in the side panel.
3. Chat with Sally, paste a list, or describe a meal. Review the list, then start the shopping task.
4. Sally searches that supermarket, selects matching products, and adds them to your cart.
5. Watch item-by-item progress. Pause or stop at any time. When the run finishes, Sally opens the trolley or basket so you can check it.

What you can do with Sally:
- Turn grocery ideas, recipes, and written lists into a shopping task.
- Follow live progress while items are added.
- Use quantities such as "2x milk" or "bread x3".
- Shop only on the supermarket sites listed below.
- Keep checkout and payment on the supermarket website.

Supported supermarket websites: Tesco, Sainsbury's, ASDA, Ocado, Waitrose, Morrisons, and Aldi.

Sally is for households that repeat the same grocery shop, and for anyone planning meals who wants the cart filled without searching for every item by hand.

Sign-in is a magic link to your email. Optional HeySalad Pro or Max billing is handled on HeySalad's own site after you choose to upgrade. A free session can run a limited number of autonomous shops. Product names from the page are sent so Sally can pick a match, and messages you type are sent so Sally can turn them into a list.

Sally by HeySalad helps you save time on repeat shopping by turning a conversation into a cart you still approve.
```

## Privacy policy URL

```
https://sally.heysalad.app/privacy.html
```

Use this URL. It returns the Sally privacy policy, last updated 18 February 2026, and it covers the Sally extension, the iOS app, and the camera. It says personal information is not sold, shopping lists and account details are processed to run Sally, and shopping and recipe requests are sent to OpenAI under an enterprise agreement.

Do not use `https://heysalad.app/privacy`. That address redirects to the HeySalad homepage, not a privacy policy. `https://heysalad.ai/privacy` is a different product policy and does not describe this extension.

## Single purpose

```
Sally plans a grocery list from chat, a pasted list, or a recipe, then searches supported supermarket sites and adds matching products to the cart. The shopper pauses, stops, and pays on the supermarket site.
```

## Remote code

Select **No, I am not using remote code**.

Sally is Manifest V3. Scripts ship inside the package. Network calls return JSON for sign-in, product matching, chat, and task progress. Sally does not fetch or execute remote JavaScript.

## Data use

Select these categories:

- Personally identifiable information. Account name and email from magic-link sign-in.
- Authentication information. The extension session token stored locally after sign-in.
- Personal communications. Chat messages and grocery lists the shopper types or imports.
- Website content. Product names and prices read on a supported supermarket page, and recipe text on Sally pages, so Sally can match items.
- User activity. Shopping-task progress, pause and stop, and items added during a run.

Also true, and should be disclosed if the form asks in this way:

- An optional delivery postcode the shopper types, used to choose a supermarket flow.
- Optional HeySalad Pro or Max upgrade. The extension opens HeySalad billing. It does not collect card numbers.

Do not select health information, web browsing history, or location beyond a postcode the shopper chooses to type. Sally does not request the browser history permission and does not read the history database.

Certify all three statements. They match the privacy policy:

- Data is not sold to third parties, outside of the approved use cases.
- Data is not used or transferred for purposes unrelated to Sally's shopping assistant.
- Data is not used or transferred to determine creditworthiness or for lending.

## Permission justifications

Paste one justification into each Partner Center permission box.

### storage

Sally saves the shopper's sign-in session, grocery lists, shopping-task progress, and local stats on the device. Without storage, Sally would forget the list and the signed-in session every time Microsoft Edge restarts.

### activeTab

Sally reads the address of the tab the shopper is using so she can tell whether it is a supported supermarket and run the shopping task there. Access follows the tab the shopper is actively using.

### scripting

Sally injects her packaged shopping script into a supported supermarket tab to search, choose a matching product, and click add to basket. The script is part of this package. It is not downloaded from the network.

### tabs

Sally opens or updates a supermarket tab, reads its address while a task is running, and moves to the trolley or basket when the list is finished. She needs this to shop in the right tab and to group that tab for the shopper.

### tabGroups

When Sally opens a supermarket tab for a run, she puts it in a tab group titled Sally so the shop stays separate from the shopper's other tabs. If tab groups are unavailable, Sally continues without grouping.

### notifications

Sally notifies the shopper when a shopping run finishes and when a recipe page has a list ready to save. The notification is local to Microsoft Edge. It does not send a marketing message.

### identity

Sign-in uses `chrome.identity.launchWebAuthFlow` with a magic link from `https://oauth.heysalad.app`. Sally does not use a Google account token. The redirect URL is `https://<extension-id>.chromiumapp.org/oauth`.

### sidePanel

Sally's chat, list, and progress UI live in the Microsoft Edge side panel. The toolbar button opens that panel. Microsoft Edge 114 or later is required for the side panel API.

## Host permission justifications

### https://www.tesco.com/* and https://secure.tesco.com/*

Sally searches Tesco groceries and adds matching products to the Tesco trolley in the shopper's own signed-in session.

### https://www.sainsburys.co.uk/*

Sally searches Sainsbury's groceries and adds matching products to the Sainsbury's trolley.

### https://groceries.asda.com/*

Sally searches ASDA groceries and adds matching products to the ASDA trolley.

### https://www.ocado.com/*

Sally searches Ocado and adds matching products to the Ocado basket.

### https://www.waitrose.com/*

Sally searches Waitrose groceries and adds matching products to the Waitrose trolley.

### https://groceries.morrisons.com/* and https://www.morrisons.com/*

Sally searches Morrisons groceries and adds matching products to the Morrisons trolley.

### https://www.aldi.co.uk/*

Sally searches Aldi and adds matching products to the Aldi basket.

### https://oauth.heysalad.app/*

Magic-link sign-in, session validation, and optional HeySalad Pro or Max upgrade. Sally does not collect the supermarket password here.

### https://shopping-agent.heysalad-o.workers.dev/*

Product matching. Sally sends the grocery query and the product names on the page, and receives which product is the best match.

### https://sally-api.heysalad.app/* and https://sally-api.heysalad-o.workers.dev/*

Sally's API for shopping tasks, chat, and account state. `wss://sally-api.heysalad-o.workers.dev/*` is the same service over WebSocket, used for live progress between Sally and a linked phone session.

### https://chat.heysalad.app/*, https://heysalad.app/*, and https://sally.heysalad.app/*

Content script only, for recipe pages. Sally reads a recipe the shopper has opened on these sites and offers to turn it into a grocery list. These hosts are not supermarket automation targets.

## Search terms

```
grocery shopping
shopping list
supermarket cart
recipe to cart
meal planning
Tesco
weekly shop
```

## Store images already in this repo

Upload these separately in Partner Center. They are not inside the extension zip.

| Asset | Size | Path |
| --- | --- | --- |
| Logo, meets the 128×128 minimum | 128×128 | `icons/icon128.png` |
| Small promotional tile | 440×280 | `store-assets/chrome-store/small-promo-tile-440x280.png` |
| Large promotional tile | 1400×560 | `store-assets/chrome-store/marquee-promo-tile-1400x560.png` |
| Screenshot 1 | 1280×800 | `store-assets/chrome-store/screenshot-1-chat-planning-1280x800.png` |
| Screenshot 2 | 1280×800 | `store-assets/chrome-store/screenshot-2-build-reusable-carts-1280x800.png` |
| Screenshot 3 | 1280×800 | `store-assets/chrome-store/screenshot-3-shopping-progress-1280x800.png` |
| Screenshot 4 | 1280×800 | `store-assets/chrome-store/screenshot-4-recipe-to-cart-1280x800.png` |
| Screenshot 5 | 1280×800 | `store-assets/chrome-store/screenshot-5-repeat-workflows-1280x800.png` |

Partner Center recommends a 300×300 logo. The packaged icon is 128×128, which meets the published minimum. A 300×300 logo is still worth uploading before submission.

## Notes for certification

```
The product name is Sally. Please use that full name throughout the review.

This is the Microsoft Edge package of Sally by HeySalad, version 1.0.28. That is the version currently published on the Chrome Web Store (extension id bocfhkkokpfjcgchdkenflanjbkmdika, updated 13 July 2026). This submission is a new Microsoft Edge Add-ons listing. It is not an update to an existing Edge extension.

There is no shared demo password. Use a supermarket account you control, and an email inbox you control for the magic link. Do not place a supermarket order, do not enter card details, and do not complete a HeySalad Pro or Max upgrade. Those paid steps are out of scope for this test.

Install the uploaded zip. In Microsoft Edge, pin Sally. The toolbar button opens the side panel. Microsoft Edge 114 or later is required.

Sign-in test:
1. Open Sally.
2. Enter an email address you control.
3. Sally opens https://oauth.heysalad.app through the extension identity flow.
4. Use the magic link in that window.
5. Sally should return to the side panel signed in.

The redirect URI is https://<this-edge-extension-id>.chromiumapp.org/oauth. If sign-in fails before a supermarket test, the usual cause is that this Edge redirect URI is not allowlisted on oauth.heysalad.app yet. Shopping can still be tested while signed in to the supermarket itself.

Shopping test, Tesco (Ocado, Sainsbury's, ASDA, Waitrose, Morrisons, or Aldi are also valid):
1. Sign in at https://www.tesco.com/groceries/ with an account you control.
2. Open Sally's side panel.
3. Enter three lines: Milk, Bread, and 2x eggs.
4. Start the shopping task.
5. Confirm the on-page progress overlay updates and products are added to the trolley.
6. Pause the run, resume it, then stop it.
7. If the run finishes, Sally opens the trolley or basket. Confirm the items, then leave without paying.

Expected behaviour:
- Sally only automates the supermarket hosts declared in the manifest.
- Recipe import runs on https://sally.heysalad.app/, https://heysalad.app/, and https://chat.heysalad.app/. It does not run on the supermarket hosts.
- A free account can run 2 autonomous shops. A later attempt should explain the limit and point at HeySalad billing. Do not pay for an upgrade.
- Network calls go to oauth.heysalad.app, sally-api.heysalad.app, sally-api.heysalad-o.workers.dev (HTTPS and WSS), and shopping-agent.heysalad-o.workers.dev. Responses are data, not remote code.
- No supermarket password is stored or sent to HeySalad.
```

## Manifest checks for this package

The zip is built by `npm run package:edge`. The packager:

- Requires Manifest V3.
- Removes `update_url` and `key` if they are present, so Partner Center does not receive a Chrome update URL and Edge can assign a new extension id.
- Requires the name, short name, and toolbar title to say Sally.
- Requires the name, short name, and description not to say Chrome.
- Puts `manifest.json` at the root of the zip and omits docs, tests, and store screenshots.

Permissions in this package are the same set as the published 1.0.28 extension. No permission was added for Edge.

The published 1.0.28 zip references `OPENAI_API_URL`, `DEFAULT_COMPOSER_MODEL`, `DEFAULT_CLASSIFIER_MODEL`, and `DEFAULT_REALTIME_MODEL` when Sally is installed, but it does not define them. This package defines them from the 1.0.28 backup in this repo, including the public OpenAI responses endpoint and the backup's composer, classifier, and realtime model ids. Those direct OpenAI functions are not called by the shopping flow. Chat uses the Sally API host `sally-api.heysalad-o.workers.dev`. A `reasoning` request field that exists only in the backup, and not in the published zip, is not included.
