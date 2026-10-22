/**
 * Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central), gerado no próprio aparelho.
 * O dinheiro vai direto para a chave Pix do músico: o app não toca no pagamento.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63 */
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Tira acentos e caracteres que o padrão não aceita */
function plain(s: string, max: number): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .,\-]/g, '').trim().slice(0, max) || 'ARTISTA'
}

/** Detecta o tipo e deixa a chave no formato que o Pix espera */
export function normalizePixKey(raw: string): { key: string; type: PixKeyType } | null {
  const v = raw.trim()
  if (!v) return null
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { key: v.toLowerCase(), type: 'email' }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return { key: v.toLowerCase(), type: 'aleatoria' }
  const digits = v.replace(/\D/g, '')
  if (v.startsWith('+')) return digits.length >= 12 ? { key: `+${digits}`, type: 'telefone' } : null
  if (digits.length === 14) return { key: digits, type: 'cnpj' }
  if (digits.length === 11 && isCpf(digits)) return { key: digits, type: 'cpf' }
  // celular com DDD (11 dígitos começando com DDD + 9) ou com 55 na frente
  if (digits.length === 11 || digits.length === 10) return { key: `+55${digits}`, type: 'telefone' }
  if (digits.length === 13 && digits.startsWith('55')) return { key: `+${digits}`, type: 'telefone' }
  return null
}

function isCpf(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export interface PixParams {
  key: string
  name: string
  city: string
  amount?: number
  message?: string
}

/** Monta o código "copia e cola" (também serve para o QR do Pix) */
export function pixPayload({ key, name, city, amount, message }: PixParams): string {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key) + (message ? tlv('02', plain(message, 40)) : '')
  let p = tlv('00', '01')
  p += tlv('26', account)
  p += tlv('52', '0000')
  p += tlv('53', '986')
  if (amount && amount > 0) p += tlv('54', amount.toFixed(2))
  p += tlv('58', 'BR')
  p += tlv('59', plain(name, 25).toUpperCase())
  p += tlv('60', plain(city, 15).toUpperCase())
  p += tlv('62', tlv('05', '***'))
  p += '6304'
  return p + crc16(p)
}
