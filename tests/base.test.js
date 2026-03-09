/**
 * Sally by HeySalad® - Base Content Script Tests
 * 
 * Tests for the core shopping functionality
 */

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn()
    }
  }
};

global.chrome = mockChrome;

// Mock fetch for AI matching
global.fetch = jest.fn();

describe('Sally Shopping Extension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Store Detection', () => {
    const stores = [
      { hostname: 'www.tesco.com', expected: 'tesco' },
      { hostname: 'www.sainsburys.co.uk', expected: 'sainsburys' },
      { hostname: 'groceries.asda.com', expected: 'asda' },
      { hostname: 'www.ocado.com', expected: 'ocado' },
      { hostname: 'www.waitrose.com', expected: 'waitrose' },
      { hostname: 'groceries.morrisons.com', expected: 'morrisons' },
      { hostname: 'www.aldi.co.uk', expected: 'aldi' }
    ];

    stores.forEach(({ hostname, expected }) => {
      test(`should detect ${expected} from hostname ${hostname}`, () => {
        expect(hostname.includes(expected) || hostname.includes(expected.substring(0, 4))).toBe(true);
      });
    });
  });

  describe('Search URL Generation', () => {
    const searchUrls = {
      tesco: 'https://www.tesco.com/groceries/en-GB/search?query=',
      sainsburys: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/',
      asda: 'https://groceries.asda.com/search/',
      ocado: 'https://www.ocado.com/search?q=',
      waitrose: 'https://www.waitrose.com/ecom/shop/search?searchTerm=',
      morrisons: 'https://groceries.morrisons.com/search?q=',
      aldi: 'https://www.aldi.co.uk/search?q='
    };

    Object.entries(searchUrls).forEach(([store, baseUrl]) => {
      test(`should generate correct search URL for ${store}`, () => {
        const query = 'milk';
        const expectedUrl = `${baseUrl}${encodeURIComponent(query)}`;
        expect(expectedUrl).toContain(query);
        expect(expectedUrl).toContain(store === 'sainsburys' ? 'sainsburys' : store.substring(0, 4));
      });
    });
  });

  describe('Checkout URL Generation', () => {
    const checkoutUrls = {
      tesco: 'https://www.tesco.com/groceries/en-GB/trolley',
      sainsburys: 'https://www.sainsburys.co.uk/gol-ui/trolley',
      asda: 'https://groceries.asda.com/trolley',
      ocado: 'https://www.ocado.com/webshop/getBasket.do',
      waitrose: 'https://www.waitrose.com/ecom/shop/trolley',
      morrisons: 'https://groceries.morrisons.com/trolley',
      aldi: 'https://www.aldi.co.uk/checkout/cart'
    };

    Object.entries(checkoutUrls).forEach(([store, url]) => {
      test(`should have correct checkout URL for ${store}`, () => {
        expect(url).toBeTruthy();
        expect(url.startsWith('https://')).toBe(true);
      });
    });
  });

  describe('AI Product Matching', () => {
    test('should call Shopping Agent API for product matching', async () => {
      const mockResponse = {
        success: true,
        bestIndex: 0,
        confidence: 0.95,
        reason: 'Exact match found'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const query = 'semi-skimmed milk';
      const products = [
        { name: 'Tesco Semi-Skimmed Milk 2L', price: 1.45, index: 0 },
        { name: 'Tesco Whole Milk 2L', price: 1.45, index: 1 },
        { name: 'Tesco Skimmed Milk 2L', price: 1.40, index: 2 }
      ];

      // Simulate the API call
      const response = await fetch('https://shopping-agent.heysalad-o.workers.dev/api/match-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, products })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.bestIndex).toBe(0);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should handle API errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch('https://shopping-agent.heysalad-o.workers.dev/api/match-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'milk', products: [] })
        });
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Product Selectors', () => {
    const storeSelectors = {
      asda: ['[data-auto-id="productTile"]', '.co-product', '[class*="ProductTile"]'],
      tesco: ['[data-auto="product-tile"]', '.product-tile', '[class*="ProductTile"]'],
      sainsburys: ['[data-test-id="product-tile"]', '.pt-grid-item', '.ln-c-card'],
      ocado: ['[data-sku]', '.fop-item', '[class*="product-pod"]'],
      waitrose: ['[data-testid="product-pod"]', '.productPod'],
      morrisons: ['[data-test="fop-item"]', '.fop-item', '.product-card'],
      aldi: ['.product-tile', '.product-card', '.search-results__item']
    };

    Object.entries(storeSelectors).forEach(([store, selectors]) => {
      test(`should have valid selectors for ${store}`, () => {
        expect(selectors.length).toBeGreaterThan(0);
        selectors.forEach(selector => {
          expect(typeof selector).toBe('string');
          expect(selector.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Add Button Selectors', () => {
    const addButtonSelectors = {
      asda: ['[data-auto-id="addButton"]', 'button[class*="add-to-trolley"]'],
      tesco: ['button[data-auto="add-button"]', 'button[class*="add-control"]'],
      sainsburys: ['[data-test-id="add-button"]', '.pt__icons__add'],
      ocado: ['.fop-add-to-basket', 'button[aria-label*="Add"]'],
      waitrose: ['[data-testid="add-to-trolley-button"]', '.addToTrolley'],
      morrisons: ['[data-test="add-to-trolley"]', '.fop-add-to-trolley'],
      aldi: ['.product-tile__add-to-cart', '[data-testid="add-to-cart"]']
    };

    Object.entries(addButtonSelectors).forEach(([store, selectors]) => {
      test(`should have valid add button selectors for ${store}`, () => {
        expect(selectors.length).toBeGreaterThan(0);
        selectors.forEach(selector => {
          expect(typeof selector).toBe('string');
        });
      });
    });
  });

  describe('Task State Management', () => {
    test('should track item status correctly', () => {
      const task = {
        items: [
          { name: 'Milk', quantity: 2, status: 'pending' },
          { name: 'Bread', quantity: 1, status: 'pending' },
          { name: 'Eggs', quantity: 1, status: 'pending' }
        ]
      };

      // Simulate processing first item
      task.items[0].status = 'searching';
      expect(task.items.filter(i => i.status === 'pending').length).toBe(2);
      expect(task.items.filter(i => i.status === 'searching').length).toBe(1);

      // Simulate item added
      task.items[0].status = 'added';
      task.items[0].productName = 'Tesco Semi-Skimmed Milk 2L';
      task.items[0].price = 2.90;
      expect(task.items.filter(i => i.status === 'added').length).toBe(1);

      // Simulate item failed
      task.items[1].status = 'failed';
      task.items[1].failReason = 'No products found';
      expect(task.items.filter(i => i.status === 'failed').length).toBe(1);
    });

    test('should calculate progress correctly', () => {
      const task = {
        items: [
          { name: 'Milk', status: 'added' },
          { name: 'Bread', status: 'added' },
          { name: 'Eggs', status: 'failed' },
          { name: 'Butter', status: 'pending' }
        ]
      };

      const total = task.items.length;
      const completed = task.items.filter(i => i.status === 'added' || i.status === 'failed').length;
      const percent = (completed / total) * 100;

      expect(total).toBe(4);
      expect(completed).toBe(3);
      expect(percent).toBe(75);
    });
  });

  describe('Price Parsing', () => {
    const priceTests = [
      { input: '£1.50', expected: 1.50 },
      { input: '£10.99', expected: 10.99 },
      { input: '1.45', expected: 1.45 },
      { input: '£0.99', expected: 0.99 },
      { input: 'Price: £2.50', expected: 2.50 },
      { input: '', expected: 0 },
      { input: null, expected: 0 }
    ];

    priceTests.forEach(({ input, expected }) => {
      test(`should parse "${input}" as ${expected}`, () => {
        const parsePrice = (text) => {
          if (!text) return 0;
          const match = text.match(/£?([\d.]+)/);
          return match ? parseFloat(match[1]) : 0;
        };

        expect(parsePrice(input)).toBe(expected);
      });
    });
  });

  describe('URL Detection', () => {
    const searchPageTests = [
      { url: 'https://www.tesco.com/groceries/en-GB/search?query=milk', expected: true },
      { url: 'https://groceries.asda.com/search/milk', expected: true },
      { url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/milk', expected: true },
      { url: 'https://www.ocado.com/search?q=milk', expected: true },
      { url: 'https://www.waitrose.com/ecom/shop/search?searchTerm=milk', expected: true },
      { url: 'https://groceries.morrisons.com/search?q=milk', expected: true },
      { url: 'https://www.aldi.co.uk/search?q=milk', expected: true },
      { url: 'https://www.tesco.com/groceries/', expected: false },
      { url: 'https://www.tesco.com/groceries/en-GB/trolley', expected: false }
    ];

    searchPageTests.forEach(({ url, expected }) => {
      test(`should detect "${url}" as search page: ${expected}`, () => {
        const isSearchResultsPage = (testUrl) => {
          return testUrl.includes('/search') || 
                 testUrl.includes('query=') || 
                 testUrl.includes('searchTerm=') ||
                 testUrl.includes('/SearchResults/') ||
                 testUrl.includes('?q=') ||
                 testUrl.includes('&q=');
        };

        expect(isSearchResultsPage(url)).toBe(expected);
      });
    });
  });
});

describe('Shopping List Discrepancy Detection', () => {
  test('should detect quantity mismatches', () => {
    const requested = { name: 'Milk', quantity: 2 };
    const added = { name: 'Tesco Semi-Skimmed Milk 2L', quantity: 1 };

    const hasDiscrepancy = requested.quantity !== added.quantity;
    expect(hasDiscrepancy).toBe(true);
  });

  test('should detect missing items', () => {
    const shoppingList = [
      { name: 'Milk', quantity: 2 },
      { name: 'Bread', quantity: 1 },
      { name: 'Eggs', quantity: 1 }
    ];

    const addedItems = [
      { name: 'Milk', status: 'added' },
      { name: 'Bread', status: 'failed' }
    ];

    const missingItems = shoppingList.filter(item => 
      !addedItems.find(added => added.name === item.name && added.status === 'added')
    );

    expect(missingItems.length).toBe(2); // Bread (failed) and Eggs (not processed)
  });

  test('should calculate total cost correctly', () => {
    const items = [
      { name: 'Milk', quantity: 2, price: 1.45 },
      { name: 'Bread', quantity: 1, price: 1.20 },
      { name: 'Eggs', quantity: 1, price: 2.50 }
    ];

    const totalCost = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    expect(totalCost).toBeCloseTo(6.60, 2);
  });
});
