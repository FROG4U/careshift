"use client";

import { useRef, useState } from "react";
import { updatePhoto } from "@/app/my-shifts/actions";

/** Load a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Center-crop + downscale to a small square JPEG data URL (~10–25KB). */
async function compress(file: File, size = 256, quality = 0.72): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function AvatarUpload({
  photoUrl,
  initials,
}: {
  photoUrl: string | null;
  initials: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await compress(file);
      setPreview(dataUrl); // optimistic
      const res = await updatePhoto(dataUrl);
      if (res.error) {
        setError(res.error);
        setPreview(photoUrl);
      }
    } catch {
      setError("Couldn't process that image.");
      setPreview(photoUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative h-24 w-24 rounded-full"
      >
        {preview ? (
          <img
            src={preview}
            alt="Profile"
            className="h-24 w-24 rounded-full object-cover shadow-md ring-4 ring-white"
          />
        ) : (
          <span
            className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md ring-4 ring-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #000))",
            }}
          >
            {initials.toUpperCase()}
          </span>
        )}

        {/* camera badge */}
        <span
          className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md ring-2 ring-white"
          style={{ background: "var(--accent, var(--brand))" }}
        >
          <span className="material-symbols-rounded text-[18px]">
            {busy ? "hourglass_top" : "photo_camera"}
          </span>
        </span>

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-xs font-semibold text-white">
            Saving…
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-2 text-xs font-semibold text-[var(--brand)]"
      >
        {preview ? "Change photo" : "Add a photo"}
      </button>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}
