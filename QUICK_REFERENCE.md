# 📱 → 💻 Mobile-to-Extension Quick Reference

## Flow Overview

```
Extension Shows QR → Mobile Scans → API Stores List → Extension Polls → Shopping Starts
```

## For Users

### Extension (Desktop)
1. Open Sally extension
2. Click **"Show QR Code"**
3. Wait for mobile to scan
4. Shopping starts automatically

### Mobile (Phone)
1. Open Sally Mobile
2. Create shopping list
3. Tap QR scan button
4. Point at computer screen
5. Tap "Send List"

## For Developers

### API Endpoints
```
GET  /api/extension/session/:id           # Extension polls
POST /api/extension/session/:id/send-list # Mobile sends
POST /api/extension/session/:id/progress  # Extension updates
```

### QR Format
```
heysalad://extension-link?session=ext_timestamp_random
```

### Session Storage
```
Key: extension_session:ext_...
TTL: 900 seconds (15 minutes)
Storage: Cloudflare KV
```

### Extension Functions
```javascript
showExtensionQR()           // Generate QR
startSessionPolling(id)     // Poll API
startSessionTimer(expires)  // Countdown
startShoppingFromMobile()   // Auto-start
closeExtensionQR()          // Cleanup
```

### Mobile Handler
```typescript
handleExtensionQR(sessionId)  // Process scan
```

## Testing

### Quick Test
```bash
1. Extension: Click "Show QR Code"
2. Mobile: Scan QR
3. Verify: Shopping starts
```

### API Test
```bash
curl https://sally-api.heysalad-o.workers.dev/api/extension/session/ext_test_123
```

## Deployment

### Sally API
```bash
cd sally-api && wrangler deploy
```

### Extension
```bash
chrome://extensions/ → Load unpacked
```

### Mobile
```bash
cd sally-mobile && eas build --platform ios
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| QR not showing | Check QRCode library loaded |
| Mobile can't scan | Check camera permissions |
| Extension not polling | Check API deployed |
| Session expired | Regenerate QR (15 min limit) |
| Shopping won't start | Check console logs |

## Files

| File | Purpose |
|------|---------|
| `sally-api/src/routes/extension.ts` | API routes |
| `heysalad-ai-shopper/popup/popup.js` | Extension logic |
| `sally-mobile/app/qr-scan.tsx` | Mobile handler |

## Key Metrics

| Metric | Target |
|--------|--------|
| QR Generation | < 1s |
| Scan Time | < 2s |
| API Response | < 500ms |
| Detection | < 2s |

## Security

- ✅ Random session IDs
- ✅ 15-minute expiry
- ✅ User auth required
- ✅ HTTPS only

## Status

✅ Implementation Complete
⏳ Testing Required
⏳ Deployment Pending

---

**Quick Start**: Load extension → Show QR → Scan with mobile → Done!

