// =========================
// SERVICE WORKER — sw.js
// MB WorkStation PWA
// =========================
var CACHE_NAME = "mbworkstation-v3";
var ASSETS = [
  "/mbworkstation/",
  "/mbworkstation/index.html",
  "/mbworkstation/styles.css",
  "/mbworkstation/app.js",
  "/mbworkstation/manifest.json",
  "/mbworkstation/icon-192.png",
  "/mbworkstation/icon-512.png",
  "https://unpkg.com/dexie@3/dist/dexie.js",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME; // ← deletes ALL old cache versions
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      // Network first for HTML files so app always loads fresh
      if (e.request.headers.get("accept") &&
          e.request.headers.get("accept").includes("text/html")) {
        return fetch(e.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
          return response;
        }).catch(function() {
          return cached || caches.match("/index.html");
        });
      }
      // Cache first for all other assets
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

// INSTALL — cache all core assets
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log("SW: Caching core assets");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ACTIVATE — clean up old caches
self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_NAME) {
            console.log("SW: Removing old cache:", name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// FETCH — cache first, then network
self.addEventListener("fetch", function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then(function(networkResponse) {
        return caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(function() {
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});