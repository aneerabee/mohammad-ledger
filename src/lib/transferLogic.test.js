import { describe, expect, it } from 'vitest'
import {
  buildCustomerFromDraft,
  buildTransferFromDraft,
  computeMargin,
  parseMoney,
  filterTransfers,
  getUnsettledForCustomer,
  migrateState,
  parseAppStateBackup,
  settleTransfers,
  sortTransfers,
  summarizeCustomers,
  summarizeTransfers,
  transitionTransfer,
  validateTransition,
  updateAmount,
} from './transferLogic'
import {
  buildCustomerStatement,
  buildLedgerEntries,
  buildLegacySettlementEntry,
  buildOpeningBalanceEntry,
  buildSeedLedgerEntries,
  createProfitClaimEntry,
  groupUnsettledTransfersByCustomer,
  LEDGER_ENTRY_TYPES,
  summarizeOfficeLedger,
  summarizeLedgerByCustomer,
} from './ledger'

const customers = [
  {
    id: 101, name: 'محمد', openingBalance: 500, settledTotal: 100,
    createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z',
  },
  {
    id: 102, name: 'ليلى', openingBalance: 0, settledTotal: 0,
    createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z',
  },
]

const sample = [
  {
    id: 1, customerId: 101, reference: 'WU-100', senderName: 'أحمد', receiverName: 'محمد',
    status: 'received', issueCode: '', systemAmount: null, customerAmount: null,
    margin: null, settled: false, settledAt: null, note: '',
    createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z',
  },
  {
    id: 2, customerId: 102, reference: 'WU-200', senderName: 'منى', receiverName: 'ليلى',
    status: 'picked_up', issueCode: '', systemAmount: 100, customerAmount: 90,
    margin: 10, settled: false, settledAt: null, note: '',
    createdAt: '2026-04-11T10:00:00.000Z', updatedAt: '2026-04-11T10:00:00.000Z',
  },
]

describe('transferLogic', () => {
  it('parseMoney handles edge cases', () => {
    expect(parseMoney('')).toBe(0)
    expect(parseMoney(null)).toBe(0)
    expect(parseMoney(undefined)).toBe(0)
    expect(parseMoney('abc')).toBe(0)
    expect(parseMoney('100.5')).toBe(100.5)
    expect(parseMoney(42)).toBe(42)
    expect(parseMoney(0)).toBe(0)
  })

  it('computes margin only when both amounts exist', () => {
    expect(computeMargin(100, 88)).toBe(12)
    expect(computeMargin(100, null)).toBeNull()
  })

  it('creates customer and blocks duplicate names', () => {
    const created = buildCustomerFromDraft({ name: 'سالم', openingBalance: '100', settledTotal: '20' }, customers)
    expect(created.ok).toBe(true)

    const dup = buildCustomerFromDraft({ name: 'محمد', openingBalance: '', settledTotal: '' }, customers)
    expect(dup.ok).toBe(false)
  })

  it('requires selected customer when creating transfer', () => {
    const result = buildTransferFromDraft(
      { customerId: '', senderName: 'سالم', reference: 'wu-300' },
      sample, customers,
    )
    expect(result.ok).toBe(false)
  })

  it('requires sender name', () => {
    const result = buildTransferFromDraft(
      { customerId: '101', senderName: '', reference: 'wu-300' },
      sample, customers,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('يجب إدخال اسم المرسل.')
  })

  it('prevents duplicate references', () => {
    const result = buildTransferFromDraft(
      { customerId: '101', senderName: 'سالم', reference: 'wu-100' },
      sample, customers,
    )
    expect(result.ok).toBe(false)
  })

  it('creates transfer and binds receiver name to selected customer', () => {
    const result = buildTransferFromDraft(
      { customerId: '101', senderName: 'سالم', reference: ' wu-300 ', transferAmount: '500', customerAmount: '480' },
      sample, customers,
    )
    expect(result.ok).toBe(true)
    expect(result.value.status).toBe('received')
    expect(result.value.settled).toBe(false)
    expect(result.value.reference).toBe('WU-300')
    expect(result.value.receiverName).toBe('محمد')
    expect(result.value.transferAmount).toBe(500)
    expect(result.value.customerAmount).toBe(480)
    expect(result.value.systemAmount).toBeNull()
    expect(result.value.margin).toBeNull()
  })

  it('transitions to with_employee', () => {
    const next = transitionTransfer(sample[0], 'with_employee')
    expect(next.status).toBe('with_employee')
    expect(next.sentAt).toBeTruthy()
  })

  it('transitions to picked_up', () => {
    const next = transitionTransfer(sample[0], 'picked_up')
    expect(next.status).toBe('picked_up')
    expect(next.pickedUpAt).toBeTruthy()
  })

  it('transitions to review_hold', () => {
    const next = transitionTransfer({ ...sample[0], status: 'with_employee' }, 'review_hold')
    expect(next.status).toBe('review_hold')
    expect(next.reviewHoldAt).toBeTruthy()
  })

  it('resets issue transfer back to received and clears office progress fields', () => {
    const issueTransfer = {
      ...sample[1],
      status: 'issue',
      issueCode: 'missing_info',
      systemAmount: 110,
      margin: 20,
      sentAt: '2026-04-11T10:00:00.000Z',
      pickedUpAt: '2026-04-11T11:00:00.000Z',
    }
    const next = transitionTransfer(issueTransfer, 'received')
    expect(next.status).toBe('received')
    expect(next.issueCode).toBe('')
    expect(next.systemAmount).toBeNull()
    expect(next.customerAmount).toBeNull()
    expect(next.transferAmount).toBeNull()
    expect(next.margin).toBeNull()
    expect(next.sentAt).toBeNull()
    expect(next.pickedUpAt).toBeNull()
  })

  it('validates transition to with_employee requires both transferAmount and customerAmount', () => {
    const noAmounts = { ...sample[0], transferAmount: null, customerAmount: null }
    expect(validateTransition(noAmounts, 'with_employee').ok).toBe(false)

    const onlyTransfer = { ...sample[0], transferAmount: 500, customerAmount: null }
    expect(validateTransition(onlyTransfer, 'with_employee').ok).toBe(false)

    const onlyCustomer = { ...sample[0], transferAmount: null, customerAmount: 480 }
    expect(validateTransition(onlyCustomer, 'with_employee').ok).toBe(false)

    const withBoth = { ...sample[0], transferAmount: 500, customerAmount: 480 }
    expect(validateTransition(withBoth, 'with_employee').ok).toBe(true)
  })

  it('validates transition to picked_up requires systemAmount and customerAmount', () => {
    const noSystem = { ...sample[0], customerAmount: 480, systemAmount: null }
    expect(validateTransition(noSystem, 'picked_up').ok).toBe(false)

    const noCustomer = { ...sample[0], customerAmount: null, systemAmount: 490 }
    expect(validateTransition(noCustomer, 'picked_up').ok).toBe(false)

    const withSystem = { ...sample[0], customerAmount: 480, systemAmount: 490 }
    const check2 = validateTransition(withSystem, 'picked_up')
    expect(check2.ok).toBe(true)
  })

  it('clears issueCode when leaving issue status', () => {
    const withIssue = { ...sample[0], status: 'issue', issueCode: 'name_mismatch' }
    const next = transitionTransfer(withIssue, 'with_employee')
    expect(next.issueCode).toBe('')
  })

  it('recomputes margin when amount changes', () => {
    const next = updateAmount(sample[0], 'systemAmount', '120')
    const final = updateAmount(next, 'customerAmount', '111')
    expect(final.margin).toBe(9)
  })

  it('settles selected transfers', () => {
    const transfers = [
      { ...sample[1], id: 10 },
      { ...sample[1], id: 20 },
      { ...sample[0], id: 30 },
    ]
    const result = settleTransfers(transfers, [10, 20])
    expect(result[0].settled).toBe(true)
    expect(result[0].settledAt).toBeTruthy()
    expect(result[1].settled).toBe(true)
    expect(result[2].settled).toBe(false)
  })

  it('does not settle non-picked_up transfers', () => {
    const result = settleTransfers(sample, [1])
    expect(result[0].settled).toBe(false)
  })

  it('gets unsettled transfers for customer', () => {
    const transfers = [
      { ...sample[1], id: 10, customerId: 102 },
      { ...sample[1], id: 20, customerId: 102, settled: true },
      { ...sample[1], id: 30, customerId: 101 },
    ]
    const unsettled = getUnsettledForCustomer(transfers, 102)
    expect(unsettled).toHaveLength(1)
    expect(unsettled[0].id).toBe(10)
  })

  it('filters by status and view mode', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const filtered = filterTransfers(sample, {
      searchTerm: '',
      statusFilter: 'picked_up',
      viewMode: 'all',
      customerFilter: 'all',
    }, customersById)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].reference).toBe('WU-200')
  })

  it('active view keeps old unsettled picked_up transfers visible', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const oldPickedUp = {
      ...sample[1], id: 99, status: 'picked_up',
      createdAt: '2025-01-01T09:00:00.000Z', updatedAt: '2025-01-01T09:00:00.000Z',
    }
    const filtered = filterTransfers([...sample, oldPickedUp], {
      searchTerm: '',
      statusFilter: 'all',
      viewMode: 'active',
      customerFilter: 'all',
    }, customersById)
    expect(filtered.some((t) => t.id === 99)).toBe(true)
    expect(filtered.some((t) => t.status === 'received')).toBe(true)
  })

  it('smart sort puts issues first', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const withIssue = [
      { ...sample[0], id: 10, status: 'received' },
      { ...sample[0], id: 20, status: 'issue' },
      { ...sample[0], id: 30, status: 'with_employee' },
    ]
    const sorted = sortTransfers(withIssue, 'smart', customersById)
    expect(sorted[0].status).toBe('issue')
    expect(sorted[1].status).toBe('received')
    expect(sorted[2].status).toBe('with_employee')
  })

  it('sorts by customer name', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const sorted = sortTransfers(sample, 'customer', customersById)
    expect(sorted[0].reference).toBe('WU-200')
  })

  it('summarizes transfers with accountant pending', () => {
    const summary = summarizeTransfers(sample)
    expect(summary.total).toBe(2)
    expect(summary.unsettledCount).toBe(1)
    expect(summary.accountantPending).toBe(100)
    expect(summary.customerOwed).toBe(90)
    expect(summary.totalMargin).toBe(10)
  })

  it('summarizes customer balances with settlement tracking', () => {
    const transfers = [
      { ...sample[1], id: 3, customerId: 101, customerAmount: 200, systemAmount: 220, margin: 20 },
      { ...sample[1], id: 4, customerId: 101, customerAmount: 150, systemAmount: 170, margin: 20, settled: true },
    ]
    const summary = summarizeCustomers(customers, transfers, buildSeedLedgerEntries(customers))
    const mohamed = summary.find((c) => c.id === 101)
    expect(mohamed.unsettledCount).toBe(1)
    expect(mohamed.unsettledAmount).toBe(200)
    expect(mohamed.settledCount).toBe(1)
    expect(mohamed.settledAmount).toBe(150)
    expect(mohamed.receivedCount).toBe(0)
    expect(mohamed.withEmployeeCount).toBe(0)
    expect(mohamed.reviewHoldCount).toBe(0)
    expect(mohamed.issueCount).toBe(0)
    expect(mohamed.currentBalance).toBe(600)
    expect(mohamed.ledgerCredits).toBe(850)
    expect(mohamed.ledgerDebits).toBe(250)
  })

  it('migrates old status format', () => {
    const oldTransfer = {
      id: 99, customerId: 101, reference: 'WU-OLD', senderName: 'قديم', receiverName: 'محمد',
      issueCode: '', systemAmount: 100, customerAmount: 90, margin: 10, note: '',
      createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z',
    }
    const oldState = {
      customers,
      transfers: [
        { ...oldTransfer, id: 1, status: 'new', paymentStatus: 'pending' },
        { ...oldTransfer, id: 2, status: 'paid', paymentStatus: 'paid' },
        { ...oldTransfer, id: 3, status: 'sent_to_operator', paymentStatus: 'pending' },
      ],
    }
    const migrated = migrateState(oldState)
    expect(migrated.transfers[0].status).toBe('received')
    expect(migrated.transfers[0].settled).toBe(false)
    expect(migrated.transfers[1].status).toBe('picked_up')
    expect(migrated.transfers[1].settled).toBe(true)
    expect(migrated.transfers[2].status).toBe('with_employee')
    expect(migrated.ledgerEntries.some((entry) => entry.type === LEDGER_ENTRY_TYPES.OPENING_BALANCE)).toBe(true)
  })

  it('migration adds transferAmount field for old data', () => {
    const oldTransfer = {
      id: 77, customerId: 101, reference: 'WU-MIGRATE', senderName: 'قديم', receiverName: 'محمد',
      issueCode: '', systemAmount: 100, customerAmount: 90, margin: 10, note: '',
      status: 'new', paymentStatus: 'pending',
      createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z',
    }
    const migrated = migrateState({ customers, transfers: [oldTransfer] })
    expect(migrated.transfers[0].transferAmount).toBeNull()
  })

  it('buildLegacySettlementEntry produces negative amount', () => {
    const entry = buildLegacySettlementEntry(customers[0])
    expect(entry).not.toBeNull()
    expect(entry.amount).toBe(-100)
    expect(entry.type).toBe(LEDGER_ENTRY_TYPES.LEGACY_SETTLEMENT)
  })

  it('buildOpeningBalanceEntry returns null for zero balance', () => {
    const entry = buildOpeningBalanceEntry(customers[1])
    expect(entry).toBeNull()
  })

  it('filters by search term across reference, sender, customer name', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const byRef = filterTransfers(sample, {
      searchTerm: 'wu-200', statusFilter: 'all', viewMode: 'all', customerFilter: 'all',
    }, customersById)
    expect(byRef).toHaveLength(1)
    expect(byRef[0].reference).toBe('WU-200')

    const bySender = filterTransfers(sample, {
      searchTerm: 'أحمد', statusFilter: 'all', viewMode: 'all', customerFilter: 'all',
    }, customersById)
    expect(bySender).toHaveLength(1)
    expect(bySender[0].senderName).toBe('أحمد')

    const byCustomer = filterTransfers(sample, {
      searchTerm: 'ليلى', statusFilter: 'all', viewMode: 'all', customerFilter: 'all',
    }, customersById)
    expect(byCustomer).toHaveLength(1)
  })

  it('completed view shows only settled picked_up transfers', () => {
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const settledSample = [
      { ...sample[1], id: 88, settled: true, settledAt: '2026-04-11T12:00:00.000Z' },
      { ...sample[0], id: 89, status: 'received' },
    ]
    const filtered = filterTransfers(settledSample, {
      searchTerm: '', statusFilter: 'all', viewMode: 'completed', customerFilter: 'all',
    }, customersById)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].settled).toBe(true)
  })

  it('parses valid backup payload', () => {
    const restored = parseAppStateBackup(JSON.stringify({ customers, transfers: sample }))
    expect(restored.customers).toHaveLength(2)
    expect(restored.transfers).toHaveLength(2)
    expect(restored.ledgerEntries.length).toBeGreaterThan(0)
  })

  it('builds ledger entries from transfers and opening balances', () => {
    const entries = buildLedgerEntries([
      { ...sample[1], id: 7, customerId: 101, customerAmount: 120, settled: false },
      { ...sample[1], id: 8, customerId: 101, customerAmount: 80, settled: true },
    ], buildSeedLedgerEntries(customers))

    expect(entries.some((entry) => entry.id === 'opening-101')).toBe(true)
    expect(entries.some((entry) => entry.id === 'transfer-due-7')).toBe(true)
    expect(entries.some((entry) => entry.id === 'transfer-settlement-8')).toBe(true)
  })

  it('summarizes ledger balances by customer', () => {
    const transfers = [
      { ...sample[1], id: 11, customerId: 101, customerAmount: 200, settled: false },
      { ...sample[1], id: 12, customerId: 101, customerAmount: 100, settled: true },
    ]
    const summary = summarizeLedgerByCustomer(customers, transfers, buildSeedLedgerEntries(customers))
    const mohamed = summary.get(101)

    expect(mohamed.currentBalance).toBe(600)
    expect(mohamed.manualEntriesCount).toBe(2)
  })

  it('builds a readable customer statement with running balance', () => {
    const transfers = [
      { ...sample[1], id: 31, customerId: 101, reference: 'WU-310', senderName: 'خالد', customerAmount: 120, settled: false },
      { ...sample[1], id: 32, customerId: 101, reference: 'WU-320', senderName: 'علي', customerAmount: 80, settled: true },
    ]
    const statement = buildCustomerStatement(customers, transfers, buildSeedLedgerEntries(customers), 101)

    expect(statement[0].label).toBe('رصيد افتتاحي')
    expect(statement.at(-1).runningBalance).toBe(520)
    expect(statement.some((entry) => entry.reference === 'WU-320')).toBe(true)
  })

  it('summarizes office balances without profit mixed into customer due', () => {
    const claim = createProfitClaimEntry(5)
    const office = summarizeOfficeLedger(customers, [
      { ...sample[1], id: 41, customerId: 101, systemAmount: 210, customerAmount: 200, margin: 10, settled: false },
      { ...sample[1], id: 42, customerId: 102, systemAmount: 120, customerAmount: 100, margin: 20, settled: true },
    ], [...buildSeedLedgerEntries(customers), claim])

    expect(office.officeCustomerLiability).toBe(600)
    expect(office.accountantSystemReceived).toBe(330)
    expect(office.accountantCustomerPaid).toBe(100)
    expect(office.accountantOutstandingCustomer).toBe(200)
    expect(office.accountantCashOnHand).toBe(330 - 100 - 200 - 5)
    expect(office.accountantClaimedProfit).toBe(5)
    expect(office.accountantClaimableProfit).toBe(15)
    expect(office.accountantGrossMargin).toBe(30)
    expect(office.accountantRealizedMargin).toBe(20)
    expect(office.accountantPendingProfit).toBe(10)
  })

  it('groups unsettled transfers by customer for separate settlements flow', () => {
    const groups = groupUnsettledTransfersByCustomer(customers, [
      { ...sample[1], id: 51, customerId: 101, customerAmount: 90, systemAmount: 100, margin: 10, settled: false },
      { ...sample[1], id: 52, customerId: 101, customerAmount: 45, systemAmount: 50, margin: 5, settled: false },
      { ...sample[1], id: 53, customerId: 102, customerAmount: 70, systemAmount: 80, margin: 10, settled: true },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].customerName).toBe('محمد')
    expect(groups[0].customerTotal).toBe(135)
    expect(groups[0].systemTotal).toBe(150)
  })

  /*
   * Full-day simulation: 2 customers, 8 transfers across all statuses,
   * settlements, profit claim — verifies every number across all summaries.
   */
  it('full-day scenario: all summaries are cross-consistent', () => {
    const custs = [
      { id: 201, name: 'عمر', openingBalance: 1000, settledTotal: 200,
        createdAt: '2026-04-12T06:00:00.000Z', updatedAt: '2026-04-12T06:00:00.000Z' },
      { id: 202, name: 'سارة', openingBalance: 0, settledTotal: 0,
        createdAt: '2026-04-12T06:00:00.000Z', updatedAt: '2026-04-12T06:00:00.000Z' },
    ]
    const seeds = buildSeedLedgerEntries(custs)

    // 8 transfers across all statuses
    const base = { issueCode: '', note: '', transferAmount: null, settled: false, settledAt: null,
      sentAt: null, pickedUpAt: null, issueAt: null, reviewHoldAt: null, resetAt: null }

    const txs = [
      // عمر — 5 حوالات
      { ...base, id: 301, customerId: 201, reference: 'T-301', senderName: 'أ', receiverName: 'عمر',
        status: 'received', transferAmount: 500, customerAmount: 480, systemAmount: null, margin: null,
        createdAt: '2026-04-12T08:00:00.000Z', updatedAt: '2026-04-12T08:00:00.000Z' },
      { ...base, id: 302, customerId: 201, reference: 'T-302', senderName: 'ب', receiverName: 'عمر',
        status: 'with_employee', transferAmount: 600, customerAmount: 570, systemAmount: null, margin: null,
        sentAt: '2026-04-12T08:30:00.000Z',
        createdAt: '2026-04-12T08:10:00.000Z', updatedAt: '2026-04-12T08:30:00.000Z' },
      { ...base, id: 303, customerId: 201, reference: 'T-303', senderName: 'ج', receiverName: 'عمر',
        status: 'issue', transferAmount: 400, customerAmount: 380, systemAmount: null, margin: null,
        issueCode: 'name_mismatch', issueAt: '2026-04-12T09:00:00.000Z',
        createdAt: '2026-04-12T08:20:00.000Z', updatedAt: '2026-04-12T09:00:00.000Z' },
      { ...base, id: 304, customerId: 201, reference: 'T-304', senderName: 'د', receiverName: 'عمر',
        status: 'picked_up', transferAmount: 700, customerAmount: 660, systemAmount: 680, margin: 20,
        pickedUpAt: '2026-04-12T10:00:00.000Z',
        createdAt: '2026-04-12T08:30:00.000Z', updatedAt: '2026-04-12T10:00:00.000Z' },
      { ...base, id: 305, customerId: 201, reference: 'T-305', senderName: 'ه', receiverName: 'عمر',
        status: 'picked_up', transferAmount: 300, customerAmount: 280, systemAmount: 290, margin: 10,
        settled: true, settledAt: '2026-04-12T11:00:00.000Z',
        pickedUpAt: '2026-04-12T09:30:00.000Z',
        createdAt: '2026-04-12T08:40:00.000Z', updatedAt: '2026-04-12T11:00:00.000Z' },

      // سارة — 3 حوالات
      { ...base, id: 306, customerId: 202, reference: 'T-306', senderName: 'و', receiverName: 'سارة',
        status: 'review_hold', transferAmount: 250, customerAmount: 230, systemAmount: null, margin: null,
        reviewHoldAt: '2026-04-12T09:15:00.000Z',
        createdAt: '2026-04-12T09:00:00.000Z', updatedAt: '2026-04-12T09:15:00.000Z' },
      { ...base, id: 307, customerId: 202, reference: 'T-307', senderName: 'ز', receiverName: 'سارة',
        status: 'picked_up', transferAmount: 450, customerAmount: 420, systemAmount: 435, margin: 15,
        pickedUpAt: '2026-04-12T10:30:00.000Z',
        createdAt: '2026-04-12T09:10:00.000Z', updatedAt: '2026-04-12T10:30:00.000Z' },
      { ...base, id: 308, customerId: 202, reference: 'T-308', senderName: 'ح', receiverName: 'سارة',
        status: 'picked_up', transferAmount: 350, customerAmount: 330, systemAmount: 340, margin: 10,
        settled: true, settledAt: '2026-04-12T12:00:00.000Z',
        pickedUpAt: '2026-04-12T11:00:00.000Z',
        createdAt: '2026-04-12T09:20:00.000Z', updatedAt: '2026-04-12T12:00:00.000Z' },
    ]

    // ── 1. Transfer summary (from summarizeTransfers) ──
    const tSummary = summarizeTransfers(txs)
    expect(tSummary.total).toBe(8)
    expect(tSummary.receivedCount).toBe(1)          // T-301
    expect(tSummary.withEmployeeCount).toBe(1)      // T-302
    expect(tSummary.issueCount).toBe(1)             // T-303
    expect(tSummary.pickedUpCount).toBe(4)          // T-304,305,307,308
    expect(tSummary.settledCount).toBe(2)           // T-305,308
    expect(tSummary.unsettledCount).toBe(2)         // T-304,307

    // Totals from picked_up only
    expect(tSummary.totalSystem).toBe(680 + 290 + 435 + 340)   // 1745
    expect(tSummary.totalCustomer).toBe(660 + 280 + 420 + 330) // 1690
    expect(tSummary.totalMargin).toBe(20 + 10 + 15 + 10)       // 55

    // Accountant pending (unsettled picked_up system amounts)
    expect(tSummary.accountantPending).toBe(680 + 435)          // 1115
    expect(tSummary.customerOwed).toBe(660 + 420)               // 1080

    // ── 2. Customer summary (from summarizeCustomers) ──
    const cSummary = summarizeCustomers(custs, txs, seeds)

    const omar = cSummary.find((c) => c.id === 201)
    expect(omar.transferCount).toBe(5)
    expect(omar.receivedCount).toBe(1)
    expect(omar.withEmployeeCount).toBe(1)
    expect(omar.issueCount).toBe(1)
    expect(omar.pickedUpCount).toBe(2)              // T-304, T-305
    expect(omar.settledCount).toBe(1)               // T-305
    expect(omar.unsettledCount).toBe(1)             // T-304
    expect(omar.settledAmount).toBe(280)            // T-305 customerAmount
    expect(omar.unsettledAmount).toBe(660)          // T-304 customerAmount
    expect(omar.totalMargin).toBe(30)               // 20+10

    // Omar ledger: opening 1000, legacy -200, due T-304 +660, due T-305 +280, settlement T-305 -280
    // = 1000 - 200 + 660 + 280 - 280 = 1460
    expect(omar.currentBalance).toBe(1460)
    expect(omar.ledgerCredits).toBe(1000 + 660 + 280)  // 1940
    expect(omar.ledgerDebits).toBe(200 + 280)           // 480

    const sara = cSummary.find((c) => c.id === 202)
    expect(sara.transferCount).toBe(3)
    expect(sara.receivedCount).toBe(0)
    expect(sara.reviewHoldCount).toBe(1)            // T-306
    expect(sara.pickedUpCount).toBe(2)              // T-307, T-308
    expect(sara.settledCount).toBe(1)               // T-308
    expect(sara.unsettledCount).toBe(1)             // T-307
    expect(sara.settledAmount).toBe(330)            // T-308
    expect(sara.unsettledAmount).toBe(420)          // T-307

    // Sara ledger: no opening, due T-307 +420, due T-308 +330, settlement T-308 -330
    // = 420 + 330 - 330 = 420
    expect(sara.currentBalance).toBe(420)
    expect(sara.ledgerCredits).toBe(420 + 330)      // 750
    expect(sara.ledgerDebits).toBe(330)

    // ── 3. Office ledger (from summarizeOfficeLedger) ──
    const office = summarizeOfficeLedger(custs, txs, seeds)

    // officeCustomerLiability = max(1460,0) + max(420,0)
    expect(office.officeCustomerLiability).toBe(1460 + 420)  // 1880

    expect(office.accountantSystemReceived).toBe(1745)       // all picked_up systemAmounts
    expect(office.accountantCustomerPaid).toBe(280 + 330)    // settled customerAmounts = 610
    expect(office.accountantOutstandingCustomer).toBe(660 + 420) // unsettled customerAmounts = 1080

    // cashOnHand = received - paid - outstanding - claimed
    // = 1745 - 610 - 1080 - 0 = 55
    expect(office.accountantCashOnHand).toBe(55)

    // grossMargin = 20+10+15+10 = 55
    expect(office.accountantGrossMargin).toBe(55)
    // realizedMargin (settled only) = 10+10 = 20
    expect(office.accountantRealizedMargin).toBe(20)
    // claimable = realized - claimed = 20 - 0 = 20
    expect(office.accountantClaimableProfit).toBe(20)
    // pending = gross - realized = 55 - 20 = 35
    expect(office.accountantPendingProfit).toBe(35)

    // ── 4. Cross-consistency checks ──

    // cashOnHand must equal grossMargin when no claims made
    expect(office.accountantCashOnHand).toBe(office.accountantGrossMargin)

    // paid + outstanding + claimedProfit + cashOnHand must equal systemReceived
    expect(
      office.accountantCustomerPaid +
      office.accountantOutstandingCustomer +
      office.accountantClaimedProfit +
      office.accountantCashOnHand
    ).toBe(office.accountantSystemReceived)

    // realizedMargin + pendingProfit must equal grossMargin
    expect(office.accountantRealizedMargin + office.accountantPendingProfit).toBe(office.accountantGrossMargin)

    // ── 5. After profit claim ──
    const claim = createProfitClaimEntry(20)
    const officeAfterClaim = summarizeOfficeLedger(custs, txs, [...seeds, claim])

    expect(officeAfterClaim.accountantClaimedProfit).toBe(20)
    expect(officeAfterClaim.accountantClaimableProfit).toBe(0)
    // cashOnHand = 1745 - 610 - 1080 - 20 = 35
    expect(officeAfterClaim.accountantCashOnHand).toBe(35)

    // Invariant still holds after claim
    expect(
      officeAfterClaim.accountantCustomerPaid +
      officeAfterClaim.accountantOutstandingCustomer +
      officeAfterClaim.accountantClaimedProfit +
      officeAfterClaim.accountantCashOnHand
    ).toBe(officeAfterClaim.accountantSystemReceived)

    // ── 6. Settlement flow ──
    // Settle T-304 (omar unsettled) and T-307 (sara unsettled)
    const afterSettle = settleTransfers(txs, [304, 307])
    const t304 = afterSettle.find((t) => t.id === 304)
    const t307 = afterSettle.find((t) => t.id === 307)
    expect(t304.settled).toBe(true)
    expect(t307.settled).toBe(true)

    const officeAfterSettle = summarizeOfficeLedger(custs, afterSettle, seeds)
    expect(officeAfterSettle.accountantCustomerPaid).toBe(280 + 330 + 660 + 420) // 1690
    expect(officeAfterSettle.accountantOutstandingCustomer).toBe(0)
    expect(officeAfterSettle.accountantRealizedMargin).toBe(55)  // all margins realized
    expect(officeAfterSettle.accountantClaimableProfit).toBe(55) // all claimable
    expect(officeAfterSettle.accountantCashOnHand).toBe(55)      // = grossMargin

    // Invariant after full settlement
    expect(
      officeAfterSettle.accountantCustomerPaid +
      officeAfterSettle.accountantOutstandingCustomer +
      officeAfterSettle.accountantClaimedProfit +
      officeAfterSettle.accountantCashOnHand
    ).toBe(officeAfterSettle.accountantSystemReceived)
  })
})
