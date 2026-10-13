export interface PispiConfig {
  baseUrl: string
  authUrl: string
  clientId: string
  clientSecret: string
  apiKey: string
  scope: string
  participantCode: string
  certPath?: string
  keyPath?: string
}

export interface PispiTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

interface TokenCacheEntry {
  data: PispiTokenResponse
  expiresAt: number
}

let tokenCache: TokenCacheEntry | null = null

/**
 * Resets the in-memory token cache (useful for testing or cache invalidation).
 */
export function clearPispiTokenCache(): void {
  tokenCache = null
}

/**
 * Helper to retrieve the server-side PI-SPI configuration.
 */
export function getPispiConfig(): PispiConfig {
  try {
    // @ts-ignore
    const config = typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : {}
    if (config && config.pispi) {
      return config.pispi as PispiConfig
    }
  } catch {
    // Fallback when outside Nuxt context (e.g. unit testing)
  }

  return {
    baseUrl: process.env.PISPI_BASE_URL || '',
    authUrl: process.env.PISPI_AUTH_URL || '',
    clientId: process.env.PISPI_CLIENT_ID || '',
    clientSecret: process.env.PISPI_CLIENT_SECRET || '',
    apiKey: process.env.PISPI_API_KEY || '',
    scope: process.env.PISPI_SCOPE || '',
    participantCode: process.env.PISPI_PARTICIPANT_CODE || '',
    certPath: process.env.PISPI_CERT_PATH || '',
    keyPath: process.env.PISPI_KEY_PATH || ''
  }
}

/**
 * Checks if mandatory PI-SPI credentials and configurations are defined.
 */
export function validatePispiConfig(config: PispiConfig): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  if (!config.baseUrl) missing.push('PISPI_BASE_URL')
  if (!config.authUrl) missing.push('PISPI_AUTH_URL')
  if (!config.clientId) missing.push('PISPI_CLIENT_ID')
  if (!config.clientSecret) missing.push('PISPI_CLIENT_SECRET')
  if (!config.apiKey) missing.push('PISPI_API_KEY')
  if (!config.participantCode) missing.push('PISPI_PARTICIPANT_CODE')

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Helper to strip any sensitive credentials (client secret, API key, tokens) from error messages or logs.
 */
function sanitizeErrorMessage(message: string, secrets: string[]): string {
  let sanitized = message || ''
  for (const secret of secrets) {
    if (secret && secret.length > 2) {
      sanitized = sanitized.split(secret).join('[REDACTED]')
    }
  }
  return sanitized
}

/**
 * Performs OAuth2 client credentials authentication against the PI-SPI Auth Server.
 * Reuses cached token if valid. NEVER returns or logs secrets.
 */
export async function fetchPispiToken(): Promise<PispiTokenResponse> {
  const config = getPispiConfig()
  const { valid, missing } = validatePispiConfig(config)

  if (!valid) {
    throw createError({
      statusCode: 400,
      statusMessage: `Configuration PI-SPI incomplète. Variables manquantes: ${missing.join(', ')}`
    })
  }

  // Check in-memory cache (30 second safety margin before expiry)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30000) {
    return tokenCache.data
  }

  const secretsToMask = [config.clientSecret, config.apiKey].filter(Boolean)

  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append('client_id', config.clientId)
  params.append('client_secret', config.clientSecret)
  if (config.scope) {
    params.append('scope', config.scope)
  }

  try {
    const response = await fetch(config.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'X-API-Key': config.apiKey
      },
      body: params.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      const sanitized = sanitizeErrorMessage(errorText || response.statusText, secretsToMask)
      throw createError({
        statusCode: response.status,
        statusMessage: `Échec d'authentification auprès de l'IDP PI-SPI (${response.status}): ${sanitized}`
      })
    }

    const data = await response.json() as PispiTokenResponse
    if (!data.access_token) {
      throw createError({
        statusCode: 502,
        statusMessage: "Réponse invalide de l'IDP PI-SPI: access_token absent."
      })
    }

    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
    tokenCache = {
      data,
      expiresAt: Date.now() + expiresIn * 1000
    }

    return data
  } catch (err: any) {
    if (err.statusCode) throw err
    const safeMsg = sanitizeErrorMessage(err.message, secretsToMask)
    throw createError({
      statusCode: 503,
      statusMessage: `Erreur de connexion au serveur d'authentification PI-SPI: ${safeMsg}`
    })
  }
}

/**
 * Sends an authenticated request to the PI-SPI Sandbox API Gateway.
 */
export async function pispiApiFetch<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: any
    headers?: Record<string, string>
  } = {}
): Promise<T> {
  const config = getPispiConfig()
  const tokenData = await fetchPispiToken()

  // Cleanly join baseUrl and endpoint without altering paths or adding unrequested prefixes
  const cleanBase = config.baseUrl.replace(/\/$/, '')
  const cleanEndpoint = endpoint.replace(/^\//, '')
  const url = `${cleanBase}/${cleanEndpoint}`

  const tokenType = (tokenData.token_type || 'Bearer').trim()
  const defaultAuth = `${tokenType} ${tokenData.access_token}`

  const requestHeaders: Record<string, string> = {
    'Authorization': defaultAuth,
    'X-API-Key': config.apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  }

  if (config.participantCode) {
    requestHeaders['X-Participant-Code'] = config.participantCode
  }

  const secretsToMask = [config.clientSecret, config.apiKey, tokenData.access_token].filter(Boolean)

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: requestHeaders,
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!response.ok) {
      const errorBody = await response.text()
      const sanitized = sanitizeErrorMessage(errorBody || response.statusText, secretsToMask)
      throw createError({
        statusCode: response.status,
        statusMessage: `Erreur API PI-SPI (${response.status}): ${sanitized}`
      })
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T
    }

    const text = await response.text()
    if (!text || !text.trim()) {
      return {} as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      return { raw: text } as T
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    const safeMsg = sanitizeErrorMessage(err.message, secretsToMask)
    throw createError({
      statusCode: 502,
      statusMessage: `Erreur lors de l'appel à l'API PI-SPI Gateway (${endpoint}): ${safeMsg}`
    })
  }
}
