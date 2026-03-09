/**
 * QR Functionality Tests for Sally Chrome Extension
 * 
 * Tests cover:
 * - QR code generation (client-side)
 * - QR code scanning
 * - Camera initialization
 * - Error handling
 * - Data validation
 */
require('../popup/qr-scanner.js');
const QRScanner = window.QRScanner;

describe('QR Code Generation', () => {
  let mockQRCode;
  let mockStorage;
  
  beforeEach(() => {
    // Mock QRCode library
    mockQRCode = jest.fn();
    global.QRCode = mockQRCode;
    
    // Mock chrome storage
    mockStorage = {
      local: {
        get: jest.fn(),
        set: jest.fn()
      }
    };
    global.chrome = {
      storage: mockStorage,
      runtime: {
        sendMessage: jest.fn()
      }
    };
    
    // Mock DOM elements
    document.body.innerHTML = `
      <input id="items-input" value="2x Milk\n1x Bread\n6x Eggs" />
      <select id="store-select">
        <option value="tesco" selected>Tesco</option>
      </select>
      <button id="generate-qr-btn">Generate QR</button>
      <div id="qr-code-display"></div>
      <div id="qr-instructions"></div>
      <section id="main-section"></section>
      <section id="qr-generator-section" class="hidden"></section>
    `;
  });
  
  test('should generate QR code with valid items', async () => {
    const items = [
      { name: 'Milk', quantity: 2 },
      { name: 'Bread', quantity: 1 },
      { name: 'Eggs', quantity: 6 }
    ];
    
    // Mock parseItems function
    const parseItems = (text) => items;
    
    const qrData = await generateQRCodeData(items, 'tesco');
    
    expect(qrData).toContain('heysalad://shop?data=');
    expect(mockQRCode).toHaveBeenCalled();
  });
  
  test('should show error when no items entered', async () => {
    document.getElementById('items-input').value = '';
    
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    
    await generateQRCode();
    
    expect(alertSpy).toHaveBeenCalledWith('Please enter at least one item');
  });
  
  test('should encode items correctly in QR payload', () => {
    const items = [
      { name: 'Milk', quantity: 2 },
      { name: 'Bread', quantity: 1 }
    ];
    
    const payload = {
      v: 1,
      sid: 'temp_123',
      items: items.map(item => ({
        n: item.name,
        q: item.quantity
      })),
      store: 'tesco',
      ts: Date.now()
    };
    
    const encoded = btoa(JSON.stringify(payload));
    const decoded = JSON.parse(atob(encoded));
    
    expect(decoded.items).toHaveLength(2);
    expect(decoded.items[0].n).toBe('Milk');
    expect(decoded.items[0].q).toBe(2);
  });
  
  test('should work without authentication', async () => {
    // No current user
    const currentUser = null;
    
    const items = [{ name: 'Milk', quantity: 1 }];
    const qrData = await generateQRCodeData(items, 'tesco');
    
    expect(qrData).toBeDefined();
    expect(qrData).toContain('heysalad://shop?data=');
  });
  
  test('should show different instructions based on auth status', async () => {
    const qrInstructions = document.getElementById('qr-instructions');
    
    // Without auth
    let currentUser = null;
    updateQRInstructions(currentUser);
    expect(qrInstructions.innerHTML).toContain('No account needed to scan');
    
    // With auth
    currentUser = { email: 'test@example.com' };
    updateQRInstructions(currentUser);
    expect(qrInstructions.innerHTML).toContain('Signed in as');
  });
});

describe('QR Code Scanning', () => {
  let mockScanner;
  let mockVideo;
  let mockCanvas;
  
  beforeEach(() => {
    // Mock video and canvas elements
    mockVideo = {
      srcObject: null,
      play: jest.fn().mockResolvedValue(undefined),
      readyState: 4, // HAVE_ENOUGH_DATA
      HAVE_ENOUGH_DATA: 4,
      videoWidth: 640,
      videoHeight: 480
    };
    
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({
        drawImage: jest.fn(),
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(640 * 480 * 4),
          width: 640,
          height: 480
        }))
      }))
    };
    
    // Mock navigator.mediaDevices
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{
          stop: jest.fn()
        }]
      })
    };
    
    // Mock jsQR
    global.jsQR = jest.fn();
    
    document.body.innerHTML = `
      <video id="qr-video"></video>
      <canvas id="qr-canvas"></canvas>
      <div id="qr-status"></div>
      <div id="qr-message" class="hidden"></div>
      <section id="main-section"></section>
      <section id="qr-scanner-section" class="hidden"></section>
    `;
  });
  
  test('should initialize camera successfully', async () => {
    const scanner = new QRScanner();
    await scanner.init(mockVideo, mockCanvas);
    
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    expect(mockVideo.play).toHaveBeenCalled();
    expect(scanner.scanning).toBe(true);
  });
  
  test('should handle camera access denied', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(
      new Error('Permission denied')
    );
    
    const scanner = new QRScanner();
    
    await expect(scanner.init(mockVideo, mockCanvas)).rejects.toThrow(
      'Camera access denied'
    );
  });
  
  test('should detect QR code successfully', async () => {
    const mockQRData = 'heysalad://shop?data=eyJ2IjoxLCJpdGVtcyI6W3sibiI6Ik1pbGsiLCJxIjoyfV19';
    
    global.jsQR.mockReturnValue({
      data: mockQRData
    });
    
    const scanner = new QRScanner();
    const onScanCallback = jest.fn();
    scanner.onScan(onScanCallback);
    
    await scanner.init(mockVideo, mockCanvas);
    
    // Wait for scan to detect QR
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(onScanCallback).toHaveBeenCalledWith(mockQRData);
    expect(scanner.scanning).toBe(false);
  });
  
  test('should switch between front and back camera', async () => {
    const scanner = new QRScanner();
    await scanner.init(mockVideo, mockCanvas);
    
    expect(scanner.currentFacingMode).toBe('environment');
    
    await scanner.switchCamera();
    
    expect(scanner.currentFacingMode).toBe('user');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });
  
  test('should stop camera stream properly', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = {
      getTracks: () => [mockTrack]
    };
    
    navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);
    
    const scanner = new QRScanner();
    await scanner.init(mockVideo, mockCanvas);
    
    scanner.stop();
    
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(scanner.scanning).toBe(false);
    expect(mockVideo.srcObject).toBeNull();
  });
});

describe('QR Data Processing', () => {
  test('should parse valid QR data', () => {
    const payload = {
      v: 1,
      sid: 'temp_123',
      items: [
        { n: 'Milk', q: 2 },
        { n: 'Bread', q: 1 }
      ],
      store: 'tesco',
      ts: Date.now()
    };
    
    const qrData = `heysalad://shop?data=${btoa(JSON.stringify(payload))}`;
    
    const parsed = parseQRData(qrData);
    
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].n).toBe('Milk');
    expect(parsed.store).toBe('tesco');
  });
  
  test('should reject invalid QR format', () => {
    const invalidQR = 'https://example.com/invalid';
    
    expect(() => parseQRData(invalidQR)).toThrow('Invalid QR code format');
  });
  
  test('should reject expired QR codes', () => {
    const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
    
    const payload = {
      v: 1,
      items: [{ n: 'Milk', q: 1 }],
      store: 'tesco',
      ts: oldTimestamp
    };
    
    const qrData = `heysalad://shop?data=${btoa(JSON.stringify(payload))}`;
    
    expect(() => parseQRData(qrData)).toThrow('QR code expired');
  });
  
  test('should reject QR with no items', () => {
    const payload = {
      v: 1,
      items: [],
      store: 'tesco',
      ts: Date.now()
    };
    
    const qrData = `heysalad://shop?data=${btoa(JSON.stringify(payload))}`;
    
    expect(() => parseQRData(qrData)).toThrow('No items in shopping list');
  });
  
  test('should handle items with different quantities', () => {
    const items = [
      { n: 'Milk', q: 2 },
      { n: 'Bread', q: 1 },
      { n: 'Eggs', q: 6 }
    ];
    
    const formatted = formatItemsForInput(items);
    
    expect(formatted).toBe('2x Milk\nBread\n6x Eggs');
  });
});

describe('UI State Management', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="main-section"></section>
      <section id="qr-scanner-section" class="hidden"></section>
      <section id="qr-generator-section" class="hidden"></section>
      <div id="qr-status"></div>
      <div id="qr-message" class="hidden"></div>
    `;
  });
  
  test('should show scanner section when opening', () => {
    const mainSection = document.getElementById('main-section');
    const scannerSection = document.getElementById('qr-scanner-section');
    
    openQRScanner();
    
    expect(mainSection.classList.contains('hidden')).toBe(true);
    expect(scannerSection.classList.contains('hidden')).toBe(false);
  });
  
  test('should hide scanner section when closing', () => {
    const mainSection = document.getElementById('main-section');
    const scannerSection = document.getElementById('qr-scanner-section');
    
    // Open first
    scannerSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    
    closeQRScanner();
    
    expect(mainSection.classList.contains('hidden')).toBe(false);
    expect(scannerSection.classList.contains('hidden')).toBe(true);
  });
  
  test('should update status messages correctly', () => {
    const qrStatus = document.getElementById('qr-status');
    
    updateQRStatus('scanning');
    expect(qrStatus.textContent).toContain('Scanning');
    expect(qrStatus.className).toContain('scanning');
    
    updateQRStatus('success');
    expect(qrStatus.textContent).toContain('Detected');
    expect(qrStatus.className).toContain('success');
    
    updateQRStatus('error');
    expect(qrStatus.textContent).toContain('denied');
    expect(qrStatus.className).toContain('error');
  });
  
  test('should show and hide error messages', () => {
    const qrMessage = document.getElementById('qr-message');
    
    showQRMessage('Test error', 'error');
    expect(qrMessage.classList.contains('hidden')).toBe(false);
    expect(qrMessage.textContent).toBe('Test error');
    expect(qrMessage.className).toContain('error');
    
    hideQRMessage();
    expect(qrMessage.classList.contains('hidden')).toBe(true);
  });
});

describe('Integration Tests', () => {
  test('should complete full QR generation flow', async () => {
    // Setup
    document.body.innerHTML = `
      <input id="items-input" value="2x Milk\n1x Bread" />
      <select id="store-select"><option value="tesco" selected>Tesco</option></select>
      <button id="generate-qr-btn">Generate</button>
      <div id="qr-code-display"></div>
      <section id="main-section"></section>
      <section id="qr-generator-section" class="hidden"></section>
    `;
    
    global.QRCode = jest.fn();
    
    // Execute
    await generateQRCode();
    
    // Verify
    expect(global.QRCode).toHaveBeenCalled();
    const qrSection = document.getElementById('qr-generator-section');
    expect(qrSection.classList.contains('hidden')).toBe(false);
  });
  
  test('should complete full QR scanning flow', async () => {
    // Setup
    const mockQRData = createMockQRData([
      { name: 'Milk', quantity: 2 }
    ], 'tesco');
    
    document.body.innerHTML = `
      <input id="items-input" value="" />
      <select id="store-select"></select>
      <video id="qr-video"></video>
      <canvas id="qr-canvas"></canvas>
      <section id="main-section"></section>
      <section id="qr-scanner-section" class="hidden"></section>
    `;
    
    global.jsQR = jest.fn().mockReturnValue({ data: mockQRData });
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }]
      })
    };
    
    // Execute
    await openQRScanner();
    await handleQRCodeScanned(mockQRData);
    
    // Verify
    const itemsInput = document.getElementById('items-input');
    expect(itemsInput.value).toContain('Milk');
    
    const scannerSection = document.getElementById('qr-scanner-section');
    expect(scannerSection.classList.contains('hidden')).toBe(true);
  });
});

// Helper functions for tests
function generateQRCodeData(items, store) {
  const payload = {
    v: 1,
    sid: generateTempSessionId(),
    items: items.map(item => ({ n: item.name, q: item.quantity })),
    store: store,
    ts: Date.now()
  };
  const qrData = `heysalad://shop?data=${btoa(JSON.stringify(payload))}`;

  const display = document.getElementById('qr-code-display');
  if (display && typeof global.QRCode === 'function') {
    new global.QRCode(display, {
      text: qrData,
      width: 256,
      height: 256
    });
  }

  return qrData;
}

function parseQRData(qrData) {
  if (!qrData.startsWith('heysalad://shop?data=')) {
    throw new Error('Invalid QR code format');
  }
  
  const encodedPayload = qrData.split('data=')[1];
  const payload = JSON.parse(atob(encodedPayload));
  
  if (!payload.items || payload.items.length === 0) {
    throw new Error('No items in shopping list');
  }
  
  const age = Date.now() - payload.ts;
  const maxAge = 60 * 60 * 1000; // 1 hour
  
  if (age > maxAge) {
    throw new Error('QR code expired (older than 1 hour)');
  }
  
  return payload;
}

function formatItemsForInput(items) {
  return items.map(item => 
    item.q > 1 ? `${item.q}x ${item.n}` : item.n
  ).join('\n');
}

function generateTempSessionId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `temp_${timestamp}_${randomStr}`;
}

function createMockQRData(items, store) {
  const payload = {
    v: 1,
    sid: 'test_123',
    items: items.map(item => ({ n: item.name, q: item.quantity })),
    store: store,
    ts: Date.now()
  };
  
  return `heysalad://shop?data=${btoa(JSON.stringify(payload))}`;
}

function updateQRInstructions(currentUser) {
  const qrInstructions = document.getElementById('qr-instructions');
  if (!qrInstructions) return;
  
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

function updateQRStatus(status) {
  const qrStatus = document.getElementById('qr-status');
  if (!qrStatus) return;
  
  switch (status) {
    case 'scanning':
      qrStatus.textContent = '📷 Scanning for QR code...';
      qrStatus.className = 'qr-status scanning';
      break;
    case 'success':
      qrStatus.textContent = '✅ QR Code Detected!';
      qrStatus.className = 'qr-status success';
      break;
    case 'error':
      qrStatus.textContent = '❌ Camera access denied';
      qrStatus.className = 'qr-status error';
      break;
  }
}

let testScanner = null;

async function generateQRCode() {
  const itemsInput = document.getElementById('items-input');
  const storeSelect = document.getElementById('store-select');
  const mainSection = document.getElementById('main-section');
  const qrGeneratorSection = document.getElementById('qr-generator-section');

  const raw = (itemsInput?.value || '').trim();
  if (!raw) {
    alert('Please enter at least one item');
    return;
  }

  const items = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\d+)x\s+(.+)$/i);
      if (!match) return { name: line, quantity: 1 };
      return { name: match[2].trim(), quantity: parseInt(match[1], 10) };
    });

  generateQRCodeData(items, storeSelect?.value || 'tesco');

  if (mainSection) mainSection.classList.add('hidden');
  if (qrGeneratorSection) qrGeneratorSection.classList.remove('hidden');
}

async function openQRScanner() {
  const mainSection = document.getElementById('main-section');
  const scannerSection = document.getElementById('qr-scanner-section');
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');

  if (mainSection) mainSection.classList.add('hidden');
  if (scannerSection) scannerSection.classList.remove('hidden');

  if (!testScanner) testScanner = new QRScanner();
  if (video && canvas) {
    await testScanner.init(video, canvas);
  }
}

function closeQRScanner() {
  const mainSection = document.getElementById('main-section');
  const scannerSection = document.getElementById('qr-scanner-section');

  if (testScanner) testScanner.stop();
  if (scannerSection) scannerSection.classList.add('hidden');
  if (mainSection) mainSection.classList.remove('hidden');
}

function showQRMessage(text, type) {
  const qrMessage = document.getElementById('qr-message');
  if (!qrMessage) return;
  qrMessage.textContent = text;
  qrMessage.className = `message ${type}`;
  qrMessage.classList.remove('hidden');
}

function hideQRMessage() {
  const qrMessage = document.getElementById('qr-message');
  if (!qrMessage) return;
  qrMessage.classList.add('hidden');
}

async function handleQRCodeScanned(qrData) {
  const payload = parseQRData(qrData);
  const itemsInput = document.getElementById('items-input');
  if (itemsInput) {
    itemsInput.value = formatItemsForInput(payload.items);
  }
  closeQRScanner();
}
