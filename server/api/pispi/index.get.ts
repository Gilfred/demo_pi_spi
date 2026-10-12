import { defineEventHandler } from 'h3'
import { getPispiConfig, validatePispiConfig } from '../../utils/pispi'

export default defineEventHandler((event) => {
  const config = getPispiConfig()
  const validation = validatePispiConfig(config)

  // Safe configuration status without leaking clientSecret or API Keys
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PI-SPI BCEAO Nuxt Bridge',
    sandboxMode: true,
    configuration: {
      isConfigured: validation.valid,
      missingVariables: validation.missing,
      baseUrl: config.baseUrl,
      authUrl: config.authUrl,
      clientIdProvided: Boolean(config.clientId),
      clientSecretProvided: Boolean(config.clientSecret),
      apiKeyProvided: Boolean(config.apiKey),
      participantCodeProvided: Boolean(config.participantCode),
      scope: config.scope,
      mTLSCertificateProvided: Boolean(config.certPath && config.keyPath)
    },
    endpointsAvailable: [
      { path: '/api/pispi', method: 'GET', description: 'Statut de la configuration et métadonnées PI-SPI' },
      { path: '/api/pispi/auth', method: 'POST', description: "Test d'authentification OAuth2 auprès de l'IDP PI-SPI" },
      { path: '/api/pispi/lookup', method: 'POST', description: "Vérification d'un compte/alias auprès de PI-SPI (lookup)" },
      { path: '/api/pispi/transfer', method: 'POST', description: "Initiation d'un virement/transfert instantané PI-SPI" },
      { path: '/api/pispi/status', method: 'GET', description: "Interrogation du statut d'une transaction PI-SPI" }
    ],
    prerequisites: [
      "Inscription préalable sur le portail développeur PI-SPI de la BCEAO",
      "Génération du Client ID, Client Secret et API Key Sandbox",
      "Attribution d'un code participant BCEAO",
      "Configuration du certificat client mTLS en environnement restreint/sandbox",
      "Renseignement des variables dans le fichier .env (cf. .env.example)"
    ]
  }
})
