import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * Webhook receiver for Greenn payment platform.
 * When a payment is approved, Greenn POSTs here with buyer data.
 * We save the buyer's email to approved_buyers so they can register.
 *
 * Configure in Greenn:
 *   URL: https://palco-solo-app.vercel.app/api/webhook-greenn
 *   Method: POST
 *   Event: Compra aprovada
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Simple token to validate webhook authenticity
const WEBHOOK_SECRET = process.env.GREENN_WEBHOOK_SECRET || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate webhook secret (optional but recommended)
  if (WEBHOOK_SECRET) {
    const token = req.headers['x-webhook-secret'] || req.query.secret
    if (token !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const body = req.body

    // Greenn sends different payload structures depending on the event
    // Common fields: email, transaction, product, status
    const email = body?.email
      || body?.Customer?.email
      || body?.customer?.email
      || body?.buyer?.email
      || body?.data?.customer?.email
      || body?.data?.email

    const status = body?.status
      || body?.transaction?.status
      || body?.data?.status
      || 'approved'

    const transactionId = body?.transaction_id
      || body?.transaction?.id
      || body?.data?.transaction_id
      || body?.id
      || null

    const productName = body?.product?.name
      || body?.product_name
      || body?.data?.product?.name
      || null

    const buyerName = body?.name
      || body?.Customer?.name
      || body?.customer?.name
      || body?.buyer?.name
      || body?.data?.customer?.name
      || null

    if (!email) {
      console.error('Webhook received without email:', JSON.stringify(body).slice(0, 500))
      return res.status(400).json({ error: 'Email not found in payload' })
    }

    // Only process approved/paid transactions
    const approvedStatuses = ['approved', 'paid', 'completed', 'active', 'Aprovado', 'Pago']
    const isApproved = approvedStatuses.some(s =>
      String(status).toLowerCase() === s.toLowerCase()
    )

    if (!isApproved) {
      console.log(`Skipping non-approved status: ${status} for ${email}`)
      return res.status(200).json({ ok: true, skipped: true, status })
    }

    // Determine plan based on product/price
    let plan = 'basic'
    const price = body?.price || body?.transaction?.price || body?.data?.price || 0
    const priceNum = typeof price === 'string' ? parseFloat(price) : price
    if (priceNum >= 180) plan = 'advanced'
    else if (priceNum >= 100) plan = 'professional'

    // Upsert into approved_buyers
    const { error } = await supabase
      .from('approved_buyers')
      .upsert(
        {
          email: email.toLowerCase().trim(),
          plan,
          greenn_transaction_id: transactionId,
          product_name: productName,
          buyer_name: buyerName,
          approved_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({ error: 'Database error' })
    }

    console.log(`Buyer approved: ${email} (plan: ${plan})`)
    return res.status(200).json({ ok: true, email, plan })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
