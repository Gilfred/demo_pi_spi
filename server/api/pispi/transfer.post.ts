import { defineEventHandler, readBody, createError } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

// In-memory cache for double submission protection
const processedTransfers = new Map<string, { timestamp: number; response: any }>()
const DEDUPLICATION_TTL_MS = 5 * 60 * 1000 // 5 minutes

function cleanOldDeduplicationCache() {
  const now = Date.now()
  for (const [key, entry] of processedTransfers.entries()) {
    if (now - entry.timestamp > DEDUPLICATION_TTL_MS) {
      processedTransfers.delete(key)
    }
  }
}

export default defineEventHandler(async (event) => {
  cleanOldDeduplicationCache()

  const body = await readBody(event) || {}

  const rawAmount = body.amount
  const amount = Number(rawAmount)
  const currency = (body.currency || 'XOF').toUpperCase()
  const debtorAccount = body.debtorAccount || body.debtor || body.payeurAlias || body.payeur
  const creditorAccount = body.creditorAccount || body.creditor || body.payeAlias || body.beneficiaireAlias || body.beneficiaire || body.creditorAlias
  let endToEndId = (body.endToEndId || body.end2endId || '').trim()

  if (isNaN(amount) || amount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Le montant ('amount') doit être un nombre strictement supérieur à 0."
    })
  }

  if (!debtorAccount) {
    throw createError({
      statusCode: 400,
      statusMessage: "Le compte ou l'identifiant du débiteur ('debtorAccount') est obligatoire."
    })
  }

  if (!creditorAccount) {
    throw createError({
      statusCode: 400,
      statusMessage: "Le compte ou l'identifiant du créancier ('creditorAccount') est obligatoire."
    })
  }

  if (!endToEndId) {
    endToEndId = `E2E${Date.now()}${Math.floor(Math.random() * 1000)}`
  }

  // Idempotency & double submission check
  if (processedTransfers.has(endToEndId)) {
    const cached = processedTransfers.get(endToEndId)!
    throw createError({
      statusCode: 409,
      statusMessage: `Demande de transfert en double soumission détectée pour l'identifiant 'endToEndId' = ${endToEndId}.`
    })
  }

  const idempotencyKey = body.idempotencyKey || endToEndId

  let txId = (body.txId || body.transactionId || '').trim()
  if (!txId) {
    txId = `TX${Date.now()}${Math.floor(Math.random() * 1000)}`
  }

  const payeurAlias = body.payeurAlias || (typeof debtorAccount === 'string' ? debtorAccount : (debtorAccount?.account || debtorAccount?.alias || debtorAccount?.id || ''))
  const beneficiaireAlias = body.beneficiaireAlias || body.payeAlias || body.creditorAlias || (typeof creditorAccount === 'string' ? creditorAccount : (creditorAccount?.account || creditorAccount?.alias || creditorAccount?.id || ''))
  const payeAlias = body.payeAlias || beneficiaireAlias
  const remittanceInformation = body.remittanceInformation || body.reason || body.motif || 'Transfert instantane PI-SPI'

  const requestPayload: Record<string, any> = {
    txId,
    endToEndId,
    payeurAlias,
    payeAlias,
    beneficiaireAlias,
    montant: amount,
    devise: currency,
    motif: remittanceInformation,
    confirmation: body.confirmation ?? true,
    amount: {
      value: amount,
      currency
    },
    debtor: typeof debtorAccount === 'object' ? debtorAccount : { account: debtorAccount, alias: payeurAlias },
    creditor: typeof creditorAccount === 'object' ? creditorAccount : { account: creditorAccount, alias: payeAlias },
    remittanceInformation
  }

  try {
    const initResult = await pispiApiFetch<any>('/paiements-envoyes', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey
      },
      body: requestPayload
    })

    const transactionId = initResult.transactionId || initResult.txId || initResult.id || null
    let status = (initResult.status || initResult.paymentStatus || 'INITIATED').toUpperCase()

    // Handle payment confirmation step if required by API status or requested by autoConfirm
    if ((status === 'PENDING_CONFIRMATION' || status === 'REQUIRES_CONFIRMATION' || body.autoConfirm) && transactionId) {
      try {
        const confirmResult = await pispiApiFetch<any>(`/paiements-envoyes/${encodeURIComponent(transactionId)}/confirmations`, {
          method: 'PUT',
          body: {
            confirmation: true,
            status: 'CONFIRMED',
            statut: 'CONFIRMED',
            confirmationTimestamp: new Date().toISOString()
          }
        })
        status = (confirmResult.status || confirmResult.statut || 'CONFIRMED').toUpperCase()
      } catch (confirmErr: any) {
        // Log or preserve status
      }
    }

    const responseData = {
      success: true,
      transactionId,
      endToEndId,
      status,
      amount,
      currency,
      data: initResult
    }

    // Cache successful transfer key to protect against double submissions
    processedTransfers.set(endToEndId, {
      timestamp: Date.now(),
      response: responseData
    })

    return responseData
  } catch (error: any) {
    const statusCode = error.statusCode || error.status || 500
    throw createError({
      statusCode,
      statusMessage: error.statusMessage || error.message || "Erreur lors de l'initiation du transfert PI-SPI."
    })
  }
})
