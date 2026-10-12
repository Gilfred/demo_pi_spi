import { defineEventHandler, getQuery } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const transactionId = query.transactionId as string

  if (!transactionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Le paramètre 'transactionId' est obligatoire."
    })
  }

  try {
    const result = await pispiApiFetch(`/v1/transfers/${encodeURIComponent(transactionId)}`, {
      method: 'GET'
    })

    return {
      success: true,
      data: result
    }
  } catch (error: any) {
    return {
      success: false,
      statusCode: error.statusCode || 500,
      message: error.statusMessage || error.message || "Erreur lors de la récupération du statut PI-SPI."
    }
  }
})
