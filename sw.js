// =========================
// SERVICE WORKER — sw.js
// MB WorkStation PWA
// =========================
var CACHE_NAME = "mbworkstation-v4";

var ASSETS = [
  "/MB-WorkStation/",
  "/MB-WorkStation/index.html",
  "/MB-WorkStation/styles.css",
  "/MB-WorkStation/app.js",
  "/MB-WorkStation/manifest.json",
  "/MB-WorkStation/icon-192.png",
  "/MB-WorkStation/icon-512.png",
  "https://unpkg.com/dexie@3/dist/dexie.js",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// INSTALL — cache all core assets
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ACTIVATE — clean up old caches
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k)   { return caches.delete(k);  })
      );
    })
  );
  self.clients.claim();
});

// FETCH — network first for HTML, cache first for everything else
self.addEventListener("fetch", function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (e.request.headers.get("accept") &&
          e.request.headers.get("accept").includes("text/html")) {
        return fetch(e.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
          return response;
        }).catch(function() {
          return cached || caches.match("/MB-WorkStation/index.html");
        });
      }
      return cached || fetch(e.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});