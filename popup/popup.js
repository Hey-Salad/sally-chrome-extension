/**
 * Sally by HeySalad® - Popup Script
 */

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginMessage = document.getElementById('login-message');
const emailStep = document.getElementById('email-step');
const tokenStep = document.getElementById('token-step');
const verifyBtn = document.getElementById('verify-btn');
const backBtn = document.getElementById('back-btn');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const userPlanBadge = document.getElementById('user-plan-badge');
const logoutBtn = document.getElementById('logout-btn');
const planName = document.getElementById('plan-name');
const planPill = document.getElementById('plan-pill');
const planDescription = document.getElementById('plan-description');
const upgradeBtn = document.getElementById('upgrade-btn');
const taskForm = document.getElementById('task-form');
const taskStatus = document.getElementById('task-status');
const taskComplete = document.getElementById('task-complete');
const storeSelect = document.getElementById('store-select');
const itemsInput = document.getElementById('items-input');
const postcodeInput = document.getElementById('postcode-input');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const taskStore = document.getElementById('task-store');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const itemsList = document.getElementById('items-list');
const completeSummary = document.getElementById('complete-summary');
const viewCartBtn = document.getElementById('view-cart-btn');
const newTaskBtn = document.getElementById('new-task-btn');

// QR Code generation elements
const qrGeneratorSection = document.getElementById('qr-generator-section');
const generateQRBtn = document.getElementById('generate-qr-btn');
const qrCodeDisplay = document.getElementById('qr-code-display');
const qrInstructions = document.getElementById('qr-instructions');
const qrCloseBtn = document.getElementById('qr-close-btn');
const panelNotice = document.getElementById('panel-notice');
const activityFeed = document.getElementById('activity-feed');
const clearActivityBtn = document.getElementById('clear-activity-btn');
const chatForm = document.getElementById('chat-form');
const chatPlusBtn = document.getElementById('chat-plus-btn');
const chatInput = document.getElementById('chat-input');
const chatVoiceBtn = document.getElementById('chat-voice-btn');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatSuggestions = document.querySelector('.chat-suggestions');
const chatSuggestionButtons = document.querySelectorAll('.chat-suggestion');
const BILLING_URL = 'https://heysalad.app/#settings/billing';
const SHOPPING_PREFERENCES_KEY = 'shoppingPreferences';
const DEFAULT_SHOPPING_PREFERENCES = { store: '', deliveryPostcode: '', askEveryTime: false };

let currentUser = null;
let currentTask = null;
let currentPlan = { tier: 'free', label: 'Free', automationAllowed: false, upgradeUrl: BILLING_URL };
let timerInterval = null;
let qrScanner = null;
const pendingSoftConfirmations = new Map();
let activityEvents = [];
let activityStateSnapshot = {};
let pendingChatShopping = null;
let isChatBusy = false;
let areChatSuggestionsExpanded = false;
let areMobileAttachOptionsExpanded = false;
let lastShoppingItemsScrollTop = 0;
let shoppingPreferences = { ...DEFAULT_SHOPPING_PREFERENCES };
const taskMetricsApi = globalThis.HeySaladTaskMetrics || {};
const itemParserApi = globalThis.HeySaladItemParser || {};
const computeTaskMetrics = taskMetricsApi.computeTaskMetrics || ((task) => {
  const items = Array.isArray(task?.items) ? task.items : [];
  const addedItems = items.filter((item) => item.status === 'added').length;
  const failedItems = items.filter((item) => item.status === 'failed').length;
  const processedItems = addedItems + failedItems;
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
    processedItems,
    remainingItems: Math.max(items.length - processedItems, 0),
    totalUnits,
    addedUnits,
    failedUnits,
    remainingUnits: Math.max(totalUnits - (addedUnits + failedUnits), 0),
    hasMultiQuantity: totalUnits > items.length,
  };
});
const getProgressPercentage = taskMetricsApi.getProgressPercentage || ((task) => {
  const metrics = computeTaskMetrics(task);
  return metrics.totalItems > 0 ? Math.round((metrics.processedItems / metrics.totalItems) * 100) : 0;
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
const parseItemsFromText = itemParserApi.parseItems || ((text) => {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, quantity: 1, searchQuery: name }));
});

function isSidePanelSurface() {
  return document.documentElement.dataset.surface === 'sidepanel';
}

const SALLY_AGENT_TOOLS = [
  {
    name: 'start_shopping',
    description: 'Start a Sally browser shopping run from a parsed grocery list.',
  },
  {
    name: 'stop_shopping',
    description: 'Stop the active Sally shopping run.',
  },
  {
    name: 'pause_shopping',
    description: 'Pause the active Sally shopping run without clearing progress.',
  },
  {
    name: 'resume_shopping',
    description: 'Resume a paused Sally shopping run.',
  },
  {
    name: 'new_list',
    description: 'Clear the current draft list and prepare for a new shopping request.',
  },
  {
    name: 'open_cart',
    description: 'Open the current supermarket cart for the active or completed task.',
  },
  {
    name: 'start_voice_session',
    description: 'Begin a Realtime voice agent session when a secure session endpoint is configured.',
  },
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadShoppingPreferences();
  await checkAuthStatus();
  await checkTaskStatus();
  await loadStats();
  await loadSavedLists();
  await loadActivityFeed();
  setupEventListeners();
});

// Load and display user stats
async function loadStats() {
  try {
    const data = await chrome.storage.local.get(['sallyStats']);
    const stats = data.sallyStats || { totalItems: 0, totalSessions: 0, totalSpent: 0 };
    
    document.getElementById('stat-items').textContent = stats.totalItems || 0;
    document.getElementById('stat-sessions').textContent = stats.totalSessions || 0;
    
    // Estimate time saved: ~30 seconds per item (searching, comparing, adding)
    const minutesSaved = Math.round((stats.totalItems || 0) * 0.5);
    document.getElementById('stat-time').textContent = minutesSaved > 0 ? `${minutesSaved} min` : '0 min';
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// Update stats after shopping session
async function updateStats(itemsAdded) {
  try {
    const data = await chrome.storage.local.get(['sallyStats']);
    const stats = data.sallyStats || { totalItems: 0, totalSessions: 0, totalSpent: 0 };
    
    stats.totalItems += itemsAdded;
    stats.totalSessions += 1;
    
    await chrome.storage.local.set({ sallyStats: stats });
    await loadStats();
  } catch (e) {
    console.error('Failed to update stats:', e);
  }
}

// Timer functions
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  const timerEl = document.getElementById('shopping-timer');
  if (!timerEl) return;
  
  // Get start time from task or now
  const startTime = currentTask?.startedAt ? new Date(currentTask.startedAt).getTime() : Date.now();
  
  const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (isSidePanelSurface() && currentTask?.items?.length) {
      renderActivityFeed();
    }
  };
  
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatDuration(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const elapsed = Math.floor((end - start) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Load saved shopping lists
async function loadSavedLists() {
  try {
    const data = await chrome.storage.local.get(['taskHistory', 'savedRecipeLists']);
    const history = data.taskHistory || [];
    const savedRecipeLists = Array.isArray(data.savedRecipeLists) ? data.savedRecipeLists : [];
    const container = document.getElementById('saved-lists-container');
    
    if (!container) return;
    
    // Filter to reusable shopping lists and recipe captures.
    const completedTasks = history.filter(t => t.status === 'complete');
    const reusableLists = [
      ...savedRecipeLists.map((recipe) => ({ ...recipe, listType: 'recipe' })),
      ...completedTasks.map((task) => ({ ...task, listType: 'shopping' })),
    ].slice(0, 8);
    
    if (reusableLists.length === 0) {
      container.innerHTML = '<p class="empty-state">No saved lists yet</p>';
      return;
    }
    
    const storeNames = {
      tesco: 'Tesco',
      sainsburys: "Sainsbury's",
      asda: 'ASDA',
      ocado: 'Ocado',
      waitrose: 'Waitrose'
    };
    
    container.innerHTML = reusableLists.map((task, index) => {
      const date = new Date(task.savedAt || task.detectedAt || task.completedAt || task.startedAt || Date.now());
      const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const itemCount = task.listType === 'recipe' ? task.ingredients?.length || 0 : task.items?.length || 0;
      const addedCount = task.listType === 'recipe'
        ? itemCount
        : task.itemsAdded || task.items?.filter(i => i.status === 'added').length || 0;
      const duration = task.startedAt && task.completedAt ? formatDuration(task.startedAt, task.completedAt) : '';
      const title = task.listType === 'recipe' ? task.title || 'Saved recipe' : storeNames[task.store] || task.store;
      const meta = task.listType === 'recipe' ? `Recipe • ${dateStr}` : `${dateStr}${duration ? ` • ${duration}` : ''}`;
      
      return `
        <div class="saved-list-item" data-index="${index}">
          <div class="saved-list-info">
            <div class="saved-list-store">${escapeHtml(title)}</div>
            <div class="saved-list-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="saved-list-count">${addedCount}/${itemCount}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers to reuse lists
    container.querySelectorAll('.saved-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const task = reusableLists[index];
        if (task?.listType === 'recipe' && task.ingredients?.length) {
          itemsInput.value = task.ingredients.join('\n');
          storeSelect.value = '';
          showTaskForm();
          return;
        }

        if (task?.items) {
          const itemsText = task.items.map(i =>
            i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name
          ).join('\n');
          itemsInput.value = itemsText;
          storeSelect.value = task.store || '';
          showTaskForm();
        }
      });
    });
  } catch (e) {
    console.error('Failed to load saved lists:', e);
  }
}

// Clear history
async function clearHistory() {
  if (!requestSoftConfirmation('clear-history', 'Clear all saved shopping lists? Click Clear again to confirm.')) {
    return;
  }
  await chrome.storage.local.set({ taskHistory: [] });
  await loadSavedLists();
  showUserNotice('Saved shopping lists cleared.', 'success');
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TASK_UPDATED') {
    updateTaskUI(message.task);
  } else if (message.type === 'SHOPPING_COMPLETE') {
    showTaskComplete(message.task);
  } else if (message.type === 'AUTH_SUCCESS') {
    // Auth completed via polling - update UI
    currentUser = message.user;
    showMainSection();
    loadSubscriptionStatus();
    addActivityEvent({
      kind: 'auth',
      title: 'Signed in',
      text: `Signed in as ${message.user?.email || message.user?.phone || 'your Sally account'}.`,
      tone: 'success',
      icon: '✅',
    });
    // Clear any pending auth email
    chrome.storage.local.remove(['pendingAuthEmail']);
  }
});

async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUTH_CHECK' });
    if (response.isAuthenticated) {
      currentUser = response.user;
      showMainSection();
      updateSubscriptionUI(response.subscription?.plan || response.subscription || null);
    } else {
      // Check if we have a pending auth (magic link sent but not yet clicked)
      const data = await chrome.storage.local.get(['pendingAuthEmail']);
      if (data.pendingAuthEmail) {
        // Show the waiting state
        showAuthSection();
        emailStep.classList.add('hidden');
        tokenStep.classList.remove('hidden');
        showMessage('Waiting for you to click the magic link...', 'success');
        // Restart polling in case it stopped
        chrome.runtime.sendMessage({ type: 'AUTH_START_POLLING', data: { email: data.pendingAuthEmail } });
      } else {
        showAuthSection();
      }
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showAuthSection();
  }
}

async function checkTaskStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TASK_STATUS' });
    if (response.task) {
      currentTask = response.task;
      if (currentTask.status === 'complete') {
        showTaskComplete(currentTask);
      } else if (currentTask.status !== 'stopped') {
        showTaskStatus();
        updateTaskUI(currentTask);
      }
    }
  } catch (error) {
    console.error('Task status error:', error);
  }
}

function setupEventListeners() {
  loginForm.addEventListener('submit', handleLogin);
  verifyBtn.addEventListener('click', handleVerifyToken);
  backBtn.addEventListener('click', () => {
    // Stop polling when going back
    chrome.runtime.sendMessage({ type: 'AUTH_STOP_POLLING' });
    chrome.storage.local.remove(['pendingAuthEmail']);
    emailStep.classList.remove('hidden');
    tokenStep.classList.add('hidden');
    hideMessage();
  });
  logoutBtn.addEventListener('click', handleLogout);
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', openUpgradeFlow);
  }
  startBtn.addEventListener('click', handleStartShopping);
  stopBtn.addEventListener('click', handleStopShopping);
  viewCartBtn.addEventListener('click', handleViewCart);
  newTaskBtn.addEventListener('click', handleNewTask);
  
  // Clear history button
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }
  if (clearActivityBtn) {
    clearActivityBtn.addEventListener('click', clearActivityFeed);
  }
  if (activityFeed) {
    activityFeed.addEventListener('click', handleActivityFeedClick);
  }
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit);
  }
  if (chatPlusBtn) {
    chatPlusBtn.addEventListener('click', handleChatPlusClick);
  }
  if (chatVoiceBtn) {
    chatVoiceBtn.addEventListener('click', async () => {
      await executeAgentToolCall({ name: 'start_voice_session', arguments: {} });
    });
  }
  if (chatInput) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chatForm?.requestSubmit();
      }
    });
  }
  chatSuggestionButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.chatAction;
      if (action === 'attach-mobile') {
        areMobileAttachOptionsExpanded = !areMobileAttachOptionsExpanded;
        updateComposerState();
        return;
      }

      if (action === 'attach-mobile-ios') {
        areChatSuggestionsExpanded = false;
        areMobileAttachOptionsExpanded = false;
        updateComposerState();
        await showExtensionQR();
        return;
      }

      if (action === 'attach-mobile-android') {
        showUserNotice('Android attachment is coming soon. Use iOS for this build.', 'info');
        return;
      }

      if (!chatInput) return;
      chatInput.value = button.dataset.chatPrompt || '';
      chatInput.focus();
      areChatSuggestionsExpanded = false;
      updateComposerState();
    });
  });
  
  // QR Generator buttons
  if (generateQRBtn) {
    generateQRBtn.addEventListener('click', generateQRCode);
  }
  if (qrCloseBtn) {
    qrCloseBtn.addEventListener('click', closeQRGenerator);
  }
  
  // "Scan QR Code" button in mobile link banner
  const openQRScannerBtn = document.getElementById('open-qr-scanner-btn');
  if (openQRScannerBtn) {
    openQRScannerBtn.addEventListener('click', openQRScanner);
  }
  
  // QR Scanner buttons
  const qrCancelBtn = document.getElementById('qr-cancel-btn');
  const qrSwitchCameraBtn = document.getElementById('qr-switch-camera-btn');
  
  if (qrCancelBtn) {
    qrCancelBtn.addEventListener('click', closeQRScanner);
  }
  
  if (qrSwitchCameraBtn) {
    qrSwitchCameraBtn.addEventListener('click', switchQRCamera);
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (!chatInput) return;

  if (isChatBusy && isActiveShoppingTask(currentTask)) {
    await runStopShoppingTool();
    return;
  }

  if (isChatBusy) return;

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  areChatSuggestionsExpanded = false;
  setChatBusy(true);

  try {
    await addActivityEvent({
      kind: 'chat',
      role: 'user',
      title: 'You',
      text,
      tone: 'user',
      icon: '',
    });
    await handleChatCommand(text);
  } catch (error) {
    console.error('[Sally] Chat submit failed:', error);
    await addActivityEvent({
      kind: 'chat',
      title: 'Sally',
      text: 'Something went wrong sending that. Please try again.',
      tone: 'warning',
      icon: '⚠️',
    });
  } finally {
    setChatBusy(false);
    chatInput.focus();
  }
}

function handleChatPlusClick() {
  areChatSuggestionsExpanded = !areChatSuggestionsExpanded;
  updateComposerState();
  chatInput?.focus();
}

async function handleChatCommand(text) {
  const toolCall = await resolveAgentToolCall(text);
  await executeAgentToolCall(toolCall);
}

async function resolveAgentToolCall(text) {
  const normalized = text.toLowerCase().trim();

  if (['stop', 'stop shopping', 'cancel', 'cancel shopping'].includes(normalized)) {
    return { name: 'stop_shopping', arguments: {} };
  }

  if (['pause', 'pause shopping', 'hold', 'hold shopping'].includes(normalized)) {
    return { name: 'pause_shopping', arguments: {} };
  }

  if (['resume', 'resume shopping', 'continue', 'continue shopping'].includes(normalized)) {
    return { name: 'resume_shopping', arguments: {} };
  }

  if (['new', 'new list', 'start over', 'reset'].includes(normalized)) {
    return { name: 'new_list', arguments: {} };
  }

  if (['cart', 'open cart', 'view cart'].includes(normalized)) {
    return { name: 'open_cart', arguments: {} };
  }

  if (['voice', 'talk', 'speak', 'start voice', 'voice mode'].includes(normalized)) {
    return { name: 'start_voice_session', arguments: {} };
  }

  if (normalized === 'help') {
    return { name: 'help', arguments: {} };
  }

  const preferredStore = getPreferredStore();
  const classification = await classifyMessage(text, {
    store: preferredStore || undefined,
    deliveryPostcode: getPreferredPostcode(),
  });

  if (classification?.intent === 'shopping_tool' && classification.items?.length) {
    return {
      name: 'start_shopping',
      arguments: {
        rawText: text,
        store: classification.store || inferStoreFromText(text) || preferredStore,
        items: classification.items,
      },
    };
  }

  if (classification?.intent === 'clarify') {
    return {
      name: 'chat_reply',
      arguments: {
        title: 'I need a little more detail',
        text: classification.assistantHint || 'What grocery items would you like me to shop for?',
        tone: 'info',
      },
    };
  }

  if (classification?.intent === 'status') {
    return { name: 'chat_reply', arguments: getStatusReply() };
  }

  return {
    name: 'chat_reply',
    arguments: {
      title: 'Sally',
      text,
      useComposer: true,
      fallbackText: classification?.assistantHint || 'I can answer questions and help prepare a grocery list.',
      tone: 'info',
    },
  };
}

async function classifyMessage(text, context = {}) {
  try {
    const response = await sendRuntimeMessageWithTimeout({
      type: 'CLASSIFY_MESSAGE',
      data: {
        text,
        context: {
          store: getSelectedShoppingStore() || undefined,
          mode: 'local',
          deliveryPostcode: getSelectedShoppingPostcode(),
          ...context,
        },
      },
    });

    return response?.classification || null;
  } catch (error) {
    console.warn('[Sally] Classifier unavailable:', error);
    return null;
  }
}

function sendRuntimeMessageWithTimeout(message, timeoutMs = 8000) {
  return Promise.race([
    chrome.runtime.sendMessage(message),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${message.type || 'runtime message'} timed out`)), timeoutMs);
    }),
  ]);
}

function getStatusReply() {
  if (!currentTask) {
    return {
      title: 'No active shopping run',
      text: 'There is no active shopping run right now.',
      tone: 'info',
    };
  }

  return {
    title: 'Shopping status',
    text: formatProgressSummary(currentTask),
    tone: 'info',
  };
}

async function executeAgentToolCall(toolCall) {
  switch (toolCall.name) {
    case 'stop_shopping':
      await runStopShoppingTool();
      break;
    case 'pause_shopping':
      await handlePauseShopping();
      break;
    case 'resume_shopping':
      await handleResumeShopping();
      break;
    case 'new_list':
      await runNewListTool();
      break;
    case 'open_cart':
      handleViewCart();
      break;
    case 'start_voice_session':
      await runStartVoiceSessionTool();
      break;
    case 'help':
      await runHelpTool();
      break;
    case 'chat_reply':
      await runChatReplyTool(toolCall.arguments);
      break;
    case 'start_shopping':
      await runStartShoppingTool(toolCall.arguments);
      break;
    default:
      await addActivityEvent({
        kind: 'tool',
        title: 'Unsupported tool',
        text: `Sally does not know how to run ${toolCall.name}.`,
        tone: 'warning',
        icon: '⚠️',
      });
  }
}

async function runChatReplyTool({ title = 'Sally', text, fallbackText = '', useComposer = false, tone = 'info' }) {
  const reply = useComposer ? await composeChatReply(text, fallbackText) : text;

  await addActivityEvent({
    kind: 'chat',
    title,
    text: reply,
    tone,
    icon: '💬',
  });
}

async function composeChatReply(text, fallbackText = '') {
  try {
    const response = await sendRuntimeMessageWithTimeout({
      type: 'COMPOSE_CHAT_REPLY',
      data: {
        text,
        history: activityEvents
          .filter((event) => event.kind === 'chat' && event.text)
          .slice(-8)
          .map((event) => ({
            role: event.role === 'user' ? 'user' : 'assistant',
            text: event.text,
          })),
      },
    });

    return response?.reply || fallbackText || text;
  } catch (error) {
    console.warn('[Sally] Composer unavailable:', error);
    return fallbackText || text;
  }
}

async function runStopShoppingTool() {
  if (isActiveShoppingTask(currentTask)) {
    pendingSoftConfirmations.set('stop-shopping', Date.now() + 3000);
    await handleStopShopping();
    return;
  }

  showUserNotice('There is no active shopping run to stop.', 'info');
}

async function runNewListTool() {
  if (isActiveShoppingTask(currentTask)) {
    await replaceActiveShoppingTask();
  } else {
    handleNewTask();
  }

  await addActivityEvent({
    kind: 'chat',
    title: 'Ready for a new list',
    text: 'Send the items you want Sally to shop for, one per line.',
    tone: 'info',
    icon: '📝',
  });
}

async function runHelpTool() {
  await addActivityEvent({
    kind: 'chat',
    title: 'How to use chat',
    text: 'Paste a shopping list here. Sally will use the current supermarket tab, narrate progress in this chat, and keep cart actions here.',
    tone: 'info',
    icon: '💬',
    actions: [
      { type: 'open-help', label: 'Help', style: 'secondary' }
    ],
  });
}

async function runStartShoppingTool({ rawText, store, items }) {
  if (!items.length) {
    await addActivityEvent({
      kind: 'tool',
      title: 'I need a list',
      text: 'Send grocery items like "2x milk", "bread", or "eggs", each on its own line.',
      tone: 'warning',
      icon: '💡',
    });
    return;
  }

  if (isActiveShoppingTask(currentTask)) {
    await replaceActiveShoppingTask();
  }

  const selectedStore = store || getPreferredStore();

  if (selectedStore && storeSelect) {
    storeSelect.value = selectedStore;
  }

  if (getPreferredPostcode() && postcodeInput) {
    postcodeInput.value = getPreferredPostcode();
  }

  showTaskForm();
  itemsInput.value = items
    .map((item) => item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name)
    .join('\n');

  pendingChatShopping = {
    rawText,
    store: selectedStore || '',
    items,
  };

  await addActivityEvent({
    kind: 'tool',
    title: 'Shopping tool ready',
    text: `I staged ${items.length} item${items.length === 1 ? '' : 's'}${selectedStore ? ` for ${getStoreDisplayName(selectedStore)}` : ''}. Start shopping?`,
    tone: 'info',
    icon: '🧺',
    actions: [
      { type: 'confirm-start-shopping', label: 'Start shopping' },
      { type: 'cancel-start-shopping', label: 'Cancel', style: 'secondary' },
    ],
  });
}

function isActiveShoppingTask(task) {
  return Boolean(task && !['complete', 'checkout', 'stopped', 'cancelled', 'error'].includes(task.status));
}

async function replaceActiveShoppingTask() {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_SHOPPING' });
  } catch (error) {
    console.warn('[Sally] Could not stop previous task before replacement:', error);
  }

  activityStateSnapshot = {};
  currentTask = null;
  showTaskForm();

  await addActivityEvent({
    kind: 'tool',
    title: 'Replaced previous run',
    text: 'I stopped the previous shopping run and will use your latest list instead.',
    tone: 'info',
    icon: '↻',
  });
}

async function runStartVoiceSessionTool() {
  const data = await chrome.storage.local.get(['realtimeAgentEndpoint']);
  const endpoint = data.realtimeAgentEndpoint;

  if (!endpoint) {
    await addActivityEvent({
      kind: 'tool',
      title: 'Voice agent needs a session endpoint',
      text: 'The side panel is ready for Realtime voice, but Sally needs a secure backend endpoint to create short-lived Realtime sessions before the microphone can connect.',
      tone: 'info',
      icon: '🎙️',
      actions: [
        { type: 'open-help', label: 'Setup notes', style: 'secondary' }
      ],
    });
    return;
  }

  chrome.tabs.create({ url: endpoint });
}

function inferStoreFromText(text) {
  const normalized = text.toLowerCase();
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

function setChatBusy(isBusy) {
  isChatBusy = isBusy;
  if (chatInput) {
    chatInput.disabled = false;
  }
  if (chatSendBtn) {
    chatSendBtn.disabled = false;
    chatSendBtn.classList.toggle('is-stopping', isBusy && isActiveShoppingTask(currentTask));
    chatSendBtn.classList.toggle('is-working', isBusy && !isActiveShoppingTask(currentTask));
    chatSendBtn.setAttribute('aria-label', isBusy && isActiveShoppingTask(currentTask) ? 'Stop' : 'Send message');
  }
  updateComposerState();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  
  if (!email) {
    showMessage('Please enter your email', 'error');
    return;
  }
  
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> Sending...';
  
  try {
    // Send magic link
    const response = await chrome.runtime.sendMessage({
      type: 'AUTH_LOGIN',
      data: { email }
    });
    
    if (response.success) {
      // Store the email for polling
      await chrome.storage.local.set({ pendingAuthEmail: email });
      await addActivityEvent({
        kind: 'auth',
        title: 'Magic link sent',
        text: `Sally sent a sign-in link to ${email}.`,
        tone: 'info',
        icon: '✉️',
      });
      
      // Show waiting state with instructions
      emailStep.classList.add('hidden');
      tokenStep.classList.remove('hidden');
      showMessage('Magic link sent! Check your email and click the link.', 'success');
      
      // Start polling for auth completion in background
      chrome.runtime.sendMessage({ type: 'AUTH_START_POLLING', data: { email } });
    } else {
      showMessage(response.error || 'Failed to send magic link', 'error');
    }
  } catch (error) {
    console.error('[Sally] Login error:', error);
    showMessage('An error occurred. Please try again.', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span>Send Magic Link</span>';
  }
}

async function handleVerifyToken() {
  const token = document.getElementById('token').value.trim();
  
  if (!token) {
    showMessage('Please paste your token', 'error');
    return;
  }
  
  verifyBtn.disabled = true;
  verifyBtn.innerHTML = '<span class="spinner"></span> Verifying...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AUTH_CALLBACK',
      data: { token }
    });
    
    if (response.success) {
      currentUser = response.user;
      showMainSection();
      loadSubscriptionStatus();
      await addActivityEvent({
        kind: 'auth',
        title: 'Signed in',
        text: `Signed in as ${response.user?.email || response.user?.phone || 'your Sally account'}.`,
        tone: 'success',
        icon: '✅',
      });
    } else {
      showMessage(response.error || 'Invalid token', 'error');
    }
  } catch (error) {
    showMessage('Verification failed. Please try again.', 'error');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.innerHTML = '<span>Sign In</span>';
  }
}

async function handleLogout() {
  try {
    await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
    currentUser = null;
    currentTask = null;
    updateSubscriptionUI({ tier: 'free', label: 'Free', automationAllowed: false, upgradeUrl: BILLING_URL });
    showAuthSection();
    await addActivityEvent({
      kind: 'auth',
      title: 'Signed out',
      text: 'Sally disconnected your account from this browser.',
      tone: 'info',
      icon: '👋',
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
}

async function loadSubscriptionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SUBSCRIPTION_STATUS' });
    updateSubscriptionUI(response.plan || null);
  } catch (error) {
    console.error('Subscription status error:', error);
    updateSubscriptionUI(null);
  }
}

function updateSubscriptionUI(plan) {
  const resolvedPlan = plan || { tier: 'free', label: 'Free', automationAllowed: false, upgradeUrl: BILLING_URL };
  currentPlan = resolvedPlan;

  const planLabel = resolvedPlan.label || formatPlanLabel(resolvedPlan.tier);
  const planTier = normalizePlanTier(resolvedPlan.tier || planLabel);
  updatePlanBadge(planLabel, planTier);

  if (!planName || !planPill || !planDescription || !upgradeBtn) return;

  planName.textContent = planLabel;
  planPill.textContent = planLabel;
  setPlanClasses(planPill, planTier);

  if (resolvedPlan.automationAllowed) {
    planDescription.textContent = 'Autonomous shopping is unlocked. Sally can shop directly in your current supermarket tab.';
    upgradeBtn.classList.add('hidden');
  } else if (resolvedPlan.tier === 'free' && resolvedPlan.freeShopsRemaining > 0) {
    const remaining = resolvedPlan.freeShopsRemaining;
    const used = resolvedPlan.freeShopsUsed || 0;
    planDescription.textContent = `Free plan includes ${resolvedPlan.freeShopLimit || 2} autonomous shops. You have ${remaining} left (${used} used). Upgrade for ongoing shopping.`;
    upgradeBtn.classList.remove('hidden');
  } else {
    planDescription.textContent = 'Your free autonomous shops are used. Upgrade to HeySalad Pro or Max to keep Sally shopping for you.';
    upgradeBtn.classList.remove('hidden');
  }
}

function normalizePlanTier(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('max')) return 'max';
  if (normalized.includes('pro') || normalized.includes('premium')) return 'pro';
  return 'free';
}

function formatPlanLabel(tier = 'free') {
  const normalized = normalizePlanTier(tier);
  if (normalized === 'max') return 'Max';
  if (normalized === 'pro') return 'Pro';
  return 'Free';
}

function setPlanClasses(element, tier) {
  if (!element) return;
  element.classList.remove('plan-free', 'plan-paid', 'plan-pro', 'plan-max');
  element.classList.add(`plan-${tier}`);
  if (tier !== 'free') {
    element.classList.add('plan-paid');
  }
}

function updatePlanBadge(label = 'Free', tier = 'free') {
  if (!userPlanBadge) return;
  const planTier = normalizePlanTier(tier || label);
  const planLabel = label || formatPlanLabel(planTier);
  userPlanBadge.textContent = planLabel;
  userPlanBadge.title = `Plan: ${planLabel}`;
  userPlanBadge.setAttribute('aria-label', `Current plan: ${planLabel}`);
  setPlanClasses(userPlanBadge, planTier);
}

async function handleStartShopping() {
  const store = getSelectedShoppingStore();
  const itemsText = itemsInput.value.trim();
  const postcode = getSelectedShoppingPostcode();
  
  // Store is now optional - we'll detect from current tab
  if (!itemsText) {
    showUserNotice('Please enter at least one item.', 'warning');
    return;
  }

  const classification = await classifyMessage(itemsText, {
    store: store || undefined,
    deliveryPostcode: postcode || '',
  });
  const parsedItems = classification?.items?.length ? classification.items : parseItems(itemsText);
  const canFallbackToParsedList = parsedItems.length > 0 && looksLikeShoppingList(itemsText);

  if (classification?.intent !== 'shopping_tool' && !canFallbackToParsedList) {
    await addActivityEvent({
      kind: 'chat',
      title: 'Sally',
      text: classification?.assistantHint || 'That looks like chat, not a shopping list. Send specific grocery items when you want me to shop.',
      tone: 'info',
      icon: '💬',
    });
    showUserNotice('That looks like chat, not a shopping list.', 'info');
    return;
  }
  
  const items = parsedItems;
  if (items.length === 0) {
    showUserNotice('Please enter valid items.', 'warning');
    return;
  }
  
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="spinner"></span> Starting...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_SHOPPING',
      data: { store: store || undefined, items, deliveryPostcode: postcode || undefined }
    });
    
    if (response.success) {
      activityStateSnapshot = {};
      currentTask = {
        id: response.taskId,
        store: response.store,
        items: items.map(i => ({ ...i, status: 'pending' })),
        status: 'shopping',
        startedAt: new Date().toISOString(),
        mode: response.mode
      };
      await addActivityEvent({
        kind: 'shopping',
        title: 'Shopping started',
        text: `Sally started shopping ${items.length} item${items.length === 1 ? '' : 's'} at ${response.store}.`,
        tone: 'success',
        icon: '🛒',
        actions: [
          { type: 'focus-shopping-tab', label: 'Open tab' }
        ],
      });
      showTaskStatus();
      updateTaskUI(currentTask);
    } else {
      // Show helpful error message
      if (response.upgradeRequired) {
        updateSubscriptionUI(response.plan);
        showUserNotice(response.error || 'Upgrade in HeySalad to unlock autonomous shopping.', 'warning');
      } else if (response.requiresStoreSelection) {
        showUserNotice(response.error || 'Choose a supermarket before Sally starts shopping.', 'warning');
        renderActivityFeed();
      } else if (response.error && response.error.includes('supermarket website')) {
        showUserNotice('Please navigate to a supported supermarket website first: Tesco, Sainsbury\'s, ASDA, Ocado, or Waitrose.', 'warning');
      } else {
        showUserNotice(response.error || 'Failed to start shopping.', 'error');
      }
    }
  } catch (error) {
    console.error('Start shopping error:', error);
    showUserNotice('An error occurred. Please try again.', 'error');
  } finally {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span>🛒 Let Sally Shop!</span>';
  }
}

async function handleStopShopping() {
  if (!requestSoftConfirmation('stop-shopping', 'Stop shopping now? Click Stop again to confirm.')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_SHOPPING' });
    activityStateSnapshot = {};
    currentTask = null;
    showTaskForm();
    renderActivityFeed();
    showUserNotice('Shopping stopped.', 'info');
    await addActivityEvent({
      kind: 'shopping',
      title: 'Shopping stopped',
      text: 'The current Sally shopping run was stopped from the side panel.',
      tone: 'warning',
      icon: '⏹️',
      actions: [
        { type: 'new-list', label: 'New list', style: 'secondary' }
      ],
    });
  } catch (error) {
    console.error('Stop error:', error);
  }
}

async function handlePauseShopping() {
  if (!isActiveShoppingTask(currentTask) || currentTask.status === 'paused') {
    showUserNotice('There is no active shopping run to pause.', 'info');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'PAUSE_SHOPPING' });
    if (!response?.success) {
      showUserNotice(response?.error || 'Could not pause shopping.', 'warning');
      return;
    }

    currentTask = response.task || { ...currentTask, status: 'paused', pausedAt: new Date().toISOString() };
    await addActivityEvent({
      kind: 'shopping',
      title: 'Shopping paused',
      text: 'Sally paused the current shopping task. Resume when you are ready.',
      tone: 'info',
      icon: '⏸',
      actions: [
        { type: 'resume-shopping', label: 'Resume shopping' },
        { type: 'stop-shopping', label: 'Stop shopping', style: 'secondary' },
      ],
    });
    renderActivityFeed();
    showUserNotice('Shopping paused.', 'info');
  } catch (error) {
    console.error('Pause error:', error);
    showUserNotice('Could not pause shopping.', 'error');
  }
}

async function handleResumeShopping() {
  if (!currentTask || currentTask.status !== 'paused') {
    showUserNotice('There is no paused shopping run to resume.', 'info');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'RESUME_SHOPPING' });
    if (!response?.success) {
      showUserNotice(response?.error || 'Could not resume shopping.', 'warning');
      return;
    }

    currentTask = response.task || { ...currentTask, status: 'shopping' };
    await addActivityEvent({
      kind: 'shopping',
      title: 'Shopping resumed',
      text: 'Sally resumed the current shopping task.',
      tone: 'info',
      icon: '▶',
      actions: [
        { type: 'focus-shopping-tab', label: 'Open tab', style: 'secondary' },
      ],
    });
    renderActivityFeed();
    showUserNotice('Shopping resumed.', 'success');
  } catch (error) {
    console.error('Resume error:', error);
    showUserNotice('Could not resume shopping.', 'error');
  }
}

async function handleViewCart() {
  if (currentTask && currentTask.store) {
    const cartUrls = {
      tesco: 'https://www.tesco.com/groceries/en-GB/trolley',
      sainsburys: 'https://www.sainsburys.co.uk/gol-ui/trolley',
      asda: 'https://groceries.asda.com/trolley',
      ocado: 'https://www.ocado.com/basket',
      waitrose: 'https://www.waitrose.com/ecom/shop/trolley',
      morrisons: 'https://groceries.morrisons.com/trolley',
      aldi: 'https://www.aldi.co.uk/checkout/cart'
    };
    const url = cartUrls[currentTask.store];
    if (!url) return;

    try {
      if (currentTask.tabId) {
        const tab = await chrome.tabs.get(currentTask.tabId);
        await chrome.tabs.update(tab.id, { active: true, url });
        if (typeof tab.windowId === 'number') {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return;
      }
    } catch (error) {
      console.warn('[Sally] Could not reuse shopping tab for cart:', error.message);
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await chrome.tabs.update(activeTab.id, { url });
    } else {
      await chrome.tabs.create({ url });
    }
  }
}

function handleNewTask() {
  activityStateSnapshot = {};
  currentTask = null;
  itemsInput.value = '';
  showTaskForm();
}

function parseItems(text) {
  return parseItemsFromText(text);
}

function looksLikeShoppingList(text) {
  const lines = String(text || '')
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) return true;

  const normalized = String(text || '').trim();
  return /\b(\d+\s*x?\s+)?(milk|bread|eggs?|cheese|butter|yoghurt|yogurt|chicken|beef|lamb|pork|fish|salmon|rice|pasta|potatoes|tomatoes|onions|carrots|apples|bananas|oranges|salt|pepper|jam|tea|coffee|sugar|flour)\b/i.test(normalized);
}

function showAuthSection() {
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
  emailStep.classList.remove('hidden');
  tokenStep.classList.add('hidden');
}

function showMainSection() {
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  updateUserIdentityUI();
  renderActivityFeed();
}

function updateUserIdentityUI() {
  if (userEmail) {
    userEmail.textContent = currentUser ? getUserDisplayName(currentUser) : '';
  }

  if (!userAvatar) return;
  const avatarUrl = getUserAvatarUrl(currentUser || {});
  if (avatarUrl) {
    userAvatar.classList.add('has-image');
    userAvatar.textContent = '';
    userAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="">`;
  } else {
    userAvatar.classList.remove('has-image');
    userAvatar.textContent = getUserInitials(currentUser || {});
  }
}

function getUserDisplayName(user = {}) {
  return user.name
    || user.full_name
    || user.displayName
    || user.display_name
    || user.given_name
    || user.email
    || user.phone
    || 'User';
}

function showTaskForm() {
  taskForm.classList.remove('hidden');
  taskStatus.classList.add('hidden');
  taskComplete.classList.add('hidden');
  
  // Show saved lists when returning to form
  const savedLists = document.getElementById('saved-lists');
  if (savedLists) savedLists.classList.remove('hidden');
  
  // Reload saved lists in case they changed
  loadSavedLists();
  renderActivityFeed();
}

function showTaskStatus() {
  taskForm.classList.add('hidden');
  taskStatus.classList.remove('hidden');
  taskComplete.classList.add('hidden');
  
  // Hide saved lists during shopping
  const savedLists = document.getElementById('saved-lists');
  if (savedLists) savedLists.classList.add('hidden');
  
  // Start the timer
  startTimer();
}

function showTaskComplete(task) {
  // Handle case where task is undefined - get from storage
  if (!task) {
    chrome.storage.local.get(['currentTask'], (data) => {
      if (data.currentTask) {
        showTaskComplete(data.currentTask);
      }
    });
    return;
  }
  
  // Stop the timer
  stopTimer();
  currentTask = task;
  activityStateSnapshot = {};
  
  taskForm.classList.add('hidden');
  taskStatus.classList.add('hidden');
  taskComplete.classList.remove('hidden');
  
  // Show saved lists again
  const savedLists = document.getElementById('saved-lists');
  if (savedLists) savedLists.classList.remove('hidden');
  
  const metrics = computeTaskMetrics(task);
  const added = metrics.addedItems;
  const failed = metrics.failedItems;
  const total = metrics.totalItems;
  
  const storeNames = {
    tesco: 'Tesco',
    sainsburys: "Sainsbury's",
    asda: 'ASDA',
    ocado: 'Ocado',
    waitrose: 'Waitrose'
  };
  const storeName = storeNames[task.store] || task.store || 'your';
  
  const unitSummary = metrics.hasMultiQuantity
    ? ` (${metrics.addedUnits} of ${metrics.totalUnits} units)`
    : '';
  completeSummary.textContent = `Added ${added} of ${total} items${unitSummary} to your ${storeName} cart.`;
  if (failed > 0) {
    completeSummary.textContent += ` ${failed} items couldn't be found.`;
  }
  
  // Show duration
  const completeTime = document.getElementById('complete-time');
  if (completeTime && task.startedAt) {
    const duration = formatDuration(task.startedAt, task.completedAt);
    completeTime.textContent = `⏱ Completed in ${duration}`;
  }
  
  // Update stats if items were added (only once per task)
  if (added > 0 && !task.statsUpdated) {
    task.statsUpdated = true;
    chrome.storage.local.set({ currentTask: task });
    updateStats(added);
  }
  
  // Reload saved lists to show the new one
  loadSavedLists();
  addActivityEvent({
    kind: 'shopping',
    title: 'Shopping complete',
    text: `Sally finished the run with ${added} item${added === 1 ? '' : 's'} added.`,
    tone: failed > 0 ? 'warning' : 'success',
    icon: failed > 0 ? '⚠️' : '✅',
    actions: [
      { type: 'open-cart', label: 'Open cart' },
      { type: 'new-list', label: 'New list', style: 'secondary' }
    ],
  });
}

function updateTaskUI(task) {
  if (!task) return;
  const previousTask = currentTask ? JSON.parse(JSON.stringify(currentTask)) : null;
  currentTask = task;
  
  const storeNames = {
    tesco: 'Tesco',
    sainsburys: "Sainsbury's",
    asda: 'ASDA',
    ocado: 'Ocado',
    waitrose: 'Waitrose'
  };
  
  // Show status-specific messages
  let statusText = storeNames[task.store] || task.store;
  if (task.status === 'starting') {
    statusText = `Connecting to ${statusText}...`;
  } else if (task.status === 'shopping') {
    statusText = `🤖 Sally is shopping at ${statusText}`;
  } else if (task.status === 'manual' || task.status === 'fallback') {
    statusText = `Manual mode - ${statusText}`;
  } else if (task.status === 'error') {
    statusText = `Error - ${task.error || 'Unknown error'}`;
  }
  taskStore.textContent = statusText;
  
  const metrics = computeTaskMetrics(task);
  const percent = getProgressPercentage(metrics);
  const shouldPulse = task.status === 'starting' && percent === 0;

  progressFill.style.animation = shouldPulse ? 'pulse 1.5s ease-in-out infinite' : 'none';
  progressFill.style.width = `${shouldPulse ? 4 : percent}%`;
  progressText.textContent = formatProgressSummary(metrics);
  
  itemsList.innerHTML = '';
  if (task.items) {
    for (const item of task.items) {
      const row = document.createElement('div');
      row.className = 'item-row';
      
      const icon = item.status === 'added' ? '✓' : item.status === 'failed' ? '✗' : item.status === 'searching' ? '⏳' : '○';
      const price = item.price ? `£${item.price.toFixed(2)}` : '';
      
      row.innerHTML = `
        <span class="item-status ${item.status}">${icon}</span>
        <span class="item-name">${item.name} ${item.quantity > 1 ? `(×${item.quantity})` : ''}</span>
        <span class="item-price">${price}</span>
      `;
      
      itemsList.appendChild(row);
    }
  }

  logTaskActivity(previousTask, task);
  renderActivityFeed();
  
  // Handle fallback/manual mode
  if (task.status === 'manual' || task.status === 'fallback') {
    const fallbackMsg = document.createElement('div');
    fallbackMsg.className = 'fallback-message';
    fallbackMsg.innerHTML = `
      <p>⚠️ Automatic shopping unavailable.</p>
      <p>I've opened ${storeNames[task.store] || task.store} for you to shop manually.</p>
      ${task.fallbackReason ? `<p class="error-detail">${task.fallbackReason}</p>` : ''}
    `;
    itemsList.insertBefore(fallbackMsg, itemsList.firstChild);
  }
}

function showMessage(text, type) {
  loginMessage.textContent = text;
  loginMessage.className = `message ${type}`;
  loginMessage.classList.remove('hidden');
}

function hideMessage() {
  loginMessage.classList.add('hidden');
}

// ============================================
// SYNC FUNCTIONALITY
// ============================================

const syncSection = document.getElementById('sync-section');
const syncCodeInput = document.getElementById('sync-code');
const syncBtn = document.getElementById('sync-btn');
const syncMessage = document.getElementById('sync-message');
const syncStatus = document.getElementById('sync-status');

// Check if sync section exists (may not be in all versions)
if (syncBtn) {
  syncBtn.addEventListener('click', handleSync);
}

if (syncCodeInput) {
  syncCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  
  syncCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSync();
    }
  });
}

async function handleSync() {
  const code = syncCodeInput?.value?.trim();
  
  if (!code || code.length !== 6) {
    showSyncMessage('Please enter a 6-character code', 'error');
    return;
  }
  
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span> Linking...';
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SYNC_LINK',
      data: { code }
    });
    
    if (response.success) {
      showSyncMessage('Successfully linked!', 'success');
      if (syncStatus) {
        syncStatus.classList.remove('hidden');
      }
      // Store sync session
      await chrome.storage.local.set({ 
        syncSession: {
          session_id: response.session_id,
          linked_at: new Date().toISOString()
        }
      });
    } else {
      showSyncMessage(response.error || 'Failed to link', 'error');
    }
  } catch (error) {
    showSyncMessage('An error occurred', 'error');
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<span>Link Extension</span>';
    }
  }
}

function showSyncMessage(text, type) {
  if (syncMessage) {
    syncMessage.textContent = text;
    syncMessage.className = `message ${type}`;
    syncMessage.classList.remove('hidden');
  }
}

// Check existing sync status on load
async function checkSyncStatus() {
  const data = await chrome.storage.local.get(['syncSession']);
  if (data.syncSession && syncStatus) {
    syncStatus.classList.remove('hidden');
  }
}

// Add to init
checkSyncStatus();


// ============================================
// QR CODE GENERATOR FUNCTIONALITY (NO AUTH REQUIRED)
// ============================================

async function generateQRCode() {
  console.log('[Sally] Generating QR code for shopping list (no auth required)');
  
  const store = storeSelect.value;
  const itemsText = itemsInput.value.trim();
  
  if (!itemsText) {
    showUserNotice('Please enter at least one item.', 'warning');
    return;
  }
  
  const items = parseItems(itemsText);
  if (items.length === 0) {
    showUserNotice('Please enter valid items.', 'warning');
    return;
  }
  
  // Disable button and show loading
  generateQRBtn.disabled = true;
  generateQRBtn.innerHTML = '<span class="spinner"></span> Generating...';
  
  try {
    console.log('[Sally] Creating client-side QR code with:', {
      itemCount: items.length,
      store: store || 'tesco',
      authenticated: !!currentUser
    });
    
    // Create a temporary session ID (client-side only)
    const tempSessionId = generateTempSessionId();
    
    // Encode shopping list data directly in QR code
      const qrPayload = {
        v: 1, // version
        sid: tempSessionId, // temporary session ID
        items: items.map(item => ({
          n: item.name, // name
          q: item.quantity || 1, // quantity
          sq: item.searchQuery || item.name,
        })),
        store: store || 'tesco',
        ts: Date.now() // timestamp
      };
    
    // Compress and encode the payload
    const encodedPayload = btoa(JSON.stringify(qrPayload));
    
    // Generate QR code URL with encoded data
    const qrData = `heysalad://shop?data=${encodedPayload}`;
    console.log('[Sally] QR data length:', qrData.length, 'characters');
    
    // Check if QRCode library is loaded
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode library not loaded. Please refresh the extension.');
    }
    
    // Display QR code using QRCode.js library
    qrCodeDisplay.innerHTML = '';
    new QRCode(qrCodeDisplay, {
      text: qrData,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M // Medium error correction for better data capacity
    });
    
    // Update instructions based on auth status
    const qrInstructions = document.getElementById('qr-instructions');
    if (qrInstructions) {
      if (currentUser) {
        qrInstructions.innerHTML = `
          <p>✅ Signed in as ${currentUser.email || currentUser.phone}</p>
          <p>Scan with Sally Mobile to start shopping</p>
        `;
      } else {
        qrInstructions.innerHTML = `
          <p>📱 Scan with Sally Mobile</p>
          <p>You'll be prompted to sign in on your phone</p>
          <p class="hint">💡 No account needed to scan!</p>
        `;
      }
    }
    
    // Show QR section
    mainSection.classList.add('hidden');
    qrGeneratorSection.classList.remove('hidden');
    await addActivityEvent({
      kind: 'qr',
      title: 'QR generated',
      text: `Created a mobile shopping QR for ${items.length} item${items.length === 1 ? '' : 's'}.`,
      tone: 'info',
      icon: '📱',
      actions: [
        { type: 'close-qr-generator', label: 'Back to panel', style: 'secondary' }
      ],
    });
    
    console.log('[Sally] QR code generated successfully (client-side)');
    
  } catch (error) {
    console.error('[Sally] QR generation error:', error);
    showUserNotice(`Failed to generate QR code. ${error.message}`, 'error');
  } finally {
    // Re-enable button
    generateQRBtn.disabled = false;
    generateQRBtn.innerHTML = '<span>📱 Generate QR Code</span>';
  }
}

// Generate a temporary session ID for client-side QR codes
function generateTempSessionId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `temp_${timestamp}_${randomStr}`;
}

function closeQRGenerator() {
  console.log('[Sally] Closing QR generator');
  
  // Clear QR code
  qrCodeDisplay.innerHTML = '';
  
  // Show main section
  qrGeneratorSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

// ============================================
// QR SCANNER FUNCTIONALITY
// ============================================

const qrScannerSection = document.getElementById('qr-scanner-section');
const qrVideo = document.getElementById('qr-video');
const qrCanvas = document.getElementById('qr-canvas');
const qrStatus = document.getElementById('qr-status');
const qrMessage = document.getElementById('qr-message');

async function openQRScanner() {
  console.log('[Sally] Opening QR scanner');
  
  try {
    // Hide main section, show scanner
    mainSection.classList.add('hidden');
    qrScannerSection.classList.remove('hidden');
    
    // Initialize QR scanner
    if (!qrScanner) {
      qrScanner = new QRScanner();
    }
    
    // Set up scan callback
    qrScanner.onScan(handleQRCodeScanned);
    
    // Start camera
    await qrScanner.init(qrVideo, qrCanvas);
    
    qrStatus.textContent = '📷 Scanning for QR code...';
    qrStatus.className = 'qr-status scanning';
    
    console.log('[Sally] QR scanner initialized successfully');
    
  } catch (error) {
    console.error('[Sally] QR scanner error:', error);
    showQRMessage(error.message || 'Failed to access camera', 'error');
    qrStatus.textContent = '❌ Camera access denied';
    qrStatus.className = 'qr-status error';
  }
}

function closeQRScanner() {
  console.log('[Sally] Closing QR scanner');
  
  // Stop scanner
  if (qrScanner) {
    qrScanner.stop();
  }
  
  // Hide scanner, show main section
  qrScannerSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  
  // Reset status
  qrStatus.textContent = '📷 Position QR code in camera view...';
  qrStatus.className = 'qr-status';
  hideQRMessage();
}

async function switchQRCamera() {
  console.log('[Sally] Switching camera');
  
  if (!qrScanner) return;
  
  try {
    await qrScanner.switchCamera();
    qrStatus.textContent = '📷 Scanning for QR code...';
    qrStatus.className = 'qr-status scanning';
  } catch (error) {
    console.error('[Sally] Camera switch error:', error);
    showQRMessage('Failed to switch camera', 'error');
  }
}

async function handleQRCodeScanned(qrData) {
  console.log('[Sally] QR code scanned:', qrData);
  
  // Show success status
  qrStatus.textContent = '✅ QR Code Detected!';
  qrStatus.className = 'qr-status success';
  
  try {
    // Parse QR data
    if (!qrData.startsWith('heysalad://shop?data=')) {
      throw new Error('Invalid QR code format');
    }
    
    // Extract encoded payload
    const encodedPayload = qrData.split('data=')[1];
    const payload = JSON.parse(atob(encodedPayload));
    
    console.log('[Sally] Decoded QR payload:', payload);
    
    // Validate payload
    if (!payload.items || payload.items.length === 0) {
      throw new Error('No items in shopping list');
    }
    
    // Check age (reject QRs older than 1 hour)
    const age = Date.now() - payload.ts;
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    if (age > maxAge) {
      throw new Error('QR code expired (older than 1 hour)');
    }
    
    // Populate form with scanned data
    const items = payload.items.map(item => 
      item.q > 1 ? `${item.q}x ${item.n}` : item.n
    ).join('\n');
    
    itemsInput.value = items;
    storeSelect.value = payload.store || '';
    
    // Close scanner
    closeQRScanner();
    
    // Show success message
    showMessage(`Loaded ${payload.items.length} items from QR code!`, 'success');
    await addActivityEvent({
      kind: 'qr',
      title: 'QR imported',
      text: `Loaded ${payload.items.length} item${payload.items.length === 1 ? '' : 's'} from a Sally QR code.`,
      tone: 'success',
      icon: '📷',
    });
    
    // Auto-start shopping if user is authenticated
    if (currentUser) {
      setTimeout(() => {
        handleStartShopping();
      }, 1000);
    }
    
  } catch (error) {
    console.error('[Sally] QR processing error:', error);
    showQRMessage(error.message || 'Failed to process QR code', 'error');
    
    // Allow retry
    setTimeout(() => {
      if (qrScanner) {
        qrScanner.scanning = true;
        qrScanner.scan();
        qrStatus.textContent = '📷 Scanning for QR code...';
        qrStatus.className = 'qr-status scanning';
        hideQRMessage();
      }
    }, 3000);
  }
}

function showQRMessage(text, type) {
  if (qrMessage) {
    qrMessage.textContent = text;
    qrMessage.className = `message ${type}`;
    qrMessage.classList.remove('hidden');
  }
}

function hideQRMessage() {
  if (qrMessage) {
    qrMessage.classList.add('hidden');
  }
}


// ============================================
// EXTENSION QR CODE FUNCTIONALITY (MOBILE-TO-EXTENSION FLOW)
// ============================================

let extensionSession = null;
let sessionPollInterval = null;
let sessionTimerInterval = null;

// Show extension QR code for mobile to scan
async function showExtensionQR() {
  console.log('[Sally] Showing extension QR code');
  
  try {
    const qrSection = document.getElementById('extension-qr-section');
    const qrDisplay = document.getElementById('extension-qr-display');

    if (!qrSection || !qrDisplay) {
      throw new Error('QR panel is not available in this extension surface.');
    }

    // Generate a unique session token (client-side, no API call needed)
    const sessionToken = generateExtensionSessionToken();
    const now = Date.now();
    const expiresAt = now + (15 * 60 * 1000); // 15 minutes
    
    console.log('[Sally] Session token created:', sessionToken);
    
    // Store session locally
    extensionSession = {
      session_id: sessionToken,
      created_at: now,
      expires_at: expiresAt,
      status: 'waiting'
    };
    
    // Store session in chrome storage
    await chrome.storage.local.set({ extensionSession });
    
    // Generate QR code with session token
    const qrData = `heysalad://extension-link?token=${sessionToken}`;
    
    qrDisplay.innerHTML = '';
    
    // Check if QRCode library is loaded
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode library not loaded. Please refresh the extension.');
    }
    
    new QRCode(qrDisplay, {
      text: qrData,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    
    // Show QR section
    mainSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    await addActivityEvent({
      kind: 'mobile',
      title: 'Waiting for mobile',
      text: 'Sally generated an extension-link QR and is waiting for the mobile app to send a shopping list.',
      tone: 'info',
      icon: '📲',
      actions: [
        { type: 'refresh-extension-qr', label: 'Refresh QR', style: 'secondary' }
      ],
    });
    
    // Start polling for shopping list (checks local storage)
    startSessionPolling(sessionToken);
    
    // Start countdown timer
    startSessionTimer(expiresAt);
    
    console.log('[Sally] Extension QR displayed, token:', sessionToken);
    
  } catch (error) {
    console.error('[Sally] QR generation error:', error);
    showUserNotice(`Failed to generate QR code. ${error.message}`, 'error');
  }
}

// Poll API for shopping list (extension checks if mobile sent list via API)
async function startSessionPolling(sessionToken) {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  
  const statusEl = document.getElementById('extension-qr-status');
  
  sessionPollInterval = setInterval(async () => {
    try {
      // Check if session expired
      if (extensionSession && extensionSession.expires_at < Date.now()) {
        clearInterval(sessionPollInterval);
        statusEl.textContent = '⏰ Session expired. Please generate a new QR code.';
        statusEl.className = 'qr-status error';
        return;
      }
      
      // Poll API for shopping list sent by mobile
      const response = await fetch(
        `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionToken}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        console.warn('[Sally] API polling failed:', response.status);
        return;
      }
      
      const data = await response.json();
      
      if (data.status === 'ready' && data.shopping_list) {
        clearInterval(sessionPollInterval);
        clearInterval(sessionTimerInterval);
        
        statusEl.textContent = '✅ Shopping list received! Starting...';
        statusEl.className = 'qr-status success';
        
        // Close QR section
        document.getElementById('extension-qr-section').classList.add('hidden');
        mainSection.classList.remove('hidden');
        await addActivityEvent({
          kind: 'mobile',
          title: 'Mobile list received',
          text: `Received ${data.shopping_list.items.length} item${data.shopping_list.items.length === 1 ? '' : 's'} from Sally Mobile.`,
          tone: 'success',
          icon: '📥',
        });
        
        // Start shopping with received list
        await startShoppingFromMobile(data.shopping_list, data.store);
      } else if (data.status === 'expired') {
        clearInterval(sessionPollInterval);
        statusEl.textContent = '⏰ Session expired. Please generate a new QR code.';
        statusEl.className = 'qr-status error';
      }
      
    } catch (error) {
      console.error('[Sally] Session polling error:', error);
    }
  }, 2000); // Poll every 2 seconds (API polling)
}

// Countdown timer for session expiration
function startSessionTimer(expiresAt) {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  
  const timerEl = document.getElementById('extension-qr-timer');
  
  const updateTimer = () => {
    const remaining = expiresAt - Date.now();
    
    if (remaining <= 0) {
      clearInterval(sessionTimerInterval);
      timerEl.textContent = 'Expired';
      timerEl.className = 'qr-timer expired';
      return;
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  updateTimer();
  sessionTimerInterval = setInterval(updateTimer, 1000);
}

// Start shopping from mobile-sent list
async function startShoppingFromMobile(shoppingList, store) {
  console.log('[Sally] Starting shopping from mobile:', { store, items: shoppingList.items });
  
  // Store session ID for progress updates
  const sessionId = extensionSession?.session_id;
  
  // Populate form (for user to see)
  const itemsText = shoppingList.items.map(item => 
    item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name
  ).join('\n');
  
  const selectedStore = store || getSelectedShoppingStore();

  itemsInput.value = itemsText;
  storeSelect.value = selectedStore || '';
  await addActivityEvent({
    kind: 'mobile',
    title: 'Starting mobile shopping',
    text: `Preparing to shop ${shoppingList.items.length} item${shoppingList.items.length === 1 ? '' : 's'} from Sally Mobile.`,
    tone: 'info',
    icon: '🧺',
  });
  
  // Start shopping and send progress updates
  await startShoppingWithProgressUpdates(sessionId, shoppingList.items, selectedStore);
}

// Start shopping with progress updates to mobile
async function startShoppingWithProgressUpdates(sessionId, items, store) {
  console.log('[Sally] Starting autonomous shopping with progress updates');
  
  try {
    // Notify API that shopping is starting (so mobile knows)
    if (sessionId) {
      try {
        await fetch(
          `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('[Sally] Notified API that shopping started');
      } catch (notifyError) {
        console.error('[Sally] Failed to notify API:', notifyError);
        // Continue anyway - this is not critical
      }
    }
    
    // Send initial progress (0%)
    await sendProgressUpdate(sessionId, {
      itemsAdded: 0,
      itemsFailed: 0,
      totalItems: items.length,
      percentage: 0,
      items: items.map(item => ({
        ...item,
        name: item.name,
        quantity: item.quantity,
        status: 'pending'
      }))
    });
    
    // Send message to background script to start shopping
    const response = await chrome.runtime.sendMessage({
      type: 'START_SHOPPING',
      data: {
        store: store || getSelectedShoppingStore() || undefined,
        items: items.map(item => ({
          ...item,
          quantity: item.quantity || 1
        })),
        deliveryPostcode: getSelectedShoppingPostcode() || undefined,
        sessionId // Pass session ID for progress updates
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to start shopping');
    }
    
    console.log('[Sally] Shopping task started:', response.taskId);
    
    // Listen for progress updates from background script
    const progressListener = (message) => {
      if (message.type === 'SHOPPING_PROGRESS' && message.sessionId === sessionId) {
        console.log('[Sally] Progress update:', message.progress);
        sendProgressUpdate(sessionId, message.progress);
      } else if (message.type === 'SHOPPING_COMPLETE' && message.sessionId === sessionId) {
        console.log('[Sally] Shopping complete');
        chrome.runtime.onMessage.removeListener(progressListener);
      }
    };
    
    chrome.runtime.onMessage.addListener(progressListener);
    
  } catch (error) {
    console.error('[Sally] Failed to start shopping:', error);
    
    // Send error progress
    await sendProgressUpdate(sessionId, {
      itemsAdded: 0,
      itemsFailed: items.length,
      totalItems: items.length,
      percentage: 0,
      items: items.map(item => ({
        ...item,
        name: item.name,
        quantity: item.quantity,
        status: 'failed'
      })),
      error: error.message
    });
    
    showUserNotice(`Failed to start shopping. ${error.message}`, 'error');
  }
}

function showPanelNotice(text, type = 'info') {
  if (!panelNotice) return false;

  if (isSidePanelSurface()) {
    return true;
  }

  panelNotice.textContent = text;
  panelNotice.className = `panel-notice notice-${type}`;
  panelNotice.classList.remove('hidden');

  window.clearTimeout(showPanelNotice.timeoutId);
  showPanelNotice.timeoutId = window.setTimeout(() => {
    panelNotice.classList.add('hidden');
  }, 4500);

  return true;
}

function showUserNotice(text, type = 'info') {
  if (!showPanelNotice(text, type)) {
    alert(text);
  }
  addActivityEvent({
    kind: 'notice',
    title: type === 'error' ? 'Issue' : type === 'warning' ? 'Heads up' : 'Update',
    text,
    tone: type,
    icon: type === 'error' ? '⚠️' : type === 'warning' ? '💡' : 'ℹ️',
    actions: getNoticeActions(text, type),
  });
}

function requestSoftConfirmation(key, message) {
  if (!panelNotice) {
    return confirm(message.replace(' Click Clear again to confirm.', '').replace(' Click Stop again to confirm.', ''));
  }

  const now = Date.now();
  const expiresAt = pendingSoftConfirmations.get(key) || 0;

  if (expiresAt > now) {
    pendingSoftConfirmations.delete(key);
    return true;
  }

  pendingSoftConfirmations.set(key, now + 3000);
  showPanelNotice(message, 'warning');
  if (isSidePanelSurface()) {
    addActivityEvent({
      kind: 'confirm',
      title: 'Confirm action',
      text: message,
      tone: 'warning',
      icon: '⚠️',
    });
  }
  return false;
}

async function loadActivityFeed() {
  try {
    const data = await chrome.storage.local.get(['activityFeed']);
    activityEvents = Array.isArray(data.activityFeed) ? data.activityFeed : [];
    renderActivityFeed();
    updateComposerState();
  } catch (error) {
    console.error('Failed to load activity feed:', error);
  }
}

async function loadShoppingPreferences() {
  try {
    const data = await chrome.storage.local.get([SHOPPING_PREFERENCES_KEY]);
    shoppingPreferences = {
      ...DEFAULT_SHOPPING_PREFERENCES,
      ...(data[SHOPPING_PREFERENCES_KEY] || {}),
    };

    if (storeSelect && shoppingPreferences.store) {
      storeSelect.value = shoppingPreferences.store;
    }

    if (postcodeInput && shoppingPreferences.deliveryPostcode) {
      postcodeInput.value = shoppingPreferences.deliveryPostcode;
    }
  } catch (error) {
    console.warn('[Sally] Could not load shopping preferences:', error);
  }
}

async function saveShoppingPreferences(preferences) {
  shoppingPreferences = {
    ...shoppingPreferences,
    ...preferences,
  };

  await chrome.storage.local.set({ [SHOPPING_PREFERENCES_KEY]: shoppingPreferences });

  if (storeSelect) {
    storeSelect.value = shoppingPreferences.store || '';
  }

  if (postcodeInput) {
    postcodeInput.value = shoppingPreferences.deliveryPostcode || '';
  }
}

async function clearActivityFeed() {
  activityEvents = [];
  areChatSuggestionsExpanded = false;
  await chrome.storage.local.set({ activityFeed: [] });
  renderActivityFeed();
  updateComposerState();
}

async function addActivityEvent(event) {
  if (shouldSuppressActivityEvent(event)) {
    return;
  }

  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    tone: 'info',
    icon: 'ℹ️',
    ...event,
  };

  activityEvents = [item, ...activityEvents].slice(0, 30);
  renderActivityFeed();
  updateComposerState();
  await chrome.storage.local.set({ activityFeed: activityEvents });
}

function shouldSuppressActivityEvent(event) {
  return event?.kind === 'auth' || event?.kind === 'shopping';
}

function getVisibleActivityEvents() {
  return activityEvents.filter((event) => !shouldSuppressActivityEvent(event));
}

function hasUserStartedChat() {
  return getVisibleActivityEvents().some((event) => event.kind === 'chat' && event.role === 'user');
}

function updateComposerState() {
  if (chatSuggestions) {
    chatSuggestions.classList.toggle('hidden', !areChatSuggestionsExpanded);
    chatSuggestions.querySelectorAll('.mobile-attach-option').forEach((button) => {
      button.classList.toggle('hidden', !areMobileAttachOptionsExpanded);
      button.disabled = button.dataset.chatAction === 'attach-mobile-android';
    });
  }

  if (chatPlusBtn) {
    chatPlusBtn.classList.toggle('is-expanded', areChatSuggestionsExpanded);
    chatPlusBtn.setAttribute(
      'aria-label',
      areChatSuggestionsExpanded ? 'Hide quick actions' : 'Show quick actions',
    );
  }
}

function renderActivityFeed() {
  if (!activityFeed) return;

  const visibleEvents = getVisibleActivityEvents();
  const shoppingPanel = renderShoppingProgressPanel();
  const feedShouldStick = shouldStickToBottom(activityFeed);
  const feedScrollTop = activityFeed.scrollTop;
  const previousShoppingItems = activityFeed.querySelector('.threads-shopping-items');
  const itemsShouldStick = previousShoppingItems ? shouldStickToBottom(previousShoppingItems) : true;
  const itemsScrollTop = previousShoppingItems ? previousShoppingItems.scrollTop : lastShoppingItemsScrollTop;

  if (!visibleEvents.length && !shoppingPanel) {
    activityFeed.innerHTML = `
      <div class="threads-start-screen">
        <div class="threads-start-copy">
          <h3>What should Sally help with?</h3>
          <p>Ask a question, plan a list, or paste groceries. Shopping appears here as a tool when you choose to run it.</p>
        </div>
        ${renderShoppingPreferenceCard()}
      </div>
    `;
    return;
  }

  const events = isSidePanelSurface() ? [...visibleEvents].reverse() : visibleEvents;
  const eventMarkup = events.map((event) => `
    <article class="threads-message ${getActivityMessageRole(event)} activity-${event.tone || 'info'}">
      <div class="threads-message-avatar" aria-hidden="true">
        ${renderMessageAvatar(event)}
      </div>
      <div class="threads-message-stack">
        <div class="threads-message-meta">
          <span class="threads-message-label">${getActivityMessageRole(event) === 'assistant' ? 'Sally' : 'You'}</span>
          <span class="threads-message-time">${formatActivityTime(event.timestamp)}</span>
        </div>
        <div class="threads-message-bubble ${isToolEvent(event) ? 'structured tool-call' : ''}">
          ${isToolEvent(event) ? renderToolEvent(event) : renderChatEvent(event)}
        </div>
      </div>
    </article>
  `).join('');

  activityFeed.innerHTML = isSidePanelSurface()
    ? `${eventMarkup}${shoppingPanel}`
    : `${shoppingPanel}${eventMarkup}`;

  if (isSidePanelSurface()) {
    const shoppingItems = activityFeed.querySelector('.threads-shopping-items');
    if (shoppingItems) {
      shoppingItems.scrollTop = itemsShouldStick
        ? shoppingItems.scrollHeight
        : Math.min(itemsScrollTop, shoppingItems.scrollHeight - shoppingItems.clientHeight);
      lastShoppingItemsScrollTop = shoppingItems.scrollTop;
      shoppingItems.addEventListener('scroll', () => {
        lastShoppingItemsScrollTop = shoppingItems.scrollTop;
      }, { passive: true });
    }
    activityFeed.scrollTop = feedShouldStick
      ? activityFeed.scrollHeight
      : Math.min(feedScrollTop, activityFeed.scrollHeight - activityFeed.clientHeight);
  }
}

function shouldStickToBottom(element, threshold = 48) {
  if (!element) return true;
  return element.scrollHeight - element.clientHeight - element.scrollTop <= threshold;
}

function renderShoppingProgressPanel() {
  if (!currentTask?.items?.length) return '';

  const metrics = computeTaskMetrics(currentTask);
  const percent = getProgressPercentage(metrics);
  const totalCost = getTaskRunningTotal(currentTask);
  const elapsed = formatElapsedDuration(getTaskElapsedSeconds(currentTask));
  const averageItemTime = formatElapsedDuration(getAverageItemSeconds(currentTask));
  const storeName = getStoreDisplayName(currentTask.store);
  const statusCopy = currentTask.status === 'complete'
    ? 'Shopping complete'
    : currentTask.status === 'stopped'
      ? 'Shopping stopped'
      : currentTask.status === 'paused'
        ? 'Shopping paused'
        : currentTask.status === 'error'
          ? 'Needs attention'
          : `Shopping at ${storeName}`;
  const statusTone = currentTask.status === 'complete'
    ? 'success'
    : currentTask.status === 'error' || metrics.failedItems > 0
      ? 'warning'
      : 'info';

  const items = currentTask.items.map((item) => renderShoppingProgressItem(item)).join('');
  const taskActions = [
    { type: 'checkout-with-sally', label: 'Checkout with Sally' },
    { type: 'open-cart', label: 'Cart', style: 'secondary' },
  ];

  if (currentTask.status === 'paused') {
    taskActions.push({ type: 'resume-shopping', label: 'Resume' });
    taskActions.push({ type: 'stop-shopping', label: 'Stop', style: 'secondary' });
  } else if (isActiveShoppingTask(currentTask)) {
    taskActions.push({ type: 'pause-shopping', label: 'Pause', style: 'secondary' });
    taskActions.push({ type: 'stop-shopping', label: 'Stop', style: 'secondary' });
  }

  const actions = renderActivityActions(taskActions);

  return `
    <article class="threads-message assistant activity-${statusTone}">
      <div class="threads-message-avatar" aria-hidden="true">${renderMessageAvatar({ role: 'assistant' })}</div>
      <div class="threads-message-stack">
        <div class="threads-message-meta">
          <span class="threads-message-label">Sally</span>
          <span class="threads-message-time">${escapeHtml(statusCopy)}</span>
        </div>
        <div class="threads-message-bubble structured">
          <section class="threads-shopping-panel ${statusTone}">
            <div class="threads-shopping-panel-header">
              <div>
                <span class="threads-response-type-badge is-plan">${getActivityActionIcon('shopping')}Shopping</span>
                <h4>${escapeHtml(statusCopy)}</h4>
              </div>
              <div class="threads-shopping-total">
                <span>Total so far</span>
                <strong>${formatCurrency(totalCost)}</strong>
              </div>
            </div>
            <div class="threads-shopping-progress-row">
              <span>${metrics.processedItems}/${metrics.totalItems} items</span>
              <span>${percent}%</span>
            </div>
            <div class="threads-shopping-progress-bar" aria-label="${percent}% complete">
              <div style="width: ${Math.max(percent, currentTask.status === 'shopping' ? 4 : 0)}%"></div>
            </div>
            <div class="threads-shopping-timing">
              <div class="threads-shopping-time-card">
                <span class="threads-time-card-icon" aria-hidden="true">${getActivityActionIcon('elapsed')}</span>
                <span>Elapsed</span>
                <strong>${escapeHtml(elapsed)}</strong>
              </div>
              <div class="threads-shopping-time-card">
                <span class="threads-time-card-icon" aria-hidden="true">${getActivityActionIcon('avg-item')}</span>
                <span>Avg item</span>
                <strong>${escapeHtml(averageItemTime)}</strong>
              </div>
            </div>
            <div class="threads-shopping-stats">
              <span>${getActivityActionIcon('added')}<strong>${metrics.addedItems}</strong> added</span>
              <span>${getActivityActionIcon('remaining')}<strong>${metrics.remainingItems}</strong> left</span>
              <span>${getActivityActionIcon('issues')}<strong>${metrics.failedItems}</strong> issues</span>
            </div>
            <div class="threads-shopping-items">
              ${items}
            </div>
            ${actions}
          </section>
        </div>
      </div>
    </article>
  `;
}

function renderShoppingProgressItem(item) {
  const status = item.status || 'pending';
  const icon = status === 'added' ? '✓' : status === 'failed' ? '!' : status === 'searching' ? '…' : '';
  const label = item.productName && item.productName !== item.name ? item.productName : item.name;
  const quantity = Number(item.quantity) > 1 ? ` ×${Number(item.quantity)}` : '';
  const price = item.price ? formatCurrency(item.price) : '';
  const itemTime = getItemElapsedLabel(item);
  const detail = status === 'failed'
    ? (item.failReason || 'Could not add')
    : item.productName && item.productName !== item.name
      ? item.name
      : '';

  return `
    <div class="threads-shopping-item ${escapeHtml(status)}">
      <span class="threads-shopping-check" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="threads-shopping-item-copy">
        <strong>${escapeHtml(label)}${escapeHtml(quantity)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
      </span>
      <span class="threads-shopping-price">
        ${escapeHtml(price)}
        ${itemTime ? `<small>${escapeHtml(itemTime)}</small>` : ''}
      </span>
    </div>
  `;
}

function getTaskRunningTotal(task) {
  return (task?.items || []).reduce((sum, item) => {
    return sum + (item.status === 'added' && Number(item.price) ? Number(item.price) : 0);
  }, 0);
}

function formatCurrency(amount) {
  return `£${Number(amount || 0).toFixed(2)}`;
}

function getTaskElapsedSeconds(task) {
  if (!task?.startedAt) return 0;
  const start = new Date(task.startedAt).getTime();
  const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function getAverageItemSeconds(task) {
  const resolvedItems = (task?.items || []).filter((item) => item.status === 'added' || item.status === 'failed');
  if (!resolvedItems.length) return 0;
  return Math.round(getTaskElapsedSeconds(task) / resolvedItems.length);
}

function getItemElapsedLabel(item) {
  const seconds = Number(item.elapsedSeconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return formatElapsedDuration(seconds);
  }

  if (!item.resolvedAt || !currentTask?.startedAt) return '';
  const start = new Date(currentTask.startedAt).getTime();
  const end = new Date(item.resolvedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  return formatElapsedDuration(Math.max(0, Math.round((end - start) / 1000)));
}

function formatElapsedDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStoreDisplayName(store) {
  const storeNames = {
    tesco: 'Tesco',
    sainsburys: "Sainsbury's",
    asda: 'ASDA',
    ocado: 'Ocado',
    waitrose: 'Waitrose',
    morrisons: 'Morrisons',
    aldi: 'Aldi',
  };

  return storeNames[store] || store || 'your supermarket';
}

function getPreferredStore() {
  return shoppingPreferences.askEveryTime ? '' : shoppingPreferences.store || '';
}

function getPreferredPostcode() {
  return shoppingPreferences.askEveryTime ? '' : shoppingPreferences.deliveryPostcode || '';
}

function getSelectedShoppingStore() {
  return storeSelect?.value || getPreferredStore() || '';
}

function getSelectedShoppingPostcode() {
  return postcodeInput?.value?.trim() || getPreferredPostcode() || '';
}

function shouldShowShoppingPreferenceCard() {
  return !shoppingPreferences.store || shoppingPreferences.askEveryTime;
}

function renderShoppingPreferenceCard() {
  if (!shouldShowShoppingPreferenceCard()) return '';

  const storeOptions = [
    ['', 'Choose supermarket'],
    ['tesco', 'Tesco'],
    ['sainsburys', "Sainsbury's"],
    ['asda', 'ASDA'],
    ['ocado', 'Ocado'],
    ['waitrose', 'Waitrose'],
    ['morrisons', 'Morrisons'],
    ['aldi', 'Aldi'],
  ];

  return `
    <form class="shopping-preference-card" data-shopping-preferences-form>
      <h4>Where should Sally shop?</h4>
      <p>Pick a supermarket once and Sally will use it for shopping runs unless you change it.</p>
      <div class="shopping-preference-grid">
        <div class="shopping-preference-field">
          <label for="shopping-pref-store">Shop</label>
          <select id="shopping-pref-store" name="store" required>
            ${storeOptions.map(([value, label]) => `
              <option value="${escapeHtml(value)}" ${shoppingPreferences.store === value ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </div>
        <div class="shopping-preference-field">
          <label for="shopping-pref-postcode">Location</label>
          <input id="shopping-pref-postcode" name="deliveryPostcode" value="${escapeHtml(shoppingPreferences.deliveryPostcode || '')}" placeholder="Postcode or city">
        </div>
        <label class="shopping-preference-remember">
          <input type="checkbox" name="askEveryTime" ${shoppingPreferences.askEveryTime ? 'checked' : ''}>
          Ask me each time
        </label>
      </div>
      <div class="shopping-preference-actions">
        <button type="button" data-shopping-pref-action="save">Save choice</button>
        <button type="button" data-shopping-pref-action="skip">Decide later</button>
      </div>
    </form>
  `;
}

function renderMessageAvatar(event) {
  if (getActivityMessageRole(event) === 'assistant') {
    return '<span class="threads-assistant-icon"><img src="../icons/icon48.png" alt=""></span>';
  }

  const avatarUrl = getUserAvatarUrl(currentUser);
  if (avatarUrl) {
    return `<span class="threads-user-avatar-fallback has-image"><img src="${escapeHtml(avatarUrl)}" alt=""></span>`;
  }

  return `<span class="threads-user-avatar-fallback">${escapeHtml(getUserInitials(currentUser))}</span>`;
}

function getUserAvatarUrl(user = {}) {
  return user.avatarUrl
    || user.avatar_url
    || user.picture
    || user.image
    || user.photoURL
    || user.photo_url
    || '';
}

function getUserInitials(user = {}) {
  const displayName = getUserDisplayName(user);
  const words = String(displayName || '')
    .replace(/@.*/, '')
    .split(/\s+|[._-]+/)
    .filter(Boolean);

  if (!words.length) return 'Y';
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function getActivityMessageRole(event) {
  return event.role === 'user' ? 'user' : 'assistant';
}

function isToolEvent(event) {
  return ['tool', 'shopping', 'auth', 'notice', 'confirm'].includes(event.kind);
}

function formatToolName(name = '') {
  return String(name)
    .replace(/^start_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getEventTypeLabel(event) {
  if (event.kind === 'shopping') return 'Shopping tool';
  if (event.kind === 'auth') return 'Account tool';
  if (event.kind === 'notice' || event.kind === 'confirm') return 'System';
  return 'Tool';
}

function renderChatEvent(event) {
  return `
    <p class="threads-message-text">${escapeHtml(event.text || '')}</p>
    ${renderActivityActions(event.actions)}
  `;
}

function renderToolEvent(event) {
  if (isSidePanelSurface() && ['auth', 'notice', 'confirm'].includes(event.kind)) {
    return renderCompactStatusEvent(event);
  }

  return `
    <div class="threads-tool-card">
      <div class="threads-tool-card-header">
        <span class="threads-response-type-badge is-${event.kind === 'shopping' ? 'plan' : 'answer'}">${getActivityActionIcon(event.kind === 'shopping' ? 'shopping' : 'tool')}${escapeHtml(getEventTypeLabel(event))}</span>
        <span class="threads-tool-status ${event.tone || 'info'}">${escapeHtml(event.tone || 'info')}</span>
      </div>
      <h4>${escapeHtml(event.title || 'Tool update')}</h4>
      <p>${escapeHtml(event.text || '')}</p>
      ${renderActivityActions(event.actions)}
    </div>
  `;
}

function renderCompactStatusEvent(event) {
  const statusLabel = event.tone === 'success'
    ? 'Done'
    : event.tone === 'error'
      ? 'Issue'
      : event.tone === 'warning'
        ? 'Check'
        : 'Info';

  return `
    <div class="threads-status-card ${event.tone || 'info'}">
      <span class="threads-status-dot" aria-hidden="true"></span>
      <div class="threads-status-copy">
        <strong>${escapeHtml(event.title || getEventTypeLabel(event))}</strong>
        <span>${escapeHtml(event.text || '')}</span>
      </div>
      <span class="threads-status-pill">${escapeHtml(statusLabel)}</span>
      ${renderActivityActions(event.actions)}
    </div>
  `;
}

function renderActivityActions(actions = []) {
  if (!Array.isArray(actions) || !actions.length) return '';

  const buttons = actions.map((action, index) => `
    <button
      type="button"
      class="activity-action${action.style === 'secondary' ? ' secondary' : ''}"
      data-action-type="${escapeHtml(action.type)}"
      data-action-index="${index}"
    ><span class="activity-action-icon" aria-hidden="true">${getActivityActionIcon(action.type)}</span><span>${escapeHtml(action.label)}</span></button>
  `).join('');

  return `<div class="activity-actions">${buttons}</div>`;
}

function getActivityActionIcon(type = '') {
  const icons = {
    'confirm-start-shopping': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    'pause-shopping': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    'resume-shopping': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    'stop-shopping': '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    'open-cart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    'checkout-with-sally': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    'focus-shopping-tab': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    'cancel-start-shopping': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6 6a2.1 2.1 0 0 1-3-3l6-6a6 6 0 0 1 7.9-7.9z"/></svg>',
    elapsed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    'avg-item': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>',
    added: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>',
    remaining: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>',
    issues: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  };

  return icons[type] || '';
}

function formatActivityTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleActivityFeedClick(event) {
  const prefButton = event.target.closest('[data-shopping-pref-action]');
  if (prefButton) {
    event.preventDefault();
    await handleShoppingPreferenceAction(prefButton);
    return;
  }

  const button = event.target.closest('[data-action-type]');
  if (!button) return;

  const type = button.dataset.actionType;
  await runActivityAction(type);
}

async function handleShoppingPreferenceAction(button) {
  const action = button.dataset.shoppingPrefAction;
  const form = button.closest('[data-shopping-preferences-form]');

  if (action === 'skip') {
    await saveShoppingPreferences({ askEveryTime: true });
    showUserNotice('Sally will ask where to shop before each run.', 'info');
    renderActivityFeed();
    return;
  }

  if (!form) return;

  const store = form.elements.store?.value || '';
  const deliveryPostcode = String(form.elements.deliveryPostcode?.value || '').trim();
  const askEveryTime = Boolean(form.elements.askEveryTime?.checked);

  if (!store && !askEveryTime) {
    showUserNotice('Choose a supermarket or select ask me each time.', 'warning');
    return;
  }

  await saveShoppingPreferences({ store, deliveryPostcode, askEveryTime });
  showUserNotice(store ? `Sally will shop at ${getStoreDisplayName(store)}.` : 'Sally will ask where to shop each time.', 'success');
  renderActivityFeed();
}

async function runActivityAction(type) {
  switch (type) {
    case 'open-cart':
      await handleViewCart();
      break;
    case 'checkout-with-sally':
      await handleViewCart();
      break;
    case 'new-list':
      handleNewTask();
      showUserNotice('Ready for a new shopping list.', 'info');
      break;
    case 'focus-shopping-tab':
      await focusCurrentShoppingTab();
      break;
    case 'pause-shopping':
      await handlePauseShopping();
      break;
    case 'resume-shopping':
      await handleResumeShopping();
      break;
    case 'stop-shopping':
      await handleStopShopping();
      break;
    case 'confirm-start-shopping':
      await confirmPendingChatShopping();
      break;
    case 'cancel-start-shopping':
      await cancelPendingChatShopping();
      break;
    case 'refresh-extension-qr':
      await refreshExtensionQR();
      break;
    case 'close-qr-generator':
      closeQRGenerator();
      break;
    case 'upgrade':
      await openUpgradeFlow();
      break;
    case 'open-help':
      chrome.tabs.create({ url: 'https://heysalad.app/help' });
      break;
    default:
      console.warn('Unknown activity action:', type);
  }
}

async function confirmPendingChatShopping() {
  if (!pendingChatShopping?.items?.length) {
    showUserNotice('There is no pending shopping list to start.', 'warning');
    return;
  }

  if (pendingChatShopping.store && storeSelect) {
    storeSelect.value = pendingChatShopping.store;
  }

  itemsInput.value = pendingChatShopping.items
    .map((item) => item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name)
    .join('\n');

  pendingChatShopping = null;
  await handleStartShopping();
}

async function cancelPendingChatShopping() {
  pendingChatShopping = null;

  await addActivityEvent({
    kind: 'tool',
    title: 'Shopping cancelled',
    text: 'I will not start that shopping run.',
    tone: 'info',
    icon: 'ℹ️',
  });
}

async function focusCurrentShoppingTab() {
  if (!currentTask?.tabId) {
    showUserNotice('No active Sally shopping tab is available right now.', 'warning');
    return;
  }

  try {
    const tab = await chrome.tabs.get(currentTask.tabId);
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (error) {
    console.error('Failed to focus shopping tab:', error);
    showUserNotice('Could not focus the current shopping tab.', 'error');
  }
}

async function openUpgradeFlow() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_SUBSCRIPTION_CHECKOUT',
      data: { tier: 'pro' },
    });

    if (response?.success && response.checkoutUrl) {
      chrome.tabs.create({ url: response.checkoutUrl });
      return;
    }

    const data = await chrome.storage.local.get(['extensionPlan']);
    chrome.tabs.create({ url: response?.upgradeUrl || data.extensionPlan?.upgradeUrl || BILLING_URL });
    showUserNotice(response?.error || 'Opening HeySalad billing.', 'info');
  } catch (error) {
    const data = await chrome.storage.local.get(['extensionPlan']);
    chrome.tabs.create({ url: data.extensionPlan?.upgradeUrl || BILLING_URL });
    showUserNotice('Opening HeySalad billing.', 'info');
  }
}

function getNoticeActions(text, type) {
  if (type === 'warning' && /upgrade/i.test(text)) {
    return [{ type: 'upgrade', label: 'Upgrade', style: 'secondary' }];
  }

  if (type === 'warning' && /supported supermarket website/i.test(text)) {
    return [{ type: 'focus-shopping-tab', label: 'Open tab', style: 'secondary' }];
  }

  if (type === 'error') {
    return [{ type: 'open-help', label: 'Help', style: 'secondary' }];
  }

  return [];
}

function logTaskActivity(previousTask, nextTask) {
  if (!nextTask?.items?.length) return;

  const previousStatuses = new Map(
    (previousTask?.items || []).map((item) => [`${item.name}::${item.quantity}`, item.status])
  );

  for (const item of nextTask.items) {
    const key = `${item.name}::${item.quantity}`;
    const previousStatus = previousStatuses.get(key);

    if (item.status === previousStatus) continue;

    if (item.status === 'searching' && activityStateSnapshot[key] !== 'searching') {
      activityStateSnapshot[key] = 'searching';
      addActivityEvent({
        kind: 'shopping',
        title: 'Searching',
        text: `Sally is searching for ${item.name}.`,
        tone: 'info',
        icon: '🔎',
      });
    }

    if (item.status === 'added' && activityStateSnapshot[key] !== 'added') {
      activityStateSnapshot[key] = 'added';
      const priceSummary = item.unitPrice && item.quantity > 1
        ? ` at £${item.unitPrice.toFixed(2)} each (£${item.price.toFixed(2)} total)`
        : item.price
          ? ` for £${item.price.toFixed(2)}`
          : '';
      const productSummary = item.productName && item.productName !== item.name
        ? ` via ${item.productName}`
        : '';
      addActivityEvent({
        kind: 'shopping',
        title: 'Added to cart',
        text: `${item.name}${priceSummary}${productSummary} was added to the cart.`,
        tone: 'success',
        icon: '✅',
      });
    }

    if (item.status === 'failed' && activityStateSnapshot[key] !== 'failed') {
      activityStateSnapshot[key] = 'failed';
      addActivityEvent({
        kind: 'shopping',
        title: 'Could not add item',
        text: `Sally could not add ${item.name}.`,
        tone: 'warning',
        icon: '⚠️',
        actions: [
          { type: 'focus-shopping-tab', label: 'Open tab' },
          { type: 'new-list', label: 'Review list', style: 'secondary' }
        ],
      });
    }
  }
}

// Send progress update to API (using token-based endpoint)
async function sendProgressUpdate(sessionId, progress) {
  if (!sessionId) {
    console.warn('[Sally] No session ID for progress update');
    return;
  }
  
  try {
    // Use token-based API endpoint
    const response = await fetch(
      `https://sally-api.heysalad-o.workers.dev/api/extension/token/${sessionId}/progress`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(progress)
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('[Sally] Progress update sent:', progress.percentage + '%');
  } catch (error) {
    console.error('[Sally] Failed to send progress update:', error);
  }
}

// Close extension QR
function closeExtensionQR() {
  if (sessionPollInterval) clearInterval(sessionPollInterval);
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  
  document.getElementById('extension-qr-section').classList.add('hidden');
  mainSection.classList.remove('hidden');
  
  extensionSession = null;
}

// Refresh QR (generate new session)
async function refreshExtensionQR() {
  closeExtensionQR();
  await showExtensionQR();
}

// Generate unique session token for extension
function generateExtensionSessionToken() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  const randomStr2 = Math.random().toString(36).substring(2, 15);
  return `ext_${timestamp}_${randomStr}${randomStr2}`;
}

// Add event listeners for extension QR buttons
const showExtensionQRBtn = document.getElementById('show-qr-code-btn');
const extensionQRCancelBtn = document.getElementById('extension-qr-cancel-btn');
const extensionQRRefreshBtn = document.getElementById('extension-qr-refresh-btn');

if (showExtensionQRBtn) {
  showExtensionQRBtn.addEventListener('click', showExtensionQR);
}

if (extensionQRCancelBtn) {
  extensionQRCancelBtn.addEventListener('click', closeExtensionQR);
}

if (extensionQRRefreshBtn) {
  extensionQRRefreshBtn.addEventListener('click', refreshExtensionQR);
}
