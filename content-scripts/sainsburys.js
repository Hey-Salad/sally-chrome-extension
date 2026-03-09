/**
 * HeySalad AI Shopper - Sainsbury's Content Script
 * 
 * Automates shopping on sainsburys.co.uk/gol-ui
 */

// Import base class
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content-scripts/base.js');
script.onload = function() {
  initSainsburysShopper();
};
(document.head || document.documentElement).appendChild(script);

function initSainsburysShopper() {
  const config = {
    name: 'Sainsburys',
    homeUrl: 'https://www.sainsburys.co.uk/gol-ui/',
    searchUrl: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/',
    cartUrl: 'https://www.sainsburys.co.uk/gol-ui/trolley',
    selectors: {
      // Search
      searchInput: '#search-bar-input, input[name="search-term"], [data-test-id="search-input"]',
      searchButton: '[data-test-id="search-button"], button[type="submit"]',
      
      // Products
      productCard: '[data-test-id="product-tile"], .pt-grid-item, .product-tile',
      productTitle: '[data-test-id="product-tile-title"], .pt__title, h2 a',
      productPrice: '[data-test-id="pt-retail-price"], .pt__cost__retail-price',
      
      // Add to cart
      addButton: '[data-test-id="add-button"], .pt__icons__add-button, button.add-button',
      quantityInput: '[data-test-id="quantity-input"]',
      increaseButton: '[data-test-id="increase-quantity-button"]',
      
      // Cart
      cartCount: '[data-test-id="trolley-count"], .mini-trolley__count',
      
      // Cookies
      cookieAccept: '#onetrust-accept-btn-handler, [data-test-id="accept-cookies"]'
    }
  };

  class SainsburysShopper extends window.HeySaladShopper {
    constructor() {
      super('Sainsburys', config);
      this.acceptCookies();
    }
    
    async acceptCookies() {
      await this.sleep(1000);
      const cookieBtn = document.querySelector(config.selectors.cookieAccept);
      if (cookieBtn) {
        console.log('[HeySalad AIS] Accepting cookies...');
        cookieBtn.click();
        await this.sleep(500);
      }
    }
    
    async searchAndAddItem(item) {
      console.log(`[HeySalad AIS] Searching for: ${item.name}`);
      
      try {
        // Navigate to search results
        const searchUrl = `${config.searchUrl}${encodeURIComponent(item.name)}`;
        window.location.href = searchUrl;
        
        await this.waitForNavigation();
        await this.sleep(2000);
        
        // Wait for products
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
        
        const firstProduct = products[0];
        
        const titleEl = firstProduct.querySelector(config.selectors.productTitle);
        const priceEl = firstProduct.querySelector(config.selectors.productPrice);
        
        const productName = titleEl?.textContent?.trim() || item.name;
        const priceText = priceEl?.textContent?.trim() || '';
        const price = this.parsePrice(priceText);
        
        console.log(`[HeySalad AIS] Selected: ${productName} - ${priceText}`);
        
        const addButton = firstProduct.querySelector(config.selectors.addButton);
        
        if (!addButton) {
          return { success: false, error: 'Add button not found' };
        }
        
        for (let i = 0; i < item.quantity; i++) {
          await this.humanClick(addButton);
          await this.sleep(800 + Math.random() * 500);
          
          if (i > 0) {
            const increaseBtn = firstProduct.querySelector(config.selectors.increaseButton);
            if (increaseBtn) {
              await this.humanClick(increaseBtn);
            }
          }
        }
        
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
     * Parse price from text - skips unit prices (per kg, per litre, etc.)
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

  new SainsburysShopper();
}
