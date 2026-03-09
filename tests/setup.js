/**
 * Jest Setup File
 * Configures global mocks and utilities for tests
 */

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
  tabs: {
    create: jest.fn(),
    query: jest.fn()
  }
};

// Mock QRCode library
global.QRCode = jest.fn(function(element, options) {
  this.element = element;
  this.options = options;
  
  // Simulate QR code generation
  if (element) {
    element.innerHTML = '<canvas></canvas>';
  }
});

global.QRCode.CorrectLevel = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};

// Mock jsQR library
global.jsQR = jest.fn();

// Mock navigator.mediaDevices
global.navigator.mediaDevices = {
  getUserMedia: jest.fn()
};

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((callback) => {
  setTimeout(callback, 0);
  return 1;
});

// Mock alert
global.alert = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Helper to create mock video element
global.createMockVideo = () => ({
  srcObject: null,
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  readyState: 4, // HAVE_ENOUGH_DATA
  videoWidth: 640,
  videoHeight: 480,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
});

// Helper to create mock canvas element
global.createMockCanvas = () => ({
  width: 0,
  height: 0,
  getContext: jest.fn(() => ({
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(640 * 480 * 4),
      width: 640,
      height: 480
    })),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn()
  }))
});

// Helper to create mock media stream
global.createMockMediaStream = () => ({
  getTracks: jest.fn(() => [{
    stop: jest.fn(),
    getSettings: jest.fn(() => ({
      facingMode: 'environment'
    }))
  }]),
  getVideoTracks: jest.fn(() => [{
    stop: jest.fn()
  }])
});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset navigator.mediaDevices mock
  global.navigator.mediaDevices.getUserMedia.mockResolvedValue(
    global.createMockMediaStream()
  );
});
