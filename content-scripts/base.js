/**
 * Sally by HeySalad® - Base Content Script
 * 
 * This runs on every supermarket page and handles:
 * - Receiving shopping tasks from the background script
 * - Searching for products and adding to cart
 * - Reporting progress back to the popup
 */

(function() {
  'use strict';
  
  // Prevent double initialization
  if (window.__heysaladInitialized) return;
  window.__heysaladInitialized = true;
  
  console.log('[Sally] Content script loaded on:', window.location.hostname);
  
  // State
  let currentTask = null;
  let isProcessing = false;
  let overlayElement = null;
  
  // Backend AI routing
  const SHOPPING_AGENT_URL = 'https://shopping-agent.heysalad-o.workers.dev';
  
  async function matchProductWithAI(query, products) {
    try {
      console.log('[Sally] 🤖 Backend matching:', query, 'against', products.length, 'products');
      const response = await fetch(`${SHOPPING_AGENT_URL}/api/match-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          products
        })
      });
      
      if (!response.ok) {
        console.error('[Sally] Shopping Agent API error:', response.status);
        throw new Error(`Shopping Agent API error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[Sally] ✅ Backend match result:', result);
      
      if (typeof result.bestIndex === 'number' && 
          result.bestIndex >= 0 && 
          result.bestIndex < products.length &&
          typeof result.confidence === 'number') {
        return {
          success: true,
          bestIndex: result.bestIndex,
          confidence: result.confidence,
          reason: result.reason || 'Backend selected',
          shouldAdd: result.shouldAdd !== false,
          validationConfidence: result.validationConfidence,
          validationReason: result.validationReason,
          model: result.model
        };
      }
      
      console.log('[Sally] Backend response parsing failed, using fallback');
      return basicProductMatch(query, products);
      
    } catch (error) {
      console.error('[Sally] Backend matching error:', error);
      return basicProductMatch(query, products);
    }
  }
  
  /**
   * Basic product matching fallback
   */
  function basicProductMatch(query, products) {
    console.log('[Sally] Using basic product matching for:', query);
    
    const queryLower = query.toLowerCase().trim();
    let bestIndex = 0;
    let bestScore = 0;
    
    products.forEach((product, index) => {
      const productLower = product.name.toLowerCase();
      let score = 0;
      
      // Exact match gets highest score
      if (productLower.includes(queryLower)) {
        score = 0.9;
      } else {
        // Word matching
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        const matchedWords = queryWords.filter(word => productLower.includes(word));
        score = matchedWords.length / queryWords.length;
      }
      
      // Avoid processed versions of fresh items
      const criticalMismatches = [
        { item: 'apple', wrong: ['juice', 'cider', 'sauce'] },
        { item: 'tomato', wrong: ['sauce', 'paste', 'puree', 'soup'] },
        { item: 'chicken', wrong: ['stock', 'soup', 'gravy'] },
        { item: 'carrot', wrong: ['juice', 'soup'] },
        { item: 'orange', wrong: ['juice', 'marmalade'] }
      ];
      
      for (const rule of criticalMismatches) {
        if (queryLower.includes(rule.item)) {
          for (const wrongWord of rule.wrong) {
            if (productLower.includes(wrongWord) && !queryLower.includes(wrongWord)) {
              score = 0.1; // Very low score for wrong matches
              break;
            }
          }
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    
    return {
      success: bestScore > 0.3,
      bestIndex,
      confidence: bestScore,
      reason: bestScore > 0.7 ? 'Good match found' : 'Weak match - please verify'
    };
  }
  
  async function validateProductMatch(requestedItem, selectedProduct) {
    return basicValidation(requestedItem, selectedProduct.name);
  }
  
  /**
   * Basic validation fallback (rule-based)
   */
  function basicValidation(requestedItem, selectedProductName) {
    const requested = requestedItem.toLowerCase().trim();
    const selected = selectedProductName.toLowerCase();
    
    // Critical mismatches to prevent
    const criticalMismatches = [
      { item: 'apple', wrong: ['juice', 'cider', 'sauce'] },
      { item: 'tomato', wrong: ['sauce', 'paste', 'puree', 'soup', 'ketchup'] },
      { item: 'chicken', wrong: ['stock', 'soup', 'gravy', 'sauce'] },
      { item: 'beef', wrong: ['stock', 'soup', 'gravy'] },
      { item: 'carrot', wrong: ['juice', 'soup'] },
      { item: 'orange', wrong: ['juice', 'marmalade'] },
      { item: 'lemon', wrong: ['juice', 'curd'] },
      { item: 'potato', wrong: ['chip', 'crisp', 'waffle'] },
      { item: 'onion', wrong: ['ring', 'soup', 'powder'] },
      { item: 'garlic', wrong: ['powder', 'paste', 'bread'] }
    ];
    
    // Check for critical mismatches
    for (const rule of criticalMismatches) {
      if (requested.includes(rule.item)) {
        for (const wrongWord of rule.wrong) {
          if (selected.includes(wrongWord) && !requested.includes(wrongWord)) {
            return {
              valid: false,
              confidence: 0.95,
              reason: `"${selectedProductName}" is a processed product, not fresh ${requestedItem}`
            };
          }
        }
      }
    }
    
    // Check if the requested item appears in the selected product name
    const requestedWords = requested.split(/\s+/).filter(w => w.length > 2);
    const matchedWords = requestedWords.filter(word => selected.includes(word));
    
    if (matchedWords.length === 0) {
      return {
        valid: false,
        confidence: 0.8,
        reason: `"${selectedProductName}" doesn't contain "${requestedItem}"`
      };
    }
    
    // If we get here, it's probably OK
    const confidence = matchedWords.length / requestedWords.length;
    return {
      valid: confidence > 0.5,
      confidence: confidence,
      reason: confidence > 0.5 ? 'Basic match found' : 'Weak match'
    };
  }
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Sally] Message received:', message.type);
    
    if (message.type === 'START_SHOPPING_TASK') {
      currentTask = message.task;
      // Save to storage so we can resume after navigation
      chrome.storage.local.set({ currentTask });
      
      // 🚀 CRITICAL FIX: AUTO-START IMMEDIATELY
      console.log('[Sally] 🚀 AUTO-STARTING shopping task immediately');
      handleStartShopping(message.task);
      
      sendResponse({ success: true });
    } else if (message.type === 'STOP_SHOPPING_TASK') {
      currentTask = null;
      isProcessing = false;
      chrome.storage.local.set({ currentTask: null });
      sendResponse({ success: true });
    } else if (message.type === 'PING') {
      sendResponse({ success: true, ready: true });
    }
    
    return true;
  });
  
  /**
   * Enhanced auto-start shopping handler
   */
  async function handleStartShopping(task) {
    console.log('[Sally] 🚀 AUTO-STARTING shopping task:', task);
    
    currentTask = task;
    isProcessing = true;
    
    // Show overlay immediately
    showOverlay();
    showToast('🤖 Sally is taking control...', 'info');
    
    // Accept cookies and handle initial setup
    await acceptCookies();
    await sleep(1000);
    
    // Handle authentication if needed
    await handleAuthenticationIfNeeded();
    
    // 🏪 CRITICAL FIX: Navigate to correct store first
    const targetStore = task.store || 'waitrose'; // Default to Waitrose as requested
    const navigated = await navigateToCorrectStore(targetStore);
    
    if (navigated) {
      // If we navigated, the page will reload and resume from storage
      return;
    }
    
    // Handle store-specific popups and limits
    await handleStorePopupsAndLimits();
    
    // Start shopping immediately
    setTimeout(() => {
      checkAndProcess();
    }, 2000);
  }

  /**
   * Navigate to correct store - CRITICAL FIX
   */
  async function navigateToCorrectStore(requestedStore) {
    const currentHost = window.location.hostname;
    const targetStore = requestedStore.toLowerCase();
    
    console.log('[Sally] 🏪 Requested store:', targetStore, 'Current:', currentHost);
    
    // Store mapping
    const storeHosts = {
      'waitrose': 'waitrose.com',
      'tesco': 'tesco.com', 
      'sainsburys': 'sainsburys.co.uk',
      'asda': 'asda.com',
      'ocado': 'ocado.com',
      'morrisons': 'morrisons.com',
      'aldi': 'aldi.co.uk'
    };
    
    let targetHost = storeHosts[targetStore];
    
    if (!targetHost) {
      console.log('[Sally] ⚠️ Unknown store, defaulting to Waitrose');
      targetHost = 'waitrose.com';
    }
    
    // Check if we're already on the correct store
    if (currentHost.includes(targetHost.replace('.com', '').replace('.co.uk', ''))) {
      console.log('[Sally] ✅ Already on correct store');
      return false; // No navigation needed
    }
    
    // Navigate to correct store
    const storeUrls = {
      'waitrose.com': 'https://www.waitrose.com/ecom/shop/',
      'tesco.com': 'https://www.tesco.com/groceries/',
      'sainsburys.co.uk': 'https://www.sainsburys.co.uk/gol-ui/',
      'asda.com': 'https://groceries.asda.com/',
      'ocado.com': 'https://www.ocado.com/',
      'morrisons.com': 'https://groceries.morrisons.com/',
      'aldi.co.uk': 'https://www.aldi.co.uk/'
    };
    
    const targetUrl = storeUrls[targetHost];
    if (targetUrl) {
      console.log('[Sally] 🔄 Navigating to correct store:', targetUrl);
      showToast(`Switching to ${targetStore}...`, 'info');
      
      // Save navigation state
      chrome.storage.local.set({ 
        lastNavigationTime: Date.now(),
        targetStore: targetStore,
        currentTask: currentTask
      });
      
      window.location.href = targetUrl;
      return true; // Navigation happened
    }
    
    return false;
  }

  /**
   * Handle store-specific popups and limits
   */
  async function handleStorePopupsAndLimits() {
    const host = window.location.hostname;
    
    if (host.includes('waitrose.com')) {
      await handleWaitroseItemLimit();
    }
    
    // Handle other store-specific popups
    await handleGenericPopups();
  }

  /**
   * Waitrose 25-item limit handler
   */
  async function handleWaitroseItemLimit() {
    console.log('[Sally] 🛒 Checking for Waitrose item limit popup...');
    
    const popupSelectors = [
      '[class*="modal"]',
      '[class*="popup"]',
      '[class*="dialog"]',
      '[role="dialog"]',
      '[aria-modal="true"]'
    ];
    
    for (const selector of popupSelectors) {
      const popup = document.querySelector(selector);
      if (popup && popup.offsetParent !== null) {
        const text = popup.textContent.toLowerCase();
        
        // Check if it's about item limits
        if (text.includes('25') && (text.includes('limit') || text.includes('maximum'))) {
          console.log('[Sally] 🚨 Found Waitrose item limit popup');
          
          // Look for OK/Continue/Adjust button
          const buttons = popup.querySelectorAll('button');
          for (const btn of buttons) {
            const btnText = btn.textContent.toLowerCase();
            if (btnText.includes('ok') || 
                btnText.includes('continue') || 
                btnText.includes('adjust') ||
                btnText.includes('proceed')) {
              
              console.log('[Sally] ✅ Clicking popup button:', btnText);
              btn.click();
              await sleep(1000);
              
              // Adjust shopping strategy for item limits
              await adjustForItemLimits();
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Adjust shopping strategy when hitting item limits
   */
  async function adjustForItemLimits() {
    console.log('[Sally] 📋 Adjusting shopping strategy for item limits...');
    
    if (!currentTask) return;
    
    // Prioritize essential items
    const essentialKeywords = ['milk', 'bread', 'eggs', 'butter', 'chicken', 'beef'];
    
    currentTask.items.forEach(item => {
      const isEssential = essentialKeywords.some(keyword => 
        item.name.toLowerCase().includes(keyword)
      );
      
      if (isEssential) {
        item.priority = 'high';
      } else {
        item.priority = 'low';
      }
    });
    
    // Sort by priority
    currentTask.items.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return 0;
    });
    
    chrome.storage.local.set({ currentTask });
    showToast('📋 Prioritizing essential items due to store limits', 'info');
  }

  /**
   * Handle generic popups (cookies, newsletters, etc.)
   */
  async function handleGenericPopups() {
    console.log('[Sally] 🍪 Handling generic popups...');
    
    // Common popup selectors
    const popupSelectors = [
      '[class*="cookie"]',
      '[class*="gdpr"]',
      '[class*="newsletter"]',
      '[class*="modal"]',
      '[role="dialog"]'
    ];
    
    for (const selector of popupSelectors) {
      const popup = document.querySelector(selector);
      if (popup && popup.offsetParent !== null) {
        // Look for accept/dismiss buttons
        const buttons = popup.querySelectorAll('button');
        for (const btn of buttons) {
          const btnText = btn.textContent.toLowerCase();
          if (btnText.includes('accept') || 
              btnText.includes('ok') || 
              btnText.includes('dismiss') ||
              btnText.includes('close')) {
            
            console.log('[Sally] ✅ Dismissing popup:', btnText);
            btn.click();
            await sleep(500);
            break;
          }
        }
      }
    }
  }

  /**
   * Enhanced authentication handling
   */
  async function handleAuthenticationIfNeeded() {
    const host = window.location.hostname;
    
    console.log('[Sally] 🔐 Checking authentication for:', host);
    
    if (host.includes('tesco.com')) {
      await handleTescoAuth();
    } else if (host.includes('waitrose.com')) {
      await handleWaitroseAuth();
    }
    
    // Handle generic login prompts
    await handleGenericLoginPrompts();
  }

  /**
   * Tesco authentication handler
   */
  async function handleTescoAuth() {
    console.log('[Sally] 🔐 Handling Tesco authentication...');
    
    // Check if login modal is present
    const loginSelectors = [
      '[data-testid="login-modal"]',
      '[class*="login-modal"]',
      '[class*="sign-in"]',
      'button[aria-label*="Sign in"]',
      'button[aria-label*="Log in"]'
    ];
    
    for (const selector of loginSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        console.log('[Sally] 🚨 Found Tesco login prompt');
        
        // Try to dismiss or handle login
        const dismissBtn = element.querySelector('button[aria-label*="Close"], button[aria-label*="Dismiss"], .close');
        if (dismissBtn) {
          console.log('[Sally] ❌ Dismissing login prompt');
          dismissBtn.click();
          await sleep(1000);
          return;
        }
        
        // If we have stored credentials, try to login
        const credentials = await getStoredCredentials('tesco');
        if (credentials) {
          await performAutoLogin('tesco', credentials);
        } else {
          console.log('[Sally] ⚠️ No stored Tesco credentials, continuing as guest');
          showToast('⚠️ Tesco login required - continuing as guest', 'warning');
        }
      }
    }
  }

  /**
   * Waitrose authentication handler
   */
  async function handleWaitroseAuth() {
    console.log('[Sally] 🔐 Handling Waitrose authentication...');
    
    // Waitrose usually allows guest checkout, so just dismiss any login prompts
    const loginPrompts = document.querySelectorAll('[class*="login"], [class*="sign-in"]');
    for (const prompt of loginPrompts) {
      if (prompt.offsetParent !== null) {
        const dismissBtn = prompt.querySelector('button[aria-label*="Close"], .close, [class*="dismiss"]');
        if (dismissBtn) {
          console.log('[Sally] ❌ Dismissing Waitrose login prompt');
          dismissBtn.click();
          await sleep(500);
        }
      }
    }
  }

  /**
   * Handle generic login prompts
   */
  async function handleGenericLoginPrompts() {
    const loginElements = document.querySelectorAll('[class*="login"], [class*="sign-in"], [class*="auth"]');
    
    for (const element of loginElements) {
      if (element.offsetParent !== null) {
        const closeBtn = element.querySelector('button[aria-label*="Close"], .close, [class*="dismiss"]');
        if (closeBtn) {
          console.log('[Sally] ❌ Dismissing generic login prompt');
          closeBtn.click();
          await sleep(500);
        }
      }
    }
  }

  /**
   * Get stored credentials for a store
   */
  async function getStoredCredentials(store) {
    try {
      const data = await chrome.storage.local.get([`credentials_${store}`]);
      return data[`credentials_${store}`] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Perform automatic login (placeholder for future implementation)
   */
  async function performAutoLogin(store, credentials) {
    console.log('[Sally] 🔐 Auto-login for', store, 'not yet implemented');
    // TODO: Implement automatic login flow
  }
  
  /**
   * 🏪 NEW: Navigate to correct store
   */
  async function navigateToCorrectStore(requestedStore) {
    const currentHost = window.location.hostname;
    const targetStore = requestedStore.toLowerCase();
    
    console.log('[Sally] 🏪 Requested store:', targetStore, 'Current:', currentHost);
    
    // Store mapping
    const storeHosts = {
      'waitrose': 'waitrose.com',
      'tesco': 'tesco.com', 
      'sainsburys': 'sainsburys.co.uk',
      'asda': 'asda.com',
      'ocado': 'ocado.com',
      'morrisons': 'morrisons.com',
      'aldi': 'aldi.co.uk'
    };
    
    let targetHost = storeHosts[targetStore];
    
    if (!targetHost) {
      console.log('[Sally] ⚠️ Unknown store:', targetStore, 'defaulting to Waitrose');
      targetHost = 'waitrose.com';
    }
    
    // Check if we're already on the correct store
    if (currentHost.includes(targetHost)) {
      console.log('[Sally] ✅ Already on correct store');
      return false; // No navigation needed
    }
    
    // Navigate to correct store
    const storeUrls = {
      'waitrose.com': 'https://www.waitrose.com/ecom/shop/',
      'tesco.com': 'https://www.tesco.com/groceries/',
      'sainsburys.co.uk': 'https://www.sainsburys.co.uk/gol-ui/',
      'asda.com': 'https://groceries.asda.com/',
      'ocado.com': 'https://www.ocado.com/',
      'morrisons.com': 'https://groceries.morrisons.com/',
      'aldi.co.uk': 'https://www.aldi.co.uk/'
    };
    
    const targetUrl = storeUrls[targetHost];
    if (targetUrl) {
      console.log('[Sally] 🔄 Navigating to correct store:', targetUrl);
      showToast(`Switching to ${targetStore}...`, 'info');
      
      // Save navigation state
      chrome.storage.local.set({ 
        lastNavigationTime: Date.now(),
        targetStore: targetStore
      });
      
      window.location.href = targetUrl;
      return true; // Navigation happened
    }
    
    return false;
  }
  chrome.storage.local.get(['currentTask', 'lastNavigationTime'], (data) => {
    if (data.currentTask && data.currentTask.status !== 'complete' && data.currentTask.status !== 'stopped' && data.currentTask.status !== 'checkout') {
      currentTask = data.currentTask;
      console.log('[Sally] Resuming task from storage, items:', currentTask.items.map(i => `${i.name}:${i.status}`).join(', '));
      
      // Check if we just navigated (within last 10 seconds for slow sites like Ocado)
      const now = Date.now();
      const lastNav = data.lastNavigationTime || 0;
      const host = window.location.hostname;
      const navTimeout = host.includes('ocado.com') ? 15000 : 10000; // Ocado is slow
      const justNavigated = (now - lastNav) < navTimeout;
      
      // Also check if we're on a search page
      const currentUrl = window.location.href;
      const isOnSearchPage = currentUrl.includes('/search') || 
                             currentUrl.includes('query=') || 
                             currentUrl.includes('entry=') || 
                             currentUrl.includes('searchTerm=') ||
                             currentUrl.includes('/SearchResults/');
      
      console.log('[Sally] Time since last navigation:', now - lastNav, 'ms, justNavigated:', justNavigated, 'isOnSearchPage:', isOnSearchPage);
      
      // If we're on a search page and just navigated, keep the 'searching' status
      // Otherwise reset to pending
      if (!justNavigated && !isOnSearchPage) {
        currentTask.items.forEach(item => {
          if (item.status === 'searching') {
            console.log('[Sally] Resetting item to pending:', item.name);
            item.status = 'pending';
          }
        });
      } else if (isOnSearchPage) {
        console.log('[Sally] On search page, keeping searching status');
      } else {
        console.log('[Sally] Just navigated, keeping searching status');
      }
      
      // Optimized delay to let page render (reduced for speed)
      let delay = 1500; // Reduced from 2000
      if (host.includes('ocado.com')) delay = 2500; // Reduced from 4000
      if (host.includes('tesco.com')) delay = 2000; // Reduced from 3500
      if (host.includes('morrisons.com')) delay = 2000;
      if (host.includes('aldi.co.uk')) delay = 1200; // Aldi is fast
      
      console.log('[Sally] Waiting', delay, 'ms for page to render on', host);
      
      setTimeout(() => {
        checkAndProcess();
      }, delay);
    }
  });
  
  /**
   * Check current page and process accordingly
   */
  async function checkAndProcess() {
    if (!currentTask || isProcessing) return;
    
    // Show overlay when we have a task
    showOverlay();
    
    const currentUrl = window.location.href;
    console.log('[Sally] Checking page:', currentUrl);
    
    // First check if there's an item already being searched
    const searchingItem = currentTask.items.find(i => i.status === 'searching');
    
    // Find the next pending item
    const pendingItem = currentTask.items.find(i => i.status === 'pending');
    
    // If we have a searching item and we're on a search page, process it
    if (searchingItem && isSearchResultsPage(currentUrl)) {
      console.log('[Sally] Found searching item on search page:', searchingItem.name);
      isProcessing = true;
      await processSearchResults(searchingItem);
      isProcessing = false;
      return;
    }
    
    if (!pendingItem && !searchingItem) {
      console.log('[Sally] No pending items, shopping complete');
      showToast('Shopping complete! 🎉', 'success');
      chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE' });
      setTimeout(hideOverlay, 3000);
      return;
    }
    
    // Use searching item if exists, otherwise pending
    const itemToProcess = searchingItem || pendingItem;
    
    // Mark item as searching if not already
    if (itemToProcess.status !== 'searching') {
      itemToProcess.status = 'searching';
      chrome.storage.local.set({ currentTask });
    }
    updateOverlay();
    
    // Check if we're on a search results page
    if (isSearchResultsPage(currentUrl)) {
      console.log('[Sally] On search results page, looking for products...');
      isProcessing = true;
      await processSearchResults(itemToProcess);
      isProcessing = false;
    } else if (isHomePage()) {
      // Navigate to search
      console.log('[Sally] Not on search page, searching for:', itemToProcess.name);
      navigateToSearch(itemToProcess.name);
    }
  }
  
  /**
   * Check if current URL is a search results page
   */
  function isSearchResultsPage(url) {
    // ASDA: /search/query
    // Tesco: /groceries/en-GB/search?query=
    // Sainsbury's: /SearchResults/query
    // Ocado: /search?q=
    // Waitrose: /search?searchTerm=
    const isSearch = url.includes('/search') || 
           url.includes('query=') || 
           url.includes('searchTerm=') ||
           url.includes('/SearchResults/') ||
           url.includes('?q=') ||
           url.includes('&q=');
    
    console.log('[Sally] isSearchResultsPage check:', url, '->', isSearch);
    return isSearch;
  }
  
  /**
   * Check if current URL is the store home page or any non-search page
   */
  function isHomePage() {
    // If not a search page, treat as home page (need to navigate to search)
    return !isSearchResultsPage(window.location.href);
  }
  
  /**
   * Navigate to search results for an item
   */
  function navigateToSearch(query) {
    const host = window.location.hostname;
    const currentUrl = window.location.href;
    let searchUrl;
    
    if (host.includes('tesco.com')) {
      searchUrl = `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(query)}`;
    } else if (host.includes('sainsburys.co.uk')) {
      searchUrl = `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(query)}`;
    } else if (host.includes('asda.com')) {
      searchUrl = `https://groceries.asda.com/search/${encodeURIComponent(query)}`;
    } else if (host.includes('ocado.com')) {
      searchUrl = `https://www.ocado.com/search?q=${encodeURIComponent(query)}`;
    } else if (host.includes('waitrose.com')) {
      searchUrl = `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(query)}`;
    } else if (host.includes('morrisons.com')) {
      searchUrl = `https://groceries.morrisons.com/search?q=${encodeURIComponent(query)}`;
    } else if (host.includes('aldi.co.uk')) {
      searchUrl = `https://www.aldi.co.uk/search?q=${encodeURIComponent(query)}`;
    }
    
    if (searchUrl) {
      // Check if we're already on a search page (prevent refresh loop)
      const isOnSearchPage = currentUrl.includes('/search') || 
                             currentUrl.includes('query=') || 
                             currentUrl.includes('?q=') || 
                             currentUrl.includes('&q=') ||
                             currentUrl.includes('searchTerm=') ||
                             currentUrl.includes('/SearchResults/');
      
      if (isOnSearchPage) {
        // Extract current search term from URL
        let currentSearchTerm = '';
        try {
          const urlObj = new URL(currentUrl);
          currentSearchTerm = urlObj.searchParams.get('query') || 
                              urlObj.searchParams.get('q') ||  // Ocado uses ?q=
                              urlObj.searchParams.get('searchTerm') || 
                              currentUrl.split('/SearchResults/')[1]?.split('?')[0] ||
                              currentUrl.split('/search/')[1]?.split('?')[0] || '';
          currentSearchTerm = decodeURIComponent(currentSearchTerm).toLowerCase();
        } catch (e) {
          console.log('[Sally] Error parsing URL:', e);
        }
        
        const targetSearch = query.toLowerCase();
        
        // If we're already searching for something similar, don't navigate again
        if (currentSearchTerm && (
            currentSearchTerm.includes(targetSearch.substring(0, 4)) ||
            targetSearch.includes(currentSearchTerm.substring(0, 4))
        )) {
          console.log('[Sally] Already on search page for:', query, '(current:', currentSearchTerm, ') - processing results instead');
          // Process results directly instead of navigating
          setTimeout(() => checkAndProcess(), 1000);
          return;
        }
      }
      
      console.log('[Sally] Navigating to:', searchUrl);
      // Save navigation timestamp to prevent re-navigation after page reload
      chrome.storage.local.set({ lastNavigationTime: Date.now() }, () => {
        window.location.href = searchUrl;
      });
    }
  }
  
  /**
   * Process search results - find product and add to cart
   */
  async function processSearchResults(item) {
    console.log('[Sally] Processing search results for:', item.name);
    console.log('[Sally] Current URL:', window.location.href);
    
    // Wait for page to fully load
    await waitForPageLoad();
    console.log('[Sally] Page loaded');
    
    // Accept cookies if present
    await acceptCookies();
    
    // Wait for products to load (dynamic content) - optimized wait times
    let products = [];
    let attempts = 0;
    const host = window.location.hostname;
    
    // Optimized wait times per store (reduced for speed)
    let maxAttempts = 12; // Default
    let waitTime = 600; // Default - reduced from 1000
    
    if (host.includes('tesco.com')) {
      maxAttempts = 15;
      waitTime = 800; // Reduced from 1500
    } else if (host.includes('ocado.com')) {
      maxAttempts = 15;
      waitTime = 800;
    } else if (host.includes('morrisons.com')) {
      maxAttempts = 12;
      waitTime = 700;
    } else if (host.includes('aldi.co.uk')) {
      maxAttempts = 10;
      waitTime = 500; // Aldi is usually fast
    }
    
    console.log('[Sally] Waiting for products on', host, '- max attempts:', maxAttempts, 'wait:', waitTime, 'ms');
    
    while (products.length === 0 && attempts < maxAttempts) {
      await sleep(waitTime);
      products = findProducts();
      console.log('[Sally] Attempt', attempts + 1, '- Found', products.length, 'products');
      
      // Log what we can see on the page for debugging
      if (attempts === 5 && products.length === 0) {
        console.log('[Sally] Debug - Page HTML sample:', document.body.innerHTML.substring(0, 2000));
        console.log('[Sally] Debug - All buttons:', document.querySelectorAll('button').length);
        console.log('[Sally] Debug - All links:', document.querySelectorAll('a').length);
        
        // Tesco-specific debugging
        if (window.location.hostname.includes('tesco.com')) {
          console.log('[Sally] Tesco Debug - Looking for product elements...');
          console.log('[Sally] Tesco Debug - [data-auto] elements:', document.querySelectorAll('[data-auto]').length);
          console.log('[Sally] Tesco Debug - li elements:', document.querySelectorAll('li').length);
          console.log('[Sally] Tesco Debug - ul elements:', document.querySelectorAll('ul').length);
          // Log first few data-auto values
          const dataAutos = document.querySelectorAll('[data-auto]');
          dataAutos.forEach((el, i) => {
            if (i < 10) console.log(`[Sally] Tesco Debug - data-auto[${i}]:`, el.getAttribute('data-auto'), el.tagName);
          });
        }
      }
      
      attempts++;
    }
    
    if (products.length === 0) {
      console.log('[Sally] No products found after', maxAttempts, 'attempts');
      
      // Try one more thing - look for any product-like elements
      const fallbackProducts = document.querySelectorAll('[class*="product"], [class*="Product"], [data-auto-id*="product"]');
      console.log('[Sally] Fallback product search found:', fallbackProducts.length, 'elements');
      
      // Tesco-specific fallback: look for list items with add buttons
      if (fallbackProducts.length === 0 && window.location.hostname.includes('tesco.com')) {
        console.log('[Sally] Trying Tesco-specific fallback...');
        // Find all list items that contain an add button
        const allLis = document.querySelectorAll('li');
        const tescoProducts = Array.from(allLis).filter(li => {
          const hasAddBtn = li.querySelector('button[class*="add"], button[aria-label*="Add"], button[aria-label*="trolley"]');
          const hasPrice = li.querySelector('[class*="price"], [class*="Price"]');
          return hasAddBtn || hasPrice;
        });
        console.log('[Sally] Tesco fallback found:', tescoProducts.length, 'potential products');
        if (tescoProducts.length > 0) {
          products = tescoProducts;
        }
      }
      
      if (fallbackProducts.length > 0 && products.length === 0) {
        products = Array.from(fallbackProducts);
      }
      
      if (products.length === 0) {
        reportItemFailed(item, 'No products found');
        await sleep(1000);
        moveToNextItem();
        return;
      }
    }
    
    // Extract info from all products for AI matching
    const productInfoList = products.slice(0, 10).map((p, i) => {
      const info = extractProductInfo(p);
      return { ...info, index: i, inStock: true };
    });
    
    console.log('[Sally] Found', productInfoList.length, 'products to match against');
    
    // Use AI to find the best matching product
    let bestIndex = 0;
    let aiUsed = false;
    try {
      showToast('🤖 AI selecting best match...', 'info');
      const matchResult = await matchProductWithAI(item.name, productInfoList);
      if (matchResult.success && matchResult.bestIndex !== undefined) {
        bestIndex = matchResult.bestIndex;
        aiUsed = true;
        console.log('[Sally] AI matched product:', matchResult.reason, '(confidence:', matchResult.confidence, ')');
        if (matchResult.shouldAdd === false) {
          console.log('[Sally] ❌ Backend rejected product:', matchResult.validationReason);
          showToast(`❌ Wrong product: ${matchResult.validationReason || matchResult.reason}`, 'error');
          reportItemFailed(item, `Match rejected: ${matchResult.validationReason || matchResult.reason}`);
          await sleep(1500);
          moveToNextItem();
          return;
        }
        if (matchResult.confidence >= 0.7) {
          showToast(`✨ AI found: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'success');
        } else {
          showToast(`🤔 Best guess: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'info');
        }
      }
    } catch (e) {
      console.log('[Sally] AI matching failed, using first product:', e);
      showToast('Using first result (AI unavailable)', 'info');
    }
    
    // Get the best matching product
    const product = products[bestIndex];
    console.log('[Sally] Selected product index:', bestIndex, product.tagName, product.className);
    
    const productInfo = extractProductInfo(product);
    console.log('[Sally] Selected product:', productInfo);
    
    // 🤖 AI VALIDATION: Verify this is the correct product before adding
    showToast('🤖 Validating product match...', 'info');
    const validation = await validateProductMatch(item.name, productInfo);
    
    if (!validation.valid || validation.confidence < 0.7) {
      console.log('[Sally] ❌ AI rejected product:', validation.reason);
      showToast(`❌ Wrong product: ${validation.reason}`, 'error');
      reportItemFailed(item, `AI validation failed: ${validation.reason}`);
      await sleep(1500);
      moveToNextItem();
      return;
    }
    
    console.log('[Sally] ✅ AI validated product (confidence:', validation.confidence, ')');
    showToast(`✅ Validated: ${productInfo.name.substring(0, 30)}...`, 'success');
    
    // Scroll product into view
    product.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(800);
    
    // Try to add to cart - with retry logic for slow-loading buttons
    let addButton = null;
    let buttonRetries = 0;
    const maxButtonRetries = 5;
    
    while (!addButton && buttonRetries < maxButtonRetries) {
      addButton = findAddButton(product);
      
      if (!addButton) {
        console.log('[Sally] Add button not found in product (attempt', buttonRetries + 1, '), trying page-level search...');
        addButton = findAddButtonOnPage();
      }
      
      if (!addButton) {
        buttonRetries++;
        if (buttonRetries < maxButtonRetries) {
          console.log('[Sally] Waiting 500ms for button to render...');
          await sleep(500);
          // Re-scroll to ensure product is visible
          product.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    
    if (!addButton) {
      console.log('[Sally] No add button found after', maxButtonRetries, 'attempts');
      // Log all buttons in the product for debugging
      const productButtons = product.querySelectorAll('button');
      console.log('[Sally] Buttons in product card:', productButtons.length);
      productButtons.forEach((btn, i) => {
        console.log(`[Sally] Product button ${i}:`, 
          'text:', btn.textContent?.trim().substring(0, 30), 
          'aria:', btn.getAttribute('aria-label')?.substring(0, 30),
          'class:', btn.className?.substring(0, 40));
      });
      
      // Log all buttons on page
      const allButtons = document.querySelectorAll('button');
      console.log('[Sally] All buttons on page:', allButtons.length);
      allButtons.forEach((btn, i) => {
        if (i < 15) { // Log first 15
          console.log(`[Sally] Page button ${i}:`, btn.textContent?.trim().substring(0, 30), btn.className?.substring(0, 50));
        }
      });
      
      reportItemFailed(item, 'Add button not found');
      await sleep(1000);
      moveToNextItem();
      return;
    }
    
    console.log('[Sally] ✓ Found add button after', buttonRetries + 1, 'attempt(s)');
    
    // CRITICAL: Validate this is actually an ADD button, not a REMOVE button
    const btnText = (addButton.textContent || '').toLowerCase().trim();
    const btnAriaLabel = (addButton.getAttribute('aria-label') || '').toLowerCase();
    const isRemoveButton = btnText.includes('remove') || 
                           btnAriaLabel.includes('remove') ||
                           btnText.includes('delete') ||
                           btnAriaLabel.includes('delete') ||
                           btnText === '-' ||
                           btnAriaLabel.includes('decrease') ||
                           btnAriaLabel.includes('reduce');
    
    if (isRemoveButton) {
      console.log('[Sally] ⚠ WARNING: Found button appears to be a REMOVE button, not ADD!');
      console.log('[Sally] Button text:', btnText, 'aria:', btnAriaLabel);
      // Try to find the actual add button again
      const actualAddBtn = findAddButtonOnPage();
      if (actualAddBtn && actualAddBtn !== addButton) {
        console.log('[Sally] Found alternative add button');
        addButton = actualAddBtn;
      } else {
        console.log('[Sally] Could not find alternative, proceeding with caution...');
      }
    }
    
    // Click add button for each quantity - ENHANCED WITH SMART QUANTITY INPUT
    const isTesco = window.location.hostname.includes('tesco.com');
    const isMorrisons = window.location.hostname.includes('morrisons.com');
    const isWaitrose = window.location.hostname.includes('waitrose.com');
    const isReactSite = isTesco || isMorrisons;
    
    // 🔍 CRITICAL: Check for store popups and limits BEFORE adding items
    await handleStorePopupsAndLimits();
    
    // Get trolley count before adding (for verification)
    const trolleyCountBefore = getTrolleyCount();
    console.log('[Sally] Trolley count BEFORE add:', trolleyCountBefore);
    
    // 📦 ENHANCED: Try smart quantity input first
    const quantityAdded = await addItemWithSmartQuantity(item, addButton, product);
    
    if (!quantityAdded) {
      // Fallback to multiple clicks if smart quantity failed
      console.log('[Sally] 🔄 Smart quantity failed, using multiple clicks');
      
      for (let i = 0; i < item.quantity; i++) {
        console.log('[Sally] Clicking add button, qty:', i + 1, 'button:', addButton.tagName, addButton.className?.substring(0, 50));
        
        // Log button state before click
        const btnText = addButton.textContent?.trim();
        const btnAriaLabel = addButton.getAttribute('aria-label');
        const btnDisabled = addButton.disabled;
        console.log('[Sally] Button state before click - text:', btnText, 'aria:', btnAriaLabel, 'disabled:', btnDisabled);
        
        addButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(500);
        
        // Use appropriate click method
        if (isReactSite) {
          await performReactClick(addButton);
        } else {
          await performNativeClick(addButton);
        }
        
        // Wait for cart to update
        const waitTime = isReactSite ? 2500 : 1000;
        console.log('[Sally] Waiting', waitTime, 'ms for cart to update...');
        await sleep(waitTime);
        
        // For quantity > 1, find increment button after first add
        if (i === 0 && item.quantity > 1) {
          await sleep(800);
          const incrementBtn = findIncrementButton(product);
          if (incrementBtn) {
            console.log('[Sally] Found increment button for remaining quantity');
            addButton = incrementBtn;
          }
        }
      }
    }
    
    // Report success
    reportItemAdded(item, productInfo.name, productInfo.price * item.quantity);
    
    // CRITICAL: Wait longer before navigating on Tesco to ensure cart state is saved
    // Tesco's React app needs time to sync the cart to the server
    const preNavDelay = isTesco ? 3000 : 1500; // 3 seconds for Tesco
    console.log('[Sally] Waiting', preNavDelay, 'ms before navigating to next item...');
    await sleep(preNavDelay);
    
    // Final trolley count check before navigation
    const finalTrolleyCount = getTrolleyCount();
    console.log('[Sally] Final trolley count before navigation:', finalTrolleyCount);
    
    moveToNextItem();
  }
  
  /**
   * Find product cards on the page
   */
  function findProducts() {
    const host = window.location.hostname;
    let selectors = [];
    
    // Use store-specific selectors first
    if (host.includes('asda.com')) {
      selectors = [
        // ASDA 2024 selectors
        '[data-auto-id="productTile"]',
        '.co-product',
        '.co-item',
        '[class*="co-product"]',
        '[class*="ProductTile"]',
        '[class*="product-tile"]',
        '.search-page-content__products-wrapper li',
        'li[data-auto-id]',
        // ASDA grid items
        '[class*="search-page"] li',
        '[class*="SearchResults"] li',
        // Generic product containers
        'article[class*="product"]',
        'div[class*="product-card"]'
      ];
    } else if (host.includes('tesco.com')) {
      selectors = [
        // Tesco 2024/2025 selectors
        '[data-auto="product-tile"]',
        'li[class*="product-list"]',
        '.product-tile',
        '.product-list--list-item',
        '[class*="product-tile"]',
        '[class*="ProductTile"]',
        // Tesco search results grid
        'ul[class*="product-list"] > li',
        '[class*="styled__ProductTileWrapper"]',
        '[class*="StyledProductTile"]',
        // Generic product containers
        'article[class*="product"]',
        '[data-testid*="product"]',
        'li[data-auto]'
      ];
    } else if (host.includes('sainsburys.co.uk')) {
      selectors = [
        '[data-test-id="product-tile"]',
        '.pt-grid-item',
        '.ln-c-card',
        '[class*="product-tile"]'
      ];
    } else if (host.includes('ocado.com')) {
      selectors = [
        // Ocado 2024 selectors
        '[data-sku]',
        '.fop-item',
        '[class*="fop-"]',
        '.product-tile',
        '[class*="ProductTile"]',
        '[class*="product-pod"]',
        // Ocado search results
        '[class*="search-results"] li',
        '[class*="SearchResults"] li',
        // Generic
        '[class*="product"]',
        'article'
      ];
    } else if (host.includes('waitrose.com')) {
      selectors = [
        '[data-testid="product-pod"]',
        '.productPod',
        '[class*="product"]'
      ];
    } else if (host.includes('morrisons.com')) {
      selectors = [
        // Morrisons 2024 selectors
        '[data-test="fop-item"]',
        '.fop-item',
        '[class*="fop-"]',
        '[class*="product-tile"]',
        '[class*="ProductTile"]',
        '.product-card',
        '[data-testid="product-tile"]',
        // Morrisons search results
        '[class*="search-results"] li',
        'article[class*="product"]'
      ];
    } else if (host.includes('aldi.co.uk')) {
      selectors = [
        // Aldi 2024 selectors
        '.product-tile',
        '[class*="product-tile"]',
        '[class*="ProductTile"]',
        '.product-card',
        '[data-testid="product"]',
        // Aldi search results
        '.search-results__item',
        '[class*="search-result"]',
        'article[class*="product"]',
        '.box--product'
      ];
    }
    
    // Add generic fallbacks
    selectors.push(
      '[class*="product-card"]',
      '[class*="ProductCard"]',
      'article[class*="product"]',
      '[role="listitem"]'
    );
    
    for (const selector of selectors) {
      try {
        const products = document.querySelectorAll(selector);
        if (products.length > 0) {
          console.log('[Sally] Found', products.length, 'products with selector:', selector);
          return Array.from(products);
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    return [];
  }
  
  /**
   * Extract product info from a product card
   * IMPORTANT: Prioritizes actual selling price over unit price (per kg/litre)
   */
  function extractProductInfo(product) {
    // Title selectors (order matters - more specific first)
    const titleSelectors = [
      // ASDA
      '[data-auto-id="productTitle"]',
      '.co-product__title',
      '[class*="ProductTitle"]',
      '[class*="product-title"]',
      // Tesco 2024/2025
      '[data-auto="product-tile--title"]',
      '.product-tile--title',
      '[class*="styled__Title"]',
      '[class*="StyledTitle"]',
      '[class*="ProductTitle"]',
      'a[class*="product-tile"] span',
      'h3[class*="styled"]',
      // Sainsbury's
      '[data-test-id="product-tile-title"]',
      '.pt__title',
      '.ln-c-card__title',
      // Ocado
      '.fop-title',
      '[class*="fop-title"]',
      '[class*="product-name"]',
      '[class*="ProductName"]',
      // Waitrose
      '[data-testid="product-pod-title"]',
      // Morrisons
      '[data-test="fop-title"]',
      '.fop-title',
      '[class*="fop-title"]',
      '[class*="product-name"]',
      // Aldi
      '.product-tile__name',
      '[class*="product-tile__name"]',
      '.product-card__name',
      // Generic fallbacks
      'h2', 'h3', 
      'a[href*="product"]',
      'a'
    ];
    
    // Price selectors - PRIORITIZE actual selling price over unit price (per kg/litre)
    // Order matters: most specific/accurate selectors first
    const host = window.location.hostname;
    let priceSelectors = [];
    
    if (host.includes('tesco.com')) {
      // Tesco: Prioritize regular price, avoid Clubcard price and unit price
      priceSelectors = [
        // Main selling price (not Clubcard, not per-unit)
        '[data-auto="price-value"]:not([class*="clubcard"]):not([class*="Clubcard"])',
        '.beans-price__text:not([class*="clubcard"])',
        '[class*="styled__PriceText"]:not([class*="clubcard"])',
        '[class*="StyledPriceText"]:not([class*="clubcard"])',
        // Regular price container
        '[class*="price-control-wrapper"] [class*="value"]',
        '[class*="PriceControlWrapper"] [class*="value"]',
        // Fallback to any price value
        '[data-auto="price-value"]',
        '.price-per-sellable-unit .value',
        '[class*="styled__Price"]',
        '[class*="StyledPrice"]'
      ];
    } else if (host.includes('sainsburys.co.uk')) {
      // Sainsbury's: Prioritize retail price, avoid Nectar price and unit price
      priceSelectors = [
        '[data-test-id="pt-retail-price"]',
        '.pt__cost__retail-price',
        '.pd__cost__retail-price',
        // Avoid unit price selectors
        '[class*="retail-price"]:not([class*="unit"])',
        '.ln-c-card [class*="price"]:not([class*="unit"])'
      ];
    } else if (host.includes('asda.com')) {
      // ASDA: Get the main price, NOT the price-per-sellable-unit (that's per kg/litre)
      priceSelectors = [
        // Main product price
        '[data-auto-id="productPrice"]',
        '.co-product__price strong',
        '.co-product__price .price',
        '[class*="ProductPrice"]:not([class*="unit"])',
        // Price container (not unit price)
        '.co-product__price:not(.co-product__price-per-uom)',
        '[class*="price"]:not([class*="per-uom"]):not([class*="PerUom"])'
      ];
    } else if (host.includes('ocado.com')) {
      // Ocado: Main price, avoid per-unit
      priceSelectors = [
        '.fop-price',
        '[class*="fop-price"]',
        '[class*="product-price"]:not([class*="unit"])',
        '[class*="ProductPrice"]:not([class*="unit"])'
      ];
    } else if (host.includes('waitrose.com')) {
      // Waitrose: Main price
      priceSelectors = [
        '[data-testid="product-pod-price"]',
        '[class*="productPrice"]:not([class*="unit"])',
        '.price:not([class*="unit"])'
      ];
    } else if (host.includes('morrisons.com')) {
      // Morrisons: Main price
      priceSelectors = [
        '[data-test="fop-price"]',
        '.fop-price',
        '[class*="fop-price"]',
        '[class*="product-price"]:not([class*="unit"])'
      ];
    } else if (host.includes('aldi.co.uk')) {
      // Aldi: Main price
      priceSelectors = [
        '.product-tile__price',
        '[class*="product-tile__price"]',
        '.product-card__price',
        '[class*="price"]:not([class*="unit"])'
      ];
    } else {
      // Generic fallbacks
      priceSelectors = [
        '.price',
        '[class*="price"]:not([class*="unit"])'
      ];
    }
    
    let name = 'Unknown Product';
    let price = 0;
    
    for (const selector of titleSelectors) {
      try {
        const el = product.querySelector(selector);
        if (el && el.textContent.trim()) {
          name = el.textContent.trim().substring(0, 100); // Limit length
          console.log('[Sally] Found product name:', name.substring(0, 50));
          break;
        }
      } catch (e) {}
    }
    
    for (const selector of priceSelectors) {
      try {
        const el = product.querySelector(selector);
        if (el) {
          const text = el.textContent || '';
          
          // Skip if this looks like a unit price (per kg, per litre, per 100g, etc.)
          const lowerText = text.toLowerCase();
          if (lowerText.includes('/kg') || 
              lowerText.includes('/litre') || 
              lowerText.includes('/l') ||
              lowerText.includes('per kg') ||
              lowerText.includes('per 100') ||
              lowerText.includes('/100g') ||
              lowerText.includes('/100ml')) {
            console.log('[Sally] Skipping unit price:', text.trim().substring(0, 30));
            continue;
          }
          
          // Extract price - handle formats like "£1.50", "1.50", "£1", "Now £1.50"
          // Also handle pence format like "50p"
          const penceMatch = text.match(/(\d+)p\b/i);
          if (penceMatch && !text.includes('£')) {
            // Price in pence only (e.g., "50p")
            price = parseInt(penceMatch[1], 10) / 100;
            console.log('[Sally] Found price (pence): £' + price.toFixed(2), 'from:', text.trim().substring(0, 30));
            break;
          }
          
          // Standard pound format - get the FIRST price (usually the main price)
          const match = text.match(/£\s*([\d]+(?:\.[\d]{1,2})?)/);
          if (match) {
            price = parseFloat(match[1]);
            console.log('[Sally] Found price: £' + price.toFixed(2), 'from:', text.trim().substring(0, 30));
            break;
          }
          
          // Fallback: any number that looks like a price (1-3 digits, optional decimals)
          const fallbackMatch = text.match(/\b([\d]{1,3}(?:\.[\d]{1,2})?)\b/);
          if (fallbackMatch) {
            const potentialPrice = parseFloat(fallbackMatch[1]);
            // Sanity check: price should be reasonable (£0.01 to £999)
            if (potentialPrice >= 0.01 && potentialPrice <= 999) {
              price = potentialPrice;
              console.log('[Sally] Found price (fallback): £' + price.toFixed(2), 'from:', text.trim().substring(0, 30));
              break;
            }
          }
        }
      } catch (e) {
        console.log('[Sally] Price extraction error:', e.message);
      }
    }
    
    // If still no price, try a broader search within the product card
    if (price === 0) {
      const allPriceElements = product.querySelectorAll('[class*="price"], [class*="Price"]');
      for (const el of allPriceElements) {
        const text = el.textContent || '';
        const lowerText = text.toLowerCase();
        
        // Skip unit prices
        if (lowerText.includes('/kg') || lowerText.includes('/litre') || lowerText.includes('per ')) continue;
        
        const match = text.match(/£\s*([\d]+(?:\.[\d]{1,2})?)/);
        if (match) {
          price = parseFloat(match[1]);
          console.log('[Sally] Found price (broad search): £' + price.toFixed(2));
          break;
        }
      }
    }
    
    return { name, price };
  }
  
  /**
   * Find the add to cart button within a product card
   */
  function findAddButton(product) {
    const host = window.location.hostname;
    let selectors = [];
    
    // Store-specific selectors first
    if (host.includes('asda.com')) {
      selectors = [
        // ASDA 2024 selectors
        '[data-auto-id="addButton"]',
        '[data-auto-id="btnAdd"]',
        '.co-product__add-to-trolley',
        'button[class*="add-to-trolley"]',
        'button[class*="AddToTrolley"]',
        'button[class*="add-button"]',
        'button[class*="AddButton"]',
        '[class*="quantity-controls"] button',
        // ASDA uses + button sometimes
        'button[aria-label*="Add"]',
        'button[aria-label*="add"]',
        'button[aria-label*="trolley"]',
        'button[aria-label*="basket"]'
      ];
    } else if (host.includes('tesco.com')) {
      selectors = [
        // Tesco 2024/2025 add button selectors - most specific first
        'button[data-auto="add-button"]',
        '[data-auto="add-button"]',
        // Tesco uses styled-components with random class names, look for data attributes
        '[data-auto*="add"]',
        '[data-testid*="add"]',
        // Tesco quantity/add controls
        'button[class*="add-control"]',
        '[class*="add-control"] button',
        '.add-control button',
        '.add-control',
        // Tesco trolley buttons
        '.product-add-to-trolley',
        'button[class*="trolley"]',
        '[class*="trolley"] button',
        // Styled components (Tesco uses these)
        'button[class*="AddButton"]',
        'button[class*="add-to-basket"]',
        'button[class*="AddToBasket"]',
        'button[class*="styled__AddButton"]',
        'button[class*="StyledAddButton"]',
        'button[class*="Styled"] [class*="Add"]',
        // Tesco quantity increment (sometimes the add is a + button)
        'button[class*="quantity"]',
        'button[class*="increment"]',
        'button[class*="plus"]',
        // Aria labels - CRITICAL for Tesco
        'button[aria-label*="Add"]',
        'button[aria-label*="add"]',
        'button[aria-label*="trolley"]',
        'button[aria-label*="basket"]',
        'button[aria-label*="Trolley"]',
        'button[aria-label*="Basket"]',
        // Look for buttons inside quantity wrapper
        '[class*="quantity"] button',
        '[class*="Quantity"] button',
        // Generic with add in class
        'button[class*="add"]',
        'button[class*="Add"]',
        // SVG icon buttons (Tesco uses these)
        'button svg',
        'button[type="button"]'
      ];
    } else if (host.includes('sainsburys.co.uk')) {
      selectors = [
        '[data-test-id="add-button"]',
        '.pt__icons__add',
        '.ln-c-button--filled',
        'button[class*="add"]'
      ];
    } else if (host.includes('ocado.com')) {
      selectors = [
        // Ocado 2024 selectors
        '.fop-add-to-basket',
        '[class*="add-to-basket"]',
        '[class*="AddToBasket"]',
        'button[class*="quantity"]',
        '[data-sku] button',
        'button[aria-label*="Add"]',
        'button[aria-label*="basket"]',
        'button[class*="add"]',
        // Ocado uses + buttons
        'button[class*="increment"]',
        'button[class*="plus"]'
      ];
    } else if (host.includes('waitrose.com')) {
      selectors = [
        '[data-testid="add-to-trolley-button"]',
        '.addToTrolley',
        'button[class*="add"]'
      ];
    } else if (host.includes('morrisons.com')) {
      selectors = [
        // Morrisons 2024/2025 selectors
        '[data-test="add-to-trolley"]',
        '[data-test="fop-add-to-trolley"]',
        '.fop-add-to-trolley',
        '[class*="add-to-trolley"]',
        '[class*="AddToTrolley"]',
        'button[class*="add-button"]',
        'button[class*="AddButton"]',
        // Morrisons quantity controls
        'button[class*="quantity"]',
        'button[class*="increment"]',
        // Aria labels
        'button[aria-label*="Add"]',
        'button[aria-label*="add"]',
        'button[aria-label*="trolley"]',
        'button[aria-label*="basket"]',
        // Generic
        'button[class*="add"]'
      ];
    } else if (host.includes('aldi.co.uk')) {
      selectors = [
        // Aldi 2024/2025 selectors
        '.product-tile__add-to-cart',
        '[class*="add-to-cart"]',
        '[class*="AddToCart"]',
        '.product-card__add-button',
        '[data-testid="add-to-cart"]',
        'button[class*="add-to-basket"]',
        'button[class*="AddToBasket"]',
        // Aldi quantity controls
        'button[class*="quantity"]',
        'button[class*="increment"]',
        // Aria labels
        'button[aria-label*="Add"]',
        'button[aria-label*="add"]',
        'button[aria-label*="cart"]',
        'button[aria-label*="basket"]',
        // Generic
        'button[class*="add"]'
      ];
    }
    
    // Generic fallbacks
    selectors.push(
      'button[class*="add"]',
      'button[aria-label*="Add"]',
      'button[aria-label*="add"]'
    );
    
    for (const selector of selectors) {
      try {
        const btn = product.querySelector(selector);
        if (btn && !btn.disabled) {
          console.log('[Sally] Found add button with selector:', selector);
          return btn;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Try finding any button in the product card with "add" text
    const buttons = product.querySelectorAll('button');
    console.log('[Sally] Searching', buttons.length, 'buttons in product card for add text...');
    
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      
      // Log button details for debugging
      if (window.location.hostname.includes('tesco.com')) {
        console.log('[Sally] Tesco button:', text.substring(0, 20), '| aria:', ariaLabel.substring(0, 20), '| class:', btn.className?.substring(0, 30));
      }
      
      // Look for add-related text - expanded patterns for Tesco
      if (!btn.disabled && btn.offsetParent !== null) { // visible and enabled
        if (text === 'add' || 
            text === '+' ||
            text.includes('add to') || 
            text.includes('add item') ||
            text.includes('add to trolley') ||
            text.includes('add to basket') ||
            ariaLabel.includes('add') ||
            ariaLabel.includes('trolley') ||
            ariaLabel.includes('basket') ||
            title.includes('add') ||
            title.includes('trolley')) {
          console.log('[Sally] Found add button by text:', text || ariaLabel || title);
          return btn;
        }
      }
    }
    
    // Last resort: look for any clickable element with + icon or add text
    const clickables = product.querySelectorAll('button, [role="button"], a[class*="add"]');
    for (const el of clickables) {
      const text = (el.textContent || '').trim();
      if (text === '+' || text === 'Add') {
        console.log('[Sally] Found add button by + or Add text');
        return el;
      }
    }
    
    // Tesco-specific: smarter button detection
    if (window.location.hostname.includes('tesco.com')) {
      console.log('[Sally] Tesco fallback: looking for actionable button...');
      
      // Tesco often has buttons with just an SVG icon (no text)
      // Look for buttons that contain an SVG and are reasonably sized
      const allBtns = product.querySelectorAll('button');
      
      // First pass: look for buttons with SVG icons that look like add buttons
      for (const btn of allBtns) {
        if (btn.disabled || btn.offsetParent === null) continue;
        
        const hasSvg = btn.querySelector('svg');
        const rect = btn.getBoundingClientRect();
        const text = (btn.textContent || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        
        // Skip if it's clearly a remove/decrease button
        if (ariaLabel.includes('remove') || ariaLabel.includes('decrease') || text === '-') continue;
        
        // Look for buttons that are square-ish (likely icon buttons) or have add-related aria
        const isSquareish = Math.abs(rect.width - rect.height) < 20;
        const isReasonableSize = rect.width >= 30 && rect.height >= 30;
        
        if (hasSvg && isSquareish && isReasonableSize) {
          console.log('[Sally] Tesco: Found SVG icon button, size:', rect.width, 'x', rect.height, 'aria:', ariaLabel);
          // If it has a + related aria label, use it
          if (ariaLabel.includes('add') || ariaLabel.includes('increase') || ariaLabel === '') {
            return btn;
          }
        }
      }
      
      // Second pass: look for any button that's not navigation
      for (const btn of allBtns) {
        // Skip buttons that look like navigation or info buttons
        const text = (btn.textContent || '').toLowerCase();
        const isNavButton = text.includes('view') || text.includes('details') || text.includes('more');
        
        if (!btn.disabled && btn.offsetParent !== null && !isNavButton) {
          const rect = btn.getBoundingClientRect();
          // Button should be reasonably sized (not tiny icons)
          if (rect.width > 30 && rect.height > 20) {
            console.log('[Sally] Tesco fallback: using button with text:', btn.textContent?.trim().substring(0, 30));
            return btn;
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Find any Add button on the page (fallback)
   * Looks for the first visible Add button, prioritizing ones near the top of the viewport
   */
  function findAddButtonOnPage() {
    const buttons = document.querySelectorAll('button, [role="button"]');
    const candidates = [];
    
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Check if it's an add-related button
      const isAddButton = text === 'add' || 
                          text === '+' ||
                          text.includes('add to') || 
                          text.includes('add item') ||
                          ariaLabel.includes('add') ||
                          ariaLabel.includes('trolley') ||
                          ariaLabel.includes('basket');
      
      // Check if visible and enabled
      if (isAddButton && !btn.disabled && btn.offsetParent !== null) {
        const rect = btn.getBoundingClientRect();
        // Only consider buttons in the viewport
        if (rect.top >= 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0) {
          candidates.push({ btn, top: rect.top });
        }
      }
    }
    
    // Sort by vertical position (top of page first)
    candidates.sort((a, b) => a.top - b.top);
    
    if (candidates.length > 0) {
      console.log('[Sally] Found', candidates.length, 'add buttons on page, using first one');
      return candidates[0].btn;
    }
    
    return null;
  }
  
  /**
   * Smart quantity input - CRITICAL ENHANCEMENT
   * Tries to use quantity input field instead of multiple button clicks
   */
  async function addItemWithSmartQuantity(item, addButton, product) {
    console.log('[Sally] 📦 Smart quantity input for:', item.name, 'qty:', item.quantity);
    
    if (item.quantity <= 1) {
      // For quantity 1, just click the add button once
      console.log('[Sally] Quantity 1, using single click');
      
      const isReactSite = window.location.hostname.includes('tesco.com') || 
                          window.location.hostname.includes('morrisons.com');
      
      if (isReactSite) {
        await performReactClick(addButton);
      } else {
        await performNativeClick(addButton);
      }
      
      await sleep(2000);
      return true;
    }
    
    // First, try to find quantity input field
    const quantityInput = findQuantityInput(product);
    
    if (quantityInput) {
      console.log('[Sally] 🎯 Found quantity input, setting directly to:', item.quantity);
      
      // Clear and set quantity directly
      quantityInput.focus();
      quantityInput.select();
      quantityInput.value = item.quantity.toString();
      
      // Trigger change events
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
      quantityInput.dispatchEvent(new Event('blur', { bubbles: true }));
      
      await sleep(500);
      
      // Then click add once
      const isReactSite = window.location.hostname.includes('tesco.com') || 
                          window.location.hostname.includes('morrisons.com');
      
      if (isReactSite) {
        await performReactClick(addButton);
      } else {
        await performNativeClick(addButton);
      }
      
      await sleep(2000);
      return true;
      
    } else {
      console.log('[Sally] 🔄 No quantity input found, will use multiple clicks');
      return false; // Fallback to multiple clicks
    }
  }

  /**
   * Find quantity input field within a product card
   */
  function findQuantityInput(product) {
    const selectors = [
      'input[type="number"]',
      'input[name*="quantity"]',
      'input[id*="quantity"]',
      'input[class*="quantity"]',
      'input[aria-label*="quantity"]',
      'input[aria-label*="Quantity"]',
      'input[placeholder*="quantity"]',
      'input[placeholder*="Quantity"]'
    ];
    
    for (const selector of selectors) {
      const input = product.querySelector(selector);
      if (input && !input.disabled && input.offsetParent !== null) {
        console.log('[Sally] Found quantity input:', selector);
        return input;
      }
    }
    
    // Also check nearby the add button
    const nearbyInputs = addButton?.parentElement?.querySelectorAll('input[type="number"]') || [];
    for (const input of nearbyInputs) {
      if (!input.disabled && input.offsetParent !== null) {
        console.log('[Sally] Found quantity input near add button');
        return input;
      }
    }
    
    return null;
  }

  /**
   * Perform React-compatible click (for Tesco, Morrisons)
   */
  async function performReactClick(button) {
    console.log('[Sally] 🖱️ Performing React click');
    
    // Scroll into view
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    
    // Focus the button
    button.focus();
    
    // Create and dispatch mouse events
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    
    button.dispatchEvent(mouseDown);
    await sleep(50);
    button.dispatchEvent(mouseUp);
    await sleep(50);
    button.dispatchEvent(click);
    
    // Also trigger React synthetic events
    const reactClick = new Event('click', { bubbles: true });
    button.dispatchEvent(reactClick);
  }

  /**
   * Perform native click (for other stores)
   */
  async function performNativeClick(button) {
    console.log('[Sally] 🖱️ Performing native click');
    
    // Scroll into view
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    
    // Simple click
    button.click();
  }

  /**
   * Find the increment (+) button within a product card
   * Used after first add when quantity controls appear
   */
  function findIncrementButton(product) {
    const host = window.location.hostname;
    let selectors = [];
    
    if (host.includes('tesco.com')) {
      selectors = [
        // Tesco increment button selectors
        'button[data-auto="increase-quantity"]',
        'button[aria-label*="Increase"]',
        'button[aria-label*="increase"]',
        'button[aria-label*="Add one"]',
        'button[class*="increase"]',
        'button[class*="increment"]',
        'button[class*="plus"]',
        '[class*="quantity-controls"] button:last-child',
        '[class*="QuantityControls"] button:last-child'
      ];
    } else if (host.includes('sainsburys.co.uk')) {
      selectors = [
        'button[aria-label*="Increase"]',
        'button[class*="increase"]',
        '.pt__icons__increase'
      ];
    } else if (host.includes('asda.com')) {
      selectors = [
        'button[aria-label*="Increase"]',
        'button[class*="increase"]',
        '[class*="quantity"] button:last-child'
      ];
    } else if (host.includes('morrisons.com')) {
      selectors = [
        'button[aria-label*="Increase"]',
        'button[class*="increase"]',
        'button[class*="plus"]'
      ];
    }
    
    // Generic fallbacks
    selectors.push(
      'button[aria-label*="+"]',
      'button[aria-label*="plus"]',
      'button[aria-label*="more"]'
    );
    
    for (const selector of selectors) {
      try {
        const btn = product.querySelector(selector);
        if (btn && !btn.disabled && btn.offsetParent !== null) {
          console.log('[Sally] Found increment button with selector:', selector);
          return btn;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Try finding button with + text
    const buttons = product.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text === '+' && !btn.disabled && btn.offsetParent !== null) {
        console.log('[Sally] Found increment button by + text');
        return btn;
      }
    }
    
    return null;
  }
  
  /**
   * Accept cookies banner if present
   */
  async function acceptCookies() {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button[data-testid="accept-cookies"]',
      '[data-action="accept"]',
      'button[class*="accept"]',
      '#accept-cookies'
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        console.log('[Sally] Accepting cookies');
        btn.click();
        await sleep(500);
        return;
      }
    }
  }
  
  /**
   * Get the current trolley/cart count from the page
   * Returns -1 if unable to determine
   */
  function getTrolleyCount() {
    const host = window.location.hostname;
    let count = -1;
    
    if (host.includes('tesco.com')) {
      // Tesco trolley count selectors
      const selectors = [
        '[data-auto="trolley-count"]',
        '[class*="trolley-count"]',
        '[class*="TrolleyCount"]',
        '[class*="basket-count"]',
        '[class*="BasketCount"]',
        '.trolley-icon__count',
        '[class*="trolley"] [class*="count"]',
        '[aria-label*="trolley"] [class*="count"]',
        '[aria-label*="basket"] [class*="count"]'
      ];
      
      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent?.trim();
            const num = parseInt(text, 10);
            if (!isNaN(num)) {
              count = num;
              console.log('[Sally] Tesco trolley count:', count, 'from selector:', selector);
              break;
            }
          }
        } catch (e) {}
      }
    }
    
    return count;
  }
  
  /**
   * Report item added successfully
   */
  function reportItemAdded(item, productName, price) {
    console.log('[Sally] Item added:', item.name, '->', productName, '£' + price);
    
    // Log trolley count for debugging
    const trolleyCount = getTrolleyCount();
    console.log('[Sally] Current trolley count after add:', trolleyCount);
    
    // Update task
    item.status = 'added';
    item.productName = productName;
    item.price = price;
    chrome.storage.local.set({ currentTask });
    
    // Update overlay
    updateOverlay();
    showToast(`Added: ${item.name}`, 'success');
    
    // Notify background
    chrome.runtime.sendMessage({
      type: 'ITEM_ADDED',
      data: { itemName: item.name, productName, price }
    });
    
    // Update running stats (items added this session)
    chrome.storage.local.get(['sessionItemsAdded'], (data) => {
      const count = (data.sessionItemsAdded || 0) + item.quantity;
      chrome.storage.local.set({ sessionItemsAdded: count });
    });
  }
  
  /**
   * Report item failed
   */
  function reportItemFailed(item, reason) {
    console.log('[Sally] Item failed:', item.name, '-', reason);
    
    // Update task
    item.status = 'failed';
    item.failReason = reason;
    chrome.storage.local.set({ currentTask });
    
    // Update overlay
    updateOverlay();
    showToast(`Not found: ${item.name}`, 'error');
    
    // Notify background
    chrome.runtime.sendMessage({
      type: 'ITEM_FAILED',
      data: { itemName: item.name, reason }
    });
  }
  
  /**
   * Move to the next item in the list
   */
  function moveToNextItem() {
    if (!currentTask) return;
    
    const pendingItem = currentTask.items.find(i => i.status === 'pending');
    if (pendingItem) {
      console.log('[Sally] Moving to next item:', pendingItem.name);
      navigateToSearch(pendingItem.name);
    } else {
      console.log('[Sally] All items processed, going to checkout!');
      goToCheckout();
    }
  }
  
  /**
   * Navigate to the checkout/trolley page
   */
  function goToCheckout() {
    const host = window.location.hostname;
    let checkoutUrl;
    
    if (host.includes('tesco.com')) {
      checkoutUrl = 'https://www.tesco.com/groceries/en-GB/trolley';
    } else if (host.includes('sainsburys.co.uk')) {
      checkoutUrl = 'https://www.sainsburys.co.uk/gol-ui/trolley';
    } else if (host.includes('asda.com')) {
      checkoutUrl = 'https://groceries.asda.com/trolley';
    } else if (host.includes('ocado.com')) {
      checkoutUrl = 'https://www.ocado.com/webshop/getBasket.do';
    } else if (host.includes('waitrose.com')) {
      checkoutUrl = 'https://www.waitrose.com/ecom/shop/trolley';
    } else if (host.includes('morrisons.com')) {
      checkoutUrl = 'https://groceries.morrisons.com/trolley';
    } else if (host.includes('aldi.co.uk')) {
      checkoutUrl = 'https://www.aldi.co.uk/checkout/cart';
    }
    
    if (checkoutUrl) {
      console.log('[Sally] Navigating to checkout:', checkoutUrl);
      showToast('Shopping complete! Going to checkout... 🛒', 'success');
      
      // Update task status
      currentTask.status = 'checkout';
      chrome.storage.local.set({ currentTask });
      
      // Notify background
      chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE' });
      
      // Navigate after a short delay so user sees the toast
      setTimeout(() => {
        window.location.href = checkoutUrl;
      }, 1500);
    } else {
      chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE' });
    }
  }
  
  /**
   * Wait for page to fully load
   */
  function waitForPageLoad() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }
  
  /**
   * Sleep helper
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // SVG Icons
  const ICONS = {
    salad: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/><path d="m13 12 4-4"/><path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"/></svg>',
    bot: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>',
    cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    circle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>'
  };
  
  /**
   * Create and show the overlay UI
   */
  function showOverlay() {
    if (overlayElement) return;
    
    overlayElement = document.createElement('div');
    overlayElement.id = 'heysalad-overlay';
    overlayElement.classList.add('minimized');
    overlayElement.innerHTML = `
      <div class="heysalad-header">
        <span class="heysalad-title">${ICONS.salad}<span class="heysalad-title-text">Sally is shopping</span></span>
        <div class="heysalad-header-actions">
          <button class="heysalad-open-panel" id="heysalad-open-panel" type="button">Open panel</button>
          <button class="heysalad-minimize" id="heysalad-minimize" type="button">${ICONS.minus}</button>
        </div>
      </div>
      <div class="heysalad-body">
        <div class="heysalad-status">
          <span class="heysalad-status-icon">${ICONS.bot}</span>
          <span class="heysalad-status-text" id="heysalad-status-text">Starting...</span>
        </div>
        <div class="heysalad-progress">
          <div class="heysalad-progress-bar">
            <div class="heysalad-progress-fill" id="heysalad-progress-fill"></div>
          </div>
          <div class="heysalad-progress-text" id="heysalad-progress-text">0 of 0 items</div>
        </div>
        <div class="heysalad-items" id="heysalad-items"></div>
        <div class="heysalad-actions">
          <button class="heysalad-btn heysalad-btn-primary" id="heysalad-checkout" style="display:none;">${ICONS.cart} View Cart</button>
          <button class="heysalad-btn heysalad-btn-secondary" id="heysalad-stop">${ICONS.stop} Stop</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlayElement);

    // Event listeners
    document.getElementById('heysalad-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      overlayElement.classList.toggle('minimized');
    });

    document.getElementById('heysalad-open-panel').addEventListener('click', async (e) => {
      e.stopPropagation();
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      if (!response?.success) {
        showToast('Could not open the Sally panel', 'error');
      }
    });
    
    document.getElementById('heysalad-stop').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_SHOPPING' });
      hideOverlay();
    });
    
    document.getElementById('heysalad-checkout').addEventListener('click', () => {
      goToCheckout();
    });

    overlayElement.querySelector('.heysalad-title').addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      if (!response?.success) {
        overlayElement.classList.toggle('minimized');
      }
    });
    
    updateOverlay();
  }
  
  /**
   * Make an element draggable by its header
   */
  function makeDraggable(element) {
    const header = element.querySelector('.heysalad-header');
    if (!header) return;
    
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    header.style.cursor = 'grab';
    
    header.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on minimize button
      if (e.target.closest('.heysalad-minimize')) return;
      
      isDragging = true;
      header.style.cursor = 'grabbing';
      
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      let newX = initialX + dx;
      let newY = initialY + dy;
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      element.style.left = newX + 'px';
      element.style.top = newY + 'px';
      element.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    });
  }
  
  /**
   * Update the overlay with current task state
   */
  function updateOverlay() {
    if (!overlayElement || !currentTask) return;
    
    const statusText = document.getElementById('heysalad-status-text');
    const progressFill = document.getElementById('heysalad-progress-fill');
    const progressText = document.getElementById('heysalad-progress-text');
    const itemsContainer = document.getElementById('heysalad-items');
    
    if (!statusText) return;
    
    // Find current item being processed
    const pendingItem = currentTask.items.find(i => i.status === 'pending');
    const searchingItem = currentTask.items.find(i => i.status === 'searching');
    
    // Show/hide checkout button
    const checkoutBtn = document.getElementById('heysalad-checkout');
    const stopBtn = document.getElementById('heysalad-stop');
    
    if (searchingItem) {
      statusText.textContent = `Searching for ${searchingItem.name}...`;
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
    } else if (pendingItem) {
      statusText.textContent = `Next: ${pendingItem.name}`;
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
    } else {
      statusText.textContent = 'Shopping complete!';
      if (checkoutBtn) checkoutBtn.style.display = 'block';
      if (stopBtn) stopBtn.innerHTML = `${ICONS.x} Close`;
    }
    
    // Progress
    const total = currentTask.items.length;
    const completed = currentTask.items.filter(i => i.status === 'added' || i.status === 'failed').length;
    const percent = total > 0 ? (completed / total) * 100 : 0;
    
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${completed} of ${total} items`;
    
    // Items list with SVG icons
    itemsContainer.innerHTML = currentTask.items.map(item => {
      const statusClass = item.status || 'pending';
      const icon = item.status === 'added' ? ICONS.check : 
                   item.status === 'failed' ? ICONS.x : 
                   item.status === 'searching' ? ICONS.clock : ICONS.circle;
      const price = item.price ? `£${item.price.toFixed(2)}` : '';
      
      return `
        <div class="heysalad-item">
          <span class="heysalad-item-status ${statusClass}">${icon}</span>
          <span class="heysalad-item-name">${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
          <span class="heysalad-item-price">${price}</span>
        </div>
      `;
    }).join('');
  }
  
  /**
   * Hide and remove the overlay
   */
  function hideOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
  }
  
  /**
   * Show a toast notification
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `heysalad-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
  }
  
  // ============================================
  // MESSAGE HANDLING
  // ============================================
  
  /**
   * Listen for messages from background script
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Sally] Content script received message:', message.type);
    
    switch (message.type) {
      case 'START_SHOPPING':
        handleStartShopping(message.task);
        sendResponse({ success: true });
        break;
        
      case 'STOP_SHOPPING':
        handleStopShopping();
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  });
  
  /**
   * Handle start shopping command from background script
   */
  async function handleStartShopping(task) {
    console.log('[Sally] Starting shopping task:', task);
    
    currentTask = task;
    isProcessing = true;
    
    // Accept cookies if needed
    await acceptCookies();
    
    // Show overlay
    showOverlay();
    
    // Start with first item
    const firstItem = task.items.find(i => i.status === 'pending');
    if (firstItem) {
      console.log('[Sally] Starting with first item:', firstItem.name);
      firstItem.status = 'searching';
      updateOverlay();
      
      // Navigate to search for first item
      navigateToSearch(firstItem.name);
    } else {
      console.log('[Sally] No pending items found');
      showToast('No items to shop for', 'error');
    }
  }
  
  /**
   * Handle stop shopping command
   */
  function handleStopShopping() {
    console.log('[Sally] Stopping shopping task');
    
    currentTask = null;
    isProcessing = false;
    
    hideOverlay();
    showToast('Shopping stopped', 'info');
  }
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  // Wait for page to load before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Sally] Content script ready');
    });
  } else {
    console.log('[Sally] Content script ready');
  }
  
})();
