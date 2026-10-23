import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatTons } from './musicTheory'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format seconds to MM:SS */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Texto para busca: minúsculo e sem acento ("Arranhão" → "arranhao") */
export function normalizeSearch(text: string): string {
  // "Gusttavo" = "Gustavo", "&" = "e": o músico digita do jeito que fala
  return stripAccents(text).toLowerCase().replace(/&/g, ' e ').replace(/([a-z])\1+/g, '$1')
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Cada palavra da busca precisa aparecer em algum dos campos (em qualquer ordem) */
export function matchesSearch(query: string, fields: string[]): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  const hay = normalizeSearch(fields.join(' '))
  return words.every(w => hay.includes(w))
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Convert semitones to a human-readable label in tons (e.g. "+1½ tom") */
export function semitonesToLabel(semitones: number): string {
  if (semitones === 0) return 'Original'
  const st = Math.round(semitones)
  const cents = Math.round((semitones - st) * 100)
  const centsLabel = cents !== 0 ? ` ${cents > 0 ? '+' : ''}${cents}¢` : ''
  return st === 0 ? `Original${centsLabel}` : `${formatTons(st)}${centsLabel}`
}

/** Convert speed ratio to percentage label */
export function speedToLabel(speed: number): string {
  if (speed === 1) return 'Original'
  return `${Math.round(speed * 100)}%`
}

/** Generate a stable color from a string (for genre/instrument colors) */
export function stringToColor(str: string): string {
  const colors = [
    '#1351AA', '#1a65d4', '#0e3d80',
    '#7C3AED', '#059669', '#D97706',
    '#DC2626', '#DB2777', '#0891B2',
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
