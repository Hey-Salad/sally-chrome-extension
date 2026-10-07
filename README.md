# Sally by HeySalad® 🛒

AI-assisted grocery shopping Chrome extension.

## Repository Governance

- Open source boundary: see [OPEN_SOURCE_SCOPE.md](./OPEN_SOURCE_SCOPE.md)
- Security reporting: see [SECURITY.md](./SECURITY.md)
- Contribution rules: see [CONTRIBUTING.md](./CONTRIBUTING.md)
- Standalone GitHub migration flow: see [GITHUB_BOOTSTRAP.md](./GITHUB_BOOTSTRAP.md)
- Internal→public sync flow: see [INTERNAL_PUBLIC_SYNC.md](./INTERNAL_PUBLIC_SYNC.md)

## How It Works

Sally runs guided shopping tasks in your browser on supported UK supermarket sites:

1. **Uses YOUR logged-in session** - No need to share passwords
2. **Works in your current tab** - Navigate to a supermarket, then start a Sally shopping task
3. **AI-powered product matching** - GPT-4o-mini intelligently selects the right products
4. **Keeps checkout under your control** - Sally adds matched items; you review the cart and purchase

## Features

- ✅ **AI Product Matching** - Distinguishes "Apples" from "Apple juice"
- ✅ **Draggable Progress Overlay** - See shopping progress in real-time
- ✅ **Task Tracking** - Track items added, task progress, and shopping sessions
- ✅ **Multi-store Support** - Tesco, Sainsbury's, ASDA, Ocado, Waitrose, Morrisons, and Aldi
- ✅ **Quantity Support** - `2x Milk`, `Bread x3`, `Eggs (6)`

## Installation

### From Source (Development)

1. Clone the repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `heysalad-ai-shopper` folder

## Usage

1. **Open Sally** - Click the Sally icon or Chrome side panel
2. **Chat or paste a list** - Ask Sally to plan groceries, paste a recipe, or enter items with quantities
3. **Start shopping when ready** - Sally stages shopping as a tool, then runs only when you choose to start
4. **Watch progress** - Sally will:
   - Search for each item
   - Use AI to pick the best matching product
   - Click "Add to cart" for each item
   - Show progress, issues, and total cost so far

## Supported Stores

| Store | Status | Search URL |
|-------|--------|------------|
| Tesco | ✅ | `/groceries/en-GB/search?query=` |
| Sainsbury's | ✅ | `/gol-ui/SearchResults/` |
| ASDA | ✅ | `/search/` |
| Ocado | ✅ | `/search?q=` |
| Waitrose | ✅ | `/ecom/shop/search?searchTerm=` |
| Morrisons | ✅ | `/search?q=` |
| Aldi | ✅ | `/search?q=` |

## AI Product Matching

Sally uses the Shopping Agent API (`shopping-agent.heysalad-o.workers.dev`) for intelligent product matching:

```
POST /api/match-product
{
  "query": "Apples",
  "products": [
    { "name": "Gala Apples 6 Pack", "price": 1.50, "index": 0 },
    { "name": "Apple Juice 1L", "price": 1.20, "index": 1 }
  ]
}

Response:
{
  "success": true,
  "bestIndex": 0,
  "confidence": 0.95,
  "reason": "Fresh apples match the query, not apple juice"
}
```

## Stats Tracking

Sally tracks your shopping efficiency:
- **Items Added** - Total items successfully added to carts
- **Time Saved** - Estimated at ~30 seconds per item
- **Shop Trips** - Number of completed shopping sessions

## Project Structure

```
heysalad-ai-shopper/
├── manifest.json              # Extension manifest (v3)
├── background/
│   └── service-worker.js      # Background script (task management)
├── content-scripts/
│   ├── base.js                # Main shopping logic + AI matching
│   └── overlay.css            # Progress overlay styles
├── popup/
│   ├── popup.html             # Popup UI with stats
│   ├── popup.js               # Popup logic
│   └── popup.css              # Styles
├── icons/                     # Extension icons
└── README.md
```

## Development

### Testing

1. Load the extension in developer mode
2. Navigate to a supermarket website
3. Open the popup and enter a shopping list
4. Watch the overlay for progress
5. Check console logs: `[Sally] ...`

### Debugging

- **Content script logs**: Open DevTools on the supermarket page
- **Service worker logs**: Go to `chrome://extensions/` → Sally → "Service worker"
- **Popup logs**: Right-click popup → Inspect

## Privacy & Security

- **No passwords stored** - Uses your existing logged-in sessions
- **Browser-based execution** - Shopping actions run in your current supermarket tab
- **Service data** - Item names, selected store, account and entitlement information, and shopping progress may be sent to HeySalad services
- **OAuth authentication** - Secure magic link login via oauth.heysalad.app
- **Review before purchase** - Sally does not complete checkout for you

## Chrome Web Store Publishing

### Prerequisites

1. **Developer Account** - Register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
2. **Privacy Policy** - Host at `https://heysalad.app/privacy`
3. **Screenshots** - 1280x800 or 640x400 PNG/JPEG

### Required Assets

| Asset | Size | Location |
|-------|------|----------|
| Icon 16px | 16x16 | `icons/icon16.png` |
| Icon 32px | 32x32 | `icons/icon32.png` |
| Icon 48px | 48x48 | `icons/icon48.png` |
| Icon 128px | 128x128 | `icons/icon128.png` |
| Screenshot 1 | 1280x800 | Shopping list entry |
| Screenshot 2 | 1280x800 | Sally shopping in progress |
| Screenshot 3 | 1280x800 | Completed shopping with stats |
| Promo Tile | 440x280 | Marketing image |

### Store Listing Details

**Name**: Sally by HeySalad®
**Short Description** (132 chars max):
> Save time on repeat shopping. Chat with Sally to plan lists, build carts, and run shopping tasks.

**Detailed Description**:
> Sally by HeySalad® helps you save time on repeat shopping.
>
> Chat with Sally to plan groceries, turn recipes into lists, build reusable carts, and run shopping tasks from your browser. Sally is built for everyday shoppers, busy households, creators, assistants, and businesses with repeat buying workflows.
>
> 🛒 HOW IT WORKS
> 1. Open Sally from Chrome
> 2. Chat, paste a list, or ask Sally to plan a shop
> 3. Review the list Sally creates
> 4. Choose when to run shopping as a task
> 5. Watch Sally search, match products, and add items to your cart
>
> ✨ FEATURES
> • Save time on repeat shopping tasks
> • Chat-first planning for groceries, recipes, and shopping lists
> • Build carts from lists, recipes, routines, or repeat workflows
> • AI-powered product matching for supermarket search results
> • Works with your logged-in supermarket session, no password sharing required
> • Live shopping progress with items added, issues, cost, and total so far
> • Supports quantities: "2x milk", "eggs (6)"
>
> 🔒 PRIVACY
> Sally does not store or transmit supermarket passwords. Shopping requests may send grocery item names, store choice, account identity, billing status, and shopping progress to HeySalad services so Sally can plan, run, and measure shopping.

**Category**: Shopping
**Language**: English (UK)

### Publishing Steps

1. **Create ZIP**:
   ```bash
   cd heysalad-ai-shopper
   zip -r sally-extension.zip . -x "*.git*" -x "*.DS_Store"
   ```

2. **Upload to Chrome Web Store**:
   - Go to [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Click "New Item"
   - Upload the ZIP file
   - Fill in store listing details
   - Add screenshots and promotional images
   - Submit for review

3. **Review Timeline**: Usually 1-3 business days

### Permissions Justification

For Chrome Web Store review, explain each permission:

| Permission | Justification |
|------------|---------------|
| `storage` | Save user preferences, shopping stats, and task history |
| `activeTab` | Access current tab to detect supermarket and inject shopping script |
| `scripting` | Inject content script to automate shopping actions |
| `tabs` | Navigate to search results and cart pages |
| `notifications` | Alert user when shopping is complete |

## Changelog

### v1.0.3 (December 2025)
- ✅ **CRITICAL FIX**: Fixed Tesco add/remove toggle bug - items now stay in cart
- ✅ Single click method per store to prevent React toggle issues
- ✅ Added `findIncrementButton()` for quantity > 1 handling
- ✅ Proper quantity controls support after first add

### v1.0.2 (December 2025)
- ✅ Added Morrisons support
- ✅ Added Aldi support
- ✅ Improved Tesco add-to-cart click handling for React/Next.js
- ✅ Optimized wait times for faster shopping (30-50% speed improvement)
- ✅ Added comprehensive test suite
- ✅ Better error handling and debugging logs

### v1.0.1
- Initial Chrome Web Store release
- Support for Tesco, Sainsbury's, ASDA, Ocado, Waitrose
- AI-powered product matching via GPT-4o-mini

## License

Proprietary - HeySalad OÜ

## Contact

- **Email**: peter@heysalad.io
- **Website**: https://heysalad.io
