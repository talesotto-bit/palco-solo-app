import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Z-API + Claude — Agente de vendas WhatsApp para Palco Solo
 *
 * Configure na Z-API:
 *   Webhook de recebimento: https://palco-solo-app.vercel.app/api/webhook-zapi
 *   Metodo: POST
 */

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || ''
const ZAPI_TOKEN = process.env.ZAPI_TOKEN || ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const AVANCADO_URL = 'https://payfast.greenn.com.br/152815/offer/gxUz6f'
const DEMO_URL = 'https://palco-solo-app.vercel.app/demo'
const AMOSTRAS_URL = 'https://www.palcosolo.online/amostras'

const SYSTEM_PROMPT = `Voce e o assistente de vendas do Palco Solo, plataforma da PowerTom para musicos e cantores profissionais.

Seu objetivo: responder duvidas e convencer o cliente a adquirir o plano Avancado (R$197).

REGRAS:
- Seja persuasivo, amigavel e direto. Use emojis com moderacao.
- Responda sempre em portugues brasileiro informal.
- Mantenha respostas curtas (maximo 3-4 paragrafos). WhatsApp nao e lugar para textao.
- Sempre direcione para o fechamento da venda.
- Nunca invente informacoes. Se nao souber, diga que vai verificar.
- Nunca revele que voce e uma IA. Voce e o "time de suporte do Palco Solo".
- Nunca mencione concorrentes por nome.

INFORMACOES DO PRODUTO:

Planos (pagamento unico, acesso vitalicio, sem mensalidade):
- Basico: R$47 — Playbacks MP3 + acesso ao app
- Profissional: R$127 — Tudo do basico + VS Multipista + Karaoke com letra
- Avancado: R$197 — Tudo + separador de pistas com IA + artes para redes sociais + aula de canto + trafego pago para cantor (MAIS VENDIDO, sempre recomendar este)

Funcionalidades:
- VS Multipista: remove qualquer instrumento (bateria, baixo, violao, teclado, voz, metais). O musico toca junto com o arranjo que quiser.
- IA de tom: ajusta o tom da musica para a voz do cantor sem distorcao.
- Controle de velocidade: ajusta o BPM sem alterar o tom.
- Karaoke: letra sincronizada na tela em tempo real.
- App para iOS e Android: funciona offline apos download.
- Acervo: generos variados — sertanejo, gospel, pagode, forro, axe, piseiro, arrocha, MPB, rock, pop, internacional, brega e mais.
- Atualizacoes semanais com lancamentos novos.

Diferenciais:
- Pagamento UNICO (sem mensalidade, sem renovacao)
- Acesso VITALICIO
- Garantia de 30 dias (devolucao total, sem burocracia)
- Unica plataforma com VS Multipista + IA de tom + Karaoke tudo junto

Links uteis:
- Comprar plano Avancado: ${AVANCADO_URL}
- Experimentar demo gratis: ${DEMO_URL}
- Ouvir amostras: ${AMOSTRAS_URL}

Quando o cliente demonstrar interesse, envie o link de compra do Avancado.
Quando pedir para ouvir/testar, envie o link da demo ou amostras.`

// Simple in-memory conversation store (per phone, last 10 messages)
// In production, use Redis or Supabase for persistence
const conversations = new Map<string, { role: 'user' | 'assistant'; content: string }[]>()

function getConversation(phone: string) {
  if (!conversations.has(phone)) conversations.set(phone, [])
  return conversations.get(phone)!
}

function addMessage(phone: string, role: 'user' | 'assistant', content: string) {
  const conv = getConversation(phone)
  conv.push({ role, content })
  // Keep only last 20 messages (10 exchanges)
  if (conv.length > 20) conv.splice(0, conv.length - 20)
}

async function sendWhatsAppMessage(phone: string, text: string) {
  const url = `${ZAPI_BASE}/send-text`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message: text }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Z-API send error:', res.status, err)
  }
  return res.ok
}

async function generateResponse(phone: string, userMessage: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  addMessage(phone, 'user', userMessage)
  const messages = getConversation(phone)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages,
  })

  const assistantText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  addMessage(phone, 'assistant', assistantText)
  return assistantText
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', agent: 'palco-solo-whatsapp' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body

    // Z-API sends different event types
    // We only care about received text messages
    const isTextMessage = body?.text?.message || body?.text
    const phone = body?.phone || body?.from
    const messageText = body?.text?.message || body?.text || ''

    // Ignore non-text messages (images, audio, etc.), status updates, and our own messages
    if (!isTextMessage || !phone || body?.fromMe) {
      return res.status(200).json({ ok: true, ignored: true })
    }

    // Ignore group messages
    if (phone.includes('@g.us') || body?.isGroup) {
      return res.status(200).json({ ok: true, ignored: 'group' })
    }

    console.log(`[WhatsApp] ${phone}: ${messageText.slice(0, 100)}`)

    // Generate AI response
    const reply = await generateResponse(phone, messageText)

    // Send via Z-API
    await sendWhatsAppMessage(phone, reply)

    console.log(`[WhatsApp] Reply to ${phone}: ${reply.slice(0, 100)}`)
    return res.status(200).json({ ok: true })
  } catch (err: any) {
    console.error('Webhook error:', err?.message || err)
    return res.status(200).json({ ok: true, error: 'internal' })
    // Return 200 even on error to prevent Z-API from retrying
  }
}
