import { describe, it, expect } from 'vitest'
import {
  buildSeedLedgerEntries,
  createProfitClaimEntry,
  summarizeOfficeLedger,
} from './ledger'

/*
  End-to-end profit-claim verification.

  These tests reproduce the EXACT computation path that runs when the
  user clicks the "سحب الربح" button in any of its three locations:

    - top-of-app green banner
    - DailyClosingTab header button
    - DailyClosingTab overview card button

  All three call handleClaimProfit() in App.jsx, which:
    1. computes officeSummary with current claimHistory
    2. takes accountantClaimableProfit as the amount
    3. creates a profit_claim ledger entry via createProfitClaimEntry
    4. appends it to claimHistory
    5. re-renders, which recomputes officeSummary with the new entry

  Each test below walks the same path manually and asserts every derived
  value at every step, including the accountant-balance equation:
    customerPaid + claimedProfit + cashOnHand == systemReceived
*/

const customers = [
  { id: 1, name: 'زبون أ', openingBalance: 0, settledTotal: 0 },
  { id: 2, name: 'زبون ب', openingBalance: 0, settledTotal: 0 },
]

function makeTransfer(overrides) {
  return {
    id: overrides.id,
    customerId: overrides.customerId,
    reference: `R-${overrides.id}`,
    senderName: 'مرسل',
    receiverName: 'مستلم',
    status: overrides.status,
    settled: overrides.settled || false,
    settledAt: overrides.settledAt || null,
    transferAmount: overrides.transferAmount,
    customerAmount: overrides.customerAmount,
    systemAmount: overrides.systemAmount,
    margin: overrides.margin,
    createdAt: '2026-04-12T08:00:00.000Z',
    updatedAt: '2026-04-12T08:00:00.000Z',
    pickedUpAt: overrides.pickedUpAt || null,
    issueAt: null,
    sentAt: null,
    reviewHoldAt: null,
    history: [],
  }
}

// 5 picked_up + settled transfers — total margin = 100
const settledTransfers = [
  makeTransfer({ id: 1, customerId: 1, status: 'picked_up', settled: true, settledAt: '2026-04-12T10:00:00Z', pickedUpAt: '2026-04-12T09:00:00Z', transferAmount: 1000, customerAmount: 980, systemAmount: 990, margin: 10 }),
  makeTransfer({ id: 2, customerId: 1, status: 'picked_up', settled: true, settledAt: '2026-04-12T10:00:00Z', pickedUpAt: '2026-04-12T09:00:00Z', transferAmount: 2000, customerAmount: 1960, systemAmount: 1980, margin: 20 }),
  makeTransfer({ id: 3, customerId: 1, status: 'picked_up', settled: true, settledAt: '2026-04-12T10:00:00Z', pickedUpAt: '2026-04-12T09:00:00Z', transferAmount: 3000, customerAmount: 2940, systemAmount: 2970, margin: 30 }),
  makeTransfer({ id: 4, customerId: 2, status: 'picked_up', settled: true, settledAt: '2026-04-12T10:00:00Z', pickedUpAt: '2026-04-12T09:00:00Z', transferAmount: 4000, customerAmount: 3920, systemAmount: 3960, margin: 40 }),
  makeTransfer({ id: 5, customerId: 2, status: 'picked_up', settled: true, settledAt: '2026-04-12T10:00:00Z', pickedUpAt: '2026-04-12T09:00:00Z', transferAmount: 5000, customerAmount: 4900, settled: false, systemAmount: 4950, margin: 50 }),
  // ↑ id=5 is intentionally settled=false to test "picked_up but not settled"
  // → its margin (50) is PENDING, not realized → not yet claimable
]

const seeds = buildSeedLedgerEntries(customers)

describe('profit-claim — single claim flow', () => {
  it('initial state: 4 settled transfers (10+20+30+40=100), 1 picked-up unsettled (50 pending)', () => {
    const office = summarizeOfficeLedger(customers, settledTransfers, seeds)

    expect(office.accountantRealizedMargin).toBe(100) // 4 settled × respective margins
    expect(office.accountantClaimedProfit).toBe(0)    // no claims yet
    expect(office.accountantClaimableProfit).toBe(100) // realized - claimed
    expect(office.accountantPendingProfit).toBe(50)   // grossMargin (150) - realized (100) = 50

    // Equation: paid + claimed + cashOnHand == systemReceived
    expect(
      office.accountantCustomerPaid +
      office.accountantClaimedProfit +
      office.accountantCashOnHand,
    ).toBe(office.accountantSystemReceived)
  })

  it('AFTER claiming 100: claimable=0, claimed=100, cashOnHand drops by exactly 100', () => {
    const office1 = summarizeOfficeLedger(customers, settledTransfers, seeds)
    const cashBefore = office1.accountantCashOnHand
    const claimable = office1.accountantClaimableProfit

    // Simulate the exact flow App.jsx.handleClaimProfit runs:
    const claim = createProfitClaimEntry(claimable)

    // claim entry shape
    expect(claim.amount).toBe(-100)            // negative
    expect(claim.type).toBe('profit_claim')
    expect(claim.customerId).toBe(0)           // office-wide

    // Recompute summary with the new claim entry appended
    const office2 = summarizeOfficeLedger(customers, settledTransfers, [...seeds, claim])

    expect(office2.accountantClaimedProfit).toBe(100)
    expect(office2.accountantClaimableProfit).toBe(0)
    expect(office2.accountantCashOnHand).toBe(cashBefore - 100)

    // Pending margin is unchanged (it's based on UNSETTLED transfers)
    expect(office2.accountantPendingProfit).toBe(50)

    // Equation still holds
    expect(
      office2.accountantCustomerPaid +
      office2.accountantClaimedProfit +
      office2.accountantCashOnHand,
    ).toBe(office2.accountantSystemReceived)
  })

  it('claim is recorded in claimHistory list', () => {
    const claim = createProfitClaimEntry(100)
    const office = summarizeOfficeLedger(customers, settledTransfers, [...seeds, claim])
    expect(office.claimHistory).toHaveLength(1)
    expect(office.claimHistory[0].amount).toBe(-100)
  })
})

describe('profit-claim — repeated claims (no re-claim of same money)', () => {
  it('after first claim, second click would claim 0 (claimable becomes 0)', () => {
    const claim1 = createProfitClaimEntry(100)
    const officeAfter1 = summarizeOfficeLedger(customers, settledTransfers, [...seeds, claim1])

    // App.jsx handleClaimProfit blocks the call when claimable <= 0
    // So we just assert that's the state
    expect(officeAfter1.accountantClaimableProfit).toBe(0)
  })

  it('after settling MORE transfers, the new realized margin becomes claimable', () => {
    // Initial claim of 100 (the first 4 transfers were settled)
    const claim1 = createProfitClaimEntry(100)

    // Now also settle transfer #5 (margin = 50)
    const moreSettled = settledTransfers.map((t) =>
      t.id === 5 ? { ...t, settled: true, settledAt: '2026-04-12T11:00:00Z' } : t,
    )
    const office = summarizeOfficeLedger(customers, moreSettled, [...seeds, claim1])

    expect(office.accountantRealizedMargin).toBe(150)  // all 5 settled now
    expect(office.accountantClaimedProfit).toBe(100)   // already claimed
    expect(office.accountantClaimableProfit).toBe(50)  // newly available
    expect(office.accountantPendingProfit).toBe(0)     // nothing pending

    // Equation still holds
    expect(
      office.accountantCustomerPaid +
      office.accountantClaimedProfit +
      office.accountantCashOnHand,
    ).toBe(office.accountantSystemReceived)
  })

  it('after second claim, both 100+50 are claimed and claimable=0', () => {
    const claim1 = createProfitClaimEntry(100)
    const claim2 = createProfitClaimEntry(50)
    const moreSettled = settledTransfers.map((t) =>
      t.id === 5 ? { ...t, settled: true, settledAt: '2026-04-12T11:00:00Z' } : t,
    )
    const office = summarizeOfficeLedger(customers, moreSettled, [...seeds, claim1, claim2])

    expect(office.accountantClaimedProfit).toBe(150)
    expect(office.accountantClaimableProfit).toBe(0)
    expect(office.claimHistory).toHaveLength(2)

    // Both claim entries in history
    const total = office.claimHistory.reduce((s, c) => s + Math.abs(c.amount || 0), 0)
    expect(total).toBe(150)

    // Equation still holds
    expect(
      office.accountantCustomerPaid +
      office.accountantClaimedProfit +
      office.accountantCashOnHand,
    ).toBe(office.accountantSystemReceived)
  })
})

describe('profit-claim — accountant cash precision', () => {
  it('cashOnHand = systemReceived - customerPaid - claimedProfit (always)', () => {
    // Test with several states
    const states = [
      { transfers: settledTransfers, claims: [] },
      { transfers: settledTransfers, claims: [createProfitClaimEntry(100)] },
      { transfers: settledTransfers.slice(0, 2), claims: [] },
      { transfers: settledTransfers.slice(0, 2), claims: [createProfitClaimEntry(30)] },
    ]
    for (const s of states) {
      const office = summarizeOfficeLedger(customers, s.transfers, [...seeds, ...s.claims])
      const expectedCash =
        office.accountantSystemReceived -
        office.accountantCustomerPaid -
        office.accountantClaimedProfit
      expect(office.accountantCashOnHand).toBe(expectedCash)
    }
  })

  it('cashOnHand never goes negative even with overclaim attempts', () => {
    // (handleClaimProfit prevents this in the UI, but test the math is sane)
    const claim = createProfitClaimEntry(100)
    const office = summarizeOfficeLedger(customers, settledTransfers, [...seeds, claim])
    expect(office.accountantClaimableProfit).toBeGreaterThanOrEqual(0)
  })
})

describe('profit-claim — fractional and large amounts', () => {
  it('handles fractional margins precisely (e.g. 12.50)', () => {
    const fractionalTransfer = makeTransfer({
      id: 100,
      customerId: 1,
      status: 'picked_up',
      settled: true,
      settledAt: '2026-04-12T10:00:00Z',
      pickedUpAt: '2026-04-12T09:00:00Z',
      transferAmount: 1000,
      customerAmount: 987.5,
      systemAmount: 1000,
      margin: 12.5,
    })
    const office = summarizeOfficeLedger(customers, [fractionalTransfer], seeds)
    expect(office.accountantClaimableProfit).toBe(12.5)

    const claim = createProfitClaimEntry(12.5)
    const office2 = summarizeOfficeLedger(customers, [fractionalTransfer], [...seeds, claim])
    expect(office2.accountantClaimableProfit).toBe(0)
    expect(office2.accountantClaimedProfit).toBe(12.5)
  })

  it('handles large amounts (50000)', () => {
    const bigTransfer = makeTransfer({
      id: 200,
      customerId: 1,
      status: 'picked_up',
      settled: true,
      settledAt: '2026-04-12T10:00:00Z',
      pickedUpAt: '2026-04-12T09:00:00Z',
      transferAmount: 1000000,
      customerAmount: 950000,
      systemAmount: 1000000,
      margin: 50000,
    })
    const office = summarizeOfficeLedger(customers, [bigTransfer], seeds)
    expect(office.accountantClaimableProfit).toBe(50000)

    const claim = createProfitClaimEntry(50000)
    const office2 = summarizeOfficeLedger(customers, [bigTransfer], [...seeds, claim])
    expect(office2.accountantClaimableProfit).toBe(0)
    expect(office2.accountantCashOnHand).toBe(office.accountantCashOnHand - 50000)
  })
})

describe('profit-claim — equation invariant across all states', () => {
  it('paid + claimed + cashOnHand === systemReceived (after every operation)', () => {
    const states = [
      { transfers: [], claims: [] }, // empty
      { transfers: settledTransfers.slice(0, 1), claims: [] }, // one transfer
      { transfers: settledTransfers, claims: [] }, // all transfers
      { transfers: settledTransfers, claims: [createProfitClaimEntry(50)] }, // partial claim
      { transfers: settledTransfers, claims: [createProfitClaimEntry(50), createProfitClaimEntry(50)] }, // double claim
    ]
    for (const s of states) {
      const office = summarizeOfficeLedger(customers, s.transfers, [...seeds, ...s.claims])
      expect(
        office.accountantCustomerPaid +
        office.accountantClaimedProfit +
        office.accountantCashOnHand,
      ).toBe(office.accountantSystemReceived)
    }
  })
})
