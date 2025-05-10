const imagesArea = document.getElementById('imagesArea');
const progressBar = document.querySelector('.progress-bar');
const startButton = document.getElementById('startProcessing');
let cropManagers = [];

class CropManager {
  constructor(container, img, aspectRatio) {
    this.container = container;
    this.img = img;
    this.aspectRatio = aspectRatio;
    this.naturalWidth = img.naturalWidth;
    this.naturalHeight = img.naturalHeight;
    this.init();
  }

  init() {
    this.createElements();
    this.addEventListeners();
    this.centerCrop();
  }

  createElements() {
    this.cropOverlay = document.createElement('div');
    this.cropOverlay.className = 'crop-overlay';
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'resize-handle';
    this.cropOverlay.appendChild(this.resizeHandle);
    this.container.appendChild(this.cropOverlay);
  }

  getScaleFactor() {
    return this.img.width / this.naturalWidth;
  }

  centerCrop() {
    const scale = this.getScaleFactor();
    const initialSize = Math.min(this.naturalWidth, this.naturalHeight) * 0.6;
    let width = initialSize;
    let height = initialSize;

    if(this.aspectRatio !== 'free') {
      const ratio = parseFloat(this.aspectRatio);
      width = initialSize;
      height = width / ratio;
      if(height > this.naturalHeight) {
        height = this.naturalHeight * 0.8;
        width = height * ratio;
      }
    }

    this.cropOverlay.style.width = `${width * scale}px`;
    this.cropOverlay.style.height = `${height * scale}px`;
    this.cropOverlay.style.left = `${(this.img.width - (width * scale))/2}px`;
    this.cropOverlay.style.top = `${(this.img.height - (height * scale))/2}px`;
  }

  addEventListeners() {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let isResizing = false;
    let startWidth, startHeight, startRX, startRY;

    const handleMove = (e) => {
      if (!isDragging && !isResizing) return;
      e.preventDefault();
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      if (isDragging) {
        const dx = clientX - startX;
        const dy = clientY - startY;

        const newLeft = Math.max(0, Math.min(
          startLeft + dx,
          this.img.width - this.cropOverlay.offsetWidth
        ));
        
        const newTop = Math.max(0, Math.min(
          startTop + dy,
          this.img.height - this.cropOverlay.offsetHeight
        ));

        this.cropOverlay.style.left = `${newLeft}px`;
        this.cropOverlay.style.top = `${newTop}px`;
      }

      if (isResizing) {
        const dx = clientX - startRX;
        const dy = clientY - startRY;
        const scale = this.getScaleFactor();

        let newWidth = (startWidth / scale) + (dx / scale);
        let newHeight = (startHeight / scale) + (dy / scale);

        if (this.aspectRatio !== 'free') {
          const ratio = parseFloat(this.aspectRatio);
          newHeight = newWidth / ratio;
        }

        newWidth = Math.max(50, Math.min(newWidth, 
          this.naturalWidth - (parseFloat(this.cropOverlay.style.left) / scale)
        ));
        
        newHeight = Math.max(50, Math.min(newHeight,
          this.naturalHeight - (parseFloat(this.cropOverlay.style.top) / scale)
        ));

        this.cropOverlay.style.width = `${newWidth * scale}px`;
        this.cropOverlay.style.height = `${newHeight * scale}px`;
      }
    };

    this.cropOverlay.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(this.cropOverlay.style.left);
      startTop = parseFloat(this.cropOverlay.style.top);
    });

    this.resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizing = true;
      startRX = e.clientX;
      startRY = e.clientY;
      startWidth = parseFloat(this.cropOverlay.style.width);
      startHeight = parseFloat(this.cropOverlay.style.height);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      isResizing = false;
    });

    document.addEventListener('mousemove', handleMove);

    this.cropOverlay.addEventListener('touchstart', (e) => {
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLeft = parseFloat(this.cropOverlay.style.left);
      startTop = parseFloat(this.cropOverlay.style.top);
    });

    this.resizeHandle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isResizing = true;
      startRX = e.touches[0].clientX;
      startRY = e.touches[0].clientY;
      startWidth = parseFloat(this.cropOverlay.style.width);
      startHeight = parseFloat(this.cropOverlay.style.height);
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
      isResizing = false;
    });

    document.addEventListener('touchmove', handleMove);
  }

  getCropData() {
    const scale = this.getScaleFactor();
    return {
      x: parseFloat(this.cropOverlay.style.left) / scale,
      y: parseFloat(this.cropOverlay.style.top) / scale,
      width: parseFloat(this.cropOverlay.style.width) / scale,
      height: parseFloat(this.cropOverlay.style.height) / scale
    };
  }
}

async function processImage(container, manager, minBytes, maxBytes, outputFormat) {
  const cropData = manager.getCropData();
  const img = container.querySelector('img');
  
  // Create canvas with natural dimensions
  let canvas = document.createElement('canvas');
  canvas.width = cropData.width;
  canvas.height = cropData.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(
    img,
    cropData.x, cropData.y, cropData.width, cropData.height,
    0, 0, canvas.width, canvas.height
  );

  let quality = 0.9;
  let currentDataUrl;
  let fileSize;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  do {
    // Convert to Data URL and measure size
    currentDataUrl = canvas.toDataURL(outputFormat, quality);
    fileSize = Math.floor((currentDataUrl.split(',')[1].length * 3) / 4);

    // Scale up if below minimum size
    if (fileSize < minBytes && attempts < MAX_ATTEMPTS) {
      const sizeRatio = minBytes / fileSize;
      const scale = Math.min(4, Math.sqrt(sizeRatio) * 1.2);
      
      const newCanvas = document.createElement('canvas');
      newCanvas.width = Math.ceil(canvas.width * scale);
      newCanvas.height = Math.ceil(canvas.height * scale);
      
      const newCtx = newCanvas.getContext('2d');
      newCtx.imageSmoothingQuality = 'high';
      newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
      
      canvas = newCanvas;
      quality = 0.9; // Reset quality after scaling
      attempts++;
      continue;
    }

    // Adjust quality for max size
    while (fileSize > maxBytes && quality > 0.1) {
      quality = Math.max(0.1, quality - 0.03);
      currentDataUrl = canvas.toDataURL(outputFormat, quality);
      fileSize = Math.floor((currentDataUrl.split(',')[1].length * 3) / 4);
    }

    // Final check and small scale-up if needed
    if (fileSize < minBytes && attempts < MAX_ATTEMPTS) {
      const scale = Math.sqrt(minBytes / fileSize) * 1.1;
      const newCanvas = document.createElement('canvas');
      newCanvas.width = Math.ceil(canvas.width * scale);
      newCanvas.height = Math.ceil(canvas.height * scale);
      
      const newCtx = newCanvas.getContext('2d');
      newCtx.imageSmoothingQuality = 'high';
      newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
      
      canvas = newCanvas;
      quality = 0.9;
      attempts++;
    }
  } while (fileSize < minBytes && attempts < MAX_ATTEMPTS);

  // Final quality adjustment
  currentDataUrl = canvas.toDataURL(outputFormat, quality);
  fileSize = Math.floor((currentDataUrl.split(',')[1].length * 3) / 4);

  // Ultimate fallback - force minimum size
  if (fileSize < minBytes) {
    const scale = Math.sqrt(minBytes / fileSize) * 1.15;
    const newCanvas = document.createElement('canvas');
    newCanvas.width = Math.ceil(canvas.width * scale);
    newCanvas.height = Math.ceil(canvas.height * scale);
    
    const newCtx = newCanvas.getContext('2d');
    newCtx.imageSmoothingQuality = 'high';
    newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
    
    currentDataUrl = newCanvas.toDataURL(outputFormat, 0.9);
  }

  return currentDataUrl;
}

document.getElementById('imageInput').addEventListener('change', function(e) {
  imagesArea.innerHTML = '';
  cropManagers = [];
  Array.from(e.target.files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = function() {
        const container = document.createElement('div');
        container.className = 'image-container';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-wrapper';
        
        img.className = 'preview-image';
        wrapper.appendChild(img);
        
        container.appendChild(wrapper);
        imagesArea.appendChild(container);

        const cm = new CropManager(
          wrapper,
          img,
          document.getElementById('aspectRatio').value
        );
        cropManagers.push({ container, manager: cm });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
});

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  progressBar.style.width = '0%';
  
  const minKB = parseInt(document.getElementById('minSize').value);
  const maxKB = parseInt(document.getElementById('maxSize').value);
  const outputFormat = document.getElementById('outputFormat').value;
  
  const total = cropManagers.length;
  let processed = 0;

  for (const { container, manager } of cropManagers) {
    const oldLinks = container.querySelectorAll('.download-link');
    oldLinks.forEach(link => link.remove());

    try {
      const dataUrl = await processImage(
        container,
        manager,
        minKB * 1024,
        maxKB * 1024,
        outputFormat
      );

      const fileSizeKB = Math.round((dataUrl.split(',')[1].length * 3) / 4096);
      const link = document.createElement('a');
      link.className = 'download-link';
      link.href = dataUrl;
      link.download = `image_${processed + 1}.${outputFormat.split('/')[1]}`;
      link.textContent = `Download (${fileSizeKB}KB) ${processed + 1}`;
      container.appendChild(link);
    } catch (error) {
      console.error('Processing error:', error);
    }

    processed++;
    progressBar.style.width = `${(processed / total) * 100}%`;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  startButton.disabled = false;
});

document.getElementById('aspectRatio').addEventListener('change', () => {
  const ratio = document.getElementById('aspectRatio').value;
  cropManagers.forEach(({ manager }) => {
    manager.aspectRatio = ratio;
    manager.centerCrop();
  });
});
