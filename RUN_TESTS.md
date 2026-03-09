# Quick Test Guide - Sally Chrome Extension

## 🚀 Quick Start

```bash
# Navigate to extension directory
cd heysalad-payme/heysalad-ai-shopper

# Install dependencies (first time only)
npm install

# Run all tests
npm test
```

---

## 📋 Test Commands

### Run All Tests
```bash
npm test
```

### Run QR Tests Only
```bash
npm run test:qr
```

### Watch Mode (auto-rerun on changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

---

## ✅ Expected Output

```
PASS  __tests__/qr-functionality.test.js
  QR Code Generation
    ✓ should generate QR code with valid items
    ✓ should show error when no items entered
    ✓ should encode items correctly in QR payload
    ✓ should work without authentication
    ✓ should show different instructions based on auth status
  QR Code Scanning
    ✓ should initialize camera successfully
    ✓ should handle camera access denied
    ✓ should detect QR code successfully
    ✓ should switch between front and back camera
    ✓ should stop camera stream properly
  QR Data Processing
    ✓ should parse valid QR data
    ✓ should reject invalid QR format
    ✓ should reject expired QR codes
    ✓ should reject QR with no items
    ✓ should handle items with different quantities
  UI State Management
    ✓ should show scanner section when opening
    ✓ should hide scanner section when closing
    ✓ should update status messages correctly
    ✓ should show and hide error messages
  Integration Tests
    ✓ should complete full QR generation flow
    ✓ should complete full QR scanning flow

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        2.345s
```

---

## 📊 Coverage Report

```
File                | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
popup.js            |   85.2  |   78.5   |   82.1  |   86.3
qr-scanner.js       |   92.1  |   85.3   |   90.0  |   93.4
--------------------|---------|----------|---------|--------
All files           |   87.5  |   80.2   |   84.8  |   88.6
```

---

## 🐛 Troubleshooting

### Tests Fail to Run

**Problem**: `npm test` command not found

**Solution**:
```bash
# Make sure you're in the right directory
cd heysalad-payme/heysalad-ai-shopper

# Install dependencies
npm install
```

### Jest Not Found

**Problem**: `jest: command not found`

**Solution**:
```bash
# Install Jest globally (optional)
npm install -g jest

# Or use npx
npx jest
```

### Module Not Found Errors

**Problem**: `Cannot find module 'jest-environment-jsdom'`

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

---

## 📝 Test Files

- `__tests__/qr-functionality.test.js` - Main test suite (21 tests)
- `__tests__/setup.js` - Jest configuration and mocks
- `package.json` - Test scripts and dependencies

---

## 🎯 What's Tested

### QR Generation (5 tests)
- Valid item generation
- Empty item validation
- Payload encoding
- Auth-less operation
- Auth-based UI

### QR Scanning (5 tests)
- Camera initialization
- Permission handling
- QR detection
- Camera switching
- Stream cleanup

### Data Processing (5 tests)
- Valid data parsing
- Format validation
- Age validation
- Empty list rejection
- Quantity handling

### UI Management (4 tests)
- Section visibility
- Status updates
- Error messages

### Integration (2 tests)
- Full generation flow
- Full scanning flow

---

## 🔗 More Info

- [Complete Testing Guide](QR_TESTING_COMPLETE.md)
- [Fix Summary](../QR_SCANNER_FIX_SUMMARY.md)

---

**Quick Check**: Run `npm test` - should see 21 passing tests ✅
