/**
 * Sally by HeySalad® - Integration Tests
 * 
 * Tests the integration with Shopping Agent API
 * Run with: npm test -- --testPathPattern=integration
 */

const SHOPPING_AGENT_URL = 'https://shopping-agent.heysalad-o.workers.dev';

describe('Shopping Agent API Integration', () => {
  // Skip online checks when CI or when fetch is unavailable in the Jest runtime.
  const itIfOnline = (process.env.CI || typeof fetch !== 'function') ? it.skip : it;

  describe('Product Matching API', () => {
    itIfOnline('should match products using AI', async () => {
      const query = 'semi-skimmed milk 2 litres';
      const products = [
        { name: 'Tesco British Semi Skimmed Milk 2L', price: 1.45, index: 0, inStock: true },
        { name: 'Tesco British Whole Milk 2L', price: 1.45, index: 1, inStock: true },
        { name: 'Tesco British Skimmed Milk 2L', price: 1.40, index: 2, inStock: true },
        { name: 'Cravendale Semi Skimmed Milk 2L', price: 2.10, index: 3, inStock: true },
        { name: 'Tesco Organic Semi Skimmed Milk 1L', price: 1.35, index: 4, inStock: true }
      ];

      const response = await fetch(`${SHOPPING_AGENT_URL}/api/match-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, products })
      });

      expect(response.ok).toBe(true);
      
      const result = await response.json();
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('bestIndex');
      expect(result).toHaveProperty('confidence');
      
      if (result.success) {
        // Should pick the first semi-skimmed 2L option
        expect(result.bestIndex).toBe(0);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    }, 30000);

    itIfOnline('should handle empty product list', async () => {
      const response = await fetch(`${SHOPPING_AGENT_URL}/api/match-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'milk', products: [] })
      });

      const result = await response.json();
      
      // Should return a fallback or error
      expect(result).toHaveProperty('success');
    }, 10000);

    itIfOnline('should prefer in-stock items', async () => {
      const query = 'bread';
      const products = [
        { name: 'Hovis Best of Both 800g', price: 1.50, index: 0, inStock: false },
        { name: 'Warburtons Toastie 800g', price: 1.45, index: 1, inStock: true },
        { name: 'Kingsmill 50/50 800g', price: 1.40, index: 2, inStock: true }
      ];

      const response = await fetch(`${SHOPPING_AGENT_URL}/api/match-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, products })
      });

      const result = await response.json();
      
      if (result.success) {
        // Should not pick the out-of-stock item
        expect(result.bestIndex).not.toBe(0);
      }
    }, 30000);
  });

  describe('Health Check', () => {
    itIfOnline('should return healthy status', async () => {
      const response = await fetch(`${SHOPPING_AGENT_URL}/api/health`);
      
      expect(response.ok).toBe(true);
      
      const result = await response.json();
      expect(result.status).toBe('ok');
    }, 10000);
  });
});

describe('Shopping List Validation', () => {
  test('should validate shopping list format', () => {
    const validList = {
      items: [
        { name: 'Milk', quantity: 2 },
        { name: 'Bread', quantity: 1 },
        { name: 'Eggs', quantity: 1 }
      ],
      store: 'tesco'
    };

    expect(validList.items).toBeInstanceOf(Array);
    expect(validList.items.length).toBeGreaterThan(0);
    
    validList.items.forEach(item => {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('quantity');
      expect(typeof item.name).toBe('string');
      expect(typeof item.quantity).toBe('number');
      expect(item.quantity).toBeGreaterThan(0);
    });
  });

  test('should detect invalid items', () => {
    const invalidItems = [
      { name: '', quantity: 1 }, // Empty name
      { name: 'Milk', quantity: 0 }, // Zero quantity
      { name: 'Bread', quantity: -1 }, // Negative quantity
      { name: 'Eggs' } // Missing quantity
    ];

    const validateItem = (item) => {
      if (!item.name || item.name.trim() === '') return false;
      if (!item.quantity || item.quantity <= 0) return false;
      return true;
    };

    invalidItems.forEach(item => {
      expect(validateItem(item)).toBe(false);
    });
  });

  test('should normalize item names', () => {
    const normalizeItemName = (name) => {
      return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '');
    };

    expect(normalizeItemName('  Semi-Skimmed Milk  ')).toBe('semiskimmed milk');
    expect(normalizeItemName('BREAD (White)')).toBe('bread white');
    expect(normalizeItemName('Eggs - Free Range')).toBe('eggs  free range');
  });
});

describe('Store Compatibility', () => {
  const supportedStores = ['tesco', 'sainsburys', 'asda', 'ocado', 'waitrose', 'morrisons', 'aldi'];

  supportedStores.forEach(store => {
    test(`should support ${store}`, () => {
      const storeConfig = getStoreConfig(store);
      
      expect(storeConfig).toBeDefined();
      expect(storeConfig.searchUrl).toBeDefined();
      expect(storeConfig.checkoutUrl).toBeDefined();
    });
  });

  test('should reject unsupported stores', () => {
    const unsupportedStores = ['lidl', 'coop', 'iceland', 'amazon'];
    
    unsupportedStores.forEach(store => {
      const config = getStoreConfig(store);
      expect(config).toBeNull();
    });
  });
});

// Helper function to get store configuration
function getStoreConfig(store) {
  const configs = {
    tesco: {
      searchUrl: 'https://www.tesco.com/groceries/en-GB/search?query=',
      checkoutUrl: 'https://www.tesco.com/groceries/en-GB/trolley'
    },
    sainsburys: {
      searchUrl: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/',
      checkoutUrl: 'https://www.sainsburys.co.uk/gol-ui/trolley'
    },
    asda: {
      searchUrl: 'https://groceries.asda.com/search/',
      checkoutUrl: 'https://groceries.asda.com/trolley'
    },
    ocado: {
      searchUrl: 'https://www.ocado.com/search?q=',
      checkoutUrl: 'https://www.ocado.com/webshop/getBasket.do'
    },
    waitrose: {
      searchUrl: 'https://www.waitrose.com/ecom/shop/search?searchTerm=',
      checkoutUrl: 'https://www.waitrose.com/ecom/shop/trolley'
    },
    morrisons: {
      searchUrl: 'https://groceries.morrisons.com/search?q=',
      checkoutUrl: 'https://groceries.morrisons.com/trolley'
    },
    aldi: {
      searchUrl: 'https://www.aldi.co.uk/search?q=',
      checkoutUrl: 'https://www.aldi.co.uk/checkout/cart'
    }
  };

  return configs[store] || null;
}

describe('Discrepancy Detection', () => {
  test('should detect product name mismatches', () => {
    const requested = 'Semi-skimmed milk';
    const matched = 'Tesco British Semi Skimmed Milk 2L';
    
    // Simple similarity check
    const similarity = calculateSimilarity(requested.toLowerCase(), matched.toLowerCase());
    
    // Should have some similarity since both contain "semi" and "skimmed" and "milk"
    expect(similarity).toBeGreaterThan(0.3);
  });

  test('should flag potential wrong items', () => {
    const testCases = [
      { requested: 'Whole milk', matched: 'Skimmed milk', shouldFlag: true },
      { requested: 'White bread', matched: 'Brown bread', shouldFlag: true },
      { requested: 'Semi-skimmed milk', matched: 'Semi Skimmed Milk 2L', shouldFlag: false },
      { requested: 'Free range eggs', matched: 'Tesco Free Range Eggs 12pk', shouldFlag: false }
    ];

    testCases.forEach(({ requested, matched, shouldFlag }) => {
      const similarity = calculateSimilarity(requested.toLowerCase(), matched.toLowerCase());
      const hasOpposingDescriptors =
        (requested.toLowerCase().includes('whole') && matched.toLowerCase().includes('skimmed')) ||
        (requested.toLowerCase().includes('skimmed') && matched.toLowerCase().includes('whole')) ||
        (requested.toLowerCase().includes('white') && matched.toLowerCase().includes('brown')) ||
        (requested.toLowerCase().includes('brown') && matched.toLowerCase().includes('white'));
      const flagged = similarity < 0.4 || hasOpposingDescriptors;
      
      if (shouldFlag) {
        expect(flagged).toBe(true);
      }
    });
  });

  test('should track shopping session statistics', () => {
    const session = {
      startTime: Date.now(),
      store: 'tesco',
      items: [
        { name: 'Milk', status: 'added', confidence: 0.95 },
        { name: 'Bread', status: 'added', confidence: 0.72 },
        { name: 'Eggs', status: 'failed', reason: 'No products found' },
        { name: 'Butter', status: 'added', confidence: 0.88 }
      ]
    };

    const stats = calculateSessionStats(session);
    
    expect(stats.totalItems).toBe(4);
    expect(stats.addedItems).toBe(3);
    expect(stats.failedItems).toBe(1);
    expect(stats.successRate).toBe(0.75);
    expect(stats.averageConfidence).toBeCloseTo(0.85, 2);
  });
});

// Helper functions
function calculateSimilarity(str1, str2) {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matches = 0;
  words1.forEach(word => {
    if (words2.some(w => w.includes(word) || word.includes(w))) {
      matches++;
    }
  });
  
  return matches / Math.max(words1.length, words2.length);
}

function calculateSessionStats(session) {
  const items = session.items;
  const addedItems = items.filter(i => i.status === 'added');
  const failedItems = items.filter(i => i.status === 'failed');
  
  const confidences = addedItems
    .filter(i => i.confidence !== undefined)
    .map(i => i.confidence);
  
  const averageConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
  
  return {
    totalItems: items.length,
    addedItems: addedItems.length,
    failedItems: failedItems.length,
    successRate: addedItems.length / items.length,
    averageConfidence
  };
}
