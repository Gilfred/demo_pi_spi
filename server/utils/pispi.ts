import { useRuntimeConfig } from '#imports'

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

/**
 * Helper to retrieve the server-side PI-SPI configuration.
 */
export function getPispiConfig(): PispiConfig {
  const config = useRuntimeConfig()
  return config.pispi as PispiConfig
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
 * Performs authentic OAuth2 client credentials authentication against the PI-SPI Auth Server.
 * NEVER returns or logs secrets.
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

  // OAuth2 client_credentials grant request
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
      throw createError({
        statusCode: response.status,
        statusMessage: `Échec d'authentification auprès de l'IDP PI-SPI (${response.status}): ${errorText || response.statusText}`
      })
    }

    const data = await response.json() as PispiTokenResponse
    if (!data.access_token) {
      throw createError({
        statusCode: 502,
        statusMessage: "Réponse invalide de l'IDP PI-SPI: access_token absent."
      })
    }

    return data
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({
      statusCode: 503,
      statusMessage: `Erreur de connexion au serveur d'authentification PI-SPI (${config.authUrl}): ${err.message}`
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

  const url = `${config.baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`

  const requestHeaders: Record<string, string> = {
    'Authorization': `${tokenData.token_type || 'Bearer'} ${tokenData.access_token}`,
    'X-API-Key': config.apiKey,
    'X-Participant-Code': config.participantCode,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: requestHeaders,
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw createError({
        statusCode: response.status,
        statusMessage: `Erreur API PI-SPI (${response.status}): ${errorBody || response.statusText}`
      })
    }

    return (await response.json()) as T
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({
      statusCode: 502,
      statusMessage: `Erreur lors de l'appel à l'API PI-SPI Gateway (${endpoint}): ${err.message}`
    })
  }
}
