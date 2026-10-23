/**
 * Backup em arquivo (o app não tem login): salva shows, ajustes de cada música, cifras, letras,
 * favoritos e preferências. O músico guarda o arquivo (WhatsApp, Drive) e restaura em outro celular.
 * As músicas importadas não entram (são arquivos grandes de áudio): precisam ser adicionadas de novo.
 */
const KEYS = [
  'shows-v1', 'palco-track-settings', 'cifras-v1', 'own-lyrics-v1', 'lyrics-sync-v1', 'palco-favorites',
  'prefs-v1', 'stage-settings-v1', 'pedidos-v1', 'unlocks-v1', 'onboarding-v1',
]

export interface BackupFile { app: 'powertom'; v: 1; date: string; data: Record<string, string> }

export function buildBackup(): BackupFile {
  const data: Record<string, string> = {}
  for (const k of KEYS) {
    try { const v = localStorage.getItem(k); if (v !== null) data[k] = v } catch {}
  }
  return { app: 'powertom', v: 1, date: new Date().toISOString(), data }
}

export function backupSummary(b: BackupFile) {
  const parse = (k: string) => { try { return JSON.parse(b.data[k] || 'null')?.state } catch { return null } }
  return {
    shows: parse('shows-v1')?.shows?.length || 0,
    ajustes: Object.keys(parse('palco-track-settings')?.settings || {}).length,
    cifras: Object.keys(parse('cifras-v1')?.own || {}).length,
    letras: Object.keys(parse('own-lyrics-v1')?.items || {}).length,
    favoritas: parse('palco-favorites')?.ids?.length || 0,
  }
}

export async function exportBackup(): Promise<void> {
  const b = buildBackup()
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' })
  const name = `powertom-backup-${b.date.slice(0, 10)}.json`
  const file = new File([blob], name, { type: 'application/json' })
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (mobile) {
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup Power Tom' }); return }
    } catch (e: any) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 500)
}

export async function readBackup(file: File): Promise<BackupFile> {
  const b = JSON.parse(await file.text())
  if (!b || b.app !== 'powertom' || typeof b.data !== 'object') throw new Error('Este arquivo não é um backup do Power Tom.')
  return b as BackupFile
}

/** Restaura (substitui o que está no aparelho) e recarrega o app */
export function restoreBackup(b: BackupFile) {
  for (const k of KEYS) {
    if (b.data[k] !== undefined) localStorage.setItem(k, b.data[k])
  }
  location.reload()
}
