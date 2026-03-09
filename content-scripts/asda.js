/**
 * HeySalad AI Shopper - ASDA Content Script
 * 
 * Automates shopping on groceries.asda.com
 */

// Import base class
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content-scripts/base.js');
script.onload = function() {
  initAsdaShopper();
};
(document.head || document.documentElement).appendChild(script);

function initAsdaShopper() {
  const config = {
    name: 'ASDA',
    homeUrl: 'https://groceries.asda.com/',
    searchUrl: 'https://groceries.asda.com/search/',
    cartUrl: 'https://groceries.asda.com/trolley',
    selectors: {
      // Search
      searchInput: '#search, input[name="q"], [data-auto-id="searchInput"]',
      searchButton: '[data-auto-id="searchButton"], button[type="submit"]',
      
      // Products
      productCard: '[data-auto-id="productTile"], .co-product, .product-tile',
      productTitle: '[data-auto-id="productTitle"], .co-product__title, h3 a',
      productPrice: '[data-auto-id="productPrice"], .co-product__price',
      
      // Add to cart
      addButton: '[data-auto-id="addButton"], .co-product__add-button, button.add-to-trolley',
      quantityInput: '[data-auto-id="quantityInput"]',
      increaseButton: '[data-auto-id="increaseButton"]',
      
      // Cart
      cartCount: '[data-auto-id="trolleyCount"], .mini-trolley__count',
      
      // Cookies
      cookieAccept: '#onetrust-accept-btn-handler'
    }
  };

  class AsdaShopper extends window.HeySaladShopper {
    constructor() {
      super('ASDA', config);
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
        const searchUrl = `${config.searchUrl}${encodeURIComponent(item.name)}`;
        window.location.href = searchUrl;
        
        await this.waitForNavigation();
        await this.sleep(2000);
        
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
    
    parsePrice(text) {
      if (!text) return 0;
      const match = text.match(/£?([\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    }
  }

  new AsdaShopper();
}
