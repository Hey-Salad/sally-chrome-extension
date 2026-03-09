/**
 * QR Scanner for Sally Extension
 * Uses jsQR library for QR code detection
 */

// Import jsQR from CDN (will be loaded in HTML)
// <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>

class QRScanner {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.stream = null;
    this.scanning = false;
    this.onScanCallback = null;
    this.currentFacingMode = 'environment'; // Start with back camera
  }

  async init(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    await this.startCamera();
  }

  async startCamera() {
    try {
      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      this.video.srcObject = this.stream;
      await this.video.play();
      
      // Start scanning
      this.scanning = true;
      this.scan();
      
      return true;
    } catch (error) {
      console.error('[QR Scanner] Camera access error:', error);
      throw new Error('Camera access denied. Please allow camera access in your browser settings.');
    }
  }

  async switchCamera() {
    // Toggle between front and back camera
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    
    // Stop current stream
    this.stop();
    
    // Start with new facing mode
    await this.startCamera();
  }

  scan() {
    if (!this.scanning) return;
    
    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      // Set canvas size to match video
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      
      // Draw video frame to canvas
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      
      // Get image data
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      
      if (code) {
        console.log('[QR Scanner] QR code detected:', code.data);
        this.scanning = false;
        
        if (this.onScanCallback) {
          this.onScanCallback(code.data);
        }
        
        return;
      }
    }
    
    // Continue scanning
    requestAnimationFrame(() => this.scan());
  }

  onScan(callback) {
    this.onScanCallback = callback;
  }

  stop() {
    this.scanning = false;
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}

// Export for use in popup.js
window.QRScanner = QRScanner;
