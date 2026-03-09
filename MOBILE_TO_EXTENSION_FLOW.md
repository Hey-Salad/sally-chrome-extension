# 📱 → 💻 Mobile-to-Extension Shopping Flow

## The Correct Flow

### Problem with Previous Approach
❌ Extension trying to scan QR from mobile (requires camera permissions - headache!)
❌ Camera access denied errors
❌ Complex camera handling in browser extension

### New Approach (Much Better!)
✅ **Extension displays QR code** (no camera needed!)
✅ **Mobile app scans extension's QR code**
✅ **Mobile sends shopping list to extension via API**
✅ **Extension starts shopping automatically**
✅ **Mobile shows real-time progress**

## Architecture

```
┌─────────────────┐                    ┌──────────────────┐
│  Sally Mobile   │                    │ Chrome Extension │
│                 │                    │                  │
│  1. User taps   │                    │  1. Shows QR     │
│  "Shop with     │                    │     with session │
│   Sally"        │                    │     token        │
│                 │                    │                  │
│  2. Scans QR ───┼───────────────────>│  2. QR contains  │
│     from        │                    │     session_id   │
│     extension   │                    │                  │
│                 │                    │                  │
│  3. Sends list  │                    │                  │
│     to API ─────┼──> Sally API ──────>│  3. Extension    │
│                 │    (Cloudflare)    │     polls API    │
│                 │                    │     for list     │
│  4. Shows       │                    │                  │
│     progress ◄──┼──── Webhooks ◄─────┤  4. Starts       │
│     updates     │                    │     shopping     │
└─────────────────┘                    └──────────────────┘
```

## Implementation Steps

### 1. Extension: Generate Session & Show QR

```javascript
// When extension opens, create session
async function initializeExtensionSession() {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + (15 * 60 * 1000); // 15 min
  
  // Store session
  await chrome.storage.local.set({
    extensionSession: {
      session_id: sessionId,
      created_at: Date.now(),
      expires_at: expiresAt,
      status: 'waiting' // waiting, active, shopping, complete
    }
  });
  
  // Generate QR code with session ID
  const qrData = `heysalad://extension-link?session=${sessionId}`;
  displayQRCode(qrData);
  
  // Start polling for shopping list
  startPollingForList(sessionId);
}

// Poll Sally API for shopping list
async function startPollingForList(sessionId) {
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `https://sally-api.heysalad-o.workers.dev/api/extension/session/${sessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        }
      );
      
      const data = await response.json();
      
      if (data.shopping_list) {
        clearInterval(pollInterval);
        startShopping(data.shopping_list, data.store);
      }
      
      if (data.status === 'expired') {
        clearInterval(pollInterval);
        showError('Session expired. Please scan again.');
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 2000); // Poll every 2 seconds
  
  // Stop polling after 15 minutes
  setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000);
}
```

### 2. Mobile App: Scan QR & Send List

```typescript
// Sally Mobile - QR Scanner
async function handleExtensionQRScan(qrData: string) {
  // Parse QR data
  const url = new URL(qrData);
  const sessionId = url.searchParams.get('session');
  
  if (!sessionId) {
    throw new Error('Invalid QR code');
  }
  
  // Get current shopping list
  const shoppingList = await getActiveShoppingList();
  
  if (!shoppingList || shoppingList.items.length === 0) {
    Alert.alert('No Shopping List', 'Please create a shopping list first');
    return;
  }
  
  // Send list to extension via API
  const response = await fetch(
    `https://sally-api.heysalad-o.workers.dev/api/extension/session/${sessionId}/send-list`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        items: shoppingList.items,
        store: shoppingList.store || 'tesco',
        user_id: user.id
      })
    }
  );
  
  const result = await response.json();
  
  if (result.success) {
    // Navigate to progress screen
    navigation.navigate('ShoppingProgress', {
      sessionId: sessionId,
      extensionMode: true
    });
  }
}
```

### 3. Sally API: Session Management

```typescript
// sally-api/src/routes/extension.ts

interface ExtensionSession {
  session_id: string;
  user_id?: string;
  shopping_list?: ShoppingList;
  store?: string;
  status: 'waiting' | 'active' | 'shopping' | 'complete' | 'expired';
  created_at: number;
  expires_at: number;
  progress?: ShoppingProgress;
}

// Create session (called by extension)
app.post('/api/extension/session/create', async (c) => {
  const { user_id } = await c.req.json();
  
  const sessionId = generateSessionId();
  const session: ExtensionSession = {
    session_id: sessionId,
    user_id,
    status: 'waiting',
    created_at: Date.now(),
    expires_at: Date.now() + (15 * 60 * 1000)
  };
  
  // Store in KV with 15 min TTL
  await c.env.KV.put(
    `extension_session:${sessionId}`,
    JSON.stringify(session),
    { expirationTtl: 900 }
  );
  
  return c.json({ success: true, session_id: sessionId });
});

// Get session status (polled by extension)
app.get('/api/extension/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  
  const sessionData = await c.env.KV.get(`extension_session:${sessionId}`);
  
  if (!sessionData) {
    return c.json({ status: 'expired' });
  }
  
  const session: ExtensionSession = JSON.parse(sessionData);
  
  // Check expiration
  if (Date.now() > session.expires_at) {
    await c.env.KV.delete(`extension_session:${sessionId}`);
    return c.json({ status: 'expired' });
  }
  
  return c.json(session);
});

// Receive shopping list from mobile (sent by mobile app)
app.post('/api/extension/session/:sessionId/send-list', async (c) => {
  const sessionId = c.req.param('sessionId');
  const { items, store, user_id } = await c.req.json();
  
  const sessionData = await c.env.KV.get(`extension_session:${sessionId}`);
  
  if (!sessionData) {
    return c.json({ error: 'Session expired' }, 404);
  }
  
  const session: ExtensionSession = JSON.parse(sessionData);
  
  // Update session with shopping list
  session.shopping_list = { items };
  session.store = store;
  session.user_id = user_id;
  session.status = 'active';
  
  await c.env.KV.put(
    `extension_session:${sessionId}`,
    JSON.stringify(session),
    { expirationTtl: 900 }
  );
  
  return c.json({ success: true });
});

// Update progress (called by extension during shopping)
app.post('/api/extension/session/:sessionId/progress', async (c) => {
  const sessionId = c.req.param('sessionId');
  const progress = await c.req.json();
  
  const sessionData = await c.env.KV.get(`extension_session:${sessionId}`);
  
  if (!sessionData) {
    return c.json({ error: 'Session expired' }, 404);
  }
  
  const session: ExtensionSession = JSON.parse(sessionData);
  session.progress = progress;
  session.status = 'shopping';
  
  await c.env.KV.put(
    `extension_session:${sessionId}`,
    JSON.stringify(session),
    { expirationTtl: 900 }
  );
  
  // Optionally: Send webhook to mobile app
  if (session.user_id) {
    await notifyMobileApp(session.user_id, progress);
  }
  
  return c.json({ success: true });
});
```

### 4. Mobile App: Real-time Progress

```typescript
// Sally Mobile - Shopping Progress Screen
export function ShoppingProgressScreen({ route }) {
  const { sessionId, extensionMode } = route.params;
  const [progress, setProgress] = useState(null);
  
  useEffect(() => {
    if (!extensionMode) return;
    
    // Poll for progress updates
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `https://sally-api.heysalad-o.workers.dev/api/extension/session/${sessionId}`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`
            }
          }
        );
        
        const data = await response.json();
        
        if (data.progress) {
          setProgress(data.progress);
        }
        
        if (data.status === 'complete') {
          clearInterval(interval);
          showCompletionScreen();
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [sessionId, extensionMode]);
  
  return (
    <View>
      <Text>Sally is shopping on your computer...</Text>
      {progress && (
        <>
          <ProgressBar value={progress.percentage} />
          <Text>{progress.itemsAdded} of {progress.totalItems} items added</Text>
          <FlatList
            data={progress.items}
            renderItem={({ item }) => (
              <View>
                <Text>{item.name}</Text>
                <Text>{item.status}</Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}
```

## Benefits of This Approach

✅ **No camera permissions needed on desktop**
✅ **Simpler UX** - just scan QR from extension
✅ **Real-time sync** - mobile sees progress instantly
✅ **Works with existing autonomous shopping**
✅ **Secure** - session tokens expire after 15 min
✅ **Scalable** - uses Cloudflare KV for session storage

## User Flow

1. **User opens Chrome extension**
   - Extension shows QR code with session ID
   - "Scan this QR code with Sally Mobile to start shopping"

2. **User opens Sally Mobile app**
   - Taps "Shop with Sally"
   - Selects "Scan Extension QR Code"
   - Points camera at computer screen

3. **Mobile scans QR code**
   - Extracts session ID
   - Sends current shopping list to API
   - Navigates to progress screen

4. **Extension receives list**
   - Polling detects new shopping list
   - Starts autonomous shopping
   - Sends progress updates to API

5. **Mobile shows progress**
   - Polls API for updates
   - Shows real-time item status
   - Notifies when complete

## Next Steps

1. ✅ Remove camera scanner from extension
2. ✅ Add QR code display to extension popup
3. ✅ Implement session management in Sally API
4. ✅ Add QR scanner to Sally Mobile
5. ✅ Implement progress polling in mobile app
6. ✅ Test end-to-end flow
