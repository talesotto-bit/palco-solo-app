/**
 * Endereço de onde vêm as músicas (Cloudflare R2).
 * O endereço próprio (audio.powertom.com.br) passa pelo cache da Cloudflare e não tem o limite de acessos do r2.dev.
 */
export const LEGACY_AUDIO_BASE: string = 'https://pub-81339f96e6c746e8ac25fbe60e95563c.r2.dev'
export const AUDIO_BASE: string = LEGACY_AUDIO_BASE

/**
 * Chave única de um arquivo de áudio, seja qual for o endereço usado.
 * As músicas guardadas para tocar sem internet foram salvas com o endereço antigo:
 * assim continuam valendo depois da troca.
 */
export function audioCacheKey(url: string): string {
  return AUDIO_BASE !== LEGACY_AUDIO_BASE && url.startsWith(AUDIO_BASE) ? LEGACY_AUDIO_BASE + url.slice(AUDIO_BASE.length) : url
}
