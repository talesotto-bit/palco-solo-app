/**
 * Partes da música (intro, verso, refrão, solo, final) a partir das pistas separadas.
 *
 * Numa multipista, a mudança de parte aparece como mudança de "textura": instrumentos entram e saem,
 * a voz para, a energia sobe. Para cada quadro há um vetor com o nível de cada pista; onde esse vetor muda
 * de forma marcada, começa uma parte nova. Depois, as partes cantadas mais cheias (ou parecidas com a mais
 * cheia) viram "Refrão", as outras cantadas "Verso", e as sem voz viram Intro / Solo / Final.
 */
export interface SongSection { start: number; end: number; label: string }
export interface SectionTrack { rms: Float32Array; voice: boolean }

function smooth(a: Float32Array, w: number): Float32Array {
  const out = new Float32Array(a.length)
  let s = 0
  for (let i = 0; i < a.length + w; i++) {
    if (i < a.length) s += a[i]
    if (i - 2 * w - 1 >= 0) s -= a[i - 2 * w - 1]
    const c = i - w
    if (c >= 0 && c < a.length) out[c] = s / (Math.min(a.length - 1, c + w) - Math.max(0, c - w) + 1)
  }
  return out
}

function percentile(a: Float32Array, p: number): number {
  const v = [...a].filter(x => x > 0).sort((x, y) => x - y)
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0
}

export function findSections(tracks: SectionTrack[], hop: number): SongSection[] {
  if (!tracks.length) return []
  const n = tracks[0].rms.length
  if (n * hop < 40) return []
  // nível de cada pista em 0..1 (pelo pico típico dela), suavizado
  const feats = tracks.map(t => {
    const ref = percentile(t.rms, 0.95)
    const s = smooth(t.rms, 2)
    const out = new Float32Array(n)
    if (ref > 0) for (let i = 0; i < n; i++) out[i] = Math.min(1.5, s[i] / ref)
    return out
  })
  const energy = new Float32Array(n)
  for (const t of tracks) for (let i = 0; i < n; i++) energy[i] += t.rms[i] * t.rms[i]
  for (let i = 0; i < n; i++) energy[i] = Math.sqrt(energy[i])
  const E = smooth(energy, 2)
  const maxE = Math.max(...E)
  if (maxE <= 0) return []
  let s0 = 0, e0 = n - 1
  while (s0 < n && E[s0] < maxE * 0.08) s0++
  while (e0 > s0 && E[e0] < maxE * 0.08) e0--
  if ((e0 - s0) * hop < 40) return []

  const voiceIdx = tracks.findIndex(t => t.voice)
  let voiced: Uint8Array | null = null
  if (voiceIdx >= 0) {
    const v = feats[voiceIdx]
    voiced = new Uint8Array(n)
    for (let i = 0; i < n; i++) voiced[i] = v[i] > 0.12 ? 1 : 0
    // pausas de respiração (até 2,5 s) contam como cantado
    let last = -1
    for (let i = 0; i < n; i++) {
      if (!voiced[i]) continue
      if (last >= 0 && i - last > 1 && (i - last) * hop <= 2.5) for (let k = last + 1; k < i; k++) voiced[k] = 1
      last = i
    }
  }

  // mudança de textura: distância entre a média das pistas antes e depois de cada ponto
  const W = Math.round(4 / hop), MIN = Math.round(8 / hop)
  const nov = new Float32Array(n)
  const dims = feats.length
  for (let f = s0 + W; f <= e0 - W; f++) {
    let d = 0
    for (const ft of feats) {
      let a = 0, b = 0
      for (let k = 1; k <= W; k++) { a += ft[f - k]; b += ft[f + k - 1] }
      const x = (b - a) / W
      d += x * x
    }
    let ea = 0, eb = 0
    for (let k = 1; k <= W; k++) { ea += E[f - k]; eb += E[f + k - 1] }
    nov[f] = Math.sqrt(d / dims) + Math.abs(eb - ea) / W / maxE
  }
  // pontos de mudança: picos que se destacam do entorno (proeminência), os mais fortes primeiro
  const active = [...nov.subarray(s0 + W, e0 - W + 1)].sort((x, y) => x - y)
  const med = active[Math.floor(active.length / 2)] || 0
  const R = Math.round(8 / hop)
  const prom = (f: number) => {
    let l = Infinity, r = Infinity
    for (let k = Math.max(s0, f - R); k < f; k++) l = Math.min(l, nov[k])
    for (let k = f + 1; k <= Math.min(e0, f + R); k++) r = Math.min(r, nov[k])
    return nov[f] - Math.max(l === Infinity ? 0 : l, r === Infinity ? 0 : r)
  }
  const cand: { f: number; p: number }[] = []
  for (let f = s0 + MIN; f <= e0 - MIN; f++) {
    let isPeak = nov[f] > 0
    for (let k = Math.max(0, f - 3); k <= Math.min(n - 1, f + 3) && isPeak; k++) if (nov[k] > nov[f]) isPeak = false
    if (!isPeak) continue
    const p = prom(f)
    if (p > med * 0.5) cand.push({ f, p })
  }
  cand.sort((a, b) => b.p - a.p)
  const cuts = [s0, e0 + 1]
  const maxCuts = Math.ceil((e0 - s0) * hop / 18)
  for (const c of cand) {
    if (cuts.length - 2 >= maxCuts) break
    if (cuts.every(x => Math.abs(x - c.f) >= MIN)) cuts.push(c.f)
  }
  // parte longa demais (> 45 s) quase sempre são duas: corta no ponto de maior mudança dentro dela
  for (let guard = 0; guard < 8; guard++) {
    cuts.sort((a, b) => a - b)
    const i = cuts.findIndex((c, k) => k > 0 && (c - cuts[k - 1]) * hop > 45)
    if (i < 0) break
    let best = -1
    for (let f = cuts[i - 1] + MIN; f <= cuts[i] - MIN; f++) if (best < 0 || nov[f] > nov[best]) best = f
    if (best < 0) break
    cuts.push(best)
  }
  // a voz entra/sai depois de um trecho instrumental longo (≥ 6 s): sempre é corte
  if (voiced) {
    for (let f = s0 + 1; f <= e0; f++) {
      if (voiced[f] === voiced[f - 1]) continue
      let run = 0
      for (let k = f; k <= e0 && voiced[k] === voiced[f]; k++) run++
      const before = (() => { let r = 0; for (let k = f - 1; k >= s0 && voiced[k] === voiced[f - 1]; k--) r++; return r })()
      const instrumental = voiced[f] ? before : run
      if (instrumental * hop >= 6) {
        const near = cuts.findIndex(x => Math.abs(x - f) < MIN / 2)
        if (near >= 0 && cuts[near] !== s0 && cuts[near] !== e0 + 1) cuts[near] = f
        else if (near < 0) cuts.push(f)
      }
    }
  }
  cuts.sort((a, b) => a - b)
  const bounds = cuts.filter((c, i) => i === 0 || c - cuts[i - 1] >= Math.round(4 / hop) || c === e0 + 1)

  const blocks = bounds.slice(0, -1).map((a, i) => {
    const b = bounds[i + 1]
    const vec = feats.map(ft => { let s = 0; for (let f = a; f < b; f++) s += ft[f]; return s / (b - a) })
    let e = 0, v = 0
    for (let f = a; f < b; f++) { e += E[f]; if (voiced?.[f]) v++ }
    return { a, b, vec, e: e / (b - a), v: voiced ? v / (b - a) : 1 }
  })
  if (blocks.length < 2) return []
  const dist = (x: number[], y: number[]) => Math.sqrt(x.reduce((s, xi, i) => s + (xi - y[i]) ** 2, 0) / x.length)
  const sung = blocks.filter(x => x.v >= 0.35)
  const ref = sung.length ? sung : blocks
  const sortedE = ref.map(x => x.e).sort((x, y) => x - y)
  const median = sortedE[Math.floor(sortedE.length / 2)]
  const loudest = ref.reduce((m, x) => (x.e > m.e ? x : m), ref[0])
  const labels = blocks.map((x, i) => {
    const edge = i === 0 ? 'Intro' : i === blocks.length - 1 ? 'Final' : null
    if (voiced ? x.v < 0.35 : (edge && x.e < median * 0.7)) return edge ?? 'Solo'
    const chorusLike = x.e >= median * 1.12 || (x !== loudest && dist(x.vec, loudest.vec) < 0.16 && x.e >= median * 0.95) || x === loudest
    return chorusLike && ref.length > 1 ? 'Refrão' : 'Verso'
  })
  // partes vizinhas iguais e curtas viram uma só; as repetidas ganham número (Verso 1, Refrão 2...)
  const merged: { a: number; b: number; label: string }[] = []
  blocks.forEach((x, i) => {
    const prev = merged[merged.length - 1]
    if (prev && prev.label === labels[i] && ((x.b - prev.a) * hop <= 30 || labels[i] === 'Solo')) prev.b = x.b
    else merged.push({ a: x.a, b: x.b, label: labels[i] })
  })
  const total: Record<string, number> = {}, seen: Record<string, number> = {}
  merged.forEach(m => { total[m.label] = (total[m.label] || 0) + 1 })
  const out: SongSection[] = merged.map(m => {
    seen[m.label] = (seen[m.label] || 0) + 1
    const numbered = total[m.label] > 1 && m.label !== 'Intro' && m.label !== 'Final'
    return { start: m.a * hop, end: m.b * hop, label: numbered ? `${m.label} ${seen[m.label]}` : m.label }
  })
  return out.length >= 2 ? out : []
}
