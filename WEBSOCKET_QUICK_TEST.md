# WebSocket Quick Test Guide

## Quick Test Checklist

### 1. Load Extension with WebSocket Client

```bash
# Navigate to extension directory
cd heysalad-payme/heysalad-ai-shopper

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select heysalad-ai-shopper folder
```

### 2. Test WebSocket Connection

Open extension background page console:
1. Go to `chrome://extensions`
2. Find "Sally by HeySalad®"
3. Click "Inspect views: background page"

**Check for logs**:
```
[WebSocket] Client initialized for session: SESSION_ID
[WebSocket] Connecting to: wss://sally-api.heysalad-o.workers.dev/ws?session=SESSION_ID&type=extension
[WebSocket] Extension connected to session: SESSION_ID
[WebSocket] Connection confirmed: {...}
```

### 3. Test Message Sending

In background page console:

```javascript
// Check WebSocket status
wsClient.getStatus()
// Should show: { isConnected: true, sessionId: "...", ... }

// Send test progress update
wsClient.sendProgress({
  percentage: 50,
  itemsAdded: 6,
  totalItems: 12,
  currentItem: 'Test Item'
});

// Check console for:
// [WebSocket] Sent: progress
```

### 4. Test with Mobile App

**Mobile App Side**:
1. Open Sally Mobile App
2. Create a shopping list
3. Tap "Shop with Sally"
4. Generate QR code

**Extension Side**:
1. Scan QR code with extension
2. Watch console for:
   ```
   [Sally] Sync session changed, initializing WebSocket: SESSION_ID
   [WebSocket] Client initialized for session: SESSION_ID
   [WebSocket] Extension connected to session: SESSION_ID
   ```

**Start Shopping**:
1. Mobile app sends start command
2. Extension receives and starts shopping
3. Extension sends real-time progress updates
4. Mobile app receives updates instantly (<100ms!)

### 5. Test Reconnection

In background page console:

```javascript
// Disconnect
wsClient.disconnect();

// Wait 2 seconds, should auto-reconnect
// Check console for:
// [WebSocket] Reconnecting in 2000ms (attempt 1/5)
// [WebSocket] Extension connected to session: SESSION_ID
```

### 6. Test Error Handling

```javascript
// Send error to mobile
wsClient.sendError('Test error message', { code: 'TEST_ERROR' });

// Check console for:
// [WebSocket] Sent: error
```

## Expected Performance

### Latency Test

**Before (HTTP Polling)**:
- Progress update: 2-5 seconds
- Item added: 2-5 seconds
- Shopping complete: 2-5 seconds

**After (WebSocket)**:
- Progress update: <100ms ✅
- Item added: <100ms ✅
- Shopping complete: <100ms ✅

**Improvement**: 20-50x faster!

### Bandwidth Test

**Before (HTTP Polling)**:
- Requests per session: 20-30
- Data transferred: ~50KB

**After (WebSocket)**:
- Requests per session: 1 ✅
- Data transferred: ~5KB ✅

**Reduction**: 90% less bandwidth!

## Troubleshooting

### WebSocket not connecting

**Check**:
```javascript
// In background page console
wsClient.getStatus()
// Should show: { isConnected: true, ... }

// If false, check:
console.log(wsClient.reconnectAttempts); // Should be < 5
console.log(wsClient.sessionId); // Should be valid UUID
```

**Fix**:
```javascript
// Manually reconnect
wsClient.connect();
```

### Messages not received

**Check**:
```javascript
// Verify connection
wsClient.isConnected // Should be true

// Check message handlers
wsClient.messageHandlers.size // Should be > 0
```

**Fix**:
```javascript
// Re-register handlers
wsClient.on('progress', (payload) => {
  console.log('Progress:', payload);
});
```

### Session not found

**Check**:
```javascript
// Get sync session from storage
chrome.storage.local.get(['syncSession'], (data) => {
  console.log('Sync session:', data.syncSession);
});
```

**Fix**:
1. Scan QR code again from mobile app
2. Check that session ID matches on both sides

## Success Criteria

✅ WebSocket connects automatically when QR code is scanned
✅ Connection confirmed message received
✅ Progress updates sent instantly (<100ms)
✅ Mobile app receives updates in real-time
✅ Reconnection works after disconnect
✅ Error handling works correctly
✅ No console errors

## Next Steps

Once extension WebSocket is working:

1. **Integrate in Mobile App** - Add WebSocket client to Sally Mobile
2. **Remove HTTP Polling** - Replace legacy polling with WebSocket
3. **Test End-to-End** - Full shopping flow with real-time updates
4. **Monitor Performance** - Track latency and bandwidth savings
5. **Deploy to Production** - Roll out to all users

---

**Status**: Ready for testing
**Performance Target**: <100ms latency (20-50x faster than HTTP polling)
**Cost**: $5-10/month for 10,000 users

