/**
 * Confere se dois textos são a mesma música (a cifra x a letra verificada).
 * Os nomes enganam (músicas diferentes com o mesmo título); as palavras cantadas não.
 */

// palavras que aparecem em quase toda música e não ajudam a distinguir uma da outra
const COMMON = new Set(['que', 'nao', 'pra', 'com', 'uma', 'meu', 'minha', 'voce', 'mais', 'por', 'mas', 'quando', 'tudo', 'seu', 'sua', 'esse', 'essa', 'isso', 'tem', 'sem', 'vai', 'pro', 'dos', 'das', 'nos', 'the', 'and', 'you'])

function words(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/)) {
    if (w.length >= 3 && !COMMON.has(w)) out.add(w)
  }
  return out
}

/** Texto cantado de uma cifra: sem os acordes (⟨Am⟩), sem linhas só de acordes e sem tablaturas */
export function sungText(cifra: string): string {
  return cifra
    .split('\n')
    .filter(line => !/^\s*[eBGDAE]\|/.test(line))                    // tablatura
    .map(line => line.replace(/⟨[^⟩]*⟩/g, '').replace(/\[[^\]]*\]/g, ' '))   // acorde no meio da palavra não a parte; [Refrão] não conta
    .filter(line => !/^[\s\-|/()\d.x]*$/.test(line))                  // sobrou só espaço/símbolo: era linha de acordes
    .join('\n')
}

/**
 * Parte das palavras da cifra que está na letra (0 a 1). null quando a cifra tem texto de menos para julgar
 * (só acordes, por exemplo): aí não descarta.
 */
export function cifraLyricsOverlap(cifra: string, lyrics: string): number | null {
  const c = words(sungText(cifra))
  if (c.size < 12) return null
  const l = words(lyrics)
  if (l.size < 12) return null
  let inter = 0
  c.forEach(w => { if (l.has(w)) inter++ })
  return inter / c.size
}

/** A cifra é de outra música? (menos de 40% das palavras dela estão na letra verificada) */
export function cifraIsOtherSong(cifra: string, lyrics: string | null): boolean {
  if (!lyrics) return false
  const o = cifraLyricsOverlap(cifra, lyrics)
  return o !== null && o < 0.4
}

/** Artista para buscar letra/cifra. Música sem artista no catálogo mostra o gênero no lugar ("Forró"): na busca isso vira "sem artista" */
export function songArtist(t: { artist: string; genreLabel?: string }): string {
  return t.artist && t.artist !== t.genreLabel ? t.artist : ''
}

/** Título sem etiquetas de arranjo ("Versão Forró", "Ao Vivo", "Cabaré 02") para buscar */
export function cleanSongTitle(raw: string): string {
  return raw.trim()
    .replace(/\s*[-–]?\s*vers[aã]o\s+\w+(\s+\w+)?$/i, '')
    .replace(/\s*[-–]?\s*(ao\s+vivo|ac[uú]stico|eletr[io]co|cabar[eé]\s*\d*|bpm\s*\d*)$/i, '')
    .replace(/\s+0?[1-3]$/, '')
    .trim()
}
