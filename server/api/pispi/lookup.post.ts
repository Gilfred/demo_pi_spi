import { defineEventHandler, readBody } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}

  const identifier = body.identifier
  const identifierType = body.identifierType || 'MSISDN' // e.g., MSISDN, IBAN, ALIAS

  if (!identifier) {
    throw createError({
      statusCode: 400,
      statusMessage: "L'identifiant du compte ou alias est requis (champ 'identifier')."
    })
  }

  try {
    const result = await pispiApiFetch('/v1/accounts/lookup', {
      method: 'POST',
      body: {
        identifier,
        identifierType
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
      message: error.statusMessage || error.message || "Erreur lors de la recherche de compte PI-SPI."
    }
  }
})
