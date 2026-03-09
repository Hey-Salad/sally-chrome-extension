/**
 * Sally by HeySalad® - Background Service Worker
 * 
 * Now uses WebSocket for real-time communication with mobile app
 * - <100ms latency for progress updates
 * - No more slow HTTP polling
 * - Automatic reconnection
 * 
 * Handles:
 * - OAuth authentication with oauth.heysalad.app
 * - Shopping task management via WebSocket
 * - Real-time status updates
 */

const OAUTH_URL = 'https://oauth.heysalad.app';
const SHOPPING_AGENT_URL = 'https://shopping-agent.heysalad-o.workers.dev';
const SALLY_API_URL = 'https://sally-api.heysalad-o.workers.dev';
const UPGRADE_URL = 'https://heysalad.app';
const SALLY_TAB_GROUP_TITLE = 'Sally';
const SALLY_TAB_GROUP_COLOR = 'orange';

// Import WebSocket client
importScripts('websocket-client.js');

// Store URLs for manual fallback
const STORE_URLS = {
  tesco: 'https://www.tesco.com/groceries/',
  sainsburys: 'https://www.sainsburys.co.uk/gol-ui/',
  asda: 'https://groceries.asda.com/',
  ocado: 'https://www.ocado.com/',
  waitrose: 'https://www.waitrose.com/ecom/shop/',
  morrisons: 'https://groceries.morrisons.com/',
  aldi: 'https://www.aldi.co.uk/'
};

const CART_URLS = {
  tesco: 'https://www.tesco.com/groceries/en-GB/trolley',
  sainsburys: 'https://www.sainsburys.co.uk/gol-ui/trolley',
  asda: 'https://groceries.asda.com/trolley',
  ocado: 'https://www.ocado.com/webshop/getBasket.do',
  waitrose: 'https://www.waitrose.com/ecom/shop/trolley',
  morrisons: 'https://groceries.morrisons.com/trolley',
  aldi: 'https://www.aldi.co.uk/trolley'
};

// WebSocket client instance
let wsClient = null;

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[Sally] Failed to configure side panel behavior:', error.message);
  }
}

async function openSidePanelForSender(sender) {
  if (!chrome.sidePanel?.open) {
    return { success: false, error: 'Side panel API unavailable' };
  }

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;

  try {
    if (typeof tabId === 'number') {
      await chrome.sidePanel.open({ tabId });
    } else if (typeof windowId === 'number') {
      await chrome.sidePanel.open({ windowId });
    } else {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        return { success: false, error: 'No active tab available for side panel' };
      }
      await chrome.sidePanel.open({ tabId: activeTab.id });
    }

    return { success: true };
  } catch (error) {
    console.error('[Sally] Failed to open side panel:', error);
    return { success: false, error: error.message };
  }
}

configureSidePanel();

async function groupTabForSally(tabId, windowId) {
  if (!chrome.tabs?.group || !chrome.tabGroups?.query || !chrome.tabGroups?.update) return;

  try {
    const existingGroups = await chrome.tabGroups.query({
      title: SALLY_TAB_GROUP_TITLE,
      windowId,
    });

    const existingGroup = existingGroups[0];
    const groupId = existingGroup
      ? await chrome.tabs.group({ groupId: existingGroup.id, tabIds: [tabId] })
      : await chrome.tabs.group({ createProperties: { windowId }, tabIds: [tabId] });

    await chrome.tabGroups.update(groupId, {
      title: SALLY_TAB_GROUP_TITLE,
      color: SALLY_TAB_GROUP_COLOR,
      collapsed: false,
    });
  } catch (error) {
    console.warn('[Sally] Failed to group shopping tab:', error.message);
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Sally] Extension installed');
  chrome.storage.local.set({ 
    isAuthenticated: false,
    currentTask: null,
    taskHistory: []
  });
  configureSidePanel();
});

chrome.runtime.onStartup?.addListener(() => {
  configureSidePanel();
});

// Listen for tab updates to re-inject content script after navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when page is fully loaded
  if (changeInfo.status !== 'complete') return;
  
  // Check if we have an active task
  const data = await chrome.storage.local.get(['currentTask']);
  const task = data.currentTask;
  
  if (!task || task.status === 'complete' || task.status === 'stopped') return;
  
  // Check if this is a supermarket URL
  const url = tab.url || '';
  const isSupported = url.includes('tesco.com') || 
                      url.includes('sainsburys.co.uk') || 
                      url.includes('asda.com') || 
                      url.includes('ocado.com') || 
                      url.includes('waitrose.com');
  
  if (!isSupported) return;
  
  console.log('[Sally] Tab updated, re-injecting content script:', url);
  
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/base.js']
    });
    
    // Also inject CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content-scripts/overlay.css']
    });
    
    console.log('[Sally] Content script re-injected successfully');
  } catch (e) {
    console.log('[Sally] Could not inject content script:', e.message);
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Sally] Message:', message.type, sender.tab ? `from tab ${sender.tab.id}` : 'from popup');
  
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  try {
    switch (message.type) {
      case 'AUTH_LOGIN':
        return await handleLogin(message.data);
      case 'AUTH_LOGIN_WEBFLOW':
        return await handleLoginWithWebAuthFlow(message.data);
      case 'AUTH_CALLBACK':
        return await handleAuthCallback(message.data?.token);
      case 'AUTH_START_POLLING':
        return await handleAuthStartPolling(message.data);
      case 'AUTH_STOP_POLLING':
        stopAuthPolling();
        return { success: true };
      case 'AUTH_LOGOUT':
        return await handleLogout();
      case 'AUTH_CHECK':
        return await checkAuth();
      case 'GET_SUBSCRIPTION_STATUS':
        return await getSubscriptionStatus();
      case 'OPEN_SIDE_PANEL':
        return await openSidePanelForSender(sender);
      case 'START_SHOPPING':
        return await startShopping(message.data);
      case 'START_SHOPPING_FROM_MOBILE':
        return await startShopping({
          store: message.store,
          items: message.items,
          sessionId: message.sessionId,
        });
      case 'STOP_SHOPPING':
        return await stopShopping();
      case 'STOP_SHOPPING_FROM_MOBILE':
        return await stopShopping();
      case 'GET_TASK_STATUS':
        return await getTaskStatus();
      case 'CHECK_CUA_STATUS':
        return await checkCUAStatus();
      // Content script progress messages
      case 'ITEM_ADDED':
        return await handleItemAdded(message.data);
      case 'ITEM_FAILED':
        return await handleItemFailed(message.data);
      case 'SHOPPING_COMPLETE':
        return await handleShoppingComplete();
      // Sync with chat.heysalad.app
      case 'SYNC_LINK':
        return await handleSyncLink(message.data);
      case 'SYNC_PULL':
        return await handleSyncPull();
      default:
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('[Sally] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle login - sends magic link and relies on background polling to detect auth
 * 
 * NOTE: We do NOT pass a redirectUrl here because:
 * 1. The extension's chromiumapp.org redirect URL only works with launchWebAuthFlow()
 * 2. When user clicks magic link from email, it opens in a new tab
 * 3. The OAuth success page shows the token, and our polling detects the auth
 */
async function handleLogin(data) {
  const { email } = data;
  
  try {
    // Request a magic link to be sent (no redirectUrl - use OAuth's default success page)
    const response = await fetch(`${OAUTH_URL}/api/auth/send-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const result = await response.json();
    
    if (result.success) {
      return { success: true, message: 'Check your email for the magic link!' };
    } else {
      return { success: false, error: result.message || 'Failed to send magic link' };
    }
  } catch (error) {
    console.error('[Sally] Login error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle login with launchWebAuthFlow - opens auth in a popup window
 * that doesn't close the extension popup
 */
async function handleLoginWithWebAuthFlow(data) {
  const { email } = data;
  
  try {
    // Get the extension's OAuth redirect URL
    const redirectUrl = chrome.identity.getRedirectURL('oauth');
    console.log('[Sally] OAuth redirect URL:', redirectUrl);
    
    // Build the auth URL
    const authUrl = new URL(`${OAUTH_URL}/login`);
    authUrl.searchParams.set('email', email);
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('source', 'sally-extension');
    
    // Launch the web auth flow - this opens a popup window, not a tab
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
    
    console.log('[Sally] Auth response URL:', responseUrl);
    
    // Extract token from response URL
    const url = new URL(responseUrl);
    const token = url.searchParams.get('token') || url.hash.split('token=')[1]?.split('&')[0];
    
    if (token) {
      // Validate and store the token
      return await handleAuthCallback(token);
    } else {
      return { success: false, error: 'No token received from auth flow' };
    }
  } catch (error) {
    console.error('[Sally] WebAuthFlow error:', error);
    
    // User closed the popup or auth was cancelled
    if (error.message?.includes('canceled') || error.message?.includes('closed')) {
      return { success: false, error: 'Authentication was cancelled' };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Handle OAuth callback with token
 */
async function handleAuthCallback(token) {
  if (!token) {
    return { success: false, error: 'No token provided' };
  }
  
  try {
    // Validate token with OAuth service
    const response = await fetch(`${OAUTH_URL}/api/auth/validate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    if (result.valid) {
      await chrome.storage.local.set({ 
        isAuthenticated: true,
        authToken: token,
        user: result.user
      });
      
      return { success: true, user: result.user };
    } else {
      return { success: false, error: result.message || 'Invalid token' };
    }
  } catch (error) {
    console.error('[Sally] Auth callback error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  await chrome.storage.local.set({ 
    isAuthenticated: false,
    authToken: null,
    user: null,
    currentTask: null
  });
  return { success: true };
}

/**
 * Check authentication status
 */
async function checkAuth() {
  const data = await chrome.storage.local.get(['isAuthenticated', 'authToken', 'user']);
  
  if (data.isAuthenticated && data.authToken) {
    try {
      const response = await fetch(`${OAUTH_URL}/api/auth/validate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.authToken}`
        }
      });
      
      const result = await response.json();
      
      if (result.valid) {
        await chrome.storage.local.set({ user: result.user });
        const subscription = await getSubscriptionStatus(result.user);
        return { isAuthenticated: true, user: result.user, subscription };
      }
    } catch (error) {
      console.error('[Sally] Token validation error:', error);
    }
    
    // Token invalid, clear auth
    await handleLogout();
  }
  
  return { isAuthenticated: false };
}

function toExtensionPlan(subscription) {
  const tier = subscription?.tier || subscription?.subscription?.tier || 'free';
  return {
    tier,
    isPaid: tier === 'premium' || tier === 'pro',
    automationAllowed: tier === 'premium' || tier === 'pro',
    label: tier === 'pro' ? 'Sally Pro' : tier === 'premium' ? 'Sally Premium' : 'Free',
    source: subscription?.source || 'sally-api',
    upgradeUrl: UPGRADE_URL,
  };
}

async function getSubscriptionStatus(userOverride) {
  try {
    const authData = await chrome.storage.local.get(['user', 'authToken']);
    const user = userOverride || authData.user;
    const userId = user?.id || user?.user_id || user?.sub || user?.email;

    if (!userId) {
      return {
        success: true,
        plan: toExtensionPlan({ tier: 'free' }),
      };
    }

    const response = await fetch(`${SALLY_API_URL}/api/subscriptions/status`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
        'X-User-Email': user.email || '',
        ...(authData.authToken ? { 'Authorization': `Bearer ${authData.authToken}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Subscription status HTTP ${response.status}`);
    }

    const result = await response.json();
    const plan = toExtensionPlan(result.subscription);
    await chrome.storage.local.set({ extensionPlan: plan });
    return { success: true, plan };
  } catch (error) {
    console.error('[Sally] Subscription status error:', error);
    const fallbackPlan = toExtensionPlan({ tier: 'free' });
    await chrome.storage.local.set({ extensionPlan: fallbackPlan });
    return { success: false, error: error.message, plan: fallbackPlan };
  }
}

async function ensureAutomationAccess() {
  const subscription = await getSubscriptionStatus();
  if (subscription.plan?.automationAllowed) {
    return { allowed: true, plan: subscription.plan };
  }

  return {
    allowed: false,
    plan: subscription.plan,
    error: 'Autonomous shopping is part of Sally Premium or Pro. Upgrade in Sally to let the extension shop for you.',
    upgradeUrl: subscription.plan?.upgradeUrl || UPGRADE_URL,
  };
}

/**
 * Check CUA (Computer Use Agent) availability
 */
async function checkCUAStatus() {
  try {
    const response = await fetch(`${SHOPPING_AGENT_URL}/api/cua/status`);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[Sally] CUA status check error:', error);
    return { 
      available: false, 
      error: error.message,
      message: 'Could not connect to Shopping Agent'
    };
  }
}

/**
 * Start a shopping task using LOCAL BROWSER CONTROL
 * 
 * Works in the CURRENT ACTIVE TAB - user should already be on a supermarket site.
 * The extension controls the browser directly:
 * 1. Uses the user's logged-in session
 * 2. No anti-bot detection (it's their real browser)
 * 3. Full DOM access for clicking buttons
 * 4. No new tabs - works in the current tab
 */
async function startShopping(data) {
  const { store, items, deliveryPostcode, sessionId } = data;
  
  if (!items || items.length === 0) {
    return { success: false, error: 'Items are required' };
  }

  const entitlement = await ensureAutomationAccess();
  if (!entitlement.allowed) {
    return {
      success: false,
      upgradeRequired: true,
      error: entitlement.error,
      plan: entitlement.plan,
      upgradeUrl: entitlement.upgradeUrl,
    };
  }
  
  // Get the current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) {
    return { success: false, error: 'No active tab found. Please open a supermarket website first.' };
  }
  
  // Detect which store we're on from the URL
  const detectedStore = detectStore(activeTab.url);
  
  console.log('[Sally] Store detection:', {
    currentUrl: activeTab.url,
    detectedStore,
    providedStore: store,
  });
  
  // FIXED: Smart store handling
  // 1. Always use the store from mobile app (if provided)
  // 2. If no store provided, use detected store or default to Ocado
  // 3. If user is on wrong store, navigate to correct one
  
  let finalStore = store || detectedStore || 'ocado'; // Use mobile app's choice, or detected, or default
  
  if (detectedStore && store && store !== detectedStore) {
    // User wants a different store than they're on - navigate to it
    console.log('[Sally] 🔄 Store mismatch - navigating from', detectedStore, 'to', store);
    // Don't throw error - just navigate
    finalStore = store;
  } else if (detectedStore) {
    // Use the detected store (either matches user's selection or user had no preference)
    finalStore = detectedStore;
    console.log('[Sally] ✅ Using detected store:', finalStore);
  } else {
    // Not on any supported store - will need to navigate
    console.log('[Sally] 🔄 Not on a supported store, will navigate to:', finalStore);
  }
  
  const cartUrl = CART_URLS[finalStore];
  
  // Create task record
  const task = {
    id: crypto.randomUUID(),
    store: finalStore,
    items: items.map(item => ({ 
      name: item.name || item, 
      quantity: item.quantity || 1,
      status: 'pending' 
    })),
    deliveryPostcode,
    status: 'shopping',
    startedAt: new Date().toISOString(),
    itemsAdded: 0,
    itemsFailed: 0,
    mode: 'local',
    tabId: activeTab.id,
    cartUrl,
    sessionId // Store session ID for progress updates
  };
  
  await chrome.storage.local.set({ currentTask: task });
  await groupTabForSally(activeTab.id, activeTab.windowId);
  
  console.log('[Sally] Starting LOCAL shopping in current tab for', finalStore, 'with', items.length, 'items');
  console.log('[Sally] Current URL:', activeTab.url);
  console.log('[Sally] Detected store:', detectedStore, '| Final store:', finalStore);
  
  // 🚀 NEW: Initialize WebSocket for real-time updates
  if (sessionId && typeof ShoppingWebSocketClient !== 'undefined') {
    console.log('[Sally] 📡 Initializing WebSocket for session:', sessionId);
    wsClient = new ShoppingWebSocketClient(sessionId);
    wsClient.connect();
  } else {
    console.log('[Sally] ⚠️ WebSocket not available, using HTTP fallback');
  }
  
  try {
    // FIXED: Only navigate to store if we're not already on a supported store
    if (!detectedStore) {
      console.log('[Sally] Not on a supported store, navigating to', finalStore);
      const storeUrl = STORE_URLS[finalStore];
      await chrome.tabs.update(activeTab.id, { url: storeUrl });
      
      // Wait for navigation to complete
      await waitForTabLoad(activeTab.id);
      console.log('[Sally] Navigation to', finalStore, 'completed');
    } else {
      console.log('[Sally] Already on', detectedStore, '- no navigation needed');
    }
    
    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content-scripts/base.js']
      });
      console.log('[Sally] Content script injected successfully');
    } catch (e) {
      console.log('[Sally] Content script may already be loaded:', e.message);
    }
    
    // Wait a bit for content script to initialize
    await sleep(500);
    
    // Send the shopping task to the content script
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'START_SHOPPING_TASK',
        task: task
      });
      console.log('[Sally] Content script response:', response);
    } catch (e) {
      console.log('[Sally] Content script not responding, will start shopping when page loads');
      // Don't navigate here - the content script will handle it when it loads
    }
    
    // Notify popup
    chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
    
    return { 
      success: true, 
      taskId: task.id,
      store: finalStore,
      mode: 'local',
      message: `Shopping started! Adding ${items.length} items to your ${finalStore} cart...`
    };
    
  } catch (error) {
    console.error('[Sally] Local shopping error:', error);
    
    task.status = 'error';
    task.error = error.message;
    await chrome.storage.local.set({ currentTask: task });
    
    chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
    
    return { 
      success: false, 
      taskId: task.id,
      error: error.message 
    };
  }
}

/**
 * Detect which store the user is on based on URL
 */
function detectStore(url) {
  if (!url) return null;
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('tesco.com')) return 'tesco';
  if (urlLower.includes('sainsburys.co.uk')) return 'sainsburys';
  if (urlLower.includes('asda.com')) return 'asda';
  if (urlLower.includes('ocado.com')) return 'ocado';
  if (urlLower.includes('waitrose.com')) return 'waitrose';
  if (urlLower.includes('morrisons.com')) return 'morrisons';
  if (urlLower.includes('aldi.co.uk')) return 'aldi';
  
  return null;
}

/**
 * Get search URL for a store
 */
function getSearchUrl(store, query) {
  const encodedQuery = encodeURIComponent(query);
  switch (store) {
    case 'tesco':
      return `https://www.tesco.com/groceries/en-GB/search?query=${encodedQuery}`;
    case 'sainsburys':
      return `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodedQuery}`;
    case 'asda':
      return `https://groceries.asda.com/search/${encodedQuery}`;
    case 'ocado':
      return `https://www.ocado.com/search?q=${encodedQuery}`;
    case 'waitrose':
      return `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodedQuery}`;
    case 'morrisons':
      return `https://groceries.morrisons.com/search?q=${encodedQuery}`;
    case 'aldi':
      return `https://www.aldi.co.uk/search?q=${encodedQuery}`;
    default:
      return STORE_URLS[store];
  }
}

/**
 * Wait for a tab to finish loading
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Also check if already loaded
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stop current shopping task
 */
async function stopShopping() {
  const data = await chrome.storage.local.get(['currentTask']);
  const task = data.currentTask;
  
  if (task) {
    task.status = 'stopped';
    task.stoppedAt = new Date().toISOString();
    
    // Save to history
    const historyData = await chrome.storage.local.get(['taskHistory']);
    const history = historyData.taskHistory || [];
    history.unshift(task);
    
    await chrome.storage.local.set({ 
      currentTask: null,
      taskHistory: history.slice(0, 50)
    });
  }
  
  // 🚀 NEW: Disconnect WebSocket
  if (wsClient) {
    console.log('[Sally] 📡 Disconnecting WebSocket');
    wsClient.disconnect();
    wsClient = null;
  }
  
  return { success: true };
}

/**
 * Get current task status
 */
async function getTaskStatus() {
  const data = await chrome.storage.local.get(['currentTask']);
  return { task: data.currentTask };
}

/**
 * Handle item added by content script
 */
async function handleItemAdded(data) {
  const { itemName, productName, price } = data;
  console.log('[Sally] Item added:', itemName, '->', productName, '£' + price);
  
  const storage = await chrome.storage.local.get(['currentTask']);
  const task = storage.currentTask;
  
  if (task) {
    task.itemsAdded = (task.itemsAdded || 0) + 1;
    
    // Update the specific item in the task. Prefer pending items, but also
    // reconcile already-updated rows from content script for richer completion data.
    const item = task.items.find(i => i.name === itemName && i.status === 'pending') ||
      task.items.find(i => i.name === itemName && i.status === 'added') ||
      task.items.find(i => i.name === itemName);
    if (item) {
      item.status = 'added';
      item.productName = productName;
      item.price = price;
    }
    
    await chrome.storage.local.set({ currentTask: task });
    
    // Send progress update to API if we have a session ID
    if (task.sessionId) {
      await sendProgressToAPI(task);
      
      // Also add item to session
      await addItemToSession(task.sessionId, {
        requested_name: itemName,
        found_name: productName,
        price: price,
        quantity: item?.quantity || 1,
        added: true,
        confidence: 1.0,
      });
    }
    
    // Notify popup
    chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
    
    // Send progress message for popup listener
    chrome.runtime.sendMessage({ 
      type: 'SHOPPING_PROGRESS', 
      sessionId: task.sessionId,
      progress: buildProgressObject(task)
    }).catch(() => {});
  }
  
  return { success: true };
}

/**
 * Add item to session via API
 */
async function addItemToSession(sessionId, itemData) {
  try {
    const response = await fetch(
      `https://sally-api.heysalad-o.workers.dev/api/sessions/${sessionId}/item`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      }
    );
    
    if (!response.ok) {
      console.error('[Sally] Failed to add item to session:', response.status);
    }
  } catch (error) {
    console.error('[Sally] Error adding item to session:', error);
  }
}

/**
 * Handle item failed by content script
 */
async function handleItemFailed(data) {
  const { itemName, reason } = data;
  console.log('[Sally] Item failed:', itemName, '-', reason);
  
  const storage = await chrome.storage.local.get(['currentTask']);
  const task = storage.currentTask;
  
  if (task) {
    task.itemsFailed = (task.itemsFailed || 0) + 1;
    
    // Update the specific item in the task. Prefer pending items, but also
    // reconcile already-updated rows from content script for richer completion data.
    const item = task.items.find(i => i.name === itemName && i.status === 'pending') ||
      task.items.find(i => i.name === itemName && i.status === 'failed') ||
      task.items.find(i => i.name === itemName);
    if (item) {
      item.status = 'failed';
      item.failReason = reason;
    }
    
    await chrome.storage.local.set({ currentTask: task });
    
    // Send progress update to API if we have a session ID
    if (task.sessionId) {
      await sendProgressToAPI(task);
    }
    
    // Notify popup
    chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
    
    // Send progress message for popup listener
    chrome.runtime.sendMessage({ 
      type: 'SHOPPING_PROGRESS', 
      sessionId: task.sessionId,
      progress: buildProgressObject(task)
    }).catch(() => {});
  }
  
  return { success: true };
}

/**
 * Build progress object from task
 */
function buildProgressObject(task) {
  const totalItems = task.items.length;
  const itemsAdded = task.itemsAdded || 0;
  const itemsFailed = task.itemsFailed || 0;
  const percentage = Math.round(((itemsAdded + itemsFailed) / totalItems) * 100);
  
  return {
    itemsAdded,
    itemsFailed,
    totalItems,
    percentage,
    items: task.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      status: item.status,
      price: item.price
    }))
  };
}

/**
 * Send progress update to Sally API (WebSocket + HTTP fallback)
 */
async function sendProgressToAPI(task) {
  if (!task.sessionId) {
    console.log('[Sally] No session ID, skipping progress update');
    return;
  }
  
  try {
    const progress = buildProgressObject(task);
    
    console.log('[Sally] 📱 Sending progress:', {
      sessionId: task.sessionId,
      percentage: progress.percentage,
      itemsAdded: progress.itemsAdded,
      itemsFailed: progress.itemsFailed,
      totalItems: progress.totalItems
    });
    
    // 🚀 NEW: Send via WebSocket if available (much faster!)
    if (wsClient && wsClient.isConnected) {
      wsClient.sendProgress(progress);
      console.log('[Sally] ✅ Progress sent via WebSocket (<100ms)');
      return; // WebSocket sent, no need for HTTP
    }
    
    // Fallback to HTTP if WebSocket not available
    console.log('[Sally] 📡 WebSocket not available, using HTTP fallback');
    const response = await fetch(
      `https://sally-api.heysalad-o.workers.dev/api/extension/token/${task.sessionId}/progress`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(progress)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sally] ❌ Failed to send progress to API:', response.status, errorText);
    } else {
      const result = await response.json();
      console.log('[Sally] ✅ Progress sent to API via HTTP:', progress.percentage + '%', result);
    }
  } catch (error) {
    console.error('[Sally] ❌ Error sending progress:', error);
  }
}

// ============================================
// DUPLICATE FUNCTIONS REMOVED
// The actual implementations are earlier in this file (lines 334-750)
// This section was causing the extension to ignore store selection
// and always default to Tesco.
// ============================================

// ============================================
// AUTH POLLING FOR MAGIC LINK FLOW
// ============================================

let authPollingInterval = null;
let authPollingEmail = null;

/**
 * Start polling for auth completion after magic link is sent
 * This allows the extension to detect when the user clicks the magic link
 * in their email (which opens a new tab) and completes authentication.
 */
async function handleAuthStartPolling(data) {
  const { email } = data;
  
  if (!email) {
    return { success: false, error: 'Email required for polling' };
  }
  
  // Stop any existing polling
  if (authPollingInterval) {
    clearInterval(authPollingInterval);
  }
  
  authPollingEmail = email;
  let pollCount = 0;
  const maxPolls = 60; // Poll for 5 minutes max (60 * 5 seconds)
  
  console.log('[Sally] Starting auth polling for:', email);
  
  // Start polling every 5 seconds
  authPollingInterval = setInterval(async () => {
    pollCount++;
    
    if (pollCount > maxPolls) {
      console.log('[Sally] Auth polling timed out');
      clearInterval(authPollingInterval);
      authPollingInterval = null;
      authPollingEmail = null;
      return;
    }
    
    try {
      // Check if user has authenticated by looking for a recent session
      const response = await fetch(`${OAUTH_URL}/api/auth/check-email-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const result = await response.json();
      
      if (result.authenticated && result.token) {
        console.log('[Sally] Auth detected via polling!');
        
        // Stop polling
        clearInterval(authPollingInterval);
        authPollingInterval = null;
        authPollingEmail = null;
        
        // Validate and store the token
        const authResult = await handleAuthCallback(result.token);
        
        if (authResult.success) {
          // Broadcast auth success to any open popup
          chrome.runtime.sendMessage({ 
            type: 'AUTH_SUCCESS', 
            user: authResult.user 
          }).catch(() => {
            // Popup might be closed, that's ok
            console.log('[Sally] Could not notify popup (may be closed)');
          });
          
          // Show notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Signed In! 🎉',
            message: 'You\'re now signed in to Sally. Open the extension to start shopping!'
          });
        }
      }
    } catch (error) {
      console.log('[Sally] Auth poll error:', error.message);
      // Continue polling on error
    }
  }, 5000);
  
  return { success: true, message: 'Polling started' };
}

/**
 * Stop auth polling
 */
function stopAuthPolling() {
  if (authPollingInterval) {
    clearInterval(authPollingInterval);
    authPollingInterval = null;
    authPollingEmail = null;
  }
}

// ============================================
// SYNC WITH CHAT.HEYSALAD.APP
// ============================================

/**
 * Link extension to a sync session from chat.heysalad.app
 */
async function handleSyncLink(data) {
  const { code, session_id } = data;
  
  if (!code && !session_id) {
    return { success: false, error: 'Code or session_id required' };
  }
  
  try {
    // Generate a unique extension ID if we don't have one
    let extensionId = (await chrome.storage.local.get(['extensionId'])).extensionId;
    if (!extensionId) {
      extensionId = crypto.randomUUID();
      await chrome.storage.local.set({ extensionId });
    }
    
    const response = await fetch(`${SHOPPING_AGENT_URL}/api/sync/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code?.toUpperCase(),
        session_id,
        extension_id: extensionId,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Store the sync session
      await chrome.storage.local.set({
        syncSession: {
          session_id: result.session_id,
          user_id: result.user_id,
          linked_at: new Date().toISOString(),
        },
      });
      
      return { success: true, session_id: result.session_id };
    } else {
      return { success: false, error: result.error || 'Failed to link' };
    }
  } catch (error) {
    console.error('[Sally] Sync link error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Pull shopping lists from synced chat session
 */
async function handleSyncPull() {
  const data = await chrome.storage.local.get(['syncSession']);
  const syncSession = data.syncSession;
  
  if (!syncSession?.session_id) {
    return { success: false, error: 'Not synced' };
  }
  
  try {
    const response = await fetch(`${SHOPPING_AGENT_URL}/api/sync/pull/${syncSession.session_id}`);
    const result = await response.json();
    
    if (result.success) {
      return { success: true, lists: result.lists };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('[Sally] Sync pull error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Poll for actions from mobile app
 * Called periodically when synced to check for shopping commands
 */
async function pollSyncActions() {
  const data = await chrome.storage.local.get(['syncSession']);
  const syncSession = data.syncSession;
  
  if (!syncSession?.session_id) return;
  
  try {
    const response = await fetch(`${SHOPPING_AGENT_URL}/api/sync/actions/${syncSession.session_id}`);
    const result = await response.json();
    
    if (result.success && result.actions?.length > 0) {
      for (const action of result.actions) {
        console.log('[Sally] Received action from mobile:', action.action_type);
        
        if (action.action_type === 'start_shopping') {
          const { items, store } = action.payload;
          
          // Show notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Shopping Request from Mobile 📱',
            message: `Sally Mobile wants to shop ${items.length} items at ${store}. Click to start!`,
          });
          
          // Store the pending shopping task
          await chrome.storage.local.set({
            pendingMobileTask: {
              items,
              store,
              received_at: new Date().toISOString(),
            },
          });
          
          // Notify popup if open
          chrome.runtime.sendMessage({ 
            type: 'MOBILE_SHOPPING_REQUEST', 
            items, 
            store 
          }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.log('[Sally] Sync poll error:', error.message);
  }
}

/**
 * Initialize WebSocket connection for a session
 */
async function initializeWebSocket(sessionId) {
  if (wsClient) {
    console.log('[Sally] Disconnecting existing WebSocket');
    wsClient.disconnect();
  }
  
  console.log('[Sally] Initializing WebSocket for session:', sessionId);
  
  // Import WebSocket client
  if (typeof ShoppingWebSocketClient === 'undefined') {
    await import('./websocket-client.js');
  }
  
  wsClient = new ShoppingWebSocketClient(sessionId);
  
  // Register message handlers
  wsClient.on('start_shopping', async (payload) => {
    console.log('[Sally] Received start shopping command via WebSocket');
    await handleStartShoppingFromMobile(payload);
  });
  
  wsClient.on('stop', async () => {
    console.log('[Sally] Received stop command via WebSocket');
    await handleStopShoppingFromMobile();
  });
  
  // Connect
  wsClient.connect();
  
  return wsClient;
}

/**
 * Handle start shopping command from mobile via WebSocket
 */
async function handleStartShoppingFromMobile(payload) {
  const { items, store, preferences } = payload;
  
  console.log('[Sally] Starting shopping from mobile:', { items: items?.length, store });
  
  // Start shopping with the provided items
  const result = await startShopping({
    items,
    store,
    preferences,
    source: 'mobile_websocket'
  });
  
  if (result.success) {
    console.log('[Sally] Shopping started successfully via WebSocket');
  } else {
    console.error('[Sally] Failed to start shopping:', result.error);
    if (wsClient) {
      wsClient.sendError(result.error || 'Failed to start shopping');
    }
  }
}

/**
 * Handle stop shopping command from mobile via WebSocket
 */
async function handleStopShoppingFromMobile() {
  console.log('[Sally] Stopping shopping from mobile command');
  
  const data = await chrome.storage.local.get(['currentTask']);
  if (data.currentTask) {
    data.currentTask.status = 'cancelled';
    await chrome.storage.local.set({ currentTask: data.currentTask });
    
    // Notify content script to stop
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_SHOPPING' }).catch(() => {});
    }
    
    if (wsClient) {
      wsClient.sendComplete({
        itemsAdded: data.currentTask.itemsAdded || 0,
        totalItems: data.currentTask.items?.length || 0,
        cancelled: true
      });
    }
  }
}

// Start polling for sync actions when extension loads (DEPRECATED - replaced by WebSocket)
let syncPollInterval = null;

async function startSyncPolling() {
  const data = await chrome.storage.local.get(['syncSession']);
  if (data.syncSession?.session_id) {
    // Check if WebSocket is available, if so, use it instead of polling
    if (!wsClient || !wsClient.isConnected) {
      console.log('[Sally] WebSocket not connected, initializing...');
      await initializeWebSocket(data.syncSession.session_id);
    }
    
    // Keep legacy polling as fallback (but less frequent)
    if (syncPollInterval) clearInterval(syncPollInterval);
    syncPollInterval = setInterval(pollSyncActions, 60000); // Poll every 60 seconds as fallback
    console.log('[Sally] Started fallback sync polling (WebSocket is primary)');
  }
}

// Initialize sync polling on startup
startSyncPolling();

// Re-start polling when sync session changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.syncSession) {
    if (changes.syncSession.newValue) {
      const sessionId = changes.syncSession.newValue.session_id;
      console.log('[Sally] Sync session changed, initializing WebSocket:', sessionId);
      initializeWebSocket(sessionId);
      startSyncPolling();
    } else {
      // Session ended, disconnect WebSocket
      if (wsClient) {
        console.log('[Sally] Sync session ended, disconnecting WebSocket');
        wsClient.disconnect();
        wsClient = null;
      }
      if (syncPollInterval) {
        clearInterval(syncPollInterval);
        syncPollInterval = null;
      }
    }
  }
});

/**
 * Handle shopping complete from content script
 */
async function handleShoppingComplete() {
  console.log('[Sally] Shopping complete!');
  
  const storage = await chrome.storage.local.get(['currentTask', 'sallyStats']);
  const task = storage.currentTask;
  
  if (task) {
    task.status = 'complete';
    task.completedAt = new Date().toISOString();
    
    // Update lifetime stats
    const stats = storage.sallyStats || { totalItems: 0, totalSessions: 0, totalSpent: 0 };
    const itemsAdded = task.itemsAdded || task.items?.filter(i => i.status === 'added').length || 0;
    const spent = task.items?.reduce((sum, item) => {
      return sum + (item.status === 'added' && item.price ? item.price : 0);
    }, 0) || 0;
    
    if (itemsAdded > 0 && !task.statsUpdated) {
      stats.totalItems += itemsAdded;
      stats.totalSessions += 1;
      
      stats.totalSpent += spent;
      
      task.statsUpdated = true;
    }
    
    await chrome.storage.local.set({ currentTask: task, sallyStats: stats });
    
    // Save to history
    const historyData = await chrome.storage.local.get(['taskHistory']);
    const history = historyData.taskHistory || [];
    history.unshift(task);
    await chrome.storage.local.set({ taskHistory: history.slice(0, 50) });
    
    // Send real-time completion via WebSocket (instant!)
    if (wsClient && wsClient.isConnected) {
      const duration = task.completedAt && task.startedAt 
        ? (new Date(task.completedAt) - new Date(task.startedAt)) / 1000 
        : 0;
      
      wsClient.sendComplete({
        itemsAdded,
        totalItems: task.items?.length || 0,
        totalPrice: spent,
        duration
      });
    }
    
    // Notify popup
    chrome.runtime.sendMessage({ type: 'SHOPPING_COMPLETE', task }).catch(() => {});
    
    // Show notification with time saved estimate
    const timeSaved = Math.round(itemsAdded * 0.5); // ~30 sec per item
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Shopping Complete! 🛒',
      message: `Added ${itemsAdded} items to your ${task.store} cart. Saved ~${timeSaved} min!`
    });
  }
  
  return { success: true };
}
