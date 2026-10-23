/** Confete leve em canvas (sem biblioteca), para comemorar ações do público */
export function confetti(colors: string[] = ['#22c55e', '#facc15', '#ec4899', '#3b82f6', '#ffffff'], count = 140) {
  if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const c = document.createElement('canvas')
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999'
  const dpr = Math.min(2, devicePixelRatio || 1)
  c.width = innerWidth * dpr; c.height = innerHeight * dpr
  document.body.appendChild(c)
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  const W = innerWidth, H = innerHeight
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.55,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, color: colors[(Math.random() * colors.length) | 0],
  }))
  const t0 = performance.now()
  const frame = (t: number) => {
    ctx.clearRect(0, 0, W, H)
    for (const p of parts) {
      p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore()
    }
    if (t - t0 < 2600) requestAnimationFrame(frame); else c.remove()
  }
  requestAnimationFrame(frame)
  try { navigator.vibrate?.([30, 40, 30]) } catch {}
}
