import { createClient } from '@supabase/supabase-js'

const LOCAL_STORAGE_KEYS = ['western-office-state-v3', 'western-office-state-v2']
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_TABLES = {
  customers: 'wo_customers',
  transfers: 'wo_transfers',
  ledgerEntries: 'wo_ledger_entries',
  claimHistory: 'wo_claim_history',
}

let cachedClient = null

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getPersistenceMode() {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local'
}

function getSupabaseClient() {
  if (getPersistenceMode() !== 'supabase') return null
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cachedClient
}

function readLocalState() {
  if (!hasBrowserStorage()) return null
  for (const key of LOCAL_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  }
  return null
}

function writeLocalState(state) {
  if (!hasBrowserStorage()) return
  window.localStorage.setItem(LOCAL_STORAGE_KEYS[0], JSON.stringify(state))
}

async function loadFromSupabase() {
  const client = getSupabaseClient()
  if (!client) return null

  const [{ data: customers, error: customerError }, { data: transfers, error: transferError }, { data: ledgerEntries, error: ledgerError }, { data: claimHistory, error: claimHistoryError }] = await Promise.all([
    client.from(SUPABASE_TABLES.customers).select('id,payload'),
    client.from(SUPABASE_TABLES.transfers).select('id,payload'),
    client.from(SUPABASE_TABLES.ledgerEntries).select('id,payload'),
    client.from(SUPABASE_TABLES.claimHistory).select('id,payload'),
  ])

  if (customerError || transferError || ledgerError || claimHistoryError) {
    throw customerError || transferError || ledgerError || claimHistoryError
  }

  return {
    customers: (customers || []).map((row) => row.payload),
    transfers: (transfers || []).map((row) => row.payload),
    ledgerEntries: (ledgerEntries || []).map((row) => row.payload),
    claimHistory: (claimHistory || []).map((row) => row.payload),
  }
}

async function syncTable(client, table, rows) {
  const { data: existingRows, error: existingError } = await client.from(table).select('id')
  if (existingError) throw existingError

  const nextIds = new Set(rows.map((row) => row.id))
  const staleIds = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id))

  if (rows.length > 0) {
    const wrappedRows = rows.map((row) => ({
      id: row.id,
      payload: row,
    }))
    const { error } = await client.from(table).upsert(wrappedRows, { onConflict: 'id' })
    if (error) throw error
  }

  if (staleIds.length > 0) {
    const { error } = await client.from(table).delete().in('id', staleIds)
    if (error) throw error
  }
}

async function saveToSupabase(state) {
  const client = getSupabaseClient()
  if (!client) return

  await syncTable(client, SUPABASE_TABLES.customers, state.customers)
  await syncTable(client, SUPABASE_TABLES.transfers, state.transfers)
  await syncTable(client, SUPABASE_TABLES.ledgerEntries, state.ledgerEntries || [])
  await syncTable(client, SUPABASE_TABLES.claimHistory, state.claimHistory || [])
}

export async function loadPersistedState(fallbackState, migrateState) {
  try {
    if (getPersistenceMode() === 'supabase') {
      const remoteState = await loadFromSupabase()
      if (!remoteState) return { mode: 'supabase', state: fallbackState }
      return { mode: 'supabase', state: migrateState(remoteState) }
    }

    const localState = readLocalState()
    if (!localState) return { mode: 'local', state: fallbackState }
    return { mode: 'local', state: migrateState(localState) }
  } catch (err) {
    console.error('[persistence] load failed:', err)
    return { mode: getPersistenceMode(), state: fallbackState, loadError: true }
  }
}

export async function savePersistedState(state) {
  if (getPersistenceMode() === 'supabase') {
    await saveToSupabase(state)
    return
  }
  writeLocalState(state)
}
