/** Temas de cor da página de pedidos (o músico escolhe; vai no link como número) */
export interface RequestTheme { name: string; accent: string; accent2: string; bg: string; ink: string }

export const THEMES: RequestTheme[] = [
  { name: 'Palco verde', accent: '#22c55e', accent2: '#14b8a6', bg: '#07140d', ink: '#04130a' },
  { name: 'Neon roxo', accent: '#a855f7', accent2: '#ec4899', bg: '#120a1c', ink: '#ffffff' },
  { name: 'Sertanejo', accent: '#f59e0b', accent2: '#ef4444', bg: '#1a0f05', ink: '#1a0f05' },
  { name: 'Azul show', accent: '#3b82f6', accent2: '#06b6d4', bg: '#06101f', ink: '#ffffff' },
  { name: 'Festa rosa', accent: '#ec4899', accent2: '#f97316', bg: '#1a0712', ink: '#ffffff' },
  { name: 'Louvor', accent: '#facc15', accent2: '#fde68a', bg: '#141005', ink: '#1a1405' },
]

export const themeOf = (i?: number) => THEMES[i ?? 0] || THEMES[0]
