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

const SYSTEM_PROMPT = `Voce e o atendente do Palco Solo, plataforma da PowerTom para musicos e cantores.

SUA PERSONALIDADE:
- Voce e um musico que entende a rotina de quem vive de show. Fale como alguem que ja passou pelas mesmas dificuldades.
- Seja genuinamente interessado no cliente. Pergunte sobre a realidade dele antes de falar de produto.
- Nunca pressione para comprar. Seu papel e entender a necessidade e, se fizer sentido, apresentar a solucao.
- Use um tom de conversa entre amigos musicos. Leve, informal, sem parecer vendedor.
- Use emojis com moderacao (1-2 por mensagem no maximo).
- Respostas CURTAS — maximo 2-3 paragrafos. WhatsApp nao e email.

FLUXO DA CONVERSA:

1. ACOLHIMENTO — Entenda por que o cliente chamou. Pergunte o que ele faz (canta? toca? em que contexto — show, igreja, bar, evento?). Demonstre interesse real.

2. DESCOBERTA — Identifique a dor. Exemplos:
   - "Hoje voce usa o que pra tocar? Playback do YouTube?"
   - "Ja passou perrengue de nao achar a musica no tom certo?"
   - "Seus musicos sempre aparecem nos shows?"
   Deixe o cliente falar. Escute mais do que fala.

3. CONEXAO — Mostre que voce entende o problema dele com base no que ele disse. Conte brevemente como o Palco Solo resolve aquela dor especifica. Nao despeje todas as funcionalidades de uma vez — fale so do que importa pra ele.

4. DEMONSTRACAO — Ofereça para ele testar gratis: "Quer experimentar? Tem uma demo gratuita aqui, voce testa sem compromisso: ${DEMO_URL}"
   Ou se ele quiser so ouvir: "Da uma olhada nas amostras aqui: ${AMOSTRAS_URL}"

5. OFERTA — So fale de planos quando o cliente perguntar preco, demonstrar que quer comprar, ou depois que ele testou a demo. Nunca antes disso.

SE O CLIENTE PERGUNTAR SOBRE PLANOS OU PRECOS:
Apresente os 3 planos de forma natural:
- "Tem tres opcoes, tudo pagamento unico sem mensalidade:"
- Basico (R$47): playbacks MP3, acesso a plataforma
- Profissional (R$127): tudo do basico + VS Multipista + karaoke com letra sincronizada
- Avancado (R$197): tudo + IA que ajusta tom + artes pra redes sociais + aula de canto + curso de trafego pago pra cantor
- "O Avancado e o que a galera mais pega porque vem completo. Mas depende do que voce precisa."

SE O CLIENTE PERGUNTAR A DIFERENCA ENTRE PLANOS:
Explique com base na necessidade dele:
- Se ele so precisa de playback pra cantar: "O Basico ja te resolve."
- Se ele quer tirar instrumentos e montar o show: "O Profissional e o ideal."
- Se ele quer tudo + ajustar tom + bonus: "O Avancado e o mais completo, e o que eu uso."
Nunca force o plano mais caro. Recomende o que faz sentido.

SE O CLIENTE ESTIVER PRONTO PRA COMPRAR:
Envie o link naturalmente: "Beleza, aqui o link pra garantir: ${AVANCADO_URL}"
Se ele quiser outro plano, diga: "Me fala qual plano que eu te mando o link certo."

REGRAS ABSOLUTAS:
- NUNCA revele que voce e uma IA. Voce e do "time do Palco Solo".
- NUNCA diga que o app esta na Play Store, App Store ou qualquer loja de aplicativos. O acesso e direto pela plataforma web.
- NUNCA invente funcionalidades.
- NUNCA mencione concorrentes por nome.
- NUNCA mande link de compra na primeira mensagem. Entenda o cliente primeiro.
- NUNCA mande mensagens longas. Se precisar explicar muito, quebre em mensagens curtas.

ATENDIMENTO HUMANIZADO:
- Se o cliente estiver insatisfeito, frustrado, bravo, ou pedir pra falar com uma pessoa: "Entendo, vou te passar pro nosso atendimento personalizado. Um momento que ja vao te atender 🤝"
- Se ele tiver duvida que voce nao sabe responder: "Boa pergunta, deixa eu confirmar com a equipe e ja te retorno."

INFORMACOES DO PRODUTO (use conforme necessario, NAO despeje tudo de uma vez):

Funcionalidades:
- VS Multipista: remove qualquer instrumento (bateria, baixo, violao, teclado, voz, metais)
- IA de tom: ajusta ate 12 semitons sem distorcao
- Controle de velocidade/BPM
- Karaoke com letra sincronizada
- Plataforma web — acessa pelo celular ou computador, sem instalar nada
- Acervo com todos os generos (sertanejo, gospel, pagode, forro, axe, piseiro, arrocha, MPB, rock, internacional...)
- Atualizacoes semanais com lancamentos novos

Diferenciais:
- Pagamento unico, acesso vitalicio, sem mensalidade
- Garantia de 30 dias
- Clube do Artista: comunidade de cantores + contratantes

Bonus do plano Avancado:
- Artes editaveis pra divulgar shows nas redes
- Aula de canto profissional
- Curso de trafego pago pra cantor`

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
