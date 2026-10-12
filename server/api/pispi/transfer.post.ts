import { defineEventHandler, readBody } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}

  const { amount, currency = 'XOF', debtorAccount, creditorAccount, endToEndId } = body

  if (!amount || !debtorAccount || !creditorAccount) {
    throw createError({
      statusCode: 400,
      statusMessage: "Les champs 'amount', 'debtorAccount' et 'creditorAccount' sont requis."
    })
  }

  try {
    const result = await pispiApiFetch('/v1/transfers', {
      method: 'POST',
      body: {
        endToEndId: endToEndId || `TX-${Date.now()}`,
        amount: {
          value: Number(amount),
          currency
        },
        debtor: { account: debtorAccount },
        creditor: { account: creditorAccount }
      }
    })

    return {
      success: true,
      data: result
    }
  } catch (error: any) {
    return {
      success: false,
      statusCode: error.statusCode || 500,
      message: error.statusMessage || error.message || "Erreur lors de l'initiation du transfert PI-SPI."
    }
  }
})
