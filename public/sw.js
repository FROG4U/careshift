/* CareShift service worker — push notifications only.
 *
 * Deliberately does NO caching: the app is server-rendered and a stale cache
 * would show old rosters, which is worse than a slightly slower load.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CareShift", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "CareShift";
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
