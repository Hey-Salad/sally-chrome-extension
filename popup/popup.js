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

let currentUser = null;
let currentTask = null;
let timerInterval = null;
let qrScanner = null;
const pendingSoftConfirmations = new Map();
let activityEvents = [];
let activityStateSnapshot = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
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
    const data = await chrome.storage.local.get(['taskHistory']);
    const history = data.taskHistory || [];
    const container = document.getElementById('saved-lists-container');
    
    if (!container) return;
    
    // Filter to only completed tasks
    const completedTasks = history.filter(t => t.status === 'complete').slice(0, 5);
    
    if (completedTasks.length === 0) {
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
    
    container.innerHTML = completedTasks.map((task, index) => {
      const date = new Date(task.completedAt || task.startedAt);
      const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const itemCount = task.items?.length || 0;
      const addedCount = task.itemsAdded || task.items?.filter(i => i.status === 'added').length || 0;
      const duration = task.startedAt && task.completedAt ? formatDuration(task.startedAt, task.completedAt) : '';
      
      return `
        <div class="saved-list-item" data-index="${index}">
          <div class="saved-list-info">
            <div class="saved-list-store">${storeNames[task.store] || task.store}</div>
            <div class="saved-list-meta">${dateStr}${duration ? ` • ${duration}` : ''}</div>
          </div>
          <span class="saved-list-count">${addedCount}/${itemCount}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers to reuse lists
    container.querySelectorAll('.saved-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const task = completedTasks[index];
        if (task && task.items) {
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
    upgradeBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['extensionPlan']);
      chrome.tabs.create({ url: data.extensionPlan?.upgradeUrl || 'https://heysalad.app' });
    });
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
    updateSubscriptionUI({ tier: 'free', label: 'Free', automationAllowed: false, upgradeUrl: 'https://heysalad.app' });
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
  const resolvedPlan = plan || { tier: 'free', label: 'Free', automationAllowed: false, upgradeUrl: 'https://heysalad.app' };
  if (!planName || !planPill || !planDescription || !upgradeBtn) return;

  planName.textContent = resolvedPlan.label || 'Free';
  planPill.textContent = resolvedPlan.label || 'Free';
  planPill.classList.toggle('plan-free', !resolvedPlan.automationAllowed);
  planPill.classList.toggle('plan-paid', !!resolvedPlan.automationAllowed);

  if (resolvedPlan.automationAllowed) {
    planDescription.textContent = 'Autonomous shopping is unlocked. Sally can shop directly in your current supermarket tab.';
    upgradeBtn.classList.add('hidden');
  } else {
    planDescription.textContent = 'Autonomous shopping is part of Sally Premium or Pro. Upgrade in Sally to let the extension shop for you.';
    upgradeBtn.classList.remove('hidden');
  }
}

async function handleStartShopping() {
  const store = storeSelect.value;
  const itemsText = itemsInput.value.trim();
  const postcode = postcodeInput.value.trim();
  
  // Store is now optional - we'll detect from current tab
  if (!itemsText) {
    showUserNotice('Please enter at least one item.', 'warning');
    return;
  }
  
  const items = parseItems(itemsText);
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
        showUserNotice(response.error || 'Upgrade in Sally to unlock autonomous shopping.', 'warning');
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

function handleViewCart() {
  if (currentTask && currentTask.store) {
    const cartUrls = {
      tesco: 'https://www.tesco.com/groceries/en-GB/trolley',
      sainsburys: 'https://www.sainsburys.co.uk/gol-ui/trolley',
      asda: 'https://groceries.asda.com/trolley',
      ocado: 'https://www.ocado.com/webshop/getBasket.do',
      waitrose: 'https://www.waitrose.com/ecom/shop/trolley'
    };
    const url = cartUrls[currentTask.store];
    if (url) chrome.tabs.create({ url });
  }
}

function handleNewTask() {
  activityStateSnapshot = {};
  currentTask = null;
  itemsInput.value = '';
  showTaskForm();
}

function parseItems(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const items = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    let name = trimmed;
    let quantity = 1;
    
    // Try "2x Item" format
    const prefixMatch = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
    if (prefixMatch) {
      quantity = parseInt(prefixMatch[1], 10);
      name = prefixMatch[2].trim();
    } else {
      // Try "Item x2" format
      const suffixMatch = trimmed.match(/^(.+?)\s*x\s*(\d+)$/i);
      if (suffixMatch) {
        name = suffixMatch[1].trim();
        quantity = parseInt(suffixMatch[2], 10);
      } else {
        // Try "Item (2)" format
        const parenMatch = trimmed.match(/^(.+?)\s*\((\d+)\)$/);
        if (parenMatch) {
          name = parenMatch[1].trim();
          quantity = parseInt(parenMatch[2], 10);
        }
      }
    }
    
    if (name && quantity > 0) {
      items.push({ name, quantity });
    }
  }
  
  return items;
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
  if (currentUser) {
    userEmail.textContent = currentUser.email || currentUser.phone || 'User';
  }
  renderActivityFeed();
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
  activityStateSnapshot = {};
  
  taskForm.classList.add('hidden');
  taskStatus.classList.add('hidden');
  taskComplete.classList.remove('hidden');
  
  // Show saved lists again
  const savedLists = document.getElementById('saved-lists');
  if (savedLists) savedLists.classList.remove('hidden');
  
  // Calculate from items array if itemsAdded not set
  const added = task.itemsAdded || task.items?.filter(i => i.status === 'added').length || 0;
  const failed = task.itemsFailed || task.items?.filter(i => i.status === 'failed').length || 0;
  const total = task.items?.length || 0;
  
  const storeNames = {
    tesco: 'Tesco',
    sainsburys: "Sainsbury's",
    asda: 'ASDA',
    ocado: 'Ocado',
    waitrose: 'Waitrose'
  };
  const storeName = storeNames[task.store] || task.store || 'your';
  
  completeSummary.textContent = `Added ${added} of ${total} items to your ${storeName} cart.`;
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
  
  const total = task.items?.length || 0;
  const completed = (task.itemsAdded || 0) + (task.itemsFailed || 0);
  const percent = total > 0 ? (completed / total) * 100 : 0;
  
  // Show indeterminate progress while shopping
  if (task.status === 'starting' || task.status === 'shopping') {
    progressFill.style.width = '100%';
    progressFill.style.animation = 'pulse 1.5s ease-in-out infinite';
    progressText.textContent = task.status === 'starting' 
      ? 'Initializing AI browser...' 
      : 'Sally is adding items to your cart...';
  } else {
    progressFill.style.animation = 'none';
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${completed} of ${total} items`;
  }
  
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
        q: item.quantity || 1 // quantity
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
    
    const qrDisplay = document.getElementById('extension-qr-display');
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
    document.getElementById('extension-qr-section').classList.remove('hidden');
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
  
  itemsInput.value = itemsText;
  storeSelect.value = store || '';
  await addActivityEvent({
    kind: 'mobile',
    title: 'Starting mobile shopping',
    text: `Preparing to shop ${shoppingList.items.length} item${shoppingList.items.length === 1 ? '' : 's'} from Sally Mobile.`,
    tone: 'info',
    icon: '🧺',
  });
  
  // Start shopping and send progress updates
  await startShoppingWithProgressUpdates(sessionId, shoppingList.items, store);
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
        name: item.name,
        quantity: item.quantity,
        status: 'pending'
      }))
    });
    
    // Send message to background script to start shopping
    const response = await chrome.runtime.sendMessage({
      type: 'START_SHOPPING',
      data: {
        store,
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity || 1
        })),
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
  return false;
}

async function loadActivityFeed() {
  try {
    const data = await chrome.storage.local.get(['activityFeed']);
    activityEvents = Array.isArray(data.activityFeed) ? data.activityFeed : [];
    renderActivityFeed();
  } catch (error) {
    console.error('Failed to load activity feed:', error);
  }
}

async function clearActivityFeed() {
  activityEvents = [];
  await chrome.storage.local.set({ activityFeed: [] });
  renderActivityFeed();
}

async function addActivityEvent(event) {
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    tone: 'info',
    icon: 'ℹ️',
    ...event,
  };

  activityEvents = [item, ...activityEvents].slice(0, 30);
  renderActivityFeed();
  await chrome.storage.local.set({ activityFeed: activityEvents });
}

function renderActivityFeed() {
  if (!activityFeed) return;

  if (!activityEvents.length) {
    activityFeed.innerHTML = '<p class="activity-empty">Sally will narrate shopping, QR handoff, and account events here.</p>';
    return;
  }

  activityFeed.innerHTML = activityEvents.map((event) => `
    <article class="activity-item activity-${event.tone || 'info'}">
      <div class="activity-icon">${event.icon || 'ℹ️'}</div>
      <div class="activity-body">
        <div class="activity-meta">
          <span class="activity-title">${escapeHtml(event.title || 'Update')}</span>
          <span class="activity-time">${formatActivityTime(event.timestamp)}</span>
        </div>
        <p class="activity-text">${escapeHtml(event.text || '')}</p>
        ${renderActivityActions(event.actions)}
      </div>
    </article>
  `).join('');
}

function renderActivityActions(actions = []) {
  if (!Array.isArray(actions) || !actions.length) return '';

  const buttons = actions.map((action, index) => `
    <button
      type="button"
      class="activity-action${action.style === 'secondary' ? ' secondary' : ''}"
      data-action-type="${escapeHtml(action.type)}"
      data-action-index="${index}"
    >${escapeHtml(action.label)}</button>
  `).join('');

  return `<div class="activity-actions">${buttons}</div>`;
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
  const button = event.target.closest('[data-action-type]');
  if (!button) return;

  const type = button.dataset.actionType;
  await runActivityAction(type);
}

async function runActivityAction(type) {
  switch (type) {
    case 'open-cart':
      handleViewCart();
      break;
    case 'new-list':
      handleNewTask();
      showUserNotice('Ready for a new shopping list.', 'info');
      break;
    case 'focus-shopping-tab':
      await focusCurrentShoppingTab();
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
  const data = await chrome.storage.local.get(['extensionPlan']);
  chrome.tabs.create({ url: data.extensionPlan?.upgradeUrl || 'https://heysalad.app' });
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
      addActivityEvent({
        kind: 'shopping',
        title: 'Added to cart',
        text: `${item.name}${item.price ? ` for £${item.price.toFixed(2)}` : ''} was added to the cart.`,
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
