import { describe, expect, it } from 'vitest'
import { computeDailyClosing, getAvailableDates, getDateKey } from './dailyClosing'
import { buildSeedLedgerEntries, createProfitClaimEntry, summarizeOfficeLedger } from './ledger'
import { summarizeCustomers } from './transferLogic'

const customers = [
  { id: 101, name: 'محمد', openingBalance: 500, settledTotal: 100, createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z' },
  { id: 102, name: 'ليلى', openingBalance: 0, settledTotal: 0, createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z' },
]

const transfers = [
  {
    id: 1, customerId: 101, reference: 'WU-100', senderName: 'أحمد', receiverName: 'محمد',
    status: 'picked_up', issueCode: '', systemAmount: 200, customerAmount: 180, margin: 20,
    settled: false, settledAt: null, note: '',
    createdAt: '2026-04-11T09:00:00.000Z', updatedAt: '2026-04-11T09:00:00.000Z', sentAt: '2026-04-11T09:10:00.000Z', pickedUpAt: '2026-04-11T09:20:00.000Z',
  },
  {
    id: 2, customerId: 102, reference: 'WU-200', senderName: 'منى', receiverName: 'ليلى',
    status: 'picked_up', issueCode: '', systemAmount: 100, customerAmount: 90, margin: 10,
    settled: true, settledAt: '2026-04-11T12:00:00.000Z', note: '',
    createdAt: '2026-04-10T10:00:00.000Z', updatedAt: '2026-04-11T12:00:00.000Z', sentAt: '2026-04-10T10:10:00.000Z', pickedUpAt: '2026-04-10T11:00:00.000Z',
  },
  {
    id: 3, customerId: 101, reference: 'WU-300', senderName: 'سالم', receiverName: 'محمد',
    status: 'issue', issueCode: 'name_mismatch', systemAmount: null, customerAmount: null, margin: null,
    settled: false, settledAt: null, note: '',
    createdAt: '2026-04-10T15:00:00.000Z', updatedAt: '2026-04-10T15:00:00.000Z', issueAt: '2026-04-11T08:00:00.000Z',
  },
]

const claimHistory = [createProfitClaimEntry(10)]
claimHistory[0].createdAt = '2026-04-11T16:00:00.000Z'
claimHistory[0].updatedAt = '2026-04-11T16:00:00.000Z'

const customerSummary = summarizeCustomers(customers, transfers, buildSeedLedgerEntries(customers))
const officeSummary = summarizeOfficeLedger(customers, transfers, [...buildSeedLedgerEntries(customers), ...claimHistory])

describe('dailyClosing', () => {
  it('extracts date key from ISO string', () => {
    expect(getDateKey('2026-04-11T09:00:00.000Z')).toBe('2026-04-11')
    expect(getDateKey('')).toBe('')
  })

  it('lists available dates sorted descending', () => {
    const dates = getAvailableDates(transfers, claimHistory)
    expect(dates[0]).toBe('2026-04-11')
    expect(dates[1]).toBe('2026-04-10')
    expect(dates).toHaveLength(2)
  })

  it('computes daily closing for a specific date', () => {
    const closing = computeDailyClosing(transfers, customerSummary, officeSummary, claimHistory, '2026-04-11')
    expect(closing.customerSnapshot.totalOutstanding).toBe(580)
    expect(closing.officeDaily.createdCount).toBe(1)
    expect(closing.officeDaily.pickedUpCount).toBe(1)
    expect(closing.officeDaily.settledCount).toBe(1)
    expect(closing.officeDaily.officeSystemReceivedToday).toBe(200)
    expect(closing.officeDaily.officeCustomerPaidToday).toBe(90)
    expect(closing.officeDaily.claimsValueToday).toBe(10)
  })

  it('includes cumulative customer and accountant views', () => {
    const closing = computeDailyClosing(transfers, customerSummary, officeSummary, claimHistory, '2026-04-11')
    expect(closing.customerSnapshot.customerBreakdown).toHaveLength(2)
    const mohamed = closing.customerSnapshot.customerBreakdown.find((c) => c.name === 'محمد')
    expect(mohamed.pickedUpCount).toBe(1)
    expect(closing.accountantSnapshot.claimedProfit).toBe(10)
  })

  it('returns zeros for empty date', () => {
    const closing = computeDailyClosing(transfers, customerSummary, officeSummary, claimHistory, '2026-01-01')
    expect(closing.officeDaily.createdCount).toBe(0)
    expect(closing.officeDaily.officeSystemReceivedToday).toBe(0)
  })
})
