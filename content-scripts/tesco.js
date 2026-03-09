/**
 * HeySalad AI Shopper - Tesco Content Script
 * 
 * Automates shopping on tesco.com/groceries
 * 
 * Selectors are based on Tesco's current DOM structure (Dec 2025)
 * These may need updating if Tesco changes their website.
 */

// Import base class
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content-scripts/base.js');
script.onload = function() {
  initTescoShopper();
};
(document.head || document.documentElement).appendChild(script);

function initTescoShopper() {
  const config = {
    name: 'Tesco',
    homeUrl: 'https://www.tesco.com/groceries/',
    searchUrl: 'https://www.tesco.com/groceries/en-GB/search?query=',
    cartUrl: 'https://www.tesco.com/groceries/en-GB/trolley',
    selectors: {
      // Search
      searchInput: 'input[name="searchKey"], input[data-auto="search-input"], #search-input',
      searchButton: 'button[data-auto="search-button"], button[type="submit"]',
      
      // Products
      productCard: '[data-auto="product-tile"], .product-tile, [data-testid="product-tile"]',
      productTitle: '[data-auto="product-tile--title"], .product-tile--title, h3 a',
      productPrice: '[data-auto="price-value"], .price-per-sellable-unit, .value',
      
      // Add to cart
      addButton: 'button[data-auto="add-button"], button.add-control, [data-testid="add-button"]',
      quantityInput: 'input[data-auto="quantity-input"], input.quantity-input',
      increaseButton: 'button[data-auto="increase-quantity"], button.increase',
      
      // Cart
      cartCount: '[data-auto="trolley-count"], .trolley-count, [data-testid="trolley-count"]',
      
      // Cookies
      cookieAccept: '#onetrust-accept-btn-handler, button[data-testid="accept-cookies"]'
    }
  };

  class TescoShopper extends window.HeySaladShopper {
    constructor() {
      super('Tesco', config);
      this.acceptCookies();
    }
    
    /**
     * Accept cookies if banner is present
     */
    async acceptCookies() {
      await this.sleep(1000);
      const cookieBtn = document.querySelector(config.selectors.cookieAccept);
      if (cookieBtn) {
        console.log('[HeySalad AIS] Accepting cookies...');
        cookieBtn.click();
        await this.sleep(500);
      }
    }
    
    /**
     * Search for an item and add to cart
     */
    async searchAndAddItem(item) {
      console.log(`[HeySalad AIS] Searching for: ${item.name}`);
      
      try {
        // Navigate to search results
        const searchUrl = `${config.searchUrl}${encodeURIComponent(item.name)}`;
        window.location.href = searchUrl;
        
        // Wait for page to load
        await this.waitForNavigation();
        await this.sleep(2000);
        
        // Wait for products to appear
        let products;
        try {
          await this.waitForElement(config.selectors.productCard, 10000);
          products = document.querySelectorAll(config.selectors.productCard);
        } catch (e) {
          return { success: false, error: 'No products found' };
        }
        
        if (products.length === 0) {
          return { success: false, error: 'No products found' };
        }
        
        console.log(`[HeySalad AIS] Found ${products.length} products`);
        
        // Get the first product
        const firstProduct = products[0];
        
        // Extract product info
        const titleEl = firstProduct.querySelector(config.selectors.productTitle);
        const priceEl = firstProduct.querySelector(config.selectors.productPrice);
        
        const productName = titleEl?.textContent?.trim() || item.name;
        const priceText = priceEl?.textContent?.trim() || '';
        const price = this.parsePrice(priceText);
        
        console.log(`[HeySalad AIS] Selected: ${productName} - ${priceText}`);
        
        // Find and click add button
        const addButton = firstProduct.querySelector(config.selectors.addButton);
        
        if (!addButton) {
          return { success: false, error: 'Add button not found' };
        }
        
        // Add the required quantity
        for (let i = 0; i < item.quantity; i++) {
          await this.humanClick(addButton);
          await this.sleep(800 + Math.random() * 500);
          
          // After first add, we might need to use increase button
          if (i > 0) {
            const increaseBtn = firstProduct.querySelector(config.selectors.increaseButton);
            if (increaseBtn) {
              await this.humanClick(increaseBtn);
            }
          }
        }
        
        // Verify item was added (check cart count changed)
        await this.sleep(1000);
        
        return {
          success: true,
          productName,
          price: price * item.quantity
        };
        
      } catch (error) {
        console.error('[HeySalad AIS] Error:', error);
        return { success: false, error: error.message };
      }
    }
    
    /**
     * Parse price from text (e.g., "£1.50" -> 1.50)
     * Skips unit prices (per kg, per litre, etc.)
     */
    parsePrice(text) {
      if (!text) return 0;
      
      const lowerText = text.toLowerCase();
      // Skip unit prices
      if (lowerText.includes('/kg') || 
          lowerText.includes('/litre') || 
          lowerText.includes('/l') ||
          lowerText.includes('per kg') ||
          lowerText.includes('per 100')) {
        console.log('[HeySalad AIS] Skipping unit price:', text);
        return 0;
      }
      
      // Handle pence format (e.g., "50p")
      const penceMatch = text.match(/(\d+)p\b/i);
      if (penceMatch && !text.includes('£')) {
        return parseInt(penceMatch[1], 10) / 100;
      }
      
      // Standard pound format
      const match = text.match(/£\s*([\d]+(?:\.[\d]{1,2})?)/);
      return match ? parseFloat(match[1]) : 0;
    }
  }

  // Initialize the shopper
  new TescoShopper();
}
