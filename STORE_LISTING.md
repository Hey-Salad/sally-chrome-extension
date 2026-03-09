# Chrome Web Store Listing - Sally by HeySalad®

## Basic Info

**Name**: Sally by HeySalad®
**Version**: 1.0.1
**Category**: Shopping
**Language**: English (UK)

## Short Description (132 characters max)

```
Meet Sally, your AI shopping assistant. She adds groceries to your cart automatically at UK supermarkets.
```

## Detailed Description

```
Sally is your personal AI shopping assistant that automates grocery shopping at UK supermarkets.

🛒 HOW IT WORKS
1. Navigate to Tesco, Sainsbury's, ASDA, Ocado, or Waitrose
2. Enter your shopping list in Sally
3. Click "Let Sally Shop!" and watch her add items to your cart

✨ KEY FEATURES
• AI-powered product matching - Sally intelligently picks the right products
• Works with your logged-in session - no password sharing required
• Real-time progress overlay - see exactly what Sally is doing
• Stats tracking - track items added, time saved, and shopping trips
• Quantity support - "2x Milk", "Bread x3", "Eggs (6)"
• Saved lists - reuse your previous shopping lists with one click

🏪 SUPPORTED STORES
• Tesco
• Sainsbury's
• ASDA
• Ocado
• Waitrose

⏱️ SAVE TIME
Sally estimates saving ~30 seconds per item. A typical 20-item shop that would take 10+ minutes of searching and clicking is done in under 2 minutes.

🔒 PRIVACY & SECURITY
Sally works entirely in your browser using your existing supermarket sessions:
• No passwords stored or transmitted
• No personal data sent to servers
• Only product names sent for AI matching
• Secure OAuth authentication

📊 TRACK YOUR SAVINGS
Sally keeps track of:
• Total items added to carts
• Estimated time saved
• Number of shopping trips completed

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
- "Shop 5x faster" messaging

### Marquee (1400x560) - Optional
- Full branding with screenshots
- Feature highlights

## Permissions Justification

| Permission | Why We Need It |
|------------|----------------|
| `storage` | To save your shopping preferences, track your stats (items added, time saved), and remember your recent shopping lists for quick reuse. |
| `activeTab` | To detect which supermarket website you're on and inject Sally's shopping automation script into the current tab. |
| `scripting` | To run Sally's shopping script that searches for products, matches them using AI, and clicks "Add to cart" buttons. |
| `tabs` | To navigate between search results pages and the shopping cart as Sally adds items. |
| `notifications` | To alert you when Sally has finished shopping so you can review your cart. |

## Host Permissions Justification

| Domain | Why We Need It |
|--------|----------------|
| `tesco.com` | To automate shopping on Tesco's grocery website |
| `sainsburys.co.uk` | To automate shopping on Sainsbury's grocery website |
| `groceries.asda.com` | To automate shopping on ASDA's grocery website |
| `ocado.com` | To automate shopping on Ocado's website |
| `waitrose.com` | To automate shopping on Waitrose's grocery website |
| `oauth.heysalad.app` | For secure user authentication via magic link |
| `shopping-agent.heysalad-o.workers.dev` | For AI-powered product matching API |

## Review Notes for Google

```
Sally is a shopping automation tool that helps users add groceries to their cart faster.

Key points for review:
1. We do NOT store or transmit user passwords
2. We use the user's existing logged-in session
3. AI matching only receives product names, not personal data
4. All automation happens client-side in the user's browser
5. OAuth authentication uses industry-standard magic links

To test:
1. Install the extension
2. Go to https://www.tesco.com/groceries/
3. Log in with your Tesco account (or create one)
4. Click the Sally icon
5. Enter items like "Milk" and "Bread"
6. Click "Let Sally Shop!"
7. Watch Sally search and add items to your cart
```
