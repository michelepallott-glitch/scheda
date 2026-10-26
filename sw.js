// Service worker: tiene l'app in cache per usarla anche senza connessione (in palestra spesso manca).
// Alza VERSIONE a ogni modifica dei file, cosi' i telefoni scaricano la nuova versione.
const VERSIONE = "scheda-v10";
const FILE = ["./", "index.html", "app.js", "stile.css", "manifest.webmanifest",
  "icone/icona-192.png", "icone/icona-512.png", "icone/apple-touch-icon.png"];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", ev => {
  ev.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
// prima la cache (apertura istantanea e offline), intanto aggiorna in background
self.addEventListener("fetch", ev => {
  if (ev.request.method !== "GET" || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(caches.open(VERSIONE).then(async cache => {
    const salvata = await cache.match(ev.request, {ignoreSearch: true});
    // no-cache: chiede sempre al server se il file e' cambiato, invece di fidarsi della cache HTTP del browser
    const rete = fetch(ev.request, {cache: "no-cache"}).then(r => { if (r.ok) cache.put(ev.request, r.clone()); return r; }).catch(() => salvata);
    return salvata || rete;
  }));
});
