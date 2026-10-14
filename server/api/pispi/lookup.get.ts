import { defineEventHandler, getQuery, createError } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawAlias = (query.alias || query.identifier || query.account || '') as string
  const alias = rawAlias.trim()

  if (!alias) {
    throw createError({
      statusCode: 400,
      statusMessage: "Le paramètre 'alias' est obligatoire."
    })
  }

  if (alias.length < 3 || alias.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: "Format d'alias ou numéro invalide (la longueur doit être comprise entre 3 et 100 caractères)."
    })
  }

  try {
    const result = await pispiApiFetch<any>(`/alias/${encodeURIComponent(alias)}`, {
      method: 'GET'
    })

    return {
      success: true,
      type: 'alias',
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

    // Fallback to /comptes when /alias/{cle} fails (e.g., input is an account number, not a SHID alias)
    if (statusCode === 400 || statusCode === 404) {
      try {
        let accountResult: any
        try {
          accountResult = await pispiApiFetch<any>(`/comptes/${encodeURIComponent(alias)}`, { method: 'GET' })
        } catch {
          // If /comptes/{id} is not supported or returns error, fetch all accounts via /comptes
          accountResult = await pispiApiFetch<any>('/comptes', { method: 'GET' })
        }

        const items = Array.isArray(accountResult)
          ? accountResult
          : (accountResult?.data && Array.isArray(accountResult.data) ? accountResult.data : [accountResult])

        const acc = items.find((a: any) =>
          a && (a.numero === alias || a.numeroCompte === alias || a.accountNumber === alias || a.id === alias)
        ) || (accountResult?.numero || accountResult?.numeroCompte ? accountResult : (items.length === 1 ? items[0] : null))

        if (acc) {
          return {
            success: true,
            type: 'account',
            alias,
            beneficiary: {
              name: acc.nom || acc.name || acc.intitule || acc.accountHolderName || 'Titulaire de compte',
              accountNumber: acc.numero || acc.numeroCompte || acc.accountNumber || acc.id || alias,
              participantCode: acc.codeParticipant || acc.participantCode || null,
              status: acc.statut || acc.status || 'OUVERT'
            },
            data: acc
          }
        }
      } catch {
        // preserve primary error if fallback fails
      }
    }

    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: `Aucun bénéficiaire ou compte trouvé pour l'identifiant '${alias}'.`
      })
    }
    throw createError({
      statusCode,
      statusMessage: error.statusMessage || error.message || "Erreur lors de la recherche du bénéficiaire PI-SPI."
    })
  }
})
