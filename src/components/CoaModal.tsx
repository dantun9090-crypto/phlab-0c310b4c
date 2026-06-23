import { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, FileText } from 'lucide-react';

interface CoaModalProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  productName: string;
  filename?: string;
  batch?: string;
  uploadedAt?: string;
}

export function CoaModal({ open, onClose, pdfUrl, productName, filename, batch, uploadedAt }: CoaModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const proxiedPdfUrl = useMemo(() => {
    const params = new URLSearchParams({ url: pdfUrl });
    if (filename) params.set('filename', filename);
    return `/api/public/coa-pdf?${params.toString()}`;
  }, [pdfUrl, filename]);

  const downloadUrl = `${proxiedPdfUrl}&download=1`;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    closeBtnRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [open, onClose]);

  const formattedDate = uploadedAt
    ? (() => {
        try {
          return new Date(uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="coa-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coa-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-5xl h-[92vh] bg-[#0b1a30] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/10 bg-[#0a1628] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2 id="coa-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
                    Certificate of Analysis
                  </h2>
                  <p className="text-[11px] sm:text-xs text-[#8aabcf] truncate">
                    {productName}
                    {batch ? ` · Batch ${batch}` : ''}
                    {formattedDate ? ` · ${formattedDate}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={proxiedPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open certificate in new tab"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
                <a
                  href={downloadUrl}
                  download={filename || `${productName.replace(/[^a-zA-Z0-9-]/g, '_')}-COA.pdf`}
                  aria-label="Download certificate PDF"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Download</span>
                </a>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close certificate viewer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* PDF viewer */}
            <div className="flex-1 bg-[#1a1a2e]">
              <iframe
                src={`${proxiedPdfUrl}#view=FitH&toolbar=1`}
                title={`Certificate of Analysis — ${productName}`}
                className="w-full h-full border-0"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
