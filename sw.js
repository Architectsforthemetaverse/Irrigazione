const CACHE_NAME = "irrigazione-v6-neon-9";
const ASSETS = [
  "./",
  "./index.html",
  "./irrigazione.css",
  "./neon.css",
  "./next-state.css",
  "./irrigazione.js",
  "./history-all-valves.js",
  "./next-state.js",
  "./smart-rules.js",
  "./ui-neon.js",
  "./weather-advice.js",
  "./sync-config.js",
  "./mappa-irrigazione.svg",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== "basic") return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
