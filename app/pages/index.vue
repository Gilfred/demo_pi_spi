<template>
  <main class="container">
    <header class="header">
      <div class="logo-area">
        <h1>Intégration PI-SPI BCEAO</h1>
        <span class="badge">Sandbox Nuxt 4</span>
      </div>
      <p class="subtitle">
        Plateforme d'Interopérabilité du Système de Paiement Instantané (BCEAO)
      </p>
    </header>

    <div v-if="pending" class="card loading">
      Chargement du statut de l'intégration...
    </div>

    <div v-else-if="error" class="card alert error">
      <h3>Erreur lors de la vérification initiale</h3>
      <p>{{ error.message }}</p>
    </div>

    <div v-else class="grid">
      <!-- Status & Configuration Card -->
      <section class="card">
        <h2>1. État de la Configuration Server-Side</h2>
        <div class="status-indicator" :class="{ ok: info?.configuration?.isConfigured, warning: !info?.configuration?.isConfigured }">
          <span class="dot"></span>
          <span>{{ info?.configuration?.isConfigured ? 'Configuration complète' : 'Variables d\'environnement manquantes' }}</span>
        </div>

        <div v-if="!info?.configuration?.isConfigured" class="missing-box">
          <p><strong>Variables non renseignées dans <code>.env</code> :</strong></p>
          <ul>
            <li v-for="item in info?.configuration?.missingVariables" :key="item">
              <code>{{ item }}</code>
            </li>
          </ul>
        </div>

        <ul class="info-list">
          <li><strong>Base URL:</strong> <code>{{ info?.configuration?.baseUrl }}</code></li>
          <li><strong>Auth URL:</strong> <code>{{ info?.configuration?.authUrl }}</code></li>
          <li><strong>Scope:</strong> <code>{{ info?.configuration?.scope }}</code></li>
          <li><strong>Client ID fourni:</strong> {{ info?.configuration?.clientIdProvided ? 'Oui' : 'Non' }}</li>
          <li><strong>Client Secret fourni:</strong> {{ info?.configuration?.clientSecretProvided ? 'Oui (Masqué)' : 'Non' }}</li>
          <li><strong>API Key fournie:</strong> {{ info?.configuration?.apiKeyProvided ? 'Oui (Masquée)' : 'Non' }}</li>
          <li><strong>Code Participant fourni:</strong> {{ info?.configuration?.participantCodeProvided ? 'Oui' : 'Non' }}</li>
          <li><strong>Certificat mTLS:</strong> {{ info?.configuration?.mTLSCertificateProvided ? 'Configuré' : 'Non configuré' }}</li>
        </ul>
      </section>

      <!-- Auth Test Panel -->
      <section class="card">
        <h2>2. Test d'Authentification OAuth2</h2>
        <p class="desc">
          Teste la demande de jeton d'accès <code>client_credentials</code> auprès du serveur d'authentification PI-SPI.
        </p>

        <button @click="testAuth" :disabled="authLoading" class="btn primary">
          {{ authLoading ? 'Authentification en cours...' : 'Tester l\'authentification OAuth2' }}
        </button>

        <div v-if="authResult" :class="['response-box', authResult.success ? 'success' : 'error']">
          <h4>{{ authResult.success ? 'Authentification Réussie' : 'Échec d\'Authentification' }}</h4>
          <p>{{ authResult.message }}</p>
          <ul v-if="authResult.success" class="info-list compact">
            <li><strong>Token Type:</strong> {{ authResult.tokenType }}</li>
            <li><strong>Expires In:</strong> {{ authResult.expiresIn }}s</li>
            <li><strong>Token (Masqué):</strong> <code>{{ authResult.tokenMasked }}</code></li>
          </ul>
        </div>
      </section>

      <!-- Feature 1: Beneficiary & Account Lookup -->
      <section class="card">
        <h2>3. Recherche Bénéficiaire & Compte</h2>
        <p class="desc">Endpoints: <code>GET /api/pispi/lookup</code> & <code>GET /api/pispi/accounts</code></p>

        <div class="form-group">
          <label>Alias SHID ou Numéro de Compte :</label>
          <input v-model="lookupAlias" type="text" placeholder="Ex: 92337092268450310321 ou +2250102030405" class="input" />
        </div>

        <div class="btn-group">
          <button @click="testLookup" :disabled="lookupLoading || !lookupAlias" class="btn primary">
            {{ lookupLoading ? 'Recherche...' : 'Rechercher (Alias/Compte)' }}
          </button>
          <button @click="testFetchAccount" :disabled="lookupLoading || !lookupAlias" class="btn secondary">
            Consulter Compte (/comptes)
          </button>
        </div>

        <div v-if="lookupResult" :class="['response-box', lookupResult.success ? 'success' : 'error']">
          <h4>{{ lookupResult.success ? (lookupResult.type === 'account' ? 'Compte Trouvé' : 'Bénéficiaire Trouvé') : 'Résultat Recherche' }}</h4>
          <p v-if="lookupResult.message">{{ lookupResult.message }}</p>
          <div v-if="lookupResult.success && lookupResult.beneficiary">
            <ul class="info-list compact">
              <li><strong>Nom/Intitulé:</strong> {{ lookupResult.beneficiary.name || 'N/A' }}</li>
              <li><strong>Numéro Compte:</strong> {{ lookupResult.beneficiary.accountNumber || 'N/A' }}</li>
              <li><strong>Participant:</strong> {{ lookupResult.beneficiary.participantCode || 'N/A' }}</li>
              <li><strong>Statut:</strong> {{ lookupResult.beneficiary.status || 'ACTIVE' }}</li>
            </ul>
          </div>
          <div v-else-if="lookupResult.success && lookupResult.data">
            <pre class="json-box">{{ JSON.stringify(lookupResult.data, null, 2) }}</pre>
          </div>
        </div>
      </section>

      <!-- Feature 2: Transfer Initiation -->
      <section class="card">
        <h2>4. Initiation d'un Transfert Instantané</h2>
        <p class="desc">Endpoint: <code>POST /api/pispi/transfer</code></p>

        <div class="form-grid">
          <div class="form-group">
            <label>Montant (XOF) :</label>
            <input v-model.number="transferAmount" type="number" min="1" class="input" />
          </div>
          <div class="form-group">
            <label>Compte Débiteur :</label>
            <input v-model="transferDebtor" type="text" placeholder="ACC_DEBTOR_001" class="input" />
          </div>
          <div class="form-group">
            <label>Compte Créancier :</label>
            <input v-model="transferCreditor" type="text" placeholder="ACC_CREDITOR_002" class="input" />
          </div>
          <div class="form-group">
            <label>EndToEnd ID (Optionnel) :</label>
            <input v-model="transferEndToEndId" type="text" placeholder="E2E-AUTO" class="input" />
          </div>
        </div>

        <button @click="testTransfer" :disabled="transferLoading" class="btn primary">
          {{ transferLoading ? 'Initiation en cours...' : 'Initier le transfert' }}
        </button>

        <div v-if="transferResult" :class="['response-box', transferResult.success ? 'success' : 'error']">
          <h4>{{ transferResult.success ? 'Transfert Initié' : 'Échec du Transfert' }}</h4>
          <p v-if="transferResult.message">{{ transferResult.message }}</p>
          <ul v-if="transferResult.success" class="info-list compact">
            <li><strong>Transaction ID:</strong> {{ transferResult.transactionId || 'N/A' }}</li>
            <li><strong>EndToEnd ID:</strong> {{ transferResult.endToEndId }}</li>
            <li><strong>Statut:</strong> <code>{{ transferResult.status }}</code></li>
            <li><strong>Montant:</strong> {{ transferResult.amount }} {{ transferResult.currency }}</li>
          </ul>
        </div>
      </section>

      <!-- Feature 3: Status Lookup -->
      <section class="card full-width">
        <h2>5. Consultation du Statut d'une Transaction</h2>
        <p class="desc">Endpoint: <code>GET /api/pispi/status?id=...</code></p>

        <div class="form-group">
          <label>Identifiant de Transaction ou EndToEnd ID :</label>
          <div class="input-row">
            <input v-model="statusTxId" type="text" placeholder="Ex: TX-123456 ou E2E-789" class="input" />
            <button @click="testStatus" :disabled="statusLoading || !statusTxId" class="btn primary">
              {{ statusLoading ? 'Consultation...' : 'Consulter le statut' }}
            </button>
          </div>
        </div>

        <div v-if="statusResult" :class="['response-box', statusResult.success ? 'success' : 'error']">
          <h4>{{ statusResult.success ? 'Statut de la Transaction' : 'Erreur Consultation' }}</h4>
          <p v-if="statusResult.message">{{ statusResult.message }}</p>
          <ul v-if="statusResult.success" class="info-list compact">
            <li><strong>Identifiant recherché:</strong> {{ statusResult.id }}</li>
            <li><strong>Transaction ID:</strong> {{ statusResult.transactionId || 'N/A' }}</li>
            <li><strong>EndToEnd ID:</strong> {{ statusResult.endToEndId || 'N/A' }}</li>
            <li><strong>Statut actuel:</strong> <code>{{ statusResult.status }}</code></li>
          </ul>
        </div>
      </section>

      <!-- Available Endpoints -->
      <section class="card full-width">
        <h2>6. Routes Serveur PI-SPI de l'Architecture</h2>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Méthode</th>
                <th>Endpoint Route</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="endpoint in info?.endpointsAvailable" :key="endpoint.path">
                <td><span class="method-tag" :class="endpoint.method.toLowerCase()">{{ endpoint.method }}</span></td>
                <td><code>{{ endpoint.path }}</code></td>
                <td>{{ endpoint.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Prerequisites Card -->
      <section class="card full-width">
        <h2>7. Prérequis d'Accès Sandbox BCEAO PI-SPI</h2>
        <ol class="prereq-list">
          <li v-for="(prereq, index) in info?.prerequisites" :key="index">
            {{ prereq }}
          </li>
        </ol>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const { data: info, pending, error } = await useFetch('/api/pispi')

const authLoading = ref(false)
const authResult = ref<any>(null)

const lookupAlias = ref('2250102030405')
const lookupLoading = ref(false)
const lookupResult = ref<any>(null)

const transferAmount = ref(5000)
const transferDebtor = ref('ACC_DEBTOR_001')
const transferCreditor = ref('ACC_CREDITOR_002')
const transferEndToEndId = ref('')
const transferLoading = ref(false)
const transferResult = ref<any>(null)

const statusTxId = ref('')
const statusLoading = ref(false)
const statusResult = ref<any>(null)

async function testAuth() {
  authLoading.value = true
  authResult.value = null
  try {
    const res = await $fetch('/api/pispi/auth', { method: 'POST' })
    authResult.value = res
  } catch (err: any) {
    authResult.value = {
      success: false,
      message: err.data?.message || err.message || "Erreur lors du test d'authentification."
    }
  } finally {
    authLoading.value = false
  }
}

async function testLookup() {
  lookupLoading.value = true
  lookupResult.value = null
  try {
    const res = await $fetch('/api/pispi/lookup', {
      method: 'GET',
      query: { alias: lookupAlias.value }
    })
    lookupResult.value = res
  } catch (err: any) {
    lookupResult.value = {
      success: false,
      message: err.data?.statusMessage || err.message || "Erreur lors de la recherche du bénéficiaire."
    }
  } finally {
    lookupLoading.value = false
  }
}

async function testFetchAccount() {
  lookupLoading.value = true
  lookupResult.value = null
  try {
    const res = await $fetch('/api/pispi/accounts', {
      method: 'GET',
      query: { number: lookupAlias.value }
    })
    lookupResult.value = res
  } catch (err: any) {
    lookupResult.value = {
      success: false,
      message: err.data?.statusMessage || err.message || "Erreur lors de la consultation du compte."
    }
  } finally {
    lookupLoading.value = false
  }
}

async function testTransfer() {
  transferLoading.value = true
  transferResult.value = null
  try {
    const res = await $fetch('/api/pispi/transfer', {
      method: 'POST',
      body: {
        amount: transferAmount.value,
        debtorAccount: transferDebtor.value,
        creditorAccount: transferCreditor.value,
        endToEndId: transferEndToEndId.value || undefined
      }
    })
    transferResult.value = res
    if (res.transactionId || res.endToEndId) {
      statusTxId.value = res.transactionId || res.endToEndId
    }
  } catch (err: any) {
    transferResult.value = {
      success: false,
      message: err.data?.statusMessage || err.message || "Erreur lors de l'initiation du transfert."
    }
  } finally {
    transferLoading.value = false
  }
}

async function testStatus() {
  statusLoading.value = true
  statusResult.value = null
  try {
    const res = await $fetch('/api/pispi/status', {
      method: 'GET',
      query: { id: statusTxId.value }
    })
    statusResult.value = res
  } catch (err: any) {
    statusResult.value = {
      success: false,
      message: err.data?.statusMessage || err.message || "Erreur lors de la consultation du statut."
    }
  } finally {
    statusLoading.value = false
  }
}
</script>

<style scoped>
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.header {
  margin-bottom: 2rem;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-area h1 {
  font-size: 1.8rem;
  margin: 0;
  color: #0f172a;
}

.badge {
  background-color: #0284c7;
  color: #ffffff;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-weight: 600;
}

.subtitle {
  color: #64748b;
  margin-top: 0.5rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: 1.5rem;
}

.full-width {
  grid-column: 1 / -1;
}

.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.35rem;
}

.input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #2563eb;
}

.input-row {
  display: flex;
  gap: 0.75rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.status-indicator.ok {
  background-color: #f0fdf4;
  color: #166534;
}

.status-indicator.warning {
  background-color: #fffbeb;
  color: #92400e;
}

.status-indicator .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.status-indicator.ok .dot { background-color: #22c55e; }
.status-indicator.warning .dot { background-color: #f59e0b; }

.missing-box {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.info-list li {
  padding: 0.4rem 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.95rem;
}

.info-list li:last-child {
  border-bottom: none;
}

.info-list.compact li {
  padding: 0.2rem 0;
}

.desc {
  color: #64748b;
  font-size: 0.95rem;
  margin-bottom: 1rem;
}

.btn {
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.btn-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn.primary {
  background-color: #2563eb;
  color: #ffffff;
}

.btn.primary:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.btn.secondary {
  background-color: #0284c7;
  color: #ffffff;
}

.btn.secondary:hover:not(:disabled) {
  background-color: #0369a1;
}

.json-box {
  background-color: #0f172a;
  color: #38bdf8;
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.response-box {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
}

.response-box.success {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.response-box.error {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.table-responsive {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
}

th, td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

th {
  background-color: #f8fafc;
  color: #475569;
  font-weight: 600;
}

.method-tag {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.method-tag.get { background-color: #e0f2fe; color: #0369a1; }
.method-tag.post { background-color: #dcfce7; color: #15803d; }

.prereq-list {
  padding-left: 1.2rem;
  color: #334155;
  line-height: 1.6;
}

code {
  background-color: #f1f5f9;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}
</style>
