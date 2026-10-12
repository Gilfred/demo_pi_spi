// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    // Private keys which are only available server-side
    pispi: {
      baseUrl: process.env.PISPI_BASE_URL || 'https://sandbox.pispi.bceao.int',
      authUrl: process.env.PISPI_AUTH_URL || 'https://sandbox-auth.pispi.bceao.int/oauth/token',
      clientId: process.env.PISPI_CLIENT_ID || '',
      clientSecret: process.env.PISPI_CLIENT_SECRET || '',
      apiKey: process.env.PISPI_API_KEY || '',
      // scope: process.env.PISPI_SCOPE || 'pispi:api',
      participantCode: process.env.PISPI_PARTICIPANT_CODE || '',
      // certPath: process.env.PISPI_CERT_PATH || '',
      keyPath: process.env.PISPI_KEY_PATH || ''
    }
  }
})
