/** Vibração curtinha ao tocar em botões importantes (Android; no iPhone o navegador ignora) */
export function tap(ms = 8) {
  try { navigator.vibrate?.(ms) } catch { /* sem vibração */ }
}
