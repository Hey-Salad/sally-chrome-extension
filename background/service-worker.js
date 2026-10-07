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
const OPENAI_API_URL = 'https://api.openai.com/v1';
const SALLY_FRONTIER_MODELS = {
  composer: 'gpt-5.6-terra',
  classifier: 'gpt-5.6-luna',
  realtime: 'gpt-5.6-luna',
};
const DEFAULT_COMPOSER_MODEL = SALLY_FRONTIER_MODELS.composer;
const DEFAULT_CLASSIFIER_MODEL = SALLY_FRONTIER_MODELS.classifier;
const DEFAULT_REALTIME_MODEL = SALLY_FRONTIER_MODELS.realtime;
const UPGRADE_URL = 'https://heysalad.app/#settings/billing';
const FREE_AUTONOMOUS_SHOP_LIMIT = 2;
const SALLY_TAB_GROUP_TITLE = 'Sally';
const SALLY_TAB_GROUP_COLOR = 'red';
// AI calls are proxied through Sally API (Cloudflare AI Gateway)
// to comply with Chrome Web Store MV3 policy (no remotely hosted code).
const RECIPE_NOTIFICATION_PREFIX = 'sally_recipe_';

// Import WebSocket client
importScripts(
  'websocket-client.js',
  '../shared/task-metrics.js',
  '../shared/store-routing.js',
  '../shared/item-parser.js'
);

const taskMetricsApi = globalThis.HeySaladTaskMetrics || {};
const storeRoutingApi = globalThis.HeySaladStoreRouting || {};
const itemParserApi = globalThis.HeySaladItemParser || {};
const computeTaskMetrics = taskMetricsApi.computeTaskMetrics || ((task) => {
  const items = Array.isArray(task?.items) ? task.items : [];
  const addedItems = items.filter((item) => item.status === 'added').length;
  const failedItems = items.filter((item) => item.status === 'failed').length;
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const addedUnits = items
    .filter((item) => item.status === 'added')
    .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const failedUnits = items
    .filter((item) => item.status === 'failed')
    .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

  return {
    totalItems: items.length,
    addedItems,
    failedItems,
    processedItems: addedItems + failedItems,
    remainingItems: Math.max(items.length - (addedItems + failedItems), 0),
    totalUnits,
    addedUnits,
    failedUnits,
    processedUnits: addedUnits + failedUnits,
    remainingUnits: Math.max(totalUnits - (addedUnits + failedUnits), 0),
    hasMultiQuantity: totalUnits > items.length,
  };
});
const normalizeShoppingItem = itemParserApi.normalizeShoppingItem || ((input) => {
  if (typeof input === 'string') {
    return { name: String(input || '').trim(), quantity: 1, searchQuery: String(input || '').trim() };
  }

  return {
    ...input,
    name: String(input?.name || '').trim(),
    quantity: Number(input?.quantity) > 0 ? Number(input.quantity) : 1,
    searchQuery: String(input?.searchQuery || input?.name || '').trim(),
  };
});
const getProgressPercentage = taskMetricsApi.getProgressPercentage || ((task) => {
  const metrics = computeTaskMetrics(task);
  return metrics.totalItems > 0 ? Math.round((metrics.processedItems / metrics.totalItems) * 100) : 0;
});
const detectStoreFromUrl = storeRoutingApi.detectStoreFromUrl || ((url) => {
  const urlLower = String(url || '').toLowerCase();
  if (urlLower.includes('tesco.com')) return 'tesco';
  if (urlLower.includes('sainsburys.co.uk')) return 'sainsburys';
  if (urlLower.includes('asda.com')) return 'asda';
  if (urlLower.includes('ocado.com')) return 'ocado';
  if (urlLower.includes('waitrose.com')) return 'waitrose';
  if (urlLower.includes('morrisons.com')) return 'morrisons';
  if (urlLower.includes('aldi.co.uk')) return 'aldi';
  return null;
});
const isSupportedSupermarketUrl = storeRoutingApi.isSupportedSupermarketUrl || ((url) => Boolean(detectStoreFromUrl(url)));
const resolveShoppingStore = storeRoutingApi.resolveShoppingStore || (({ requestedStore, detectedStore }) => {
  const finalStore = requestedStore || detectedStore || null;
  return {
    requestedStore: requestedStore || null,
    detectedStore: detectedStore || null,
    finalStore,
    shouldNavigateToStore: Boolean(finalStore) && (!detectedStore || (Boolean(requestedStore) && requestedStore !== detectedStore)),
    hasStoreMismatch: Boolean(requestedStore && detectedStore && requestedStore !== detectedStore),
  };
});

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
  ocado: 'https://www.ocado.com/basket',
  waitrose: 'https://www.waitrose.com/ecom/shop/trolley',
  morrisons: 'https://groceries.morrisons.com/trolley',
  aldi: 'https://www.aldi.co.uk/trolley'
};

// WebSocket client instance
let wsClient = null;
const recipeNotificationCache = new Map();

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
    taskHistory: [],
    llmConfig: {
      provider: 'openai',
      classifierModel: DEFAULT_CLASSIFIER_MODEL,
      composerModel: DEFAULT_COMPOSER_MODEL,
      realtimeModel: DEFAULT_REALTIME_MODEL,
    },
  });
  configureSidePanel();
});

chrome.runtime.onStartup?.addListener(() => {
  configureSidePanel();
});

chrome.notifications?.onButtonClicked?.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith(RECIPE_NOTIFICATION_PREFIX)) return;

  const recipe = recipeNotificationCache.get(notificationId) ||
    (await findSavedRecipeByNotificationId(notificationId));
  if (!recipe) return;

  if (buttonIndex === 0) {
    await startRecipeShopping({ recipeId: recipe.id });
    return;
  }

  if (buttonIndex === 1) {
    await saveRecipeForReorder(recipe);
  }
});

chrome.notifications?.onClicked?.addListener(async (notificationId) => {
  if (!notificationId.startsWith(RECIPE_NOTIFICATION_PREFIX)) return;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await openSidePanelForSender(activeTab ? { tab: activeTab } : {});
});

// Listen for tab updates to re-inject content script after navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when page is fully loaded
  if (changeInfo.status !== 'complete') return;
  
  // Check if we have an active task
  const data = await chrome.storage.local.get(['currentTask']);
  const task = data.currentTask;
  
  if (!task || task.status === 'complete' || task.status === 'stopped' || task.status === 'paused') return;
  
  // Check if this is a supermarket URL
  const url = tab.url || '';
  const isSupported = isSupportedSupermarketUrl(url);
  
  if (!isSupported) return;
  
  console.log('[Sally] Tab updated, re-injecting content script:', url);
  
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'shared/task-metrics.js',
        'shared/product-language.js',
        'content-scripts/base.js',
      ]
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
      case 'CREATE_SUBSCRIPTION_CHECKOUT':
        return await createSubscriptionCheckout(message.data);
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
      case 'PAUSE_SHOPPING':
        return await pauseShopping();
      case 'RESUME_SHOPPING':
        return await resumeShopping();
      case 'STOP_SHOPPING_FROM_MOBILE':
        return await stopShopping();
      case 'GET_TASK_STATUS':
        return await getTaskStatus();
      case 'CHECK_CUA_STATUS':
        return await checkCUAStatus();
      case 'CLASSIFY_MESSAGE':
        return await classifyMessageRequest(message.data);
      case 'COMPOSE_CHAT_REPLY':
        return await composeChatReplyRequest(message.data);
      case 'RECIPE_DETECTED':
        return await handleRecipeDetected(message.data, sender);
      case 'RECIPE_CANDIDATE_DETECTED':
        return await handleRecipeCandidateDetected(message.data, sender);
      case 'GET_SAVED_RECIPES':
        return await getSavedRecipes();
      case 'START_RECIPE_SHOPPING':
        return await startRecipeShopping(message.data);
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
      const user = await enrichUserProfile(result.user, token);
      await chrome.storage.local.set({ 
        isAuthenticated: true,
        authToken: token,
        user
      });
      
      return { success: true, user };
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
        const user = await enrichUserProfile(result.user, data.authToken);
        await chrome.storage.local.set({ user });
        const subscription = await getSubscriptionStatus(user);
        return { isAuthenticated: true, user, subscription };
      }
    } catch (error) {
      console.error('[Sally] Token validation error:', error);
    }
    
    // Token invalid, clear auth
    await handleLogout();
  }
  
  return { isAuthenticated: false };
}

async function enrichUserProfile(user = {}, token) {
  if (!token) return user || {};

  const profile = await fetchUserProfile(token);
  return normalizeUserProfile({ ...(user || {}), ...(profile || {}) });
}

async function fetchUserProfile(token) {
  const endpoints = [
    `${OAUTH_URL}/api/me`,
    `${OAUTH_URL}/api/user`,
    `${SALLY_API_URL}/api/me`,
    `${SALLY_API_URL}/api/users/me`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) continue;

      const result = await response.json();
      return result.user || result.profile || result.data || result;
    } catch (error) {
      console.warn('[Sally] User profile lookup failed:', endpoint, error.message);
    }
  }

  return null;
}

function normalizeUserProfile(user = {}) {
  const name = user.name
    || user.full_name
    || user.displayName
    || user.display_name
    || [user.given_name || user.firstName || user.first_name, user.family_name || user.lastName || user.last_name]
      .filter(Boolean)
      .join(' ')
    || '';
  const avatarUrl = user.avatarUrl
    || user.avatar_url
    || user.picture
    || user.image
    || user.photoURL
    || user.photo_url
    || '';

  return {
    ...user,
    ...(name ? { name } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function normalizePlanTier(value) {
  const tier = String(value || 'free').toLowerCase();
  if (tier === 'max') return 'max';
  if (tier === 'premium') return 'premium';
  if (tier === 'pro') return 'pro';
  return 'free';
}

function toExtensionPlan(subscription, source = 'heysalad-accounts') {
  const tier = normalizePlanTier(subscription?.tier || subscription?.subscription?.tier);
  const automationAllowed = tier === 'pro' || tier === 'max' || tier === 'premium';
  const labels = {
    free: 'Free',
    pro: 'HeySalad Pro',
    max: 'HeySalad Max',
    premium: 'Sally Premium',
  };

  return {
    tier,
    isPaid: automationAllowed,
    automationAllowed,
    label: labels[tier] || 'Free',
    source: subscription?.source || source,
    upgradeUrl: UPGRADE_URL,
    freeShopLimit: FREE_AUTONOMOUS_SHOP_LIMIT,
  };
}

function getFreeShopUsageKey(user) {
  const userKey = user?.id || user?.user_id || user?.sub || user?.email || 'anonymous';
  return `freeShopUsage:${userKey}`;
}

async function enrichPlanWithFreeAllowance(plan, user) {
  if (plan.automationAllowed) {
    return {
      ...plan,
      freeShopsUsed: 0,
      freeShopsRemaining: 0,
    };
  }

  const usageKey = getFreeShopUsageKey(user);
  const storage = await chrome.storage.local.get([usageKey]);
  const used = Math.max(0, Number(storage[usageKey]) || 0);
  const remaining = Math.max(FREE_AUTONOMOUS_SHOP_LIMIT - used, 0);

  return {
    ...plan,
    freeShopsUsed: used,
    freeShopsRemaining: remaining,
  };
}

async function recordFreeShopUse(entitlement) {
  if (!entitlement.freeAllowance || !entitlement.usageKey) return;

  const storage = await chrome.storage.local.get([entitlement.usageKey]);
  const used = Math.max(0, Number(storage[entitlement.usageKey]) || 0);
  await chrome.storage.local.set({ [entitlement.usageKey]: used + 1 });
}

function applyShoppingUsageToPlan(plan, usage) {
  if (!usage) return plan;

  const limit = Number(usage.limit);
  const currentUsage = Math.max(0, Number(usage.currentUsage) || 0);
  const isUnlimited = limit === -1;
  const remaining = isUnlimited
    ? -1
    : Math.max(0, Number(usage.remaining ?? (limit - currentUsage)) || 0);

  return {
    ...plan,
    usage: {
      action: 'shopping_request',
      allowed: usage.allowed !== false,
      currentUsage,
      limit,
      remaining,
      tier: usage.tier || plan.tier,
      message: usage.message,
      upgradeUrl: normalizeUpgradeUrl(usage.upgradeUrl || plan.upgradeUrl || UPGRADE_URL),
    },
    freeShopLimit: plan.automationAllowed ? 0 : Math.max(0, limit),
    freeShopsUsed: plan.automationAllowed ? 0 : currentUsage,
    freeShopsRemaining: plan.automationAllowed ? 0 : remaining,
  };
}

function normalizeUpgradeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return UPGRADE_URL;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${OAUTH_URL}${value}`;
  return UPGRADE_URL;
}

async function checkShoppingUsage(authToken) {
  if (!authToken) return null;

  const response = await fetch(`${OAUTH_URL}/api/usage/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ action: 'shopping_request' }),
  });

  const result = await response.json().catch(() => ({}));
  return {
    ...result,
    allowed: response.ok && result.allowed !== false,
  };
}

async function consumeShoppingUsage(authToken) {
  if (!authToken) {
    return {
      success: false,
      message: 'Sign in to start autonomous shopping.',
      upgradeUrl: UPGRADE_URL,
    };
  }

  const response = await fetch(`${OAUTH_URL}/api/usage/increment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ action: 'shopping_request' }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    return {
      success: false,
      message: result.message || 'Upgrade to keep Sally shopping for you.',
      currentUsage: result.currentUsage ?? result.newCount,
      limit: result.limit,
      remaining: result.remaining,
      upgradeUrl: normalizeUpgradeUrl(result.upgradeUrl || UPGRADE_URL),
    };
  }

  return {
    success: true,
    currentUsage: result.newCount,
    limit: result.limit,
    remaining: result.remaining,
  };
}

async function getCentralSubscriptionStatus(authData) {
  if (!authData.authToken) {
    return null;
  }

  const response = await fetch(`${OAUTH_URL}/api/subscription`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authData.authToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Central subscription HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || 'Central subscription lookup failed');
  }

  return toExtensionPlan({
    tier: result.tier || result.subscription?.tier || authData.user?.tier,
    subscription: result.subscription,
    source: 'heysalad-accounts',
  }, 'heysalad-accounts');
}

async function getLegacySallySubscriptionStatus(authData, user) {
  const userId = user?.id || user?.user_id || user?.sub || user?.email;

  if (!userId) {
    return toExtensionPlan({ tier: 'free' });
  }

  const response = await fetch(`${SALLY_API_URL}/api/subscriptions/status`, {
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-User-Email': user?.email || '',
      ...(authData.authToken ? { 'Authorization': `Bearer ${authData.authToken}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Legacy Sally subscription HTTP ${response.status}`);
  }

  const result = await response.json();
  return toExtensionPlan(result.subscription, 'sally-api');
}

async function getSubscriptionStatus(userOverride) {
  try {
    const authData = await chrome.storage.local.get(['user', 'authToken']);
    const user = userOverride || authData.user;

    if (!user && !authData.authToken) {
      return {
        success: true,
        plan: await enrichPlanWithFreeAllowance(toExtensionPlan({ tier: 'free' }), null),
      };
    }

    let plan = null;
    let centralError = null;
    try {
      plan = await getCentralSubscriptionStatus({ ...authData, user });
    } catch (error) {
      centralError = error;
      console.warn('[Sally] Central subscription status unavailable:', error);
    }

    if (!plan) {
      plan = await getLegacySallySubscriptionStatus(authData, user);
    }

    try {
      const usage = await checkShoppingUsage(authData.authToken);
      plan = applyShoppingUsageToPlan(plan, usage);
    } catch (error) {
      console.warn('[Sally] Backend usage status unavailable:', error);
      plan = plan.automationAllowed
        ? plan
        : {
            ...plan,
            usage: {
              action: 'shopping_request',
              allowed: false,
              currentUsage: 0,
              limit: FREE_AUTONOMOUS_SHOP_LIMIT,
              remaining: 0,
              tier: plan.tier,
              message: 'Billing usage check is unavailable. Please try again shortly.',
              upgradeUrl: UPGRADE_URL,
            },
            freeShopLimit: FREE_AUTONOMOUS_SHOP_LIMIT,
            freeShopsUsed: FREE_AUTONOMOUS_SHOP_LIMIT,
            freeShopsRemaining: 0,
          };
    }

    if (!plan.usage) {
      plan = await enrichPlanWithFreeAllowance(plan, user);
    }
    await chrome.storage.local.set({ extensionPlan: plan });
    return {
      success: true,
      plan,
      warning: centralError ? centralError.message : undefined,
    };
  } catch (error) {
    console.error('[Sally] Subscription status error:', error);
    const fallbackPlan = await enrichPlanWithFreeAllowance(
      toExtensionPlan({ tier: 'free', source: 'billing-unavailable' }, 'billing-unavailable'),
      null
    );
    await chrome.storage.local.set({ extensionPlan: fallbackPlan });
    return { success: false, error: error.message, plan: fallbackPlan };
  }
}

async function ensureAutomationAccess() {
  const subscription = await getSubscriptionStatus();

  if (subscription.plan?.usage?.allowed === false) {
    return {
      allowed: false,
      plan: subscription.plan,
      error: subscription.plan.usage.message || 'Upgrade to keep Sally shopping for you.',
      upgradeUrl: subscription.plan.usage.upgradeUrl || subscription.plan.upgradeUrl || UPGRADE_URL,
    };
  }

  if (subscription.plan?.automationAllowed) {
    return { allowed: true, plan: subscription.plan };
  }

  const authData = await chrome.storage.local.get(['user', 'authToken']);
  if (
    subscription.plan?.tier === 'free' &&
    subscription.plan.freeShopsRemaining > 0 &&
    (authData.user || authData.authToken)
  ) {
    return {
      allowed: true,
      plan: subscription.plan,
      freeAllowance: true,
      usageKey: getFreeShopUsageKey(authData.user),
    };
  }

  return {
    allowed: false,
    plan: subscription.plan,
    error: 'Your 2 free autonomous shops are used. Upgrade to HeySalad Pro or Max to keep Sally shopping for you.',
    upgradeUrl: subscription.plan?.upgradeUrl || UPGRADE_URL,
  };
}

async function createSubscriptionCheckout(data = {}) {
  const tier = ['pro', 'max'].includes(data?.tier) ? data.tier : 'pro';
  const storage = await chrome.storage.local.get(['authToken']);

  if (!storage.authToken) {
    return {
      success: false,
      error: 'Sign in before upgrading Sally.',
      upgradeUrl: UPGRADE_URL,
    };
  }

  const successUrl = `${OAUTH_URL}/billing/success?source=extension&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${OAUTH_URL}/upgrade?tier=free&usage=0&limit=${FREE_AUTONOMOUS_SHOP_LIMIT}&action=shopping_request`;

  try {
    const response = await fetch(`${OAUTH_URL}/api/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storage.authToken}`,
      },
      body: JSON.stringify({ tier, successUrl, cancelUrl }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.message || 'Could not start checkout.',
        upgradeUrl: UPGRADE_URL,
      };
    }

    return { success: true, checkoutUrl: result.checkoutUrl };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Could not start checkout.',
      upgradeUrl: UPGRADE_URL,
    };
  }
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

async function classifyMessageRequest(data = {}) {
  const text = (data.text || '').trim();

  if (!text) {
    return { success: false, error: 'Message is required' };
  }

  const localClassification = classifyMessageLocally(text, data.context || {});

  if (localClassification.reason === 'capability question') {
    return { success: true, classification: localClassification };
  }

  try {
    const response = await fetch(`${SALLY_API_URL}/api/extension/ai/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context: data.context || {} }),
    });

    if (!response.ok) {
      throw new Error(`Sally API classify error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.classification) {
      throw new Error(result.error || 'Classification failed');
    }

    return {
      success: true,
      classification: normalizeClassification(result.classification, localClassification, data.context || {}),
    };
  } catch (error) {
    console.error('[Sally Classifier] API classifier failed:', error);
    return { success: true, classification: localClassification, fallback: true };
  }
}

function classifyMessageLocally(text, context = {}) {
  const store = context.store || inferStoreFromText(text) || null;

  if (isCapabilityQuestion(text)) {
    return {
      intent: 'chat',
      confidence: 0.98,
      reason: 'capability question',
      toolName: 'none',
      requiresConfirmation: false,
      store,
      mode: context.mode || 'unspecified',
      items: [],
      missingFields: [],
      assistantHint: 'I can answer questions, help plan a grocery shop, and run shopping only when you give me specific items.',
    };
  }

  const items = parseClassifierItems(text);
  const groceryScore = items.filter((item) => looksLikeGroceryItem(item.name)).length;
  const explicitShopping = [
    /\b(buy|get|order|shop\s+for|grocer|groceries|basket|cart|trolley|checkout)\b/i,
    /\badd\s+to\s+(basket|cart|trolley)\b/i,
  ].some((pattern) => pattern.test(text));
  const listLike = text.includes('\n') || text.includes(',') || /\b(and|plus)\b/i.test(text);

  if (explicitShopping && items.length && (groceryScore > 0 || listLike)) {
    return {
      intent: 'shopping_tool',
      confidence: 0.78,
      reason: 'shopping request',
      toolName: 'start_shopping',
      requiresConfirmation: true,
      store,
      mode: context.mode || 'local',
      items,
      missingFields: [],
      assistantHint: '',
    };
  }

  if (listLike && items.length >= 2 && groceryScore >= 2) {
    return {
      intent: 'shopping_tool',
      confidence: 0.72,
      reason: 'grocery-like list',
      toolName: 'start_shopping',
      requiresConfirmation: true,
      store,
      mode: context.mode || 'local',
      items,
      missingFields: [],
      assistantHint: '',
    };
  }

  if (/\b(grocer|groceries|shopping|shop)\b/i.test(text)) {
    return {
      intent: 'clarify',
      confidence: 0.72,
      reason: 'shopping intent without specific items',
      toolName: 'none',
      requiresConfirmation: false,
      store,
      mode: context.mode || 'unspecified',
      items: [],
      missingFields: ['items'],
      assistantHint: 'What grocery items would you like me to shop for?',
    };
  }

  return {
    intent: 'chat',
    confidence: 0.7,
    reason: 'generic message',
    toolName: 'none',
    requiresConfirmation: false,
    store,
    mode: context.mode || 'unspecified',
    items: [],
    missingFields: [],
    assistantHint: getLocalChatFallback(text),
  };
}

async function composeChatReplyRequest(data = {}) {
  const text = (data.text || '').trim();

  if (!text) {
    return { success: false, error: 'Message is required' };
  }

  try {
    const response = await fetch(`${SALLY_API_URL}/api/extension/ai/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, history: data.history || [] }),
    });

    if (!response.ok) {
      throw new Error(`Sally API compose error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.reply) {
      throw new Error(result.error || 'Compose failed');
    }

    return { success: true, reply: result.reply };
  } catch (error) {
    console.error('[Sally Composer] API composer failed:', error);
    return {
      success: true,
      reply: getLocalChatFallback(text),
      fallback: true,
    };
  }
}

async function handleRecipeDetected(data = {}, sender = {}) {
  const ingredients = Array.isArray(data.ingredients)
    ? data.ingredients.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (ingredients.length < 3) {
    return { success: false, error: 'Not enough ingredients detected' };
  }

  const recipe = await saveRecipeForReorder({
    id: createRecipeId(data.url, data.title, ingredients),
    title: String(data.title || 'Recipe').trim(),
    source: String(data.source || 'page'),
    url: String(data.url || sender.tab?.url || ''),
    host: String(data.host || ''),
    ingredients,
    detectedAt: new Date().toISOString(),
  });

  const notificationId = `${RECIPE_NOTIFICATION_PREFIX}${recipe.id}`;
  recipeNotificationCache.set(notificationId, recipe);

  await appendActivityEvent({
    kind: 'tool',
    title: 'Recipe saved',
    text: `I found ${ingredients.length} ingredients in "${recipe.title}". You can shop or reorder this list from Sally.`,
    tone: 'info',
    icon: '🍽',
  });

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Sally found recipe ingredients',
    message: `${recipe.title}: ${ingredients.length} items ready to shop or reorder.`,
    buttons: [
      { title: 'Add to cart' },
      { title: 'Save' },
    ],
    priority: 1,
  });

  return { success: true, recipe };
}

async function handleRecipeCandidateDetected(data = {}, sender = {}) {
  const candidate = {
    id: createRecipeId(data.url, data.title, [data.description || '']),
    title: String(data.title || 'Recipe video').trim(),
    description: String(data.description || '').trim(),
    source: String(data.source || 'social-title'),
    url: String(data.url || sender.tab?.url || ''),
    host: String(data.host || ''),
    detectedAt: new Date().toISOString(),
  };

  const dataStore = await chrome.storage.local.get(['recipeCandidates']);
  const candidates = Array.isArray(dataStore.recipeCandidates) ? dataStore.recipeCandidates : [];
  await chrome.storage.local.set({
    recipeCandidates: [candidate, ...candidates.filter((item) => item.id !== candidate.id)].slice(0, 100),
  });

  await appendActivityEvent({
    kind: 'tool',
    title: 'Recipe video found',
    text: `I found "${candidate.title}", but the ingredients are hidden by the platform. Ask Sally to build a starter grocery list or open the caption if it is available.`,
    tone: 'info',
    icon: '🎬',
  });

  chrome.notifications.create(`${RECIPE_NOTIFICATION_PREFIX}candidate_${candidate.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Sally found a recipe video',
    message: `${candidate.title}. Ingredients are not visible yet, but Sally can build a starter list.`,
    buttons: [
      { title: 'Open Sally' },
      { title: 'Save' },
    ],
    priority: 1,
  });

  return { success: true, candidate };
}

async function saveRecipeForReorder(recipe) {
  const normalized = {
    ...recipe,
    id: recipe.id || createRecipeId(recipe.url, recipe.title, recipe.ingredients || []),
    title: String(recipe.title || 'Recipe').trim(),
    ingredients: (recipe.ingredients || []).map((item) => String(item || '').trim()).filter(Boolean),
    savedAt: recipe.savedAt || new Date().toISOString(),
  };

  const data = await chrome.storage.local.get(['savedRecipeLists']);
  const savedRecipeLists = Array.isArray(data.savedRecipeLists) ? data.savedRecipeLists : [];
  const withoutDuplicate = savedRecipeLists.filter((item) => item.id !== normalized.id);
  await chrome.storage.local.set({ savedRecipeLists: [normalized, ...withoutDuplicate].slice(0, 100) });
  return normalized;
}

async function getSavedRecipes() {
  const data = await chrome.storage.local.get(['savedRecipeLists']);
  return { recipes: Array.isArray(data.savedRecipeLists) ? data.savedRecipeLists : [] };
}

async function findSavedRecipeByNotificationId(notificationId) {
  const recipeId = notificationId.replace(RECIPE_NOTIFICATION_PREFIX, '');
  const { recipes } = await getSavedRecipes();
  return recipes.find((recipe) => recipe.id === recipeId) || null;
}

async function startRecipeShopping({ recipeId, recipe } = {}) {
  let targetRecipe = recipe;
  if (!targetRecipe && recipeId) {
    const { recipes } = await getSavedRecipes();
    targetRecipe = recipes.find((item) => item.id === recipeId);
  }

  if (!targetRecipe?.ingredients?.length) {
    return { success: false, error: 'No saved recipe ingredients found' };
  }

  const items = targetRecipe.ingredients
    .map((ingredient) => normalizeShoppingItem(ingredient))
    .filter((item) => item?.name);

  await appendActivityEvent({
    kind: 'tool',
    title: 'Recipe shopping started',
    text: `I am turning "${targetRecipe.title}" into a shopping run with ${items.length} items.`,
    tone: 'info',
    icon: '🛒',
  });

  return startShopping({ items });
}

function createRecipeId(url = '', title = '', ingredients = []) {
  const input = `${url}|${title}|${ingredients.slice(0, 20).join('|')}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function appendActivityEvent(event) {
  const data = await chrome.storage.local.get(['activityFeed']);
  const activityFeed = Array.isArray(data.activityFeed) ? data.activityFeed : [];
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    tone: 'info',
    icon: 'ℹ️',
    ...event,
  };
  await chrome.storage.local.set({ activityFeed: [item, ...activityFeed].slice(0, 30) });
}

async function composeChatReplyWithOpenAI(text, history, openaiKey, llmConfig = {}) {
  const response = await fetch(`${OPENAI_API_URL}/responses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llmConfig.composerModel || DEFAULT_COMPOSER_MODEL,
      input: [
        {
          role: 'system',
          content: [
            'You are Sally, a concise and friendly shopping assistant in a Chrome extension.',
            'Answer normal chat naturally.',
            'Do not claim you are shopping unless a shopping tool has been confirmed.',
            'If the user asks to shop, ask for specific grocery items.',
          ].join(' '),
        },
        ...history.slice(-8).map((entry) => ({
          role: entry.role === 'user' ? 'user' : 'assistant',
          content: entry.text || entry.content || '',
        })),
        { role: 'user', content: text },
      ],
      max_output_tokens: 350,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI composer error: ${response.status}`);
  }

  const data = await response.json();
  return extractResponseOutputText(data) || getLocalChatFallback(text);
}

function getLocalChatFallback(text) {
  const normalized = String(text || '').trim().toLowerCase();

  if (/^(hi|hello|hey|hiya|yo)\b/.test(normalized)) {
    return 'Hi, I am Sally. I can chat here, help turn groceries into a shopping list, and stage a shopping run when you are ready.';
  }

  if (/how\s+are\s+you/.test(normalized)) {
    return 'I am good and ready to help. You can ask me a question or give me grocery items when you want to shop.';
  }

  if (isCapabilityQuestion(text)) {
    if (/\b(brow\w*|tab|tabs|site|sites|supermarket|supermarkets|across|multiple|different)\b/i.test(text)) {
      return "I can work in Chrome on supported supermarket sites like Ocado, Tesco, Sainsbury's, ASDA, Waitrose, Morrisons, and Aldi. I use the current supermarket tab or open the right one, then run shopping as a tool inside this chat.";
    }

    if (/\b(other|else|tasks?|anything else|outside|besides)\b/i.test(text)) {
      return 'I can help with food and shopping-adjacent tasks: plan meals, convert recipes into shopping lists, scale quantities for guests, suggest swaps, compare options, and then run the approved grocery list as a shopping tool. I will keep non-shopping tasks as chat unless there is a clear grocery list to stage.';
    }

    return 'I can chat, plan meals, turn recipes into grocery lists, scale quantities, stage supermarket runs, show progress, and open your cart when shopping is done.';
  }

  if (/\b(shepherd'?s|shepards|shepherds)\s+pie\b/i.test(text)) {
    const peopleMatch = text.match(/\b(?:for|serves?|serving)\s+(\d+)\b/i) || text.match(/\b(\d+)\s+(?:people|guests|servings)\b/i);
    const people = peopleMatch ? Number(peopleMatch[1]) : 4;
    const multiplier = Math.max(1, people / 4);
    const minceGrams = Math.round(500 * multiplier / 50) * 50;
    const potatoesKg = (1.2 * multiplier).toFixed(multiplier >= 2 ? 1 : 1);
    const carrots = Math.max(2, Math.round(2 * multiplier));
    const onions = Math.max(1, Math.round(1 * multiplier));

    return `For shepherd's pie for ${people}, I would plan: ${minceGrams}g lamb mince, about ${potatoesKg}kg potatoes, ${carrots} carrots, ${onions} onions, frozen peas, tomato puree, beef or lamb stock, Worcestershire sauce, butter, milk, and mature cheddar if you want a cheesy mash top. Say "stage that list" and I can turn it into a shopping run.`;
  }

  if (/\b(i want to cook|cook|make|recipe|meal|dinner)\b/i.test(text)) {
    return 'I can help plan that. Tell me the dish and number of people, and I will turn it into a practical grocery list with quantities. When you like the list, I can stage it as a shopping tool.';
  }

  if (/\b(meat|beef|chicken|pork|lamb|fish|salmon|steak)\b/i.test(text) && /\b(veggie|veggies|vegetable|vegetables|greens|salad)\b/i.test(text)) {
    return 'Good brief. I can turn that into a shop-ready list like chicken thighs, lean mince, salmon fillets, broccoli, peppers, spinach, mushrooms, and salad leaves. Tell me quantities or say "make me a meat and veg list" and I will stage it before shopping.';
  }

  if (/\b(healthy|high protein|protein|low carb|meal prep|dinner|breakfast|lunch)\b/i.test(text)) {
    return 'I can help plan that. Give me the number of meals or people, and I will suggest a grocery list. When you approve the list, I can run shopping as a tool.';
  }

  if (/^(thanks|thank you|cheers|nice|great|ok|okay)\b/i.test(normalized)) {
    return 'You are welcome. Send a question, a preference, or specific grocery items when you want me to prepare a shopping run.';
  }

  return 'I can help with that. Tell me what you are trying to cook, what you like, or paste grocery items. I will keep chatting until there is a clear list to run as a shopping tool.';
}

async function classifyMessageWithOpenAI(text, context, openaiKey, llmConfig = {}) {
  const response = await fetch(`${OPENAI_API_URL}/responses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llmConfig.classifierModel || DEFAULT_CLASSIFIER_MODEL,
      input: [
        {
          role: 'system',
          content: [
            'Classify a Sally Chrome extension user message.',
            'Return JSON only using the schema.',
            'Never classify capability, help, setup, or general questions as shopping_tool.',
            'Use shopping_tool only when the user asks to buy specific grocery or supermarket items.',
            'If grocery intent is vague or items are missing, use clarify.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            message: text,
            context: {
              selectedStore: context.store || null,
              selectedMode: context.mode || null,
              hasPostcode: !!context.deliveryPostcode,
            },
            availableTools: ['start_shopping'],
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'sally_intent_classification',
          strict: true,
          schema: getClassifierSchema(),
        },
      },
      reasoning: { effort: 'none' },
      max_output_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI classifier error: ${response.status}`);
  }

  const data = await response.json();
  const outputText = extractResponseOutputText(data);

  if (!outputText) {
    throw new Error('Classifier returned no text output');
  }

  return JSON.parse(outputText);
}

function getClassifierSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: ['chat', 'shopping_tool', 'clarify', 'settings', 'compare_prices', 'status', 'stop'],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reason: { type: 'string' },
      toolName: { type: 'string', enum: ['none', 'start_shopping'] },
      requiresConfirmation: { type: 'boolean' },
      store: { type: ['string', 'null'] },
      mode: { type: 'string', enum: ['local', 'cloud', 'unspecified'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
          },
          required: ['name', 'quantity'],
        },
      },
      missingFields: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['items', 'store', 'postcode', 'budget', 'auth', 'openai_key', 'supermarket_tab', 'confirmation'],
        },
      },
      assistantHint: { type: 'string' },
    },
    required: [
      'intent',
      'confidence',
      'reason',
      'toolName',
      'requiresConfirmation',
      'store',
      'mode',
      'items',
      'missingFields',
      'assistantHint',
    ],
  };
}

function normalizeClassification(aiClassification, fallback, context) {
  const normalized = {
    ...fallback,
    ...aiClassification,
    store: aiClassification.store || fallback.store || context.store || null,
    items: Array.isArray(aiClassification.items) ? aiClassification.items : [],
    missingFields: Array.isArray(aiClassification.missingFields) ? aiClassification.missingFields : [],
  };

  if (normalized.intent === 'shopping_tool') {
    const items = normalized.items
      .map((item) => normalizeShoppingItem({ name: item.name, quantity: item.quantity || 1 }))
      .filter((item) => item.name);

    if (!items.length || normalized.toolName !== 'start_shopping') {
      return {
        ...fallback,
        intent: 'clarify',
        toolName: 'none',
        items: [],
        missingFields: ['items'],
        assistantHint: 'What grocery items would you like me to shop for?',
      };
    }

    return {
      ...normalized,
      intent: 'shopping_tool',
      toolName: 'start_shopping',
      items,
      requiresConfirmation: true,
    };
  }

  return {
    ...normalized,
    toolName: 'none',
    items: [],
    requiresConfirmation: false,
  };
}

function parseClassifierItems(text) {
  return String(text || '')
    .replace(/\b(and|plus)\b/gi, ',')
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(please\s+)?(buy|get|add|shop\s+for|order)\s+/i, '').trim())
    .map((line) => normalizeShoppingItem(line))
    .filter((item) => item.name);
}

function isCapabilityQuestion(text) {
  const normalized = String(text || '').trim().toLowerCase();
  return [
    /^what\s+can\s+you\s+do\b/,
    /^what\s+else\s+can\s+you\s+do\b/,
    /^what\s+do\s+you\s+do\b/,
    /^how\s+can\s+you\s+help\b/,
    /^help\b/,
    /^tell\s+me\s+about\s+yourself\b/,
    /^who\s+are\s+you\b/,
    /\b(can|could|do|will)\s+you\b.*\b(shop|shopping|browse|browser|browsers|tab|tabs|site|sites|supermarket|supermarkets)\b/,
    /\b(across|between|multiple|different)\s+(browser|browsers|tab|tabs|site|sites|supermarket|supermarkets)\b/,
    /\b(which|what)\s+(browser|browsers|site|sites|supermarket|supermarkets)\b.*\b(support|work|shop)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeGroceryItem(text) {
  const groceryPattern = [
    'milk', 'bread', 'egg', 'eggs', 'banana', 'bananas', 'apple', 'apples',
    'cheese', 'butter', 'yoghurt', 'yogurt', 'chicken', 'beef', 'fish',
    'rice', 'pasta', 'cereal', 'coffee', 'tea', 'sugar', 'flour',
    'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'onions',
    'carrot', 'carrots', 'lettuce', 'spinach', 'beans', 'peas',
    'juice', 'water', 'crisps', 'biscuits', 'soap', 'detergent',
    'toilet roll',
  ].join('|');

  return new RegExp(`\\b(${groceryPattern})\\b`, 'i').test(text);
}

function inferStoreFromText(text) {
  const normalized = String(text || '').toLowerCase();
  const storeAliases = {
    tesco: ['tesco'],
    sainsburys: ['sainsbury', 'sainsburys', "sainsbury's"],
    asda: ['asda'],
    ocado: ['ocado'],
    waitrose: ['waitrose'],
    morrisons: ['morrisons', 'morrison'],
    aldi: ['aldi'],
  };

  for (const [store, aliases] of Object.entries(storeAliases)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return store;
    }
  }

  return '';
}

function extractResponseOutputText(data) {
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  return (data.output || [])
    .flatMap((output) => output.content || [])
    .filter((content) => content.type === 'output_text' && content.text)
    .map((content) => content.text)
    .join('');
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

  // Get the current active tab before consuming paid/free usage.
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab) {
    return { success: false, error: 'No active tab found. Please open a supermarket website first.' };
  }

  // Detect which store we're on from the URL
  const detectedStore = detectStore(activeTab.url);
  const storeResolution = resolveShoppingStore({
    requestedStore: store,
    detectedStore,
  });
  
  console.log('[Sally] Store detection:', {
    currentUrl: activeTab.url,
    detectedStore,
    providedStore: store,
    resolvedStore: storeResolution.finalStore,
    shouldNavigate: storeResolution.shouldNavigateToStore,
  });
  
  const finalStore = storeResolution.finalStore;

  if (!finalStore) {
    return {
      success: false,
      requiresStoreSelection: true,
      error: 'Choose where Sally should shop before starting. Pick a supermarket in Sally and try again.',
    };
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

  const authData = await chrome.storage.local.get(['authToken']);
  const usageResult = await consumeShoppingUsage(authData.authToken);
  if (!usageResult.success) {
    const refreshedSubscription = await getSubscriptionStatus();
    return {
      success: false,
      upgradeRequired: true,
      error: usageResult.message,
      plan: refreshedSubscription.plan,
      upgradeUrl: usageResult.upgradeUrl || refreshedSubscription.plan?.upgradeUrl || UPGRADE_URL,
    };
  }
  
  if (storeResolution.hasStoreMismatch) {
    console.log('[Sally] 🔄 Store mismatch - navigating from', detectedStore, 'to', finalStore);
  } else if (detectedStore) {
    console.log('[Sally] ✅ Using detected store:', finalStore);
  } else {
    console.log('[Sally] 🔄 Not on a supported store, will navigate to:', finalStore);
  }
  
  const cartUrl = CART_URLS[finalStore];
  
  // Create task record
  const task = {
    id: crypto.randomUUID(),
    store: finalStore,
    items: items
      .map((item) => normalizeShoppingItem(item))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        status: 'pending',
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
  await recordShoppingAnalytics('shopping_started', task);
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
    if (storeResolution.shouldNavigateToStore) {
      console.log('[Sally] Navigating to store landing page for', finalStore);
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
        files: [
          'shared/task-metrics.js',
          'shared/item-parser.js',
          'shared/product-fit.js',
          'shared/product-language.js',
          'content-scripts/base.js',
        ]
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
  return detectStoreFromUrl(url);
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
    await sendTaskControlMessage(task, 'STOP_SHOPPING');
    
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

async function pauseShopping() {
  const data = await chrome.storage.local.get(['currentTask']);
  const task = data.currentTask;

  if (!task || ['complete', 'stopped', 'cancelled', 'error'].includes(task.status)) {
    return { success: false, error: 'No active shopping task to pause.' };
  }

  task.status = 'paused';
  task.pausedAt = new Date().toISOString();
  await chrome.storage.local.set({ currentTask: task });
  await sendTaskControlMessage(task, 'PAUSE_SHOPPING');
  chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
  await recordShoppingAnalytics('shopping_paused', task);

  return { success: true, task };
}

async function resumeShopping() {
  const data = await chrome.storage.local.get(['currentTask']);
  const task = data.currentTask;

  if (!task || task.status !== 'paused') {
    return { success: false, error: 'No paused shopping task to resume.' };
  }

  const now = new Date();
  if (task.pausedAt) {
    const pausedAt = new Date(task.pausedAt).getTime();
    if (Number.isFinite(pausedAt)) {
      task.totalPausedMs = (Number(task.totalPausedMs) || 0) + Math.max(0, now.getTime() - pausedAt);
    }
  }
  delete task.pausedAt;
  task.status = 'shopping';
  await chrome.storage.local.set({ currentTask: task });
  await sendTaskControlMessage(task, 'RESUME_SHOPPING');
  chrome.runtime.sendMessage({ type: 'TASK_UPDATED', task }).catch(() => {});
  await recordShoppingAnalytics('shopping_resumed', task);

  return { success: true, task };
}

async function sendTaskControlMessage(task, type) {
  const tabIds = new Set();
  if (task?.tabId) tabIds.add(task.tabId);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) tabIds.add(activeTab.id);
  } catch (error) {
    console.warn('[Sally] Could not resolve active tab for task control:', error.message);
  }

  await Promise.all([...tabIds].map((tabId) =>
    chrome.tabs.sendMessage(tabId, { type }).catch((error) => {
      console.warn(`[Sally] Could not send ${type} to tab ${tabId}:`, error.message);
    })
  ));
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
  const { itemName, productName, price, unitPrice } = data;
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
      item.unitPrice = unitPrice || item.unitPrice || 0;
      item.resolvedAt = new Date().toISOString();
      item.elapsedSeconds = getElapsedSeconds(task.startedAt, item.resolvedAt);
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
        unit_price: unitPrice || 0,
        quantity: item?.quantity || 1,
        added: true,
        confidence: 1.0,
        elapsed_seconds: item?.elapsedSeconds || 0,
      });
    }

    await recordShoppingAnalytics('item_added', task, { itemName, productName, price });
    
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
      item.resolvedAt = new Date().toISOString();
      item.elapsedSeconds = getElapsedSeconds(task.startedAt, item.resolvedAt);
    }
    
    await chrome.storage.local.set({ currentTask: task });
    
    // Send progress update to API if we have a session ID
    if (task.sessionId) {
      await sendProgressToAPI(task);
    }

    await recordShoppingAnalytics('item_failed', task, { itemName, reason });
    
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
  const metrics = computeTaskMetrics(task);
  const percentage = getProgressPercentage(metrics);
  
  return {
    itemsAdded: metrics.addedItems,
    itemsFailed: metrics.failedItems,
    totalItems: metrics.totalItems,
    itemsProcessed: metrics.processedItems,
    itemsRemaining: metrics.remainingItems,
    totalUnits: metrics.totalUnits,
    unitsAdded: metrics.addedUnits,
    unitsFailed: metrics.failedUnits,
    unitsRemaining: metrics.remainingUnits,
    percentage,
    items: task.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      status: item.status,
      price: item.price,
      resolvedAt: item.resolvedAt,
      elapsedSeconds: item.elapsedSeconds,
    }))
  };
}

function getElapsedSeconds(startedAt, endedAt = new Date().toISOString()) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

async function recordShoppingAnalytics(eventType, task, details = {}) {
  if (!task) return;

  const metrics = computeTaskMetrics(task);
  const totalSpent = (task.items || []).reduce((sum, item) => {
    return sum + (item.status === 'added' && Number(item.price) ? Number(item.price) : 0);
  }, 0);
  const payload = {
    eventType,
    taskId: task.id,
    store: task.store,
    mode: task.mode || 'local',
    sessionId: task.sessionId || null,
    timestamp: new Date().toISOString(),
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null,
    elapsedSeconds: getElapsedSeconds(task.startedAt, task.completedAt),
    totalSpent,
    metrics: {
      totalItems: metrics.totalItems,
      addedItems: metrics.addedItems,
      failedItems: metrics.failedItems,
      remainingItems: metrics.remainingItems,
      totalUnits: metrics.totalUnits,
      addedUnits: metrics.addedUnits,
      failedUnits: metrics.failedUnits,
    },
    details,
  };

  try {
    const data = await chrome.storage.local.get(['shoppingAnalytics', 'authToken']);
    const analytics = Array.isArray(data.shoppingAnalytics) ? data.shoppingAnalytics : [];
    analytics.unshift(payload);
    await chrome.storage.local.set({ shoppingAnalytics: analytics.slice(0, 250) });

    fetch(`${SALLY_API_URL}/api/extension/shopping-analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(data.authToken ? { Authorization: `Bearer ${data.authToken}` } : {}),
      },
      body: JSON.stringify(payload),
    }).catch((error) => {
      console.warn('[Sally] Shopping analytics backend unavailable:', error.message);
    });
  } catch (error) {
    console.warn('[Sally] Failed to record shopping analytics:', error.message);
  }
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
  
  if (typeof ShoppingWebSocketClient === 'undefined') {
    throw new Error('WebSocket client unavailable');
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
    await recordShoppingAnalytics('shopping_completed', task, { itemsAdded, totalPrice: spent });
    
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
