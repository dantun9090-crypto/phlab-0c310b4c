import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';

/**
 * Modal confirmation for destructive or hard-to-reverse admin actions
 * (delete, cancel, bulk operations). Replaces window.confirm, which is
 * unstyleable, blocks the main thread and shows the browser origin.
 *
 * Rendered via portal so no ancestor transform/overflow can clip it.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f2640] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-white font-semibold">
            {destructive && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
            {title}
          </h3>
          <button
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="text-[#9cb8d9] hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-[#9cb8d9] whitespace-pre-line">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm text-[#9cb8d9] hover:text-white border border-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              destructive ? 'bg-red-500/80 hover:bg-red-500' : 'bg-blue-500/80 hover:bg-blue-500'
            }`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
