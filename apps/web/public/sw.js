self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("plutusclub-offline-v1").then((cache) => cache.addAll(["/offline"]))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline"))
  );
});
