import { useMemo, useState } from 'react'
import { computeDailyClosing, getAvailableDates, getTodayKey } from '../lib/dailyClosing'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function money(value) {
  return currency.format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ar', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatArabicDate(dateStr) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00`))
}

export default function DailyClosingTab({
  transfers,
  customerSummary,
  officeSummary,
  claimHistory,
  onClaimProfit,
}) {
  const [selectedDate, setSelectedDate] = useState(getTodayKey)
  const availableDates = useMemo(
    () => getAvailableDates(transfers, claimHistory),
    [claimHistory, transfers],
  )

  const closing = useMemo(
    () => computeDailyClosing(transfers, customerSummary, officeSummary, claimHistory, selectedDate),
    [claimHistory, customerSummary, officeSummary, selectedDate, transfers],
  )

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>الإقفال اليومي</h2>
          <select
            className="closing-date-select"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {availableDates.length === 0 ? (
              <option value={selectedDate}>{selectedDate}</option>
            ) : (
              availableDates.map((date) => (
                <option key={date} value={date}>{date}</option>
              ))
            )}
          </select>
        </div>

        <p className="closing-date-label">{formatArabicDate(selectedDate)}</p>

        <div className="closing-section">
          <h3>الزبائن — تراكمي</h3>
          <div className="closing-grid">
            <div className="closing-card closing-card--accent">
              <span>مستحق للزبائن</span>
              <strong>{money(closing.customerSnapshot.totalOutstanding)}</strong>
            </div>
            <div className="closing-card">
              <span>جديدة</span>
              <strong>{closing.customerSnapshot.receivedCount}</strong>
            </div>
            <div className="closing-card">
              <span>عند الموظف</span>
              <strong className="text-blue">{closing.customerSnapshot.withEmployeeCount}</strong>
            </div>
            <div className="closing-card">
              <span>مراجعة لاحقة</span>
              <strong className="text-orange">{closing.customerSnapshot.reviewHoldCount}</strong>
            </div>
            <div className="closing-card">
              <span>مشاكل</span>
              <strong className="text-red">{closing.customerSnapshot.issueCount}</strong>
            </div>
            <div className="closing-card">
              <span>تم السحب</span>
              <strong className="text-green">{closing.customerSnapshot.pickedUpCount}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الزبون</th>
                  <th>جديدة</th>
                  <th>عند الموظف</th>
                  <th>مراجعة</th>
                  <th>مشاكل</th>
                  <th>تم السحب</th>
                  <th>الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody>
                {closing.customerSnapshot.customerBreakdown.map((customer) => (
                  <tr key={customer.id}>
                    <td className="customer-name-cell">{customer.name}</td>
                    <td>{customer.receivedCount}</td>
                    <td>{customer.withEmployeeCount}</td>
                    <td>{customer.reviewHoldCount}</td>
                    <td>{customer.issueCount}</td>
                    <td>{customer.pickedUpCount}</td>
                    <td className="balance-cell">{money(customer.currentBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="closing-section">
          <h3>المكتب — حركة اليوم فقط</h3>
          <div className="closing-grid">
            <div className="closing-card">
              <span>دخلت اليوم</span>
              <strong>{closing.officeDaily.createdCount}</strong>
            </div>
            <div className="closing-card">
              <span>أُرسلت للموظف</span>
              <strong className="text-blue">{closing.officeDaily.sentCount}</strong>
            </div>
            <div className="closing-card">
              <span>تم سحبها اليوم</span>
              <strong className="text-green">{closing.officeDaily.pickedUpCount}</strong>
            </div>
            <div className="closing-card">
              <span>راجعة لاحقًا</span>
              <strong className="text-orange">{closing.officeDaily.reviewHoldCount}</strong>
            </div>
            <div className="closing-card">
              <span>صارت مشاكل</span>
              <strong className="text-red">{closing.officeDaily.issueCount}</strong>
            </div>
            <div className="closing-card">
              <span>تسويات اليوم</span>
              <strong>{closing.officeDaily.settledCount}</strong>
            </div>
            <div className="closing-card">
              <span>من الموظف اليوم</span>
              <strong>{money(closing.officeDaily.officeSystemReceivedToday)}</strong>
            </div>
            <div className="closing-card">
              <span>للزبائن اليوم</span>
              <strong>{money(closing.officeDaily.officeCustomerPaidToday)}</strong>
            </div>
            <div className="closing-card">
              <span>ربح تحقق اليوم</span>
              <strong>{money(closing.officeDaily.officeProfitRealizedToday)}</strong>
            </div>
            <div className="closing-card">
              <span>Claims اليوم</span>
              <strong>{money(closing.officeDaily.claimsValueToday)}</strong>
            </div>
          </div>
        </div>

        <div className="closing-section">
          <div className="panel-head compact">
            <h3>المحاسب — تراكمي</h3>
            <button
              className="action-btn action-btn--green"
              disabled={closing.accountantSnapshot.claimableProfit <= 0}
              onClick={onClaimProfit}
            >
              Claim الربح
            </button>
          </div>

          <div className="closing-grid">
            <div className="closing-card">
              <span>عنده الآن</span>
              <strong>{money(closing.accountantSnapshot.cashOnHand)}</strong>
            </div>
            <div className="closing-card">
              <span>استلم من ويسترن</span>
              <strong>{money(closing.accountantSnapshot.systemReceived)}</strong>
            </div>
            <div className="closing-card">
              <span>دفع للزبائن</span>
              <strong>{money(closing.accountantSnapshot.customerPaid)}</strong>
            </div>
            <div className="closing-card">
              <span>ما زال للزبائن</span>
              <strong>{money(closing.accountantSnapshot.outstandingCustomer)}</strong>
            </div>
            <div className="closing-card">
              <span>ربح قابل للـ Claim</span>
              <strong className="text-green">{money(closing.accountantSnapshot.claimableProfit)}</strong>
            </div>
            <div className="closing-card">
              <span>ربح Pending</span>
              <strong>{money(closing.accountantSnapshot.pendingProfit)}</strong>
            </div>
            <div className="closing-card">
              <span>ربح تم Claim له</span>
              <strong>{money(closing.accountantSnapshot.claimedProfit)}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تاريخ الـ Claim</th>
                  <th>القيمة</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {closing.accountantSnapshot.claimHistory.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="empty-table">لا يوجد Claim حتى الآن</td>
                  </tr>
                ) : (
                  closing.accountantSnapshot.claimHistory.map((claim) => (
                    <tr key={claim.id}>
                      <td className="date-cell">{formatDate(claim.createdAt)}</td>
                      <td>{money(Math.abs(claim.amount || 0))}</td>
                      <td>{claim.note || 'مطالبة ربح'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
