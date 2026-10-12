import { defineEventHandler } from 'h3'
import { fetchPispiToken } from '../../utils/pispi'

export default defineEventHandler(async (event) => {
  try {
    const tokenData = await fetchPispiToken()
    // Mask sensitive token before responding to client interface
    return {
      success: true,
      message: "Authentification réussie auprès du serveur OAuth2 PI-SPI BCEAO.",
      tokenType: tokenData.token_type || 'Bearer',
      expiresIn: tokenData.expires_in || null,
      scope: tokenData.scope || null,
      tokenMasked: tokenData.access_token
        ? `${tokenData.access_token.substring(0, 6)}...${tokenData.access_token.substring(tokenData.access_token.length - 4)}`
        : null
    }
  } catch (error: any) {
    return {
      success: false,
      statusCode: error.statusCode || 500,
      message: error.statusMessage || error.message || "Erreur lors de l'authentification PI-SPI."
    }
  }
})
