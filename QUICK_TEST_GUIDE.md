# 🧪 Quick Test Guide - Mobile-to-Extension QR Flow

## Prerequisites

- ✅ Sally API deployed with extension routes
- ✅ Chrome extension loaded (unpacked)
- ✅ Sally Mobile app installed
- ✅ User signed in on mobile

## Test 1: Extension QR Generation (2 minutes)

### Steps
1. Open Chrome
2. Click Sally extension icon
3. Sign in if needed
4. Click **"Show QR Code"** button

### Expected Results
✅ QR code displays
✅ Timer shows "Expires in 15:00"
✅ Status shows "⏳ Waiting for mobile app to send shopping list..."
✅ Console shows: `[Sally] Extension QR displayed, session: ext_...`

### Troubleshooting
❌ **QR doesn't show**: Check if QRCode library loaded
❌ **No session ID**: Check console for errors
❌ **Timer not counting**: Refresh extension

## Test 2: Mobile QR Scanning (3 minutes)

### Steps
1. Open Sally Mobile app
2. Create a shopping list (or use existing)
3. Tap QR scan button
4. Point camera at extension QR on screen
5. Wait for scan

### Expected Results
✅ Camera opens
✅ QR detected
✅ Alert shows: "Send Shopping List"
✅ Tap "Send List"
✅ Success message: "Shopping list sent to your computer"
✅ Console shows: `[QRScan] Extension QR scanned, session: ext_...`

### Troubleshooting
❌ **Camera won't open**: Check permissions
❌ **QR not detected**: Ensure good lighting, hold steady
❌ **"Invalid QR code"**: Regenerate QR on extension
❌ **API error**: Check Sally API is deployed

## Test 3: Extension Receives List (1 minute)

### Steps
1. After mobile sends list
2. Watch extension popup
3. Wait up to 2 seconds

### Expected Results
✅ Status changes to "✅ Shopping list received! Starting..."
✅ QR section closes
✅ Main section shows
✅ Form populated with items
✅ Shopping starts automatically
✅ Console shows: `[Sally] Starting shopping from mobile`

### Troubleshooting
❌ **No update**: Check API polling (should be every 2s)
❌ **Session expired**: Regenerate QR
❌ **Items not populated**: Check API response format

## Test 4: End-to-End Flow (5 minutes)

### Complete Flow Test

1. **Extension**: Click "Show QR Code"
2. **Mobile**: Scan QR code
3. **Mobile**: Send shopping list
4. **Extension**: Verify list received
5. **Extension**: Watch shopping start
6. **Extension**: Monitor progress
7. **Extension**: Verify completion

### Success Criteria
✅ QR generated in < 1 second
✅ Mobile scans successfully
✅ API receives list
✅ Extension detects list in < 2 seconds
✅ Shopping starts automatically
✅ Items added to cart
✅ Completion screen shows

## Test 5: Error Scenarios (3 minutes)

### Test Session Expiration
1. Generate QR
2. Wait 15 minutes
3. Try to scan

**Expected**: "Session expired" message

### Test Invalid QR
1. Create fake QR: `heysalad://extension-link?session=invalid`
2. Scan with mobile

**Expected**: Error message or no action

### Test No Shopping List
1. Mobile has no shopping list
2. Scan extension QR

**Expected**: "No Shopping List" alert

### Test Network Failure
1. Disable internet on mobile
2. Try to send list

**Expected**: Network error message

## API Testing (Optional)

### Test Session Creation
```bash
# Extension should create session in KV
# Check Cloudflare dashboard → KV → SESSIONS
# Look for key: extension_session:ext_...
```

### Test Session Retrieval
```bash
curl https://sally-api.heysalad-o.workers.dev/api/extension/session/ext_test_123
```

**Expected**:
```json
{
  "status": "expired"
}
```

### Test Send List
```bash
curl -X POST https://sally-api.heysalad-o.workers.dev/api/extension/session/ext_test_123/send-list \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"name": "Milk", "quantity": 2},
      {"name": "Bread", "quantity": 1}
    ],
    "store": "tesco",
    "user_id": "test_user"
  }'
```

**Expected**:
```json
{
  "success": true
}
```

## Performance Benchmarks

| Metric | Target | Acceptable |
|--------|--------|------------|
| QR Generation | < 1s | < 2s |
| QR Scan | < 2s | < 5s |
| API Response | < 500ms | < 1s |
| Extension Detection | < 2s | < 5s |
| Shopping Start | < 3s | < 10s |

## Common Issues

### Issue: QR Code Not Displaying
**Cause**: QRCode library not loaded
**Fix**: Check `popup.html` includes `qrcode.min.js`

### Issue: Extension Not Polling
**Cause**: Polling interval not started
**Fix**: Check `startSessionPolling()` is called

### Issue: Mobile Can't Send List
**Cause**: API endpoint not deployed
**Fix**: Deploy Sally API with extension routes

### Issue: Session Expired Immediately
**Cause**: Clock skew or TTL too short
**Fix**: Check server time, verify 900s TTL

### Issue: Shopping Doesn't Start
**Cause**: `handleStartShopping()` not called
**Fix**: Check `startShoppingFromMobile()` implementation

## Success Checklist

Before marking as complete, verify:

- [ ] Extension QR generates successfully
- [ ] Mobile can scan QR code
- [ ] API receives shopping list
- [ ] Extension detects list within 2 seconds
- [ ] Shopping starts automatically
- [ ] Items populate correctly
- [ ] Progress updates work
- [ ] Completion screen shows
- [ ] Session expires after 15 minutes
- [ ] Error messages are clear
- [ ] No console errors
- [ ] Performance meets targets

## Next Steps After Testing

1. **If all tests pass**: Deploy to production
2. **If tests fail**: Check troubleshooting section
3. **If API issues**: Check Cloudflare logs
4. **If extension issues**: Check Chrome console
5. **If mobile issues**: Check React Native logs

## Support

**Issues**: Check console logs first
**API Errors**: Check Cloudflare Workers logs
**Extension Errors**: Check Chrome DevTools
**Mobile Errors**: Check React Native debugger

---

**Test Duration**: ~15 minutes
**Difficulty**: Easy
**Prerequisites**: All components deployed

