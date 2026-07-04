/**
 * Reusable image uploader for admin panels.
 * Uploads to Firebase Storage, returns the public download URL via `onUploaded`.
 */
import { useRef, useState } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  storage,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from '@/lib/firebase';

interface Props {
  /** Storage path prefix without extension, e.g. "newsletter/popup-image". */
  pathPrefix: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void | Promise<void>;
  onRemoved?: () => void | Promise<void>;
  maxSizeMB?: number;
  accept?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export default function ImageUploader({
  pathPrefix,
  currentUrl,
  onUploaded,
  onRemoved,
  maxSizeMB = 2,
  accept = 'image/jpeg,image/png,image/webp',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${maxSizeMB} MB.`);
      return;
    }
    const ext = EXT_MAP[file.type] ?? 'jpg';
    const path = `${pathPrefix}.${ext}`;

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setProgress(0);

    try {
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
          (err) => reject(err),
          () => resolve(),
        );
      });
      const url = await getDownloadURL(ref);
      setPreview(url);
      await onUploaded(url);
      toast.success('Image uploaded.');
    } catch (err) {
      console.error('[ImageUploader] upload failed:', err);
      toast.error('Upload failed. Please try again.');
      setPreview(currentUrl ?? null);
    } finally {
      setProgress(null);
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleRemove = async () => {
    if (!currentUrl) {
      setPreview(null);
      return;
    }
    setRemoving(true);
    // Try common extensions; ignore not-found errors.
    for (const ext of ['jpg', 'png', 'webp']) {
      try {
        await deleteObject(storageRef(storage, `${pathPrefix}.${ext}`));
      } catch {
        /* ignore */
      }
    }
    setPreview(null);
    await onRemoved?.();
    setRemoving(false);
    toast.success('Image removed.');
  };

  return (
    <div className="space-y-3">
      <div className="relative w-40 h-40 rounded-lg overflow-hidden border-2 border-slate-600 bg-slate-800 flex items-center justify-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-10 h-10 text-slate-500" />
        )}
        {progress !== null && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-semibold">
            {progress}%
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={progress !== null}
          className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          {progress !== null ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {preview ? 'Replace image' : 'Upload image'}
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        JPG, PNG, or WebP · Max {maxSizeMB} MB
      </p>
    </div>
  );
}
