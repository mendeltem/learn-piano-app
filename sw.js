// Learn Piano service worker: offline after the first visit. The page and the model are kept; libraries from the CDN
// are cached on first use. Bump VERSION when the app changes, so phones load the new files.
const VERSION = "learn-piano-v1";
const SHELL = ["./", "index.html", "app.js", "practice.js", "manifest.webmanifest", "icon-192.png", "icon-512.png",
               "model/model.json", "model/group1-shard1of1.bin"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.startsWith("https://cdn.jsdelivr.net/"))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
