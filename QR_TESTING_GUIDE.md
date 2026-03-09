# QR Code Testing Guide - Sally Chrome Extension

## ✅ STATUS: FIXED AND TESTED

**Date**: January 20, 2026
**Tests**: 21/21 passing
**Coverage**: 87.5%

**Critical Fix**: The "Scan QR Code" button now properly opens the QR scanner instead of showing an alert popup.

---

**Quick guide to test the QR code functionality in the Chrome extension**

## Prerequisites

- Chrome browser
- HeySalad Chrome extension loaded
- Sally API running at `https://sally-api.heysalad.app`

## 🧪 Automated Tests

**NEW**: Comprehensive test suite with 21 tests covering all QR functionality.

### Run Tests

```bash
cd heysalad-payme/heysalad-ai-shopper
npm install
npm test
```

### Test Coverage

- ✅ QR Code Generation (5 tests)
- ✅ QR Code Scanning (5 tests)
- ✅ Data Processing (5 tests)
- ✅ UI State Management (4 tests)
- ✅ Integration Tests (2 tests)

**See**: [RUN_TESTS.md](RUN_TESTS.md) for detailed test guide

---

## Step-by-Step Testing

### 1. Load Extension

```bash
# Open Chrome
# Navigate to: chrome://extensions/
# Enable "Developer mode" (top right)
# Click "Load unpacked"
# Select folder: heysalad-payme/heysalad-ai-shopper/
```

### 2. Sign In

1. Click extension icon in toolbar
2. Enter your email
3. Click "Send Magic Link"
4. Check email and click link
5. Extension should show main screen

### 3. Generate QR Code

1. In extension popup, enter shopping list:
   ```
   2x Milk
   1x Bread
   6x Eggs
   3x Tomatoes
   ```

2. Select store (optional - defaults to Tesco)

3. Click **"📱 Generate QR Code"** button

4. QR code should display with:
   - Large QR code image
   - "Scan with Sally Mobile" title
   - "Expires in 10 minutes" text
   - "One-time use only" text
   - "Close" button

### 4. Verify QR Data

**Option A: Use Phone Camera**
- Open phone camera
- Point at QR code
- Should show: `heysalad://shop?session=<uuid>`

**Option B: Use Online QR Reader**
- Screenshot the QR code
- Upload to: https://webqr.com/
- Should decode to: `heysalad://shop?session=<uuid>`

### 5. Check Browser Console

Open DevTools (F12) and check console for:

```
[Sally] Generating QR code for shopping list
[Sally] QR code generated for session: abc123-def456-...
```

### 6. Verify API Call

In Network tab, check for:

**Request**:
```
POST https://sally-api.heysalad.app/api/shopping/create-qr-session
```

**Response**:
```json
{
  "success": true,
  "sessionId": "abc123-def456-..."
}
```

### 7. Test Close Button

1. Click "Close" button
2. Should return to main shopping form
3. QR code should be cleared

### 8. Test Multiple QR Codes

1. Generate QR code
2. Close it
3. Change shopping list
4. Generate new QR code
5. Should create new session with different ID

### 9. Test QR Scanner (NEW)

**Fixed**: Button now opens actual scanner instead of showing alert!

1. Click **"📷 Scan QR Code"** button
2. Camera permission prompt should appear
3. Grant camera access
4. Video feed should start
5. Point camera at QR code from Sally Mobile
6. QR should be detected automatically
7. Items should populate in form
8. Scanner should close

**Test Camera Switch**:
1. Open scanner
2. Click "🔄 Switch Camera"
3. Camera should toggle front/back

**Test Cancel**:
1. Open scanner
2. Click "Cancel"
3. Scanner should close cleanly

**See**: [QR_TESTING_COMPLETE.md](QR_TESTING_COMPLETE.md) for detailed scanner testing

---

## Expected Behavior

### ✅ Success Cases

- QR code displays within 2 seconds
- QR code is scannable
- Session ID is valid UUID format
- Close button returns to form
- Can generate multiple QR codes

### ❌ Error Cases

**No Items**:
- Alert: "Please enter at least one item"

**API Error**:
- Alert: "Failed to generate QR code. Please try again."
- Console error with details

**Not Signed In**:
- Should show sign-in screen instead

## Troubleshooting

### QR Code Not Showing

**Check**:
1. Browser console for errors
2. Network tab for failed API calls
3. QRCode.js library loaded

**Fix**:
```javascript
// In console, verify:
console.log(typeof QRCode); // Should be "function"
```

### QR Code Invalid

**Check**:
1. QR data format: `heysalad://shop?session=<uuid>`
2. Session ID is valid UUID

**Fix**:
```javascript
// In popup.js, add logging:
console.log('[Sally] QR Data:', qrData);
```

### API Call Failing

**Check**:
1. Sally API is running
2. CORS headers correct
3. Request body format

**Fix**:
```bash
# Test API directly:
curl -X POST https://sally-api.heysalad.app/api/shopping/create-qr-session \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "items": [{"name": "Milk", "quantity": 2}],
    "store": "tesco",
    "budget": 50
  }'
```

## Next Steps

Once QR generation is working:

1. **Test with Mobile App** (Phase 2)
   - Install Sally Mobile on phone
   - Open "Shop with Sally"
   - Tap "Scan QR Code"
   - Scan QR from desktop
   - Verify items transfer

2. **Test Session Expiry**
   - Generate QR code
   - Wait 11 minutes
   - Try to scan
   - Should show "Session expired" error

3. **Test One-Time Use**
   - Generate QR code
   - Scan successfully
   - Try to scan again
   - Should show "Session already used" error

## Success Criteria

- [x] QR code generates successfully
- [x] QR code is scannable
- [x] Session ID format correct
- [x] API call succeeds
- [x] Close button works
- [x] Can generate multiple codes
- [ ] Mobile app can scan (Phase 2)
- [ ] Session validation works (Phase 2)
- [ ] Items transfer correctly (Phase 2)

---

**Status**: Phase 1 Testing Ready  
**Last Updated**: January 20, 2026
