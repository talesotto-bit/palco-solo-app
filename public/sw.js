/**
 * Service worker: faz o app abrir sem internet.
 * - Páginas: rede primeiro, cópia salva quando estiver offline
 * - /assets (arquivos com hash): cache primeiro
 * - catálogo e ícones: usa o salvo e atualiza em segundo plano
 * O áudio das músicas é guardado pelo próprio app (src/lib/offlineAudio.ts).
 */
const SHELL = 'shell-v2'
const DATA = 'data-v1'
const KEEP = [SHELL, DATA]

const BASE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/vendor/signalsmith-stretch-1.3.2.mjs']

/** Guarda TODAS as telas do app (não só as já abertas) e apaga as de versões antigas */
async function precacheAll() {
  const cache = await caches.open(SHELL)
  let files = []
  try { files = await (await fetch('/sw-assets.json', { cache: 'no-store' })).json() } catch { return }
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname))
  await Promise.all(files.filter((f) => !have.has(f)).map((f) =>
    fetch(f).then((res) => (res.ok ? cache.put(f, res) : null)).catch(() => null)))
  const keep = new Set(files)
  await Promise.all([...have].filter((p) => p.startsWith('/assets/') && !keep.has(p)).map((p) => cache.delete(p)))
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(BASE)).then(precacheAll)
  )
})

// o app pede a cada abertura (com internet): mantém a versão nova guardada
self.addEventListener('message', (event) => {
  if (event.data === 'precache') event.waitUntil(precacheAll())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA)
  const hit = await cache.match(request)
  const update = fetch(request)
    .then((res) => { if (res.ok) cache.put(request, res.clone()); return res })
    .catch(() => hit)
  return hit || update
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/vendor/')) {
    event.respondWith(cacheFirst(request))
  } else if (/^\/(catalog\.json|demo-catalog\.json|repertorios\.json|icons\/|manifest\.webmanifest)/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
