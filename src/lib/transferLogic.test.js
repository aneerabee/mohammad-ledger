import { describe, expect, it } from 'vitest'
import {
  buildCustomerFromDraft,
  buildTransferFromDraft,
  computeMargin,
  filterTransfers,
  parseAppStateBackup,
  sortTransfers,
  summarizeCustomers,
  summarizeTransfers,
  togglePayment,
  transitionTransfer,
  updateAmount,
} from './transferLogic'

const customers = [
  {
    id: 101,
    name: 'محمد',
    openingBalance: 500,
    settledTotal: 100,
    createdAt: '2026-04-11T09:00:00.000Z',
    updatedAt: '2026-04-11T09:00:00.000Z',
  },
  {
    id: 102,
    name: 'ليلى',
    openingBalance: 0,
    settledTotal: 0,
    createdAt: '2026-04-11T09:00:00.000Z',
    updatedAt: '2026-04-11T09:00:00.000Z',
  },
]

const sample = [
  {
    id: 1,
    customerId: 101,
    reference: 'WU-100',
    senderName: 'أحمد',
    receiverName: 'محمد',
    status: 'new',
    issueCode: '',
    systemAmount: null,
    customerAmount: null,
    margin: null,
    paymentStatus: 'pending',
    note: '',
    createdAt: '2026-04-11T09:00:00.000Z',
    updatedAt: '2026-04-11T09:00:00.000Z',
  },
  {
    id: 2,
    customerId: 102,
    reference: 'WU-200',
    senderName: 'منى',
    receiverName: 'ليلى',
    status: 'customer_confirmed',
    issueCode: '',
    systemAmount: 100,
    customerAmount: 90,
    margin: 10,
    paymentStatus: 'pending',
    note: '',
    createdAt: '2026-04-11T10:00:00.000Z',
    updatedAt: '2026-04-11T10:00:00.000Z',
  },
]

describe('transferLogic', () => {
  it('computes margin only when both amounts exist', () => {
    expect(computeMargin(100, 88)).toBe(12)
    expect(computeMargin(100, null)).toBeNull()
  })

  it('creates customer and blocks duplicate names', () => {
    const created = buildCustomerFromDraft({ name: 'سالم', openingBalance: '100', settledTotal: '20' }, customers)
    expect(created.ok).toBe(true)

    const duplicate = buildCustomerFromDraft({ name: 'محمد', openingBalance: '', settledTotal: '' }, customers)
    expect(duplicate.ok).toBe(false)
  })

  it('requires selected customer when creating transfer', () => {
    const result = buildTransferFromDraft(
      { customerId: '', senderName: 'سالم', reference: 'wu-300' },
      sample,
      customers,
    )

    expect(result.ok).toBe(false)
  })

  it('prevents duplicate references on create', () => {
    const result = buildTransferFromDraft(
      { customerId: '101', senderName: 'سالم', reference: 'wu-100' },
      sample,
      customers,
    )

    expect(result.ok).toBe(false)
  })

  it('creates transfer from customer selection', () => {
    const result = buildTransferFromDraft(
      { customerId: '101', senderName: 'سالم', reference: ' wu-300 ' },
      sample,
      customers,
    )

    expect(result.ok).toBe(true)
    expect(result.value.reference).toBe('WU-300')
    expect(result.value.receiverName).toBe('محمد')
  })

  it('moves issue status to pending payment', () => {
    const next = transitionTransfer(sample[1], 'issue')
    expect(next.status).toBe('issue')
    expect(next.paymentStatus).toBe('pending')
  })

  it('recomputes margin when amount changes', () => {
    const next = updateAmount(sample[0], 'systemAmount', '120')
    const final = updateAmount(next, 'customerAmount', '111')
    expect(final.margin).toBe(9)
  })

  it('toggles payment and aligns status', () => {
    const next = togglePayment(sample[1])
    expect(next.paymentStatus).toBe('paid')
    expect(next.status).toBe('paid')
  })

  it('filters by customer and payment', () => {
    const customersById = new Map(customers.map((item) => [item.id, item]))
    const filtered = filterTransfers(sample, {
      searchTerm: '',
      statusFilter: 'all',
      paymentFilter: 'pending',
      customerFilter: '102',
    }, customersById)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].reference).toBe('WU-200')
  })

  it('sorts by customer name', () => {
    const customersById = new Map(customers.map((item) => [item.id, item]))
    const sorted = sortTransfers(sample, 'customer', customersById)
    expect(sorted[0].reference).toBe('WU-200')
  })

  it('summarizes customer balances', () => {
    const transfers = [
      ...sample,
      { ...sample[0], id: 3, customerId: 101, customerAmount: 200, paymentStatus: 'paid', status: 'paid' },
    ]
    const summary = summarizeCustomers(customers, transfers)
    const mohamed = summary.find((item) => item.id === 101)
    expect(mohamed.deliveredTotal).toBe(200)
    expect(mohamed.currentBalance).toBe(600)
  })

  it('summarizes transfers totals', () => {
    const summary = summarizeTransfers(sample)
    expect(summary.totalSystem).toBe(100)
    expect(summary.totalCustomer).toBe(90)
    expect(summary.totalMargin).toBe(10)
  })

  it('parses valid backup payload', () => {
    const restored = parseAppStateBackup(JSON.stringify({ customers, transfers: sample }))
    expect(restored.customers).toHaveLength(2)
    expect(restored.transfers).toHaveLength(2)
  })
})
