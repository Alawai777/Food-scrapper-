/* YartedEats Service Worker — lightweight cache for offline shell */
var CACHE_NAME = "yartedeats-v1";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(["./", "./index.html"]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (n) { return n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (event.request.destination === "document") {
        return fetch(event.request)
          .then(function (resp) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
            return resp;
          })
          .catch(function () {
            return cached || new Response("Offline", { status: 503 });
          });
      }

      if (cached) return cached;

      return fetch(event.request).then(function (resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
        return resp;
      });
    })
  );
});
