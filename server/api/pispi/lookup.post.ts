import { defineEventHandler, readBody, createError } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const rawAlias = (body.alias || body.identifier || '') as string
  const alias = rawAlias.trim()

  if (!alias) {
    throw createError({
      statusCode: 400,
      statusMessage: "L'identifiant du compte ou alias est requis (champ 'alias' ou 'identifier')."
    })
  }

  if (alias.length < 3 || alias.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: "Format d'alias invalide (la longueur doit être comprise entre 3 et 100 caractères)."
    })
  }

  try {
    const result = await pispiApiFetch<any>(`/alias/${encodeURIComponent(alias)}`, {
      method: 'GET'
    })

    return {
      success: true,
      alias,
      beneficiary: {
        name: result.name || result.beneficiaryName || result.accountHolderName || result.creditorName || null,
        accountNumber: result.accountNumber || result.account || result.iban || null,
        participantCode: result.participantCode || result.institutionCode || null,
        status: result.status || result.accountStatus || 'ACTIVE'
      },
      data: result
    }
  } catch (error: any) {
    const statusCode = error.statusCode || error.status || 500
    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: `Aucun bénéficiaire trouvé pour l'alias '${alias}'.`
      })
    }
    throw createError({
      statusCode,
      statusMessage: error.statusMessage || error.message || "Erreur lors de la recherche du bénéficiaire PI-SPI."
    })
  }
})
