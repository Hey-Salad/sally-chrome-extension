# Chrome Web Store Listing - Sally by HeySalad®

## Basic Info

**Name**: Sally by HeySalad®
**Version**: 1.0.28
**Category**: Shopping
**Language**: English (UK)

## Short Description (132 characters max)

```
Save time on repeat shopping. Chat with Sally to plan lists, build carts, and run shopping tasks.
```

## Detailed Description

```
Sally by HeySalad® helps you save time on repeat shopping.

Chat with Sally to plan groceries, turn recipes into lists, build reusable carts, and run shopping tasks from your browser. Sally is built for everyday shoppers, busy households, creators, assistants, and businesses with repeat buying workflows.

🛒 HOW IT WORKS
1. Open Sally from Chrome
2. Chat, paste a list, or ask Sally to plan a shop
3. Review the list Sally creates
4. Choose when to run shopping as a task
5. Watch Sally search, match products, and add items to your cart

✨ KEY FEATURES
• Save time on repeat shopping tasks
• Chat-first planning for groceries, recipes, and shopping lists
• Build carts from lists, recipes, routines, or repeat workflows
• AI-powered product matching for supermarket search results
• Works with your logged-in supermarket session, no password sharing required
• Live progress with items added, issues, cost, and total so far
• Quantity support, for example "2x milk", "bread x3", "eggs (6)"
• Useful for households, creators, assistants, offices, and repeat business shopping

🏪 SUPPORTED STORES
• Tesco
• Sainsbury's
• ASDA
• Ocado
• Waitrose
• Morrisons
• Aldi

⏱️ SAVE TIME
Sally handles repetitive searching, matching, and adding so you can focus on deciding what you need. For repeat shops, recipes, and common supply runs, Sally turns the browser work into a guided shopping task.

🔒 PRIVACY & SECURITY
Sally works in your browser using your existing supermarket sessions:
• No passwords stored or transmitted
• Secure HeySalad account sign-in
• Billing and usage limits are checked by HeySalad so paid access is controlled
• Shopping requests may send grocery item names, store choice, account identity, and shopping progress to HeySalad services so Sally can plan, run, and measure shopping
• You stay in control and review your supermarket cart before checkout

📊 TRACK YOUR SHOPPING TASKS
Sally keeps track of:
• Total items added to carts
• Shopping progress and total cost so far
• Number of shopping trips completed
• Repeat shopping workflows over time

Built by HeySalad® - Making grocery shopping effortless.
```

## Privacy Policy URL

```
https://heysalad.app/privacy
```

## Support URL

```
https://heysalad.app/help
```

## Screenshots Needed

1. **Shopping List Entry** (1280x800)
   - Show popup with shopping list textarea
   - Include some example items
   - Store selector visible

2. **Sally Shopping** (1280x800)
   - Show overlay on supermarket page
   - Progress bar visible
   - Items being added

3. **Completed Shopping** (1280x800)
   - Show completion screen
   - Stats card visible
   - "View Cart" button

4. **Saved Lists** (1280x800)
   - Show recent shopping lists
   - Click-to-reuse functionality

## Promotional Images

### Small Promo Tile (440x280)
- Cherry red background (#E01D1D)
- White "S" logo
- "Sally by HeySalad®" text
- "AI Shopping Assistant" tagline

### Large Promo Tile (920x680) - Optional
- Same branding
- Show supported store logos
- "Guided grocery shopping" messaging

### Marquee (1400x560) - Optional
- Full branding with screenshots
- Feature highlights

## Permissions Justification

| Permission | Why We Need It |
|------------|----------------|
| `storage` | To save your Sally session, shopping preferences, shopping task state, and local progress. |
| `activeTab` | To detect which supermarket website you're on and inject Sally's shopping automation script into the current tab. |
| `scripting` | To run Sally's shopping script that searches for products, matches them using AI, and clicks "Add to cart" buttons. |
| `tabs` | To navigate between search results pages and the shopping cart as Sally adds items. |
| `notifications` | To alert you when Sally has finished shopping so you can review your cart. |
| `identity` | To support secure HeySalad sign-in flows. |
| `sidePanel` | To show the Sally chat and shopping tool panel inside Chrome. |

## Host Permissions Justification

| Domain | Why We Need It |
|--------|----------------|
| `tesco.com` | To automate shopping on Tesco's grocery website |
| `sainsburys.co.uk` | To automate shopping on Sainsbury's grocery website |
| `groceries.asda.com` | To automate shopping on ASDA's grocery website |
| `ocado.com` | To automate shopping on Ocado's website |
| `waitrose.com` | To automate shopping on Waitrose's grocery website |
| `morrisons.com` | To automate shopping on Morrisons grocery pages |
| `aldi.co.uk` | To automate shopping on Aldi grocery pages |
| `oauth.heysalad.app` | For secure user authentication via magic link |
| `shopping-agent.heysalad-o.workers.dev` | For AI-powered product matching API |
| `sally-api.heysalad.app` | For Sally account, profile, and shopping services |

## Review Notes for Google

```
Sally is a chat-first grocery assistant that helps users plan groceries and optionally run supermarket shopping as a browser tool.

Key points for review:
1. We do NOT store or transmit user passwords
2. We use the user's existing logged-in session
3. Users choose when to start a shopping run
4. Sally may send grocery item names, store choice, account identity, billing status, and shopping progress to HeySalad services to operate the assistant
5. OAuth authentication uses secure magic links

To test:
1. Install the extension
2. Go to https://www.tesco.com/groceries/
3. Log in with your Tesco account (or create one)
4. Click the Sally icon
5. Ask Sally to plan groceries or paste items like "Milk" and "Bread"
6. Start shopping when Sally stages the list
7. Watch Sally search and add items to your cart
```
