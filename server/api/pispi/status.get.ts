import { defineEventHandler, getQuery, createError } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawId = (query.id || query.transactionId || query.endToEndId || query.end2endId || '') as string
  const id = rawId.trim()
  const isE2e = query.type === 'end2end' || query.type === 'e2e' || Boolean(query.endToEndId || query.end2endId) || id.startsWith('E2E')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "L'identifiant de la transaction ('id') est obligatoire."
    })
  }

  try {
    let result: any
    let endpointUsed = ''

    if (isE2e) {
      endpointUsed = `/paiements/${encodeURIComponent(id)}/statuts`
      result = await pispiApiFetch<any>(endpointUsed, { method: 'GET' })
    } else {
      endpointUsed = `/paiements/${encodeURIComponent(id)}`
      try {
        result = await pispiApiFetch<any>(endpointUsed, { method: 'GET' })
      } catch (err: any) {
        if (err.statusCode === 404) {
          endpointUsed = `/paiements/${encodeURIComponent(id)}/statuts`
          result = await pispiApiFetch<any>(endpointUsed, { method: 'GET' })
        } else {
          throw err
        }
      }
    }

    const transactionId = result.transactionId || result.txId || (isE2e ? null : id)
    const endToEndId = result.endToEndId || result.end2endId || (isE2e ? id : null)
    const status = (result.status || result.paymentStatus || result.transactionStatus || 'UNKNOWN').toUpperCase()

    return {
      success: true,
      id,
      transactionId,
      endToEndId,
      status,
      amount: result.amount || null,
      data: result,
      endpointUsed
    }
  } catch (error: any) {
    const statusCode = error.statusCode || error.status || 500
    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: `Aucune transaction trouvée pour l'identifiant '${id}'.`
      })
    }

    throw createError({
      statusCode,
      statusMessage: error.statusMessage || error.message || "Erreur lors de la consultation du statut PI-SPI."
    })
  }
})
