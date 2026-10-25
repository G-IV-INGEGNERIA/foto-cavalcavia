/* Foto Cavalcavia: tiene in memoria la pagina per aprirla anche senza campo. */
const CACHE = "foto-cavalcavia-19-25-10";
const FILE = ["./", "./index.html", "./manifest.webmanifest", "./icona-192.png", "./icona-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))
    .then(() => self.clients.claim()));
});

function entro(p, ms) {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error("lento")), ms);
    p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); ko(e); });
  });
}
function salva(req, resp) {
  if (resp && (resp.ok || resp.type === "opaque")) { const c = resp.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
  return resp;
}

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin) {
    // prima la rete (cosi' arrivano gli aggiornamenti), ma se non risponde in fretta uso la copia
    e.respondWith(entro(fetch(r), 4000).then((resp) => salva(r, resp))
      .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match("./index.html"))));
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((resp) => salva(r, resp))));
  }
});
