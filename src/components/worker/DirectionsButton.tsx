"use client";

/**
 * Opens the phone's maps app with driving directions to the participant's home
 * so the worker can use it as a satnav. This is a navigation aid ONLY — it does
 * NOT start or record a tracked "Driving" trip and never affects pay.
 */
export function DirectionsButton({
  lat,
  lng,
  address,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
}) {
  function openMaps() {
    // Prefer exact coordinates; fall back to the typed address.
    const dest =
      lat != null && lng != null
        ? `${lat},${lng}`
        : address
          ? encodeURIComponent(address)
          : "";
    if (!dest) return;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${dest}&dirflg=d` // Apple Maps, driving
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  return (
    <button
      onClick={openMaps}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
    >
      <span className="material-symbols-rounded text-[20px]">navigation</span>
      Take me to the client
    </button>
  );
}
