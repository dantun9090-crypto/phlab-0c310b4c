/**
 * Cumulative Layout Shift (CLS) Prevention Utilities
 * Measures scrollbar width and prevents body shifts when modals open
 */

// Measure scrollbar width and set CSS variable
export function initScrollbarWidth() {
  if (typeof window === 'undefined') return;
  
  // Create temporary element to measure scrollbar
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll';
  outer.style.width = '100px';
  outer.style.height = '100px';
  document.body.appendChild(outer);
  
  const inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.height = '100%';
  outer.appendChild(inner);
  
  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  document.body.removeChild(outer);
  
  // Set CSS variable for use in modals
  document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
  
  return scrollbarWidth;
}

// Prevent body scroll and compensate for scrollbar width
export function lockBodyScroll() {
  if (typeof window === 'undefined') return () => {};
  
  const scrollY = window.scrollY;
  const scrollbarWidth = getComputedStyle(document.documentElement)
    .getPropertyValue('--scrollbar-width') || '0px';
  
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.paddingRight = scrollbarWidth;
  document.body.classList.add('modal-open');
  
  // Return unlock function
  return () => unlockBodyScroll(scrollY);
}

// Restore body scroll
export function unlockBodyScroll(scrollY: number) {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.paddingRight = '';
  document.body.classList.remove('modal-open');
  
  window.scrollTo(0, scrollY);
}

// Preload critical images to prevent LCP shift
export function preloadImage(src: string) {
  if (typeof window === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  document.head.appendChild(link);
}

// Load fonts with display: swap to prevent FOIT
export function loadFontsOptimized() {
  if (typeof window === 'undefined') return;
  
  // Check if fonts are already loaded
  if (document.body.classList.contains('fonts-loaded')) return;
  
  // Use CSS Font Loading API if available
  if ('fonts' in document) {
    Promise.all([
      document.fonts.load('400 1em Inter'),
      document.fonts.load('600 1em Inter'),
      document.fonts.load('700 1em Inter'),
    ]).then(() => {
      document.body.classList.add('fonts-loaded');
    }).catch(() => {
      // Fallback to system fonts
      console.warn('Font loading failed, using system fonts');
    });
  } else {
    // Fallback: assume fonts loaded after 3s
    setTimeout(() => {
      document.body.classList.add('fonts-loaded');
    }, 3000);
  }
}

// Initialize all CLS prevention measures
export function initCLSPrevention() {
  if (typeof window === 'undefined') return;
  
  // Measure scrollbar width on load
  initScrollbarWidth();
  
  // Re-measure on window resize (e.g., when scrollbar appears/disappears)
  let resizeTimer: NodeJS.Timeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      initScrollbarWidth();
    }, 150);
  });
  
  // Load fonts optimally
  loadFontsOptimized();
}

// Add explicit dimensions to images without them
export function addImageDimensions(img: HTMLImageElement) {
  if (img.hasAttribute('width') && img.hasAttribute('height')) return;
  
  // If image is already loaded, get natural dimensions
  if (img.complete && img.naturalWidth) {
    img.setAttribute('width', String(img.naturalWidth));
    img.setAttribute('height', String(img.naturalHeight));
  } else {
    // Wait for load
    img.addEventListener('load', function() {
      if (!img.hasAttribute('width') && img.naturalWidth) {
        img.setAttribute('width', String(img.naturalWidth));
        img.setAttribute('height', String(img.naturalHeight));
      }
    }, { once: true });
  }
}

// Scan page for images missing dimensions and fix them
export function fixImageDimensions() {
  if (typeof window === 'undefined') return;
  
  const images = document.querySelectorAll('img:not([width]):not([height])');
  images.forEach((img) => {
    addImageDimensions(img as HTMLImageElement);
  });
}

// Observe new images added to DOM
export function observeNewImages() {
  if (typeof window === 'undefined' || !('MutationObserver' in window)) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // ELEMENT_NODE
          const element = node as Element;
          
          // Check if added node is an image
          if (element.tagName === 'IMG') {
            addImageDimensions(element as HTMLImageElement);
          }
          
          // Check for images in added subtree
          const images = element.querySelectorAll('img:not([width]):not([height])');
          images.forEach((img) => {
            addImageDimensions(img as HTMLImageElement);
          });
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  return observer;
}

// Performance mark for CLS measurement
export function markCLS(value: number, entries: any[]) {
  if (typeof window === 'undefined') return;
  
  console.log(`[CLS] Current: ${value.toFixed(4)}`, entries);
  
  // Send to analytics if available
  if ((window as any).gtag) {
    (window as any).gtag('event', 'cls_measurement', {
      value: Math.round(value * 1000),
      metric_id: 'v3-cls',
    });
  }
}
