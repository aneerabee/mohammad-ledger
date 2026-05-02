import { createClient } from '@supabase/supabase-js'

export const MOHAMMAD_STORAGE_KEY = 'mohammad-ledger-v1'

const BACKUP_STORAGE_KEY = 'mohammad-ledger-backups-v1'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_TABLE = 'ml_state'
const STATE_ROW_ID = 'default'
const BACKUP_LIMIT = 12

let cachedClient = null
let remoteDisabledForSession = false

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getSupabaseClient() {
  if (remoteDisabledForSession || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cachedClient
}

export function getMohammadPersistenceMode() {
  return getSupabaseClient() ? 'supabase' : 'local'
}

function normalizeLedgerState(state, fallbackState) {
  const safeState = state && typeof state === 'object' ? state : {}
  const accounts = Array.isArray(safeState.accounts) ? safeState.accounts : fallbackState.accounts
  const movements = Array.isArray(safeState.movements) ? safeState.movements : fallbackState.movements
  return {
    accounts,
    movements,
    version: 1,
    savedAt: safeState.savedAt || new Date().toISOString(),
  }
}

function stateTimestamp(state) {
  const time = new Date(state?.savedAt || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function chooseFreshestState(localState, remoteState, fallbackState) {
  if (localState && remoteState) {
    return stateTimestamp(remoteState) >= stateTimestamp(localState)
      ? { state: remoteState, source: 'supabase' }
      : { state: localState, source: 'local-newer' }
  }
  if (remoteState) return { state: remoteState, source: 'supabase' }
  if (localState) return { state: localState, source: 'local' }
  return { state: fallbackState, source: 'fallback' }
}

export function loadLocalMohammadState(fallbackState) {
  if (!hasBrowserStorage()) return normalizeLedgerState(fallbackState, fallbackState)
  try {
    const raw = window.localStorage.getItem(MOHAMMAD_STORAGE_KEY)
    if (!raw) return normalizeLedgerState(fallbackState, fallbackState)
    return normalizeLedgerState(JSON.parse(raw), fallbackState)
  } catch (err) {
    console.warn('[mohammad-persistence] local load failed:', err?.message || err)
    return normalizeLedgerState(fallbackState, fallbackState)
  }
}

function writeLocalMohammadState(state) {
  if (!hasBrowserStorage()) return
  window.localStorage.setItem(MOHAMMAD_STORAGE_KEY, JSON.stringify(state))
}

function writeLocalBackup(state) {
  if (!hasBrowserStorage()) return
  const rawBackups = window.localStorage.getItem(BACKUP_STORAGE_KEY)
  const backups = rawBackups ? JSON.parse(rawBackups) : []
  const nextBackups = [
    {
      savedAt: state.savedAt,
      accountCount: state.accounts.length,
      movementCount: state.movements.length,
      state,
    },
    ...(Array.isArray(backups) ? backups : []),
  ].slice(0, BACKUP_LIMIT)
  window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(nextBackups))
}

async function loadRemoteMohammadState(fallbackState) {
  const client = getSupabaseClient()
  if (!client) return null
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select('payload')
    .eq('id', STATE_ROW_ID)
    .maybeSingle()

  if (error) throw error
  if (!data?.payload) return null
  return normalizeLedgerState(data.payload, fallbackState)
}

async function saveRemoteMohammadState(state) {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.from(SUPABASE_TABLE).upsert(
    {
      id: STATE_ROW_ID,
      payload: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

export async function loadMohammadPersistedState(fallbackState) {
  const fallback = normalizeLedgerState(fallbackState, fallbackState)
  const localState = loadLocalMohammadState(fallback)
  const mode = getMohammadPersistenceMode()

  if (mode !== 'supabase') {
    return { mode, state: localState, source: 'local' }
  }

  try {
    const remoteState = await loadRemoteMohammadState(fallback)
    const selected = chooseFreshestState(localState, remoteState, fallback)
    writeLocalMohammadState(selected.state)
    return { mode, ...selected }
  } catch (err) {
    console.warn('[mohammad-persistence] remote load failed:', err?.message || err)
    remoteDisabledForSession = true
    return { mode, state: localState, source: 'local-after-remote-error', loadError: true }
  }
}

export async function saveMohammadPersistedState(state) {
  const normalizedState = normalizeLedgerState(
    { ...state, savedAt: new Date().toISOString(), version: 1 },
    state,
  )

  writeLocalMohammadState(normalizedState)
  try {
    writeLocalBackup(normalizedState)
  } catch (err) {
    console.warn('[mohammad-persistence] local backup failed:', err?.message || err)
  }

  if (getMohammadPersistenceMode() !== 'supabase') {
    return { mode: 'local', localOk: true, supabaseOk: false }
  }

  try {
    await saveRemoteMohammadState(normalizedState)
  } catch (err) {
    remoteDisabledForSession = true
    throw err
  }
  return { mode: 'supabase', localOk: true, supabaseOk: true }
}
