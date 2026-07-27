import { useState, useEffect, useRef } from 'react'

const CACHE_KEY = 'palco-covers'
const MAX_CACHE = 2000
const FETCH_DELAY = 150

let _cache: Record<string, string> | null = null
let _queue: (() => void)[] = []
let _fetching = false

function getCache(): Record<string, string> {
  if (!_cache) {
    try { _cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') }
    catch { _cache = {} }
  }
  return _cache!
}

function saveCache() {
  try {
    const c = getCache()
    const keys = Object.keys(c)
    if (keys.length > MAX_CACHE) {
      keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete c[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {}
}

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`
}

function processQueue() {
  if (_fetching || _queue.length === 0) return
  _fetching = true
  const next = _queue.shift()!
  next()
  setTimeout(() => {
    _fetching = false
    processQueue()
  }, FETCH_DELAY)
}

function enqueue(fn: () => void) {
  _queue.push(fn)
  processQueue()
}

export function useCoverArt(artist: string, title: string, fallbackUrl: string): string {
  const key = cacheKey(artist, title)
  const cached = getCache()[key]
  const [url, setUrl] = useState<string>(cached || fallbackUrl)
  const mountedRef = useRef(true)
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (cached) {
      setUrl(cached)
      return
    }

    if (!artist.trim() || !title.trim()) return

    const cache = getCache()
    if (cache[key] === '404') {
      return
    }

    enqueue(async () => {
      try {
        const params = new URLSearchParams({ artist, title })
        const res = await fetch(`/api/cover?${params}`)

        if (!mountedRef.current || keyRef.current !== key) return

        if (res.status === 404) {
          cache[key] = '404'
          saveCache()
          return
        }

        if (!res.ok) return

        const data = await res.json()
        if (data.url) {
          cache[key] = data.url
          saveCache()
          if (mountedRef.current && keyRef.current === key) {
            setUrl(data.url)
          }
        }
      } catch {}
    })
  }, [key, artist, title, cached])

  return url
}
