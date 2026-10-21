"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * The camera, reading a QR card.
 *
 * Uses the browser's own barcode reader where there is one (Android Chrome,
 * which is fast and handles a shaky hand well) and falls back to jsQR for
 * iPhones, which have no such thing. Both run entirely on the phone, so this
 * works with no signal - the point of the whole feature.
 *
 * It beeps and buzzes on a read, because the worker is holding the phone up
 * to a wall and not looking at the screen.
 */

type Detected = { rawValue: string };
type Detector = { detect: (src: HTMLVideoElement) => Promise<Detected[]> };

/** Camera failures, in words a support worker can do something about. */
function cameraError(e: unknown) {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") {
    return "The camera is blocked for PCG Shift Care. Open your phone settings, allow the camera, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this phone.";
  }
  if (name === "NotReadableError") {
    return "Another app is using the camera. Close it and try again.";
  }
  return "The camera wouldn't start. Close PCG Shift Care completely, open it again and tap Scan card.";
}

function feedback() {
  try {
    navigator.vibrate?.(80);
  } catch {
    /* not supported */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => void ctx.close().catch(() => {}), 400);
  } catch {
    /* no audio on this device */
  }
}

export function QrScan({
  onCode,
  onClose,
}: {
  /** Called once with the decoded text, then the camera closes. */
  onCode: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState<{ on: boolean; available: boolean }>({
    on: false,
    available: false,
  });
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // Guards against a second read while the first is still being handled.
  const doneRef = useRef(false);

  const hit = useCallback(
    (text: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      feedback();
      onCode(text);
    },
    [onCode],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        setError(cameraError(e));
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* iOS resolves this later; the loop copes */
      }
      setReady(true);

      // A light, for the hallways this feature exists for. Android only.
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = track?.getCapabilities?.() as
        | { torch?: boolean }
        | undefined;
      if (caps?.torch) setTorch({ on: false, available: true });

      const native = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => Detector;
        }
      ).BarcodeDetector;
      const detector = native
        ? new native({ formats: ["qr_code"] })
        : null;

      let last = 0;
      const tick = async (now: number) => {
        if (stopped || doneRef.current) return;
        // Four looks a second is plenty and keeps the phone cool.
        if (now - last > 250 && video.readyState >= 2) {
          last = now;
          try {
            if (detector) {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) return hit(found[0].rawValue);
            } else {
              const canvas = (canvasRef.current ??= document.createElement("canvas"));
              const w = video.videoWidth;
              const h = video.videoHeight;
              if (w && h) {
                // Half size: enough detail for a wall card, a quarter of the work.
                canvas.width = Math.round(w / 2);
                canvas.height = Math.round(h / 2);
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(img.data, img.width, img.height, {
                    inversionAttempts: "dontInvert",
                  });
                  if (code?.data) return hit(code.data);
                }
              }
            }
          } catch {
            /* a frame that couldn't be read; the next one will be fine */
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [hit]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torch.on;
    try {
      // `torch` is real on Android and absent from the TypeScript DOM types.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorch({ on: next, available: true });
    } catch {
      setTorch({ on: false, available: false });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <span className="text-base font-semibold">Scan the card</span>
        <button
          onClick={onClose}
          className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold"
        >
          Close
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        {/* The box to aim with. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[62vw] max-h-[320px] w-[62vw] max-w-[320px] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-4 top-6 rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-lg">
            {error}
          </div>
        )}
        {!error && !ready && (
          <p className="absolute inset-x-0 bottom-24 text-center text-sm text-white/80">
            Starting the camera...
          </p>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-3 px-4 py-5 text-center text-sm text-white/80"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        {torch.available ? (
          <button
            onClick={toggleTorch}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 font-semibold text-white"
          >
            <span className="material-symbols-rounded text-[18px]">
              {torch.on ? "flashlight_off" : "flashlight_on"}
            </span>
            {torch.on ? "Light off" : "Light on"}
          </button>
        ) : (
          <span>Hold the phone steady about 20 cm from the card.</span>
        )}
      </div>
    </div>
  );
}
