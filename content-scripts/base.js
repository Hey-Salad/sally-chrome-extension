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

  function scheduleProcessingCycle(delayMs = 0) {
    setTimeout(() => {
      if (currentTask?.status === 'paused') {
        console.log('[Sally] Shopping task is paused; skipping processing cycle');
        return;
      }
      runProcessingCycle();
    }, delayMs);
  }

  async function runProcessingCycle() {
    try {
      await checkAndProcess();
    } catch (error) {
      console.error('[Sally] Processing cycle crashed:', error);
      isProcessing = false;

      if (!currentTask) {
        return;
      }

      const activeItem = currentTask.items.find((item) => item.status === 'searching') ||
        currentTask.items.find((item) => item.status === 'pending');

      if (activeItem) {
        reportItemFailed(activeItem, `Unexpected error: ${error.message}`);
        await sleep(1000);
        moveToNextItem();
        return;
      }

      updateOverlay();
      showToast('Sally hit an unexpected error', 'error');
    }
  }
  
  // Backend AI routing
  const SHOPPING_AGENT_URL = 'https://shopping-agent.heysalad-o.workers.dev';
  const taskMetricsApi = globalThis.HeySaladTaskMetrics || {};
  const itemParserApi = globalThis.HeySaladItemParser || {};
  const productFitApi = globalThis.HeySaladProductFit || {};
  const productLanguageApi = globalThis.HeySaladProductLanguage || {};
  const computeTaskMetrics = taskMetricsApi.computeTaskMetrics || ((task) => {
    const items = Array.isArray(task?.items) ? task.items : [];
    const addedItems = items.filter((item) => item.status === 'added').length;
    const failedItems = items.filter((item) => item.status === 'failed').length;

    return {
      totalItems: items.length,
      addedItems,
      failedItems,
      processedItems: addedItems + failedItems,
      remainingItems: Math.max(items.length - (addedItems + failedItems), 0),
      totalUnits: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
      addedUnits: items
        .filter((item) => item.status === 'added')
        .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
      failedUnits: items
        .filter((item) => item.status === 'failed')
        .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
      remainingUnits: items
        .filter((item) => item.status !== 'added' && item.status !== 'failed')
        .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
      hasMultiQuantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) > items.length,
    };
  });
  const formatProgressSummary = taskMetricsApi.formatProgressSummary || ((task) => {
    const metrics = computeTaskMetrics(task);
    const unitSummary = metrics.hasMultiQuantity ? ` (${metrics.addedUnits}/${metrics.totalUnits} units)` : '';
    const parts = [
      `Got ${metrics.addedItems}/${metrics.totalItems} items${unitSummary}`,
      `${metrics.remainingItems} left`,
    ];

    if (metrics.failedItems > 0) {
      parts.push(`${metrics.failedItems} unavailable`);
    }

    return parts.join(' • ');
  });
  const getProgressPercentage = taskMetricsApi.getProgressPercentage || ((task) => {
    const metrics = computeTaskMetrics(task);
    return metrics.totalItems > 0 ? Math.round((metrics.processedItems / metrics.totalItems) * 100) : 0;
  });
  const getItemSearchQuery = itemParserApi.getItemSearchQuery || ((item) => {
    if (typeof item === 'string') {
      return String(item || '').trim();
    }

    return String(item?.searchQuery || item?.name || item?.rawText || '').trim();
  });
  const extractProductAttributes = productFitApi.extractProductAttributes || ((name, price = 0) => ({
    name,
    normalizedName: String(name || '').toLowerCase(),
    price: Number(price) || 0,
    measureValue: null,
    measureType: null,
    measureUnit: null,
    packageCount: null,
    packageUnit: null,
  }));
  const scoreProductFit = productFitApi.scoreProductFit || ((requestedItem, product) => {
    const requestedQuery = normalizeSemanticText(getItemSearchQuery(requestedItem));
    const productName = normalizeSemanticText(product?.name || '');
    if (!requestedQuery || !productName) {
      return 0;
    }

    if (productName.includes(requestedQuery)) {
      return 0.75;
    }

    const queryWords = requestedQuery.split(/\s+/).filter((word) => word.length > 2);
    if (queryWords.length === 0) {
      return 0;
    }

    const matchedWords = queryWords.filter((word) => productName.includes(word));
    return matchedWords.length / queryWords.length;
  });
  const chooseBestProductByFit = productFitApi.chooseBestProductByFit || ((requestedItem, products, excludedIndices = []) => {
    let bestIndex = -1;
    let bestScore = -1;
    products.forEach((product, index) => {
      if (excludedIndices.includes(index)) {
        return;
      }

      const score = scoreProductFit(requestedItem, product, products);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return {
      success: bestIndex >= 0 && bestScore > 0.3,
      bestIndex,
      confidence: bestScore >= 0 ? bestScore : 0,
    };
  });
  const normalizeSemanticText = productLanguageApi.normalizeSemanticText || ((value) => String(value || '').toLowerCase().trim());
  const getPreferredSearchQuery = productLanguageApi.getPreferredSearchQuery || ((value) => String(value || '').trim());
  const getSearchQueryVariants = productLanguageApi.getSearchQueryVariants || ((value) => {
    const preferred = getPreferredSearchQuery(value);
    return preferred ? [preferred] : [];
  });
  const getObviousMismatchReason = productLanguageApi.getObviousMismatchReason || ((query, productName) => {
    const normalizedQuery = normalizeSemanticText(query);
    const normalizedProduct = normalizeSemanticText(productName);
    const rules = [
      { item: 'apple', wrong: ['juice', 'cider', 'sauce'] },
      { item: 'tomato', wrong: ['sauce', 'paste', 'puree', 'soup', 'ketchup'] },
      { item: 'chicken', wrong: ['stock', 'soup', 'gravy', 'nugget'] },
      { item: 'orange', wrong: ['juice', 'marmalade'] },
      { item: 'toilet tissue', wrong: ['facial tissue', 'kitchen roll'] },
      { item: 'kitchen roll', wrong: ['toilet tissue', 'facial tissue'] },
      { item: 'eggs', wrong: ['mini egg', 'creme egg', 'easter egg', 'custard', 'tart', 'chocolate'] },
    ];

    for (const rule of rules) {
      if (!normalizedQuery.includes(rule.item)) {
        continue;
      }

      const mismatch = rule.wrong.find((term) => {
        return normalizedProduct.includes(term) && !normalizedQuery.includes(term);
      });

      if (mismatch) {
        return `Rejected ${productName} because it looks like ${mismatch}, not ${query}.`;
      }
    }

    return null;
  });
  
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
  function basicProductMatch(requestedItem, products, excludedIndices = []) {
    const requestedQuery = getItemSearchQuery(requestedItem);
    console.log('[Sally] Using basic product matching for:', requestedQuery);

    const fitResult = chooseBestProductByFit(requestedItem, products, excludedIndices);
    if (!fitResult.success) {
      return {
        success: false,
        bestIndex: fitResult.bestIndex >= 0 ? fitResult.bestIndex : 0,
        confidence: fitResult.confidence,
        reason: 'No strong local fit found',
      };
    }

    const selectedProduct = products[fitResult.bestIndex];
    const mismatchReason = getObviousMismatchReason(requestedQuery, selectedProduct?.name || '');
    if (mismatchReason) {
      return {
        success: false,
        bestIndex: fitResult.bestIndex,
        confidence: Math.min(fitResult.confidence, 0.2),
        reason: mismatchReason,
      };
    }

    return {
      success: true,
      bestIndex: fitResult.bestIndex,
      confidence: fitResult.confidence,
      reason: fitResult.confidence > 0.7 ? 'Good fit found' : 'Best local fit found',
    };
  }

  function getLocalFallbackMatch(requestedItem, products, rejectedIndices = []) {
    const fallback = basicProductMatch(requestedItem, products, rejectedIndices);

    if (!fallback.success) {
      return null;
    }

    const candidate = products[fallback.bestIndex];
    if (!candidate) {
      return null;
    }

    const mismatchReason = getObviousMismatchReason(getItemSearchQuery(requestedItem), candidate.name);
    if (mismatchReason) {
      return null;
    }

    return fallback;
  }
  
  async function validateProductMatch(requestedItem, selectedProduct) {
    return basicValidation(requestedItem, selectedProduct.name);
  }
  
  /**
   * Basic validation fallback (rule-based)
   */
  function basicValidation(requestedItem, selectedProductName) {
    const requested = normalizeSemanticText(requestedItem);
    const selected = normalizeSemanticText(selectedProductName);
    
    const mismatchReason = getObviousMismatchReason(requestedItem, selectedProductName);
    if (mismatchReason) {
      return {
        valid: false,
        confidence: 0.95,
        reason: mismatchReason,
      };
    }

    const fitScore = scoreProductFit(requestedItem, extractProductAttributes(selectedProductName, 0), [
      extractProductAttributes(selectedProductName, 0),
    ]);
    if (fitScore < 0.3) {
      return {
        valid: false,
        confidence: Math.max(fitScore, 0.1),
        reason: `"${selectedProductName}" is a weak size or value fit for "${getItemSearchQuery(requestedItem) || requestedItem}"`,
      };
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
    } else if (message.type === 'PAUSE_SHOPPING') {
      handlePauseShopping();
      sendResponse({ success: true });
    } else if (message.type === 'RESUME_SHOPPING') {
      handleResumeShopping();
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
    isProcessing = false;
    
    // Show overlay immediately
    showOverlay();
    showToast('Sally is taking control...', 'info', 'bot');
    
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
    scheduleProcessingCycle(2000);
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
    showToast('Prioritizing essential items due to store limits', 'info', 'check');
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
      showToast('Tesco login required - continuing as guest', 'warning', 'circle');
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

  function getStoreAuthBlocker() {
    const host = window.location.hostname.toLowerCase();
    const href = window.location.href.toLowerCase();
    const pageText = (document.body?.innerText || '').toLowerCase();
    const hasPasswordField = Boolean(document.querySelector('input[type="password"]'));

    if (host.includes('tesco.com')) {
      const onTescoAuthPage = href.includes('/account/auth/');
      const tescoLoginPrompt = hasPasswordField && pageText.includes('sign in to your account');
      if (onTescoAuthPage || tescoLoginPrompt) {
        return {
          store: 'tesco',
          message: 'Tesco sign-in required before Sally can add items to the basket.',
        };
      }
    }

    if (hasPasswordField && pageText.includes('sign in')) {
      return {
        store: 'generic',
        message: 'Supermarket sign-in required before Sally can continue shopping.',
      };
    }

    return null;
  }

  function blockTaskForAuth(message) {
    if (!currentTask || currentTask.status === 'blocked') {
      return;
    }

    console.log('[Sally] Blocking shopping task due to auth requirement:', message);
    currentTask.status = 'blocked';

    currentTask.items.forEach((item) => {
      if (item.status === 'pending' || item.status === 'searching') {
        item.status = 'failed';
        item.failReason = message;
        chrome.runtime.sendMessage({
          type: 'ITEM_FAILED',
          data: { itemName: item.name, reason: message }
        });
      }
    });

    chrome.storage.local.set({ currentTask });
    updateOverlay();
    showToast(message, 'error');
    chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE' });
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

      if (currentTask.status === 'paused') {
        console.log('[Sally] Stored task is paused; rendering overlay without processing');
        showOverlay();
        updateOverlay();
        return;
      }
      
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
      
      scheduleProcessingCycle(delay);
    }
  });
  
  /**
   * Check current page and process accordingly
   */
  async function checkAndProcess() {
    if (!currentTask) {
      return;
    }

    if (currentTask.status === 'blocked') {
      return;
    }

    if (currentTask.status === 'paused') {
      console.log('[Sally] Shopping task paused');
      showOverlay();
      updateOverlay();
      return;
    }

    if (isProcessing) {
      console.log('[Sally] Processing already in progress, waiting for current step to finish');
      return;
    }
    
    // Show overlay when we have a task
    showOverlay();
    
    const currentUrl = window.location.href;
    console.log('[Sally] Checking page:', currentUrl);

    const authBlocker = getStoreAuthBlocker();
    if (authBlocker) {
      blockTaskForAuth(authBlocker.message);
      return;
    }
    
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
      showToast('Shopping complete.', 'success', 'check');
      chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE' });
      setTimeout(hideOverlay, 3000);
      return;
    }
    
    // Use searching item if exists, otherwise pending
    const itemToProcess = searchingItem || pendingItem;
    
    // Mark item as searching if not already
    if (itemToProcess.status !== 'searching') {
      itemToProcess.status = 'searching';
      itemToProcess.searchStartedAt = new Date().toISOString();
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
      console.log('[Sally] Not on search page, searching for:', getItemSearchQuery(itemToProcess));
      navigateToSearch(itemToProcess);
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
    const rawQuery = typeof query === 'string' ? query : getItemSearchQuery(query);
    const searchQuery = getSearchQueryForAttempt(query);
    let searchUrl;
    
    if (host.includes('tesco.com')) {
      searchUrl = `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('sainsburys.co.uk')) {
      searchUrl = `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('asda.com')) {
      searchUrl = `https://groceries.asda.com/search/${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('ocado.com')) {
      searchUrl = `https://www.ocado.com/search?q=${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('waitrose.com')) {
      searchUrl = `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('morrisons.com')) {
      searchUrl = `https://groceries.morrisons.com/search?q=${encodeURIComponent(searchQuery)}`;
    } else if (host.includes('aldi.co.uk')) {
      searchUrl = `https://www.aldi.co.uk/search?q=${encodeURIComponent(searchQuery)}`;
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
          currentSearchTerm = normalizeSemanticText(decodeURIComponent(currentSearchTerm));
        } catch (e) {
          console.log('[Sally] Error parsing URL:', e);
        }
        
        const targetSearch = normalizeSemanticText(searchQuery);
        
        // Only skip when the URL already has the exact query. Fallback searches
        // often intentionally overlap, e.g. "long grain rice 500g" -> "long grain rice".
        if (currentSearchTerm && currentSearchTerm === targetSearch) {
          console.log('[Sally] Already on search page for:', searchQuery, '(current:', currentSearchTerm, ') - processing results instead');
          // Process results directly instead of navigating
          scheduleProcessingCycle(1000);
          return;
        }
      }
      
      console.log('[Sally] Navigating to:', searchUrl, '(query:', searchQuery, ')');
      // Save navigation timestamp to prevent re-navigation after page reload
      chrome.storage.local.set({ lastNavigationTime: Date.now() }, () => {
        window.location.href = searchUrl;
      });
    }
  }

  function getSearchQueryForAttempt(itemOrQuery) {
    const rawQuery = typeof itemOrQuery === 'string' ? itemOrQuery : getItemSearchQuery(itemOrQuery);
    const variants = getSearchQueryVariants(rawQuery);
    const attemptIndex = typeof itemOrQuery === 'object'
      ? Number(itemOrQuery?.searchAttemptIndex || 0)
      : 0;

    return variants[Math.min(Math.max(attemptIndex, 0), Math.max(variants.length - 1, 0))] ||
      getPreferredSearchQuery(rawQuery) ||
      rawQuery;
  }

  async function retryWithNextSearchQuery(item, reason = 'No products found') {
    const rawQuery = getItemSearchQuery(item) || item.name;
    const variants = getSearchQueryVariants(rawQuery);
    const currentAttempt = Number(item.searchAttemptIndex || 0);
    const nextAttempt = currentAttempt + 1;

    if (nextAttempt >= variants.length) {
      return false;
    }

    item.searchAttemptIndex = nextAttempt;
    item.lastSearchFailureReason = reason;
    item.status = 'searching';
    await chrome.storage.local.set({ currentTask });

    const nextQuery = variants[nextAttempt];
    console.log('[Sally] Retrying search for', item.name, 'with broader query:', nextQuery);
    showToast(`Trying broader search: ${nextQuery}`, 'info');
    await sleep(500);
    navigateToSearch(item);
    return true;
  }
  
  /**
   * Process search results - find product and add to cart
   */
  async function processSearchResults(item) {
    console.log('[Sally] Processing search results for:', item.name);
    console.log('[Sally] Current URL:', window.location.href);
    const requestedSearchQuery = getItemSearchQuery(item) || item.name;
    
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
        if (await retryWithNextSearchQuery(item, 'No products found')) {
          return;
        }

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
      showToast('Selecting best match...', 'info', 'search');
      const matchResult = await matchProductWithAI(requestedSearchQuery, productInfoList);
      if (matchResult.success && matchResult.bestIndex !== undefined) {
        bestIndex = matchResult.bestIndex;
        aiUsed = true;
        console.log('[Sally] AI matched product:', matchResult.reason, '(confidence:', matchResult.confidence, ')');
        if (matchResult.shouldAdd === false) {
          console.log('[Sally] ❌ Backend rejected product:', matchResult.validationReason);
          const fallbackMatch = getLocalFallbackMatch(item, productInfoList, [bestIndex]);
          if (fallbackMatch) {
            bestIndex = fallbackMatch.bestIndex;
            aiUsed = false;
            console.log('[Sally] 🔁 Using local fallback after backend rejection:', productInfoList[bestIndex]?.name);
            showToast(`Using fallback: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'info', 'refresh');
          } else {
            showToast(`Wrong product: ${matchResult.validationReason || matchResult.reason}`, 'error', 'x');
            reportItemFailed(item, `Match rejected: ${matchResult.validationReason || matchResult.reason}`);
            await sleep(1500);
            moveToNextItem();
            return;
          }
        }
        if (matchResult.confidence >= 0.7) {
          showToast(`Found: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'success', 'check');
        } else {
          showToast(`Best guess: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'info', 'search');
        }
      }
    } catch (e) {
      console.log('[Sally] AI matching failed, using first product:', e);
      showToast('Using first result (AI unavailable)', 'info');
    }

    const localPreference = basicProductMatch(item, productInfoList);
    const aiFitScore = scoreProductFit(item, productInfoList[bestIndex], productInfoList);
    if (
      localPreference.success &&
      localPreference.bestIndex !== bestIndex &&
      localPreference.confidence > aiFitScore + 0.12
    ) {
      console.log('[Sally] 🔁 Local fit override selected a better value/size match:', {
        aiChoice: productInfoList[bestIndex]?.name,
        aiFitScore,
        localChoice: productInfoList[localPreference.bestIndex]?.name,
        localScore: localPreference.confidence,
      });
      bestIndex = localPreference.bestIndex;
      aiUsed = false;
      showToast(`Better fit: ${productInfoList[bestIndex]?.name?.substring(0, 30)}...`, 'info', 'refresh');
    }
    
    // Get the best matching product
    let product = products[bestIndex];
    console.log('[Sally] Selected product index:', bestIndex, product.tagName, product.className);
    
    let productInfo = extractProductInfo(product);
    console.log('[Sally] Selected product:', productInfo);
    
    // 🤖 AI VALIDATION: Verify this is the correct product before adding
    showToast('Validating product match...', 'info', 'search');
    let validation = await validateProductMatch(requestedSearchQuery, productInfo);
    
    if (!validation.valid || validation.confidence < 0.7) {
      console.log('[Sally] ❌ AI rejected product:', validation.reason);
      const fallbackMatch = getLocalFallbackMatch(item, productInfoList, [bestIndex]);
      if (fallbackMatch && fallbackMatch.bestIndex !== bestIndex) {
        bestIndex = fallbackMatch.bestIndex;
        product = products[bestIndex];
        productInfo = extractProductInfo(product);
        validation = await validateProductMatch(requestedSearchQuery, productInfo);
        console.log('[Sally] 🔁 Retrying with fallback product:', productInfo.name);
      }
      
      if (!validation.valid || validation.confidence < 0.7) {
        showToast(`Wrong product: ${validation.reason}`, 'error', 'x');
        reportItemFailed(item, `AI validation failed: ${validation.reason}`);
        await sleep(1500);
        moveToNextItem();
        return;
      }
    }
    
    console.log('[Sally] ✅ AI validated product (confidence:', validation.confidence, ')');
    showToast(`Validated: ${productInfo.name.substring(0, 30)}...`, 'success', 'check');
    
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
        const baselineQuantity = getVisibleProductQuantity(product);
        const baselineTrolleyCount = getTrolleyCount();
        
        // Use appropriate click method
        if (isReactSite) {
          await performReactClick(addButton);
        } else {
          await performNativeClick(addButton);
        }

        const confirmed = await waitForProductStateChange(product, baselineQuantity, baselineTrolleyCount, baselineQuantity + 1);
        if (!confirmed) {
          console.log('[Sally] ⚠️ Click did not visibly update the cart on attempt', i + 1);
        }
        
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
    
    const verification = await verifyAddToCart(product, trolleyCountBefore, item.quantity);
    if (!verification.success) {
      if (verification.authRequired) {
        return;
      }
      console.log('[Sally] ❌ Add verification failed:', verification.reason);
      reportItemFailed(item, verification.reason);
      await sleep(1000);
      moveToNextItem();
      return;
    }

    // Report success
    reportItemAdded(item, productInfo.name, productInfo.price, item.quantity);
    
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

    const layoutProducts = scanProductCardsFromPageLayout();
    if (layoutProducts.length > 0) {
      console.log('[Sally] Found', layoutProducts.length, 'products with smart layout scan');
      return layoutProducts;
    }

    return [];
  }

  function scanProductCardsFromPageLayout() {
    const addButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .map((button) => ({ button, score: scoreAddButtonCandidate(button, null) }))
      .filter((candidate) => candidate.score >= 50)
      .sort((a, b) => b.score - a.score);

    const products = [];
    const seen = new Set();

    for (const { button } of addButtons) {
      const card = findProductContainerForButton(button);
      if (!card || seen.has(card)) continue;

      const info = extractProductInfo(card);
      if (!info.name || info.name.length < 2) continue;

      seen.add(card);
      products.push(card);

      if (products.length >= 20) break;
    }

    return products;
  }

  function findProductContainerForButton(button) {
    const selectors = [
      '[data-sku]',
      '[data-testid*="product"]',
      '[data-test*="product"]',
      '[data-auto*="product"]',
      '[data-auto-id*="product"]',
      'article',
      'li',
      '[role="listitem"]',
      '[class*="product"]',
      '[class*="Product"]',
      '[class*="fop"]',
      '[class*="tile"]',
      '[class*="Tile"]',
      '[class*="card"]',
      '[class*="Card"]',
    ];

    for (const selector of selectors) {
      const candidate = button.closest(selector);
      if (candidate && candidate !== document.body) {
        return candidate;
      }
    }

    let node = button.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 5) {
      const text = node.textContent || '';
      const rect = node.getBoundingClientRect();
      const hasPrice = /£\s?\d|p\b/i.test(text);
      const hasUsefulSize = rect.width >= 120 && rect.height >= 80;
      if (hasPrice && hasUsefulSize) {
        return node;
      }
      node = node.parentElement;
      depth++;
    }

    return null;
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
    
    return {
      name,
      price,
      ...extractProductAttributes(name, price),
    };
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

    const smartButton = findSmartAddButton(product);
    if (smartButton) {
      console.log('[Sally] Found add button with smart layout scan:', describeButton(smartButton));
      return smartButton;
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
    const smartButton = findSmartAddButton(document, { viewportOnly: true });
    if (smartButton) {
      console.log('[Sally] Found page add button with smart scan:', describeButton(smartButton));
      return smartButton;
    }

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

  function findSmartAddButton(scope, options = {}) {
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"]'));
    const scored = [];

    for (const button of buttons) {
      const score = scoreAddButtonCandidate(button, scope, options);
      if (score < 50) continue;

      scored.push({ button, score, top: button.getBoundingClientRect().top });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.top - b.top;
    });

    return scored[0]?.button || null;
  }

  function scoreAddButtonCandidate(button, scope, options = {}) {
    if (!button || isDisabledElement(button) || !isVisibleElement(button)) return 0;

    const rect = button.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return 0;
    if (options.viewportOnly && (rect.bottom < 0 || rect.top > window.innerHeight)) return 0;

    const semanticText = getButtonSemanticText(button);
    if (isNegativeCartAction(semanticText)) return 0;

    let score = 0;
    if (/\b(add|buy)\b/.test(semanticText)) score += 45;
    if (/\b(add to|add item|add product|add one)\b/.test(semanticText)) score += 25;
    if (/\b(trolley|basket|cart|bag)\b/.test(semanticText)) score += 18;
    if (/\b(increase|increment|plus)\b/.test(semanticText)) score += 20;
    if (/^\+$/.test((button.textContent || '').trim())) score += 25;
    if (button.querySelector('svg')) score += 5;
    if (button.closest('[data-sku], [data-testid*="product"], [data-test*="product"], [data-auto*="product"], article, li, [role="listitem"]')) {
      score += 10;
    }

    const productText = scope && scope !== document ? String(scope.textContent || '').toLowerCase() : '';
    if (productText && /£\s?\d|p\b/.test(productText)) score += 8;

    if (/\b(view|details|more|sort|filter|menu|close|sign in|login|checkout|basket summary|view basket|view trolley)\b/.test(semanticText)) {
      score -= 35;
    }

    return score;
  }

  function getButtonSemanticText(button) {
    const parts = [
      button.textContent,
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-testid'),
      button.getAttribute('data-test'),
      button.getAttribute('data-auto'),
      button.getAttribute('data-auto-id'),
      button.className,
    ];

    return parts
      .map((part) => String(part || ''))
      .join(' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .trim();
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number(style.opacity || 1) > 0.05;
  }

  function isDisabledElement(element) {
    return Boolean(
      element.disabled ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.closest('[aria-disabled="true"], [disabled]')
    );
  }

  function isNegativeCartAction(text) {
    return /\b(remove|delete|decrease|reduce|minus|subtract|unavailable|out of stock|notify|favourite|favorite|save for later)\b/.test(text) ||
      /^-$/.test(text.trim());
  }

  function describeButton(button) {
    const label = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || button.className || button.tagName;
    return String(label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }
  
  /**
   * Smart quantity input - CRITICAL ENHANCEMENT
   * Tries to use quantity input field instead of multiple button clicks
   */
  async function addItemWithSmartQuantity(item, addButton, product) {
    console.log('[Sally] 📦 Smart quantity input for:', item.name, 'qty:', item.quantity);
    try {
      if (item.quantity <= 1) {
        // For quantity 1, just click the add button once
        console.log('[Sally] Quantity 1, using single click');
        const baselineQuantity = getVisibleProductQuantity(product);
        const baselineTrolleyCount = getTrolleyCount();
        
        const isReactSite = window.location.hostname.includes('tesco.com') || 
                            window.location.hostname.includes('morrisons.com');
        
        if (isReactSite) {
          await performReactClick(addButton);
        } else {
          await performNativeClick(addButton);
        }

        return await waitForProductStateChange(product, baselineQuantity, baselineTrolleyCount, 1);
      }
      
      // First, try to find quantity input field
      const quantityInput = findQuantityInput(product, addButton);
      
      if (quantityInput) {
        console.log('[Sally] 🎯 Found quantity input, setting directly to:', item.quantity);
        const baselineTrolleyCount = getTrolleyCount();
        
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

        return await waitForProductStateChange(product, 0, baselineTrolleyCount, item.quantity);
      }

      console.log('[Sally] 🔄 No quantity input found, will use multiple clicks');
      return false;
    } catch (error) {
      console.error('[Sally] Smart quantity input failed:', error);
      return false;
    }
  }

  async function waitForProductStateChange(product, baselineQuantity, baselineTrolleyCount, expectedMinimumQuantity) {
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(450);

      const currentQuantity = getVisibleProductQuantity(product);
      const currentTrolleyCount = getTrolleyCount();
      const incrementButton = findIncrementButton(product);

      if (baselineTrolleyCount >= 0 && currentTrolleyCount > baselineTrolleyCount) {
        return true;
      }

      if (currentQuantity >= expectedMinimumQuantity) {
        return true;
      }

      if (expectedMinimumQuantity === 1 && incrementButton) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find quantity input field within a product card
   */
  function findQuantityInput(product, addButton = null) {
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
    button.click();
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

  function getVisibleProductQuantity(product) {
    const quantityInput = findQuantityInput(product, null);
    if (quantityInput) {
      const numeric = Number(quantityInput.value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }

    return 0;
  }

  async function verifyAddToCart(product, previousTrolleyCount, requestedQuantity) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(700);

      const authBlocker = getStoreAuthBlocker();
      if (authBlocker) {
        blockTaskForAuth(authBlocker.message);
        return {
          success: false,
          authRequired: true,
          reason: authBlocker.message,
        };
      }

      const currentTrolleyCount = getTrolleyCount();
      const visibleQuantity = getVisibleProductQuantity(product);
      const incrementButton = findIncrementButton(product);

      if (previousTrolleyCount >= 0 && currentTrolleyCount >= previousTrolleyCount + 1) {
        return { success: true, reason: 'Trolley count increased' };
      }

      if (visibleQuantity >= Math.min(requestedQuantity, 1)) {
        return { success: true, reason: 'Quantity control updated' };
      }

      if (requestedQuantity === 1 && incrementButton) {
        return { success: true, reason: 'Increment button appeared after add' };
      }
    }

    return {
      success: false,
      reason: 'Cart did not update after clicking add',
    };
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
  function reportItemAdded(item, productName, unitPrice, quantity) {
    const totalPrice = (Number(unitPrice) || 0) * (Number(quantity) || 1);
    console.log('[Sally] Item added:', item.name, '->', productName, '£' + totalPrice);
    
    // Log trolley count for debugging
    const trolleyCount = getTrolleyCount();
    console.log('[Sally] Current trolley count after add:', trolleyCount);
    
    // Update task
    item.status = 'added';
    item.productName = productName;
    item.unitPrice = Number(unitPrice) || 0;
    item.price = totalPrice;
    item.resolvedAt = new Date().toISOString();
    chrome.storage.local.set({ currentTask });
    
    // Update overlay
    updateOverlay();
    showToast(`Added: ${item.name}`, 'success');
    
    // Notify background
    chrome.runtime.sendMessage({
      type: 'ITEM_ADDED',
      data: {
        itemName: item.name,
        productName,
        price: totalPrice,
        unitPrice: Number(unitPrice) || 0,
      }
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
    item.resolvedAt = new Date().toISOString();
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

    if (currentTask.status === 'paused') {
      console.log('[Sally] Task paused; not moving to next item');
      updateOverlay();
      return;
    }
    
    const pendingItem = currentTask.items.find(i => i.status === 'pending');
    if (pendingItem) {
      console.log('[Sally] Moving to next item:', pendingItem.name);
      navigateToSearch(pendingItem);
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
      checkoutUrl = 'https://www.ocado.com/basket';
    } else if (host.includes('waitrose.com')) {
      checkoutUrl = 'https://www.waitrose.com/ecom/shop/trolley';
    } else if (host.includes('morrisons.com')) {
      checkoutUrl = 'https://groceries.morrisons.com/trolley';
    } else if (host.includes('aldi.co.uk')) {
      checkoutUrl = 'https://www.aldi.co.uk/checkout/cart';
    }
    
    if (checkoutUrl) {
      console.log('[Sally] Navigating to checkout:', checkoutUrl);
      showToast('Shopping complete. Going to checkout...', 'success', 'cart');
      
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
    wordmark: `<img class="heysalad-wordmark-logo" src="${chrome.runtime.getURL('icons/heysalad-logo-black.svg')}" alt="HeySalad">`,
    bot: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>',
    cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    circle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    chevronUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.6 6.1"/><path d="M3 12A9 9 0 0 1 18.6 5.9"/><path d="M3 19v-5h5"/><path d="M21 5v5h-5"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect width="4" height="14" x="6" y="5" rx="1"/><rect width="4" height="14" x="14" y="5" rx="1"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
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
        <span class="heysalad-title">${ICONS.wordmark}</span>
        <span class="heysalad-loading-spinner" aria-label="Shopping in progress" title="Shopping in progress"></span>
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
          <button class="heysalad-btn heysalad-btn-secondary" id="heysalad-pause">${ICONS.pause} Pause</button>
          <button class="heysalad-btn heysalad-btn-secondary" id="heysalad-stop">${ICONS.stop} Stop</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlayElement);

    document.getElementById('heysalad-stop').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_SHOPPING' });
      hideOverlay();
    });

    document.getElementById('heysalad-pause').addEventListener('click', () => {
      if (currentTask?.status === 'paused') {
        chrome.runtime.sendMessage({ type: 'RESUME_SHOPPING' });
        handleResumeShopping();
      } else {
        chrome.runtime.sendMessage({ type: 'PAUSE_SHOPPING' });
        handlePauseShopping();
      }
    });
    
    document.getElementById('heysalad-checkout').addEventListener('click', () => {
      goToCheckout();
    });

    overlayElement.querySelector('.heysalad-title').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    });
    
    updateOverlay();
    updateOverlayChromeState();
  }

  function updateOverlayChromeState() {
    if (!overlayElement) return;
    const minimizeButton = overlayElement.querySelector('#heysalad-minimize');
    if (!minimizeButton) return;
    const isMinimized = overlayElement.classList.contains('minimized');
    minimizeButton.innerHTML = isMinimized ? ICONS.chevronUp : ICONS.chevronDown;
    minimizeButton.setAttribute('aria-label', isMinimized ? 'Expand shopping status' : 'Collapse shopping status');
    minimizeButton.setAttribute('title', isMinimized ? 'Expand shopping status' : 'Collapse shopping status');
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
    const pauseBtn = document.getElementById('heysalad-pause');
    
    if (currentTask.status === 'paused') {
      statusText.textContent = 'Shopping paused';
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
      if (pauseBtn) {
        pauseBtn.style.display = 'block';
        pauseBtn.innerHTML = `${ICONS.play} Resume`;
      }
    } else if (searchingItem) {
      statusText.textContent = `Searching for ${searchingItem.name}...`;
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
      if (pauseBtn) {
        pauseBtn.style.display = 'block';
        pauseBtn.innerHTML = `${ICONS.pause} Pause`;
      }
    } else if (pendingItem) {
      statusText.textContent = `Next: ${pendingItem.name}`;
      if (checkoutBtn) checkoutBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
      if (pauseBtn) {
        pauseBtn.style.display = 'block';
        pauseBtn.innerHTML = `${ICONS.pause} Pause`;
      }
    } else {
      statusText.textContent = 'Shopping complete!';
      if (checkoutBtn) checkoutBtn.style.display = 'block';
      if (stopBtn) stopBtn.innerHTML = `${ICONS.x} Close`;
      if (pauseBtn) pauseBtn.style.display = 'none';
    }
    
    // Progress
    const metrics = computeTaskMetrics(currentTask);
    const percent = getProgressPercentage(metrics);
    
    progressFill.style.width = `${percent}%`;
    progressText.textContent = formatProgressSummary(metrics);
    
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
  function showToast(message, type = 'info', icon = type) {
    const toast = document.createElement('div');
    toast.className = `heysalad-toast ${type}`;
    const iconElement = document.createElement('span');
    iconElement.className = 'heysalad-toast-icon';
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.innerHTML = ICONS[icon] || ICONS[type] || ICONS.circle;

    const textElement = document.createElement('span');
    textElement.className = 'heysalad-toast-text';
    textElement.textContent = message;

    toast.append(iconElement, textElement);
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

      case 'START_SHOPPING_TASK':
        handleStartShopping(message.task);
        sendResponse({ success: true });
        break;
        
      case 'STOP_SHOPPING':
        handleStopShopping();
        sendResponse({ success: true });
        break;

      case 'PAUSE_SHOPPING':
        handlePauseShopping();
        sendResponse({ success: true });
        break;

      case 'RESUME_SHOPPING':
        handleResumeShopping();
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
    isProcessing = false;
    
    // Accept cookies if needed
    await acceptCookies();
    
    // Show overlay
    showOverlay();
    updateOverlay();
    chrome.storage.local.set({ currentTask });

    const hasPendingWork = task.items.some((item) => item.status === 'pending' || item.status === 'searching');
    if (!hasPendingWork) {
      console.log('[Sally] No pending items found');
      showToast('No items to shop for', 'error');
      return;
    }

    scheduleProcessingCycle(500);
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

  function handlePauseShopping() {
    if (!currentTask || currentTask.status === 'paused') return;
    console.log('[Sally] Pausing shopping task');
    currentTask.status = 'paused';
    currentTask.pausedAt = new Date().toISOString();
    isProcessing = false;
    chrome.storage.local.set({ currentTask });
    updateOverlay();
    showToast('Shopping paused', 'info');
  }

  function handleResumeShopping() {
    if (!currentTask || currentTask.status !== 'paused') return;
    console.log('[Sally] Resuming shopping task');
    delete currentTask.pausedAt;
    currentTask.status = 'shopping';
    chrome.storage.local.set({ currentTask });
    showOverlay();
    updateOverlay();
    showToast('Shopping resumed', 'info');
    scheduleProcessingCycle(300);
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
