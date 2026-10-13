import { defineEventHandler, getQuery, createError } from 'h3'
import { pispiApiFetch } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const number = (query.number || query.accountNumber || query.account || '').toString().trim()
  const includeAliases = query.aliases === 'true' || query.aliases === '1'

  try {
    if (!number) {
      // List all accounts
      const result = await pispiApiFetch<any>('/comptes', { method: 'GET' })
      return {
        success: true,
        data: result
      }
    }

    // Get specific account
    const endpoint = includeAliases ? `/comptes/${encodeURIComponent(number)}/alias` : `/comptes/${encodeURIComponent(number)}`
    const result = await pispiApiFetch<any>(endpoint, { method: 'GET' })

    return {
      success: true,
      accountNumber: number,
      data: result
    }
  } catch (error: any) {
    const statusCode = error.statusCode || error.status || 500
    throw createError({
      statusCode,
      statusMessage: error.statusMessage || error.message || "Erreur lors de la consultation des comptes PI-SPI."
    })
  }
})
