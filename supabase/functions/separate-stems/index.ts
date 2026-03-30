import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN')!
const R2_BUCKET = Deno.env.get('R2_BUCKET') || 'tom'
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')!
const R2_ENDPOINT = Deno.env.get('R2_ENDPOINT')!
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')!
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase Edge Functions
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Demucs htdemucs_ft (cjwbw/demucs)
const DEMUCS_VERSION = '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953'

// Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Auth helper: extract user from JWT ─────────────────────────────────
async function getUserFromReq(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  return { id: user.id, email: user.email || '' }
}

// ─── Rate limit: 1 per day, admins unlimited ───────────────────────────
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; nextAvailable?: string }> {
  // Check if admin
  const { data: adminRow } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  if (adminRow) return { allowed: true } // Admin = unlimited

  // Check today's usage
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: usageRows, error } = await supabaseAdmin
    .from('separation_usage')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Rate limit check error:', error)
    return { allowed: true } // Allow on error (fail open)
  }

  if (usageRows && usageRows.length > 0) {
    // Already used today — calculate next available time
    const tomorrow = new Date(todayStart)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return {
      allowed: false,
      nextAvailable: tomorrow.toISOString(),
    }
  }

  return { allowed: true }
}

async function recordUsage(userId: string, predictionId: string, fileName: string) {
  await supabaseAdmin.from('separation_usage').insert({
    user_id: userId,
    prediction_id: predictionId,
    file_name: fileName,
  })
}

// ─── AWS Signature V4 for R2 ────────────────────────────────────────────
async function hmacSHA256(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const url = new URL(`/${R2_BUCKET}/${key}`, R2_ENDPOINT)
  const now = new Date()
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const shortDate = dateStamp.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const scope = `${shortDate}/${region}/${service}/aws4_request`

  const payloadHash = await sha256Hex(body)

  const headers: Record<string, string> = {
    'host': url.host,
    'x-amz-date': dateStamp,
    'x-amz-content-sha256': payloadHash,
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
    'content-length': body.byteLength.toString(),
  }

  const signedHeaderKeys = Object.keys(headers).sort()
  const signedHeaders = signedHeaderKeys.join(';')
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('')
  const canonicalRequest = [
    'PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n')

  const canonicalHash = await sha256Hex(new TextEncoder().encode(canonicalRequest))
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStamp}\n${scope}\n${canonicalHash}`

  let sigKey = await hmacSHA256(new TextEncoder().encode('AWS4' + R2_SECRET_ACCESS_KEY), shortDate)
  sigKey = await hmacSHA256(sigKey, region)
  sigKey = await hmacSHA256(sigKey, service)
  sigKey = await hmacSHA256(sigKey, 'aws4_request')

  const signature = [...new Uint8Array(await hmacSHA256(sigKey, stringToSign))]
    .map(b => b.toString(16).padStart(2, '0')).join('')

  const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { ...headers, 'authorization': authHeader },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`R2 upload failed (${res.status}): ${text}`)
  }
}

// ─── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    // ─── GET ?action=limit: Check user's remaining usage ─────────
    if (req.method === 'GET' && url.searchParams.get('action') === 'limit') {
      const user = await getUserFromReq(req)
      if (!user) return json({ error: 'Não autenticado' }, 401)

      const { allowed, nextAvailable } = await checkRateLimit(user.id)
      return json({ allowed, nextAvailable })
    }

    // ─── POST: Start separation ──────────────────────────────────
    if (req.method === 'POST' && !url.searchParams.has('action')) {
      const user = await getUserFromReq(req)
      if (!user) return json({ error: 'Não autenticado' }, 401)

      // Rate limit check
      const { allowed, nextAvailable } = await checkRateLimit(user.id)
      if (!allowed) {
        return json({
          error: 'Você já usou sua separação de hoje. Tente novamente amanhã.',
          nextAvailable,
          rateLimited: true,
        }, 429)
      }

      const { audioUrl, fileName } = await req.json()
      if (!audioUrl) return json({ error: 'audioUrl obrigatório' }, 400)

      const res = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: DEMUCS_VERSION,
          input: {
            audio: audioUrl,
            model_name: 'htdemucs_ft',
            output_format: 'mp3',
            mp3_bitrate: 320,
            clip_mode: 'rescale',
          },
        }),
      })

      const prediction = await res.json()
      if (prediction.error) return json({ error: prediction.error }, 500)

      // Record usage (counts the daily limit)
      await recordUsage(user.id, prediction.id, fileName || 'unknown')

      return json({
        predictionId: prediction.id,
        status: prediction.status,
        fileName,
      })
    }

    // ─── GET: Check status ───────────────────────────────────────
    if (req.method === 'GET' && !url.searchParams.has('action')) {
      const predictionId = url.searchParams.get('id')
      if (!predictionId) return json({ error: 'id obrigatório' }, 400)

      const res = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` } },
      )
      const prediction = await res.json()

      return json({
        predictionId: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
      })
    }

    // ─── POST ?action=save: Save stems to R2 ────────────────────
    if (req.method === 'POST' && url.searchParams.get('action') === 'save') {
      const { predictionId, songName, genre } = await req.json()

      const res = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` } },
      )
      const prediction = await res.json()

      if (prediction.status !== 'succeeded' || !prediction.output) {
        return json({ error: 'Separação ainda não concluída' }, 400)
      }

      const songSlug = slugify(songName || 'separacao')
      const genreSlug = genre ? slugify(genre) : 'user-uploads'

      const stemNames: Record<string, string> = {
        vocals: 'Voz',
        drums: 'Bateria',
        bass: 'Baixo',
        other: 'Outros',
      }

      const stems: Array<{
        name: string; slug: string; key: string; url: string; format: string; size: number
      }> = []

      const output = prediction.output
      for (const [stemKey, stemUrl] of Object.entries(output)) {
        if (typeof stemUrl !== 'string') continue

        const stemLabel = stemNames[stemKey] || stemKey
        const stemSlug = slugify(stemLabel)

        const audioRes = await fetch(stemUrl)
        const audioBuffer = new Uint8Array(await audioRes.arrayBuffer())

        const ext = stemUrl.includes('.mp3') ? '.mp3' : '.wav'
        const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav'
        const r2Key = `stems/${genreSlug}/${songSlug}/${stemSlug}${ext}`

        await uploadToR2(r2Key, audioBuffer, contentType)

        stems.push({
          name: stemLabel,
          slug: stemSlug,
          key: r2Key,
          url: `${R2_PUBLIC_URL}/${r2Key}`,
          format: ext.slice(1),
          size: audioBuffer.byteLength,
        })
      }

      return json({
        name: songName,
        slug: songSlug,
        genre: genre || 'Upload',
        genreSlug,
        stems,
        stemCount: stems.length,
      })
    }

    return json({ error: 'Rota não encontrada' }, 404)
  } catch (err) {
    console.error('Edge Function error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
