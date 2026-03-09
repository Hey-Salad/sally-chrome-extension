/**
 * HeySalad AI Shopper - Ocado Content Script
 * 
 * Automates shopping on ocado.com
 */

// Import base class
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content-scripts/base.js');
script.onload = function() {
  initOcadoShopper();
};
(document.head || document.documentElement).appendChild(script);

function initOcadoShopper() {
  const config = {
    name: 'Ocado',
    homeUrl: 'https://www.ocado.com/',
    searchUrl: 'https://www.ocado.com/search?entry=',
    cartUrl: 'https://www.ocado.com/webshop/getBasket.do',
    selectors: {
      // Search
      searchInput: 'input[name="entry"], #search-input, .search-input',
      searchButton: 'button[type="submit"], .search-button',
      
      // Products
      productCard: '.fop-item, [data-sku], .product-tile',
      productTitle: '.fop-title, .product-title, h4 a',
      productPrice: '.fop-price, .product-price, .price',
      
      // Add to cart
      addButton: '.quantity-button-add, .add-to-basket, button.add',
      quantityInput: '.quantity-input',
      increaseButton: '.quantity-button-increase, .increase',
      
      // Cart
      cartCount: '.basket-count, .trolley-count',
      
      // Cookies
      cookieAccept: '#onetrust-accept-btn-handler, .cookie-accept'
    }
  };

  class OcadoShopper extends window.HeySaladShopper {
    constructor() {
      super('Ocado', config);
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

  new OcadoShopper();
}
