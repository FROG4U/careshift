/* PCG Shift Care service worker — push notifications, plus ONE cached page.
 *
 * The app is server-rendered and almost nothing is cached on purpose: a stale
 * cache would show an old roster, which is worse than a slow load.
 *
 * The exception is /clock, the screen for scanning the card at a participant's
 * home. Some participants have no mobile signal at all, so that screen has to
 * open with no connection — and it carries no roster of its own, it reads what
 * the phone saved, so there is nothing about it to go stale.
 */

const SHELL = "pcg-clock-shell-v1";
const CLOCK_PAGE = "/clock";

/** Cache the clock screen and the exact build assets its HTML asks for. */
async function cacheClockPage(response) {
  const cache = await caches.open(SHELL);
  const copy = response.clone();
  await cache.put(CLOCK_PAGE, response.clone());

  // The page is no use without its stylesheet and scripts, and their names
  // carry a build hash, so they're read out of the HTML rather than guessed.
  try {
    const html = await copy.text();
    const refs = new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) || []);
    await Promise.all(
      [...refs].slice(0, 60).map(async (url) => {
        try {
          if (await cache.match(url)) return;
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok) await cache.put(url, res);
        } catch {
          /* one missing asset shouldn't fail the rest */
        }
      }),
    );
  } catch {
    /* the page itself is cached, which is the important half */
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(CLOCK_PAGE, { credentials: "same-origin" });
        if (res.ok) await cacheClockPage(res);
      } catch {
        /* installed offline; the first online visit fills the cache */
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from an older shape of this file.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("pcg-") && n !== SHELL).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // The clock screen: the network first, so it's current whenever it can be,
  // and the saved copy when there's nothing to reach.
  if (url.pathname === CLOCK_PAGE && !url.searchParams.has("_rsc")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            // Refresh in the background: a deploy changes the asset names, and
            // this is what keeps the saved copy able to open on its own.
            event.waitUntil(cacheClockPage(res.clone()));
          }
          return res;
        } catch {
          const hit = await caches.match(CLOCK_PAGE);
          if (hit) return hit;
          throw new Error("offline and no saved copy of the clock screen");
        }
      })(),
    );
    return;
  }

  // Build assets are named by their content, so a cached one is never stale.
  // Only ones already saved are served from the cache; nothing new is added
  // here, so the rest of the app is cached no more than it was before.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req, { cacheName: SHELL });
        if (hit) return hit;
        return fetch(req);
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PCG Shift Care", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "PCG Shift Care";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        // Focus an already-open tab and take it to the right page.
        for (const client of windows) {
          if ("focus" in client) {
            if ("navigate" in client) {
              return client.navigate(url).then((c) => (c ? c.focus() : null));
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
