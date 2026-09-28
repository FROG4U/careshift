"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice calls inside the app, over wifi or mobile data.
 *
 * The audio goes straight between the two phones; the server only passes the
 * handshake (see /api/calls). One of these is mounted in the office layout
 * and in the worker layout, so either side can ring the other and both see
 * the same ringing screen.
 *
 * Both ends wait for their network candidates before sending, so the whole
 * handshake is two messages - no live socket to keep open, which is what
 * makes this survive a plain nginx in front of the app.
 */

type Phase = "idle" | "calling" | "ringing" | "connecting" | "in-call" | "ended";

type CallState = {
  phase: Phase;
  withName: string;
  seconds: number;
  muted: boolean;
  error: string | null;
};

/**
 * Ring someone from anywhere in the app.
 *
 * A browser event rather than a React context on purpose: the call screen is
 * mounted once per layout, and a context would force every screen that wants
 * a call button to sit inside it. A button just says "ring this person" and
 * the call screen, wherever it is, picks it up.
 */
export const CALL_EVENT = "pcg:call";

export function ringUp(toUserId: string, name: string, conversationId?: string) {
  window.dispatchEvent(
    new CustomEvent(CALL_EVENT, { detail: { toUserId, name, conversationId } }),
  );
}

type Incoming = { id: string; fromName: string; offer: string };

async function iceConfig(): Promise<RTCConfiguration> {
  try {
    const res = await fetch("/api/calls/ice");
    if (res.ok) return (await res.json()) as RTCConfiguration;
  } catch {
    // Fall through to STUN only.
  }
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
}

/**
 * Wait for the browser to finish finding network routes, with a ceiling.
 *
 * Gathering can hang on a slow relay, and a caller staring at a dead screen
 * is worse than a call that tries with the routes it already has.
 */
function waitForIce(pc: RTCPeerConnection, ms = 2500) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function CallCentre({ myName }: { myName: string }) {
  const [state, setState] = useState<CallState>({
    phase: "idle",
    withName: "",
    seconds: 0,
    muted: false,
    error: null,
  });
  const [incoming, setIncoming] = useState<Incoming | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringRef = useRef<{ stop: () => void } | null>(null);

  /** Put everything back: tracks released, timers cleared, mic light off. */
  const teardown = useCallback((phase: Phase = "idle", error: string | null = null) => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
    ringRef.current?.stop();
    ringRef.current = null;
    callIdRef.current = null;
    setIncoming(null);
    setState((s) => ({ ...s, phase, seconds: 0, muted: false, error }));
    if (phase === "ended") setTimeout(() => setState((s) => ({ ...s, phase: "idle" })), 2500);
  }, []);

  const hangUp = useCallback(
    async (silent = false) => {
      const id = callIdRef.current;
      if (id) {
        fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", id }),
        }).catch(() => {});
      }
      teardown(silent ? "idle" : "ended");
    },
    [teardown],
  );

  /** Count the connected time, for the screen and the call log. */
  const startTimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(
      () => setState((s) => ({ ...s, seconds: s.seconds + 1 })),
      1000,
    );
  }, []);

  const newPeer = useCallback(
    async (onTrack: (stream: MediaStream) => void) => {
      const pc = new RTCPeerConnection(await iceConfig());
      pc.ontrack = (e) => onTrack(e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setState((s) => ({ ...s, phase: "in-call" }));
          startTimer();
        }
        if (pc.connectionState === "failed") {
          teardown("ended", "Could not connect. Try again, or ring their mobile.");
        }
      };
      return pc;
    },
    [startTimer, teardown],
  );

  const playRemote = useCallback((stream: MediaStream) => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    audioRef.current.play().catch(() => {});
  }, []);

  /** Place a call. */
  const start = useCallback(
    async (toUserId: string, name: string, conversationId?: string) => {
      if (state.phase !== "idle" && state.phase !== "ended") return false;
      setState({ phase: "calling", withName: name, seconds: 0, muted: false, error: null });
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        localRef.current = mic;
        const pc = await newPeer(playRemote);
        pcRef.current = pc;
        mic.getTracks().forEach((t) => pc.addTrack(t, mic));

        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await waitForIce(pc);

        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            toUserId,
            conversationId,
            sdp: JSON.stringify(pc.localDescription),
          }),
        });
        if (!res.ok) throw new Error("could not start");
        const { id } = (await res.json()) as { id: string };
        callIdRef.current = id;

        // Wait for them to pick up.
        pollRef.current = setInterval(async () => {
          const r = await fetch(`/api/calls?id=${id}`).catch(() => null);
          if (!r || !r.ok) return;
          const call = (await r.json()) as { status: string; answer: string | null };
          if (call.status === "ACCEPTED" && call.answer && pc.signalingState !== "stable") {
            setState((s) => ({ ...s, phase: "connecting" }));
            await pc.setRemoteDescription(JSON.parse(call.answer));
          }
          if (["DECLINED", "MISSED", "ENDED", "FAILED"].includes(call.status)) {
            teardown(
              "ended",
              call.status === "DECLINED"
                ? `${name} declined`
                : call.status === "MISSED"
                  ? "No answer"
                  : null,
            );
          }
        }, 1500);
        return true;
      } catch {
        teardown("ended", "Your phone would not let the app use the microphone.");
        return false;
      }
    },
    [newPeer, playRemote, state.phase, teardown],
  );

  /** Pick up. */
  const accept = useCallback(async () => {
    if (!incoming) return;
    setState({
      phase: "connecting",
      withName: incoming.fromName,
      seconds: 0,
      muted: false,
      error: null,
    });
    ringRef.current?.stop();
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = mic;
      const pc = await newPeer(playRemote);
      pcRef.current = pc;
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      await pc.setRemoteDescription(JSON.parse(incoming.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);

      await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          id: incoming.id,
          sdp: JSON.stringify(pc.localDescription),
        }),
      });
      callIdRef.current = incoming.id;
      setIncoming(null);

      // Watch for the other end hanging up.
      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/calls?id=${callIdRef.current}`).catch(() => null);
        if (!r || !r.ok) return;
        const call = (await r.json()) as { status: string };
        if (["ENDED", "DECLINED", "FAILED", "MISSED"].includes(call.status)) {
          teardown("ended");
        }
      }, 2000);
    } catch {
      teardown("ended", "Your phone would not let the app use the microphone.");
    }
  }, [incoming, newPeer, playRemote, teardown]);

  const decline = useCallback(async () => {
    if (!incoming) return;
    fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline", id: incoming.id }),
    }).catch(() => {});
    teardown("idle");
  }, [incoming, teardown]);

  /** A call button anywhere in the app. */
  useEffect(() => {
    const onRing = (e: Event) => {
      const d = (e as CustomEvent<{ toUserId: string; name: string; conversationId?: string }>)
        .detail;
      if (d?.toUserId) void start(d.toUserId, d.name, d.conversationId);
    };
    window.addEventListener(CALL_EVENT, onRing);
    return () => window.removeEventListener(CALL_EVENT, onRing);
  }, [start]);

  /** Listen for someone ringing me, whenever I am not already on a call. */
  useEffect(() => {
    if (state.phase !== "idle") return;
    let stop = false;
    const look = async () => {
      const r = await fetch("/api/calls").catch(() => null);
      if (stop || !r || !r.ok) return;
      const { incoming: inc } = (await r.json()) as { incoming: Incoming | null };
      if (inc) {
        setIncoming(inc);
        setState((s) => ({ ...s, phase: "ringing", withName: inc.fromName, error: null }));
      }
    };
    look();
    const t = setInterval(look, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [state.phase]);

  /** A ring tone, drawn rather than downloaded so there is no audio file. */
  useEffect(() => {
    if (state.phase !== "ringing") return;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const beep = () => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 480;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      };
      beep();
      timer = setInterval(beep, 1400);
    } catch {
      // No sound is fine; the screen still shows the call.
    }
    ringRef.current = {
      stop: () => {
        if (timer) clearInterval(timer);
        ctx?.close().catch(() => {});
      },
    };
    return () => {
      if (timer) clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, [state.phase]);

  // Hanging up when the tab closes, so the other end is not left listening.
  useEffect(() => {
    const bye = () => {
      const id = callIdRef.current;
      if (id && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/calls",
          new Blob([JSON.stringify({ action: "end", id })], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  const toggleMute = () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setState((s) => ({ ...s, muted: !track.enabled }));
  };

  const mmss = `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")}`;
  const show = state.phase !== "idle";

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {show && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#04212e]/95 px-6 text-center text-white">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold">
            {(state.withName || "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <h2 className="mt-4 text-2xl font-bold">{state.withName}</h2>
          <p className="mt-1 text-sm text-white/70">
            {state.phase === "calling" && "Calling…"}
            {state.phase === "ringing" && "Incoming call"}
            {state.phase === "connecting" && "Connecting…"}
            {state.phase === "in-call" && mmss}
            {state.phase === "ended" && (state.error ?? "Call ended")}
          </p>
          {state.phase === "in-call" && (
            <p className="mt-1 text-xs text-white/50">
              Over wifi or mobile data · {myName}
            </p>
          )}

          <div className="mt-10 flex items-center gap-5">
            {state.phase === "ringing" ? (
              <>
                <button
                  onClick={decline}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg"
                  aria-label="Decline"
                >
                  <span className="material-symbols-rounded text-[28px]">call_end</span>
                </button>
                <button
                  onClick={accept}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg"
                  aria-label="Answer"
                >
                  <span className="material-symbols-rounded text-[28px]">call</span>
                </button>
              </>
            ) : state.phase === "ended" ? (
              <button
                onClick={() => setState((s) => ({ ...s, phase: "idle" }))}
                className="rounded-full bg-white/15 px-6 py-3 text-sm font-semibold"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    state.muted ? "bg-white text-[#04212e]" : "bg-white/15"
                  }`}
                  aria-label={state.muted ? "Unmute" : "Mute"}
                >
                  <span className="material-symbols-rounded text-[24px]">
                    {state.muted ? "mic_off" : "mic"}
                  </span>
                </button>
                <button
                  onClick={() => hangUp()}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg"
                  aria-label="Hang up"
                >
                  <span className="material-symbols-rounded text-[28px]">call_end</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
