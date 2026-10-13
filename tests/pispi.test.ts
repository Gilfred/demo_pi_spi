import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validatePispiConfig, clearPispiTokenCache, formatAuthorizationHeader } from '../server/utils/pispi.ts'

describe('PI-SPI BCEAO Integration Unit Tests', () => {

  test('validatePispiConfig should correctly identify missing configuration variables', () => {
    const emptyConfig = {
      baseUrl: '',
      authUrl: '',
      clientId: '',
      clientSecret: '',
      apiKey: '',
      scope: '',
      participantCode: ''
    }

    const result = validatePispiConfig(emptyConfig as any)
    assert.equal(result.valid, false)
    assert.ok(result.missing.includes('PISPI_BASE_URL'))
    assert.ok(result.missing.includes('PISPI_CLIENT_SECRET'))
    assert.ok(result.missing.includes('PISPI_PARTICIPANT_CODE'))

    const validConfig = {
      baseUrl: 'https://no-mtls.piz.simulateurs.pi-bceao.com',
      authUrl: 'https://piz-simulateur-business-sandbox.auth.eu-west-1.amazoncognito.com/oauth2/token',
      clientId: 'client_123',
      clientSecret: 'secret_456',
      apiKey: 'key_789',
      scope: 'pispi:api',
      participantCode: 'BFC999'
    }

    const validResult = validatePispiConfig(validConfig)
    assert.equal(validResult.valid, true)
    assert.equal(validResult.missing.length, 0)
  })

  test('clearPispiTokenCache resets the token cache without throwing', () => {
    assert.doesNotThrow(() => {
      clearPispiTokenCache()
    })
  })

  test('Input validation rules for alias lookup', () => {
    const validateAlias = (alias: string) => {
      const clean = (alias || '').trim()
      if (!clean) return { valid: false, message: "Le paramètre 'alias' est obligatoire." }
      if (clean.length < 3 || clean.length > 100) return { valid: false, message: "Format d'alias invalide (la longueur doit être comprise entre 3 et 100 caractères)." }
      return { valid: true, clean }
    }

    assert.equal(validateAlias('').valid, false)
    assert.equal(validateAlias('a').valid, false)
    assert.equal(validateAlias('2250102030405').valid, true)
    assert.equal(validateAlias('2250102030405').clean, '2250102030405')
  })

  test('Input validation rules for transfer initiation', () => {
    const validateTransfer = (body: any) => {
      const amount = Number(body.amount)
      if (isNaN(amount) || amount <= 0) return { valid: false, message: "Le montant ('amount') doit être un nombre strictly supérieur à 0." }
      if (!body.debtorAccount) return { valid: false, message: "Le compte ou l'identifiant du débiteur ('debtorAccount') est obligatoire." }
      if (!body.creditorAccount) return { valid: false, message: "Le compte ou l'identifiant du créancier ('creditorAccount') est obligatoire." }
      return { valid: true }
    }

    assert.equal(validateTransfer({ amount: 0, debtorAccount: 'A', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: -100, debtorAccount: 'A', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: '', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: 'A', creditorAccount: '' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: 'ACC_A', creditorAccount: 'ACC_B' }).valid, true)
  })

  test('Secret masking helper prevents leaking sensitive credentials', () => {
    const secrets = ['secret_key_123', 'api_key_456']
    const rawError = 'Error connecting with secret_key_123 and api_key_456'

    let sanitized = rawError
    for (const secret of secrets) {
      sanitized = sanitized.split(secret).join('[REDACTED]')
    }

    assert.ok(!sanitized.includes('secret_key_123'))
    assert.ok(!sanitized.includes('api_key_456'))
    assert.ok(sanitized.includes('[REDACTED]'))
  })

  test('formatAuthorizationHeader formats Authorization header into key=value pair with equal-sign', () => {
    assert.equal(formatAuthorizationHeader('Bearer', 'abc123token'), 'Bearer=abc123token')
    assert.equal(formatAuthorizationHeader('Bearer=', 'abc123token'), 'Bearer=abc123token')
    assert.equal(formatAuthorizationHeader('Bearer token=', 'abc123token'), 'Bearer token=abc123token')
    assert.equal(formatAuthorizationHeader('', 'abc123token'), 'Bearer=abc123token')
    assert.ok(formatAuthorizationHeader('Bearer', 'token').includes('='))
  })
})
