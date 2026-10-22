import { isSupportStem } from '@/audio/AudioEngine'
import { isAvailableOffline } from '@/lib/offlineAudio'
import type { Track } from '@/types/track'

/** 2700 → "45 min", 4500 → "1h15" */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

/** URLs que precisam estar no aparelho para a música tocar sem internet */
export function trackAudioUrls(t: Track): string[] {
  return t.stems.filter(s => !isSupportStem(s)).map(s => s.audioUrl).filter(u => /^https?:/.test(u))
}

export function isTrackOffline(t: Track): boolean {
  const urls = trackAudioUrls(t)
  return urls.length === 0 || isAvailableOffline(urls)
}
