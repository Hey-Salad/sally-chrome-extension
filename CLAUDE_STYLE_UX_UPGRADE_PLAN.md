# Claude-Style UX Upgrade Plan for HeySalad AI Shopper Extension

## Executive Summary

Transform the HeySalad AI Shopper Chrome extension from a floating overlay design to a polished, Claude-style side panel experience with native Chrome integration.

**Current State**: Popup-based extension with floating overlays on supermarket pages
**Target State**: Side panel integration with tab connection indicators and native Chrome UI

---

## Key Improvements Inspired by Claude Extension

### 1. **Side Panel Integration** (Primary Change)
**Current**: Extension uses popup (400px width) that closes when clicking outside
**Target**: Chrome Side Panel API for persistent, native-feeling interface

**Benefits**:
- Stays open while browsing
- Doesn't block page content
- Native Chrome UI integration
- Better for multi-step workflows

**Implementation**:
```json
// manifest.json changes
{
  "manifest_version": 3,
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ]
}
```

### 2. **Tab Connection Indicators**
**Current**: No visual indication of which tab is being monitored
**Target**: Badge on extension icon showing active tab connection

**Visual Indicators**:
- 🟢 Green badge: "Shopping" - actively adding items
- 🟡 Yellow badge: "Ready" - connected to supported store
- 🔴 Red badge: "Error" - something went wrong
- ⚪ No badge: Not connected

**Implementation**:
```javascript
// Update badge when tab changes or shopping starts
chrome.action.setBadgeText({ text: '🛒', tabId: tabId });
chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
chrome.action.setTitle({ 
  title: 'Sally is shopping at Tesco', 
  tabId: tabId 
});
```

### 3. **Top-Left Corner Indicator**
**Current**: Floating overlay that can be intrusive
**Target**: Subtle, fixed indicator in top-left corner (like Claude's)

**Design**:
```css
.sally-indicator {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 999999;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sally-indicator:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}

.sally-indicator-icon {
  width: 16px;
  height: 16px;
  animation: pulse 2s ease-in-out infinite;
}

.sally-indicator-text {
  white-space: nowrap;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

**States**:
- **Idle**: "Sally • Ready to shop"
- **Searching**: "Sally • Searching for milk..." (with spinner)
- **Adding**: "Sally • Adding to cart..." (with progress)
- **Complete**: "Sally • 5 items added ✓" (with checkmark)

### 4. **Native Chrome Design Language**
**Current**: Custom styling that doesn't match Chrome
**Target**: Match Chrome's Material Design 3 aesthetic

**Design System**:
```css
:root {
  /* Chrome's color palette */
  --chrome-primary: #1a73e8;
  --chrome-surface: #ffffff;
  --chrome-surface-variant: #f1f3f4;
  --chrome-on-surface: #202124;
  --chrome-on-surface-variant: #5f6368;
  --chrome-outline: #dadce0;
  --chrome-error: #d93025;
  --chrome-success: #1e8e3e;
  
  /* Spacing (8px grid) */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Typography */
  --font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.1);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.15);
}
```

---

## Implementation Phases

### Phase 1: Side Panel Migration (Week 1)
**Goal**: Convert popup to side panel

**Tasks**:
1. Create `sidepanel/` directory structure
2. Update manifest.json with side_panel configuration
3. Migrate popup.html → sidepanel.html
4. Migrate popup.js → sidepanel.js
5. Update CSS for side panel width (320-400px)
6. Test side panel opening/closing

**Files to Create**:
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.js`
- `sidepanel/sidepanel.css`

**Manifest Changes**:
```json
{
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "permissions": ["sidePanel"]
}
```

### Phase 2: Tab Connection Indicators (Week 1)
**Goal**: Add visual indicators for active tab monitoring

**Tasks**:
1. Implement badge system in service worker
2. Add tab change listeners
3. Update badge on shopping state changes
4. Add tooltip with shopping status
5. Test badge updates across tabs

**Service Worker Updates**:
```javascript
// Track active shopping tabs
const activeShoppingTabs = new Map();

// Update badge when shopping starts
function updateTabBadge(tabId, status) {
  const badges = {
    shopping: { text: '🛒', color: '#4CAF50', title: 'Sally is shopping' },
    ready: { text: '✓', color: '#FFA726', title: 'Ready to shop' },
    error: { text: '!', color: '#F44336', title: 'Error occurred' },
    complete: { text: '✓', color: '#66BB6A', title: 'Shopping complete' }
  };
  
  const badge = badges[status] || badges.ready;
  
  chrome.action.setBadgeText({ text: badge.text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: badge.color, tabId });
  chrome.action.setTitle({ title: badge.title, tabId });
  
  activeShoppingTabs.set(tabId, status);
}

// Clear badge when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  activeShoppingTabs.delete(tabId);
});

// Update badge when switching tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const status = activeShoppingTabs.get(tabId);
  if (status) {
    updateTabBadge(tabId, status);
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
```

### Phase 3: Corner Indicator (Week 2)
**Goal**: Replace floating overlay with subtle corner indicator

**Tasks**:
1. Design minimal corner indicator component
2. Implement show/hide animations
3. Add click handler to open side panel
4. Update content script to use new indicator
5. Remove old overlay code

**Content Script Updates**:
```javascript
// Create corner indicator
function createCornerIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'sally-corner-indicator';
  indicator.innerHTML = `
    <div class="sally-indicator-icon">
      <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="Sally" />
    </div>
    <div class="sally-indicator-text">Sally</div>
    <div class="sally-indicator-status">Ready</div>
  `;
  
  // Click to open side panel
  indicator.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  });
  
  document.body.appendChild(indicator);
  return indicator;
}

// Update indicator status
function updateIndicatorStatus(status, message) {
  const indicator = document.querySelector('.sally-corner-indicator');
  if (!indicator) return;
  
  const statusEl = indicator.querySelector('.sally-indicator-status');
  statusEl.textContent = message;
  
  indicator.className = `sally-corner-indicator sally-status-${status}`;
}

// Show indicator when on supported store
if (isSupportedStore(window.location.hostname)) {
  createCornerIndicator();
  updateIndicatorStatus('ready', 'Ready to shop');
}
```

### Phase 4: Native Chrome Styling (Week 2)
**Goal**: Match Chrome's Material Design 3 aesthetic

**Tasks**:
1. Create Chrome-style design system CSS
2. Update all UI components to use new styles
3. Implement proper spacing (8px grid)
4. Add smooth transitions and animations
5. Test across different Chrome themes

**CSS Framework**:
```css
/* Base styles matching Chrome */
body {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--chrome-on-surface);
  background: var(--chrome-surface);
  margin: 0;
  padding: 0;
}

/* Chrome-style buttons */
.chrome-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chrome-button-primary {
  background: var(--chrome-primary);
  color: white;
}

.chrome-button-primary:hover {
  background: #1557b0;
  box-shadow: var(--shadow-md);
}

.chrome-button-secondary {
  background: var(--chrome-surface-variant);
  color: var(--chrome-on-surface);
}

.chrome-button-secondary:hover {
  background: #e8eaed;
}

/* Chrome-style inputs */
.chrome-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--chrome-outline);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--chrome-on-surface);
  background: var(--chrome-surface);
  transition: border-color 0.2s ease;
}

.chrome-input:focus {
  outline: none;
  border-color: var(--chrome-primary);
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.1);
}

/* Chrome-style cards */
.chrome-card {
  background: var(--chrome-surface);
  border: 1px solid var(--chrome-outline);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

/* Chrome-style list items */
.chrome-list-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease;
}

.chrome-list-item:hover {
  background: var(--chrome-surface-variant);
}
```

### Phase 5: Enhanced Features Integration (Week 3)
**Goal**: Integrate Tavily AI search and Browserless automation

**Tasks**:
1. Add configuration UI for API keys
2. Implement Tavily search toggle
3. Add Browserless cloud mode option
4. Create multi-store comparison view
5. Test enhanced features end-to-end

**Side Panel Configuration Section**:
```html
<div class="config-section">
  <h3>Enhanced Features</h3>
  
  <div class="feature-toggle">
    <div class="toggle-header">
      <span class="toggle-icon">🔍</span>
      <span class="toggle-title">Tavily AI Search</span>
      <label class="toggle-switch">
        <input type="checkbox" id="tavily-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <p class="toggle-description">
      Use advanced AI to find the best product matches across stores
    </p>
    <div class="toggle-config" id="tavily-config" style="display: none;">
      <input 
        type="password" 
        class="chrome-input" 
        placeholder="Tavily API Key (tvly-...)" 
        id="tavily-key"
      />
    </div>
  </div>
  
  <div class="feature-toggle">
    <div class="toggle-header">
      <span class="toggle-icon">☁️</span>
      <span class="toggle-title">Cloud Automation</span>
      <label class="toggle-switch">
        <input type="checkbox" id="browserless-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <p class="toggle-description">
      Fully autonomous shopping using cloud browsers (Beta)
    </p>
    <div class="toggle-config" id="browserless-config" style="display: none;">
      <input 
        type="password" 
        class="chrome-input" 
        placeholder="Browserless API Key" 
        id="browserless-key"
      />
    </div>
  </div>
</div>
```

### Phase 6: Polish & Testing (Week 3-4)
**Goal**: Final polish and comprehensive testing

**Tasks**:
1. Add loading states and skeletons
2. Implement error boundaries
3. Add keyboard shortcuts
4. Test on all supported stores
5. Performance optimization
6. Accessibility audit (WCAG 2.1 AA)
7. Cross-browser testing (Chrome, Edge, Brave)

---

## File Structure (New)

```
heysalad-ai-shopper/
├── manifest.json (updated)
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.js
│   ├── sidepanel.css
│   └── components/
│       ├── shopping-list.js
│       ├── progress-tracker.js
│       ├── store-comparison.js
│       └── settings-panel.js
├── background/
│   ├── service-worker.js (updated)
│   ├── tab-manager.js (new)
│   └── badge-controller.js (new)
├── content-scripts/
│   ├── base.js (updated)
│   ├── corner-indicator.js (new)
│   └── corner-indicator.css (new)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── shared/
    ├── chrome-styles.css (new)
    └── utils.js
```

---

## Key Differences: Current vs. Claude-Style

| Feature | Current | Claude-Style Target |
|---------|---------|---------------------|
| **UI Container** | Popup (400px) | Side Panel (320-400px) |
| **Persistence** | Closes on outside click | Stays open while browsing |
| **Tab Indicator** | None | Badge on extension icon |
| **Page Indicator** | Floating overlay | Subtle corner indicator |
| **Design Language** | Custom styling | Chrome Material Design 3 |
| **Navigation** | Multiple sections in popup | Smooth transitions in side panel |
| **Progress Updates** | Popup must be open | Real-time in side panel |
| **Multi-tab Support** | Limited | Full support with badges |

---

## Benefits of Claude-Style UX

### 1. **Better User Experience**
- Side panel doesn't block page content
- Persistent interface for long shopping sessions
- Clear visual feedback on which tab is active
- Native Chrome feel (users already familiar)

### 2. **Improved Workflow**
- Users can browse products while Sally shops
- Real-time progress updates without opening popup
- Easy to switch between tabs and monitor multiple stores
- Corner indicator is less intrusive than overlay

### 3. **Professional Polish**
- Matches Chrome's design language
- Consistent with other professional extensions
- Better accessibility (keyboard navigation, screen readers)
- Smooth animations and transitions

### 4. **Technical Advantages**
- Side Panel API is more stable than popup
- Better state management (doesn't close unexpectedly)
- Easier to implement complex workflows
- Better performance (persistent DOM)

---

## Migration Strategy

### For Existing Users
1. **Automatic Update**: Extension updates via Chrome Web Store
2. **First Launch**: Show onboarding explaining new side panel
3. **Keyboard Shortcut**: Add `Ctrl+Shift+S` to open side panel
4. **Migration Notice**: "Sally has a new home! Click here to open the side panel"

### Backward Compatibility
- Keep popup as fallback for older Chrome versions
- Detect Side Panel API availability
- Graceful degradation if API not supported

```javascript
// Feature detection
async function initializeUI() {
  if (chrome.sidePanel) {
    // Use side panel (Chrome 114+)
    await chrome.sidePanel.setOptions({
      path: 'sidepanel/sidepanel.html',
      enabled: true
    });
  } else {
    // Fallback to popup
    console.warn('Side Panel API not available, using popup fallback');
    chrome.action.setPopup({ popup: 'popup/popup.html' });
  }
}
```

---

## Success Metrics

### User Experience
- ✅ Side panel opens in <100ms
- ✅ Tab badge updates in real-time
- ✅ Corner indicator is visible but not intrusive
- ✅ All interactions feel native to Chrome
- ✅ Smooth animations (60fps)

### Technical
- ✅ Side Panel API integration complete
- ✅ Badge system working across all tabs
- ✅ Corner indicator responsive on all stores
- ✅ Chrome design system fully implemented
- ✅ No console errors or warnings

### Business
- ✅ User retention increases by 20%
- ✅ Shopping completion rate improves
- ✅ Positive user reviews mentioning UX
- ✅ Lower support tickets about UI confusion

---

## Next Steps

1. **Review this plan** with the team
2. **Create GitHub issues** for each phase
3. **Set up development environment** with Chrome Canary (for Side Panel API)
4. **Start Phase 1** (Side Panel Migration)
5. **Weekly demos** to stakeholders

---

## Resources

### Chrome APIs
- [Side Panel API Documentation](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [Action API (Badges)](https://developer.chrome.com/docs/extensions/reference/action/)
- [Material Design 3](https://m3.material.io/)

### Design References
- Claude Chrome Extension (study their UX patterns)
- Chrome DevTools (for native Chrome styling)
- Google Keep Extension (side panel example)

### Testing Tools
- Chrome Extension Testing Framework
- Puppeteer for automated testing
- Lighthouse for performance audits

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Author**: Kiro AI Assistant  
**Status**: Ready for Implementation
