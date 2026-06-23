import { useState } from 'react';
import { FileText } from 'lucide-react';
import { CoaModal } from './CoaModal';
import type { Product } from '@/lib/firebase';

interface CoaButtonProps {
  product: Pick<Product, 'name' | 'coaPdfUrl' | 'coaPdfName' | 'coaBatch' | 'coaUploadedAt'>;
  className?: string;
}

/**
 * Prominent "Click to see COA HPLC Test Certificate" button.
 * Rendered directly below the main product image.
 * Disabled state when no certificate is configured for this product.
 */
export function CoaButton({ product, className = '' }: CoaButtonProps) {
  const [open, setOpen] = useState(false);
  const hasCertificate = !!product.coaPdfUrl;

  return (
    <>
      <button
        type="button"
        onClick={() => hasCertificate && setOpen(true)}
        disabled={!hasCertificate}
        aria-label={
          hasCertificate
            ? `View Certificate of Analysis for ${product.name}`
            : `Certificate of Analysis unavailable for ${product.name}`
        }
        aria-haspopup="dialog"
        className={[
          'w-full h-14 rounded-2xl font-semibold text-sm tracking-wide',
          'flex items-center justify-center gap-2.5 transition-all duration-200',
          'border',
          hasCertificate
            ? 'bg-[#0b1a30] text-white border-blue-500/40 hover:border-blue-400 hover:bg-[#0e2240] hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-[0_4px_24px_rgba(37,99,235,0.18)] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none'
            : 'bg-white/[0.04] text-[#5a7493] border-white/[0.06] cursor-not-allowed',
          className,
        ].join(' ')}
      >
        <FileText className={`w-5 h-5 ${hasCertificate ? 'text-blue-400' : ''}`} aria-hidden="true" />
        <span>
          {hasCertificate
            ? 'Click to see COA HPLC Test Certificate'
            : 'Certificate unavailable'}
        </span>
      </button>

      {hasCertificate && product.coaPdfUrl && (
        <CoaModal
          open={open}
          onClose={() => setOpen(false)}
          pdfUrl={product.coaPdfUrl}
          productName={product.name}
          filename={product.coaPdfName}
          batch={product.coaBatch}
          uploadedAt={product.coaUploadedAt}
        />
      )}
    </>
  );
}
