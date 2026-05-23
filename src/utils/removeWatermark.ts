// Remove Wegic watermark from DOM
export function removeWatermark() {
  if (typeof window === 'undefined') return;

  const removeElements = () => {
    // Safety check: ensure body exists
    if (!document.body) return;

    // Find all elements containing "wegic" or "watermark" in various attributes
    const selectors = [
      '[class*="wegic" i]',
      '[class*="watermark" i]',
      '[id*="wegic" i]',
      '[id*="watermark" i]',
      'a[href*="wegic.ai"]',
      'a[href*="wegic.com"]',
    ];

    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          el.remove();
        });
      } catch (e) {
        // Ignore selector errors
      }
    });

    // Remove elements with "Made in Wegic" text
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToRemove: Node[] = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.toLowerCase().includes('wegic') || 
          node.textContent?.toLowerCase().includes('made in')) {
        const parent = node.parentElement;
        if (parent && parent !== document.body && parent !== document.documentElement) {
          nodesToRemove.push(parent);
        }
      }
    }

    nodesToRemove.forEach(node => {
      try {
        node.parentNode?.removeChild(node);
      } catch (e) {
        // Ignore errors
      }
    });

    // Remove any fixed/absolute positioned elements at bottom-right (common watermark position)
    document.querySelectorAll('[style*="fixed"], [style*="absolute"]').forEach(el => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      const position = style.position;
      const bottom = style.bottom;
      const right = style.right;
      
      if ((position === 'fixed' || position === 'absolute') && 
          (bottom === '0px' || right === '0px' || bottom === '20px' || right === '20px')) {
        const text = htmlEl.textContent?.toLowerCase() || '';
        if (text.includes('wegic') || text.includes('made')) {
          htmlEl.remove();
        }
      }
    });
  };

  // Run after body is ready
  if (document.body) {
    removeElements();
  }

  // Run after DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeElements);
  }

  // Run periodically to catch dynamically added watermarks
  const observer = new MutationObserver(() => {
    removeElements();
  });

  // Only observe if body exists
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // MutationObserver above handles all dynamic changes — no interval needed
}
