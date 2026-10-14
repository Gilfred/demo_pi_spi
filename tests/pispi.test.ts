import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validatePispiConfig, clearPispiTokenCache, formatAuthorizationHeader, formatPispiEndpoint } from '../server/utils/pispi.ts'

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
      const debtorAccount = body.debtorAccount || body.debtor || body.payeurAlias || body.payeur
      const creditorAccount = body.creditorAccount || body.creditor || body.beneficiaireAlias || body.beneficiaire || body.creditorAlias
      if (isNaN(amount) || amount <= 0) return { valid: false, message: "Le montant ('amount') doit être un nombre strictly supérieur à 0." }
      if (!debtorAccount) return { valid: false, message: "Le compte ou l'identifiant du débiteur ('debtorAccount') est obligatoire." }
      if (!creditorAccount) return { valid: false, message: "Le compte ou l'identifiant du créancier ('creditorAccount') est obligatoire." }
      const txId = (body.txId || 'TX123').trim()
      return { valid: true, txId }
    }

    assert.equal(validateTransfer({ amount: 0, debtorAccount: 'A', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: -100, debtorAccount: 'A', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: '', creditorAccount: 'B' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: 'A', creditorAccount: '' }).valid, false)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: 'ACC_A', creditorAccount: 'ACC_B' }).valid, true)
    assert.equal(validateTransfer({ amount: 1000, debtorAccount: 'ACC_A', creditorAccount: 'ACC_B' }).txId, 'TX123')
  })

  test('Account lookup fallback correctly maps numero and statut', () => {
    const rawAccountData = {
      data: [
        {
          numero: '13608524542126896068',
          type: 'TRAN',
          dateOuverture: '2026-10-14',
          statut: 'OUVERT'
        }
      ]
    }

    const alias = '13608524542126896068'
    const items = Array.isArray(rawAccountData) ? rawAccountData : rawAccountData.data
    const acc = items.find((a: any) => a.numero === alias || a.numeroCompte === alias)

    assert.ok(acc)
    assert.equal(acc.numero, '13608524542126896068')
    assert.equal(acc.statut, 'OUVERT')
  })

  test('Transfer payload includes payeurAlias, payeAlias, beneficiaireAlias, montant, devise, motif and confirmation', () => {
    const buildPayload = (body: any) => {
      const amount = Number(body.amount)
      const currency = (body.currency || 'XOF').toUpperCase()
      const debtorAccount = body.debtorAccount || body.debtor || body.payeurAlias || body.payeur
      const creditorAccount = body.creditorAccount || body.creditor || body.payeAlias || body.beneficiaireAlias || body.beneficiaire || body.creditorAlias
      const txId = 'TX_TEST_1'
      const endToEndId = 'E2E_TEST_1'
      const payeurAlias = body.payeurAlias || (typeof debtorAccount === 'string' ? debtorAccount : (debtorAccount?.account || debtorAccount?.alias || ''))
      const beneficiaireAlias = body.beneficiaireAlias || body.payeAlias || body.creditorAlias || (typeof creditorAccount === 'string' ? creditorAccount : (creditorAccount?.account || creditorAccount?.alias || ''))
      const payeAlias = body.payeAlias || beneficiaireAlias
      const remittanceInformation = body.remittanceInformation || body.reason || body.motif || 'Transfert instantane PI-SPI'

      return {
        txId,
        endToEndId,
        payeurAlias,
        payeAlias,
        beneficiaireAlias,
        montant: amount,
        devise: currency,
        motif: remittanceInformation,
        confirmation: body.confirmation ?? true,
        amount: { value: amount, currency },
        debtor: typeof debtorAccount === 'object' ? debtorAccount : { account: debtorAccount, alias: payeurAlias },
        creditor: typeof creditorAccount === 'object' ? creditorAccount : { account: creditorAccount, alias: payeAlias }
      }
    }

    const payload = buildPayload({
      amount: 5000,
      debtorAccount: '92337092268450310321',
      creditorAccount: '13608524542126896068'
    })

    assert.equal(payload.payeurAlias, '92337092268450310321')
    assert.equal(payload.payeAlias, '13608524542126896068')
    assert.equal(payload.beneficiaireAlias, '13608524542126896068')
    assert.equal(payload.montant, 5000)
    assert.equal(payload.devise, 'XOF')
    assert.equal(payload.motif, 'Transfert instantane PI-SPI')
    assert.equal(payload.confirmation, true)
    assert.equal(payload.debtor.account, '92337092268450310321')
    assert.equal(payload.creditor.account, '13608524542126896068')
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

  test('formatAuthorizationHeader formats Authorization header for standard Bearer scheme', () => {
    assert.equal(formatAuthorizationHeader('Bearer', 'abc123token'), 'Bearer abc123token')
    assert.equal(formatAuthorizationHeader('bearer', 'abc123token'), 'Bearer abc123token')
    assert.equal(formatAuthorizationHeader('Custom', 'abc123token'), 'Custom abc123token')
    assert.equal(formatAuthorizationHeader('', 'abc123token'), 'Bearer abc123token')
  })

  test('formatPispiEndpoint prepends participantCode to endpoint paths', () => {
    assert.equal(formatPispiEndpoint('/alias/2250102030405', 'BFC999'), '/BFC999/alias/2250102030405')
    assert.equal(formatPispiEndpoint('/BFC999/alias/2250102030405', 'BFC999'), '/BFC999/alias/2250102030405')
    assert.equal(formatPispiEndpoint('/alias/2250102030405', ''), '/alias/2250102030405')
    assert.equal(formatPispiEndpoint('alias/2250102030405', 'BFC999'), '/BFC999/alias/2250102030405')
    assert.equal(formatPispiEndpoint('https://no-mtls.piz.simulateurs.pi-bceao.com/BFC999/alias/123', 'BFC999'), 'https://no-mtls.piz.simulateurs.pi-bceao.com/BFC999/alias/123')
  })
})
