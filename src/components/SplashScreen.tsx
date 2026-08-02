"use client";

import { useEffect, useState } from "react";

/**
 * Branded launch splash — shows once per session (i.e. when the app is opened /
 * refreshed, not on internal navigation) for ~2s, then fades to the app.
 * Renders on the server (show=true) so it covers the first paint with no flash
 * of page content; hides immediately if it's already been shown this session.
 */
export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("pcg-splash-seen")) {
      setShow(false);
      return;
    }
    const fadeT = setTimeout(() => setFading(true), 1850);
    const hideT = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem("pcg-splash-seen", "1");
    }, 2350);
    return () => {
      clearTimeout(fadeT);
      clearTimeout(hideT);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "#003146" }}
    >
      {/* Care photo backdrop, dimmed under the brand */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/login-hero.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,49,70,0.75) 0%, rgba(0,49,70,0.94) 100%)",
        }}
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Pristine Care Group"
          className="splash-logo h-24 w-24 rounded-3xl shadow-2xl"
        />
        <p className="splash-text mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Welcome to
        </p>
        <h1 className="splash-text mt-1 text-2xl font-bold text-white">
          Pristine Care Group
        </h1>
      </div>
    </div>
  );
}
