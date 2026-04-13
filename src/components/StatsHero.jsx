import { useCountUp } from '../lib/useCountUp'

/*
  Stats hero — compact, pipeline-shaped bar.

  Layout (desktop):
    [📋 total] │ 📥→➤→⏸→✓ lifecycle │ ⚠ ⏳ alerts │ 💰 🏦 ✨ money

  Everything fits in one horizontal band on desktop. On mobile, the
  sections wrap to at most two compact rows.

  "Smart" behaviors:
    - Alert pills only render when count > 0 (zero = no visual noise)
    - Lifecycle nodes dim to grey when their count is zero
    - Urgent nodes pulse (received transfers waiting to be sent)
    - Numbers count-up smoothly on value change
    - Viewer mode hides office-internal money cards and swaps labels
*/

function formatMoney(value) {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (abs >= 10000) return Math.round(n / 1000) + 'k'
  if (abs >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(Math.round(n))
}

function FlowNode({ icon, count, label, tone, urgent = false, isLast = false }) {
  const animated = useCountUp(count, 500)
  const dim = count === 0
  return (
    <>
      <div
        className={[
          'flow-node',
          `flow-node--${tone}`,
          dim ? 'flow-node--dim' : '',
          urgent ? 'flow-node--urgent' : '',
        ].filter(Boolean).join(' ')}
        title={`${label}: ${count}`}
      >
        <span className="flow-node-icon" aria-hidden="true">{icon}</span>
        <span className="flow-node-count">{Math.round(animated)}</span>
        <span className="flow-node-label">{label}</span>
      </div>
      {isLast ? null : <span className="flow-arrow" aria-hidden="true">←</span>}
    </>
  )
}

function AlertPill({ tone, icon, count, label }) {
  const animated = useCountUp(count, 500)
  return (
    <div className={`alert-pill alert-pill--${tone}`} title={`${label}: ${count}`}>
      <span aria-hidden="true">{icon}</span>
      <strong>{Math.round(animated)}</strong>
      <span className="alert-pill-label">{label}</span>
    </div>
  )
}

function MoneyChip({ icon, label, value, tone }) {
  const animated = useCountUp(value, 650)
  return (
    <div className={`money-chip money-chip--${tone}`} title={`${label}: ${Math.round(animated).toLocaleString()}`}>
      <span className="money-chip-icon" aria-hidden="true">{icon}</span>
      <div className="money-chip-body">
        <span className="money-chip-label">{label}</span>
        <strong className="money-chip-value">{formatMoney(animated)}</strong>
      </div>
    </div>
  )
}

function TotalHero({ total }) {
  const animated = useCountUp(total, 650)
  return (
    <div className="stats-total-hero" title={`إجمالي الحوالات: ${total}`}>
      <span className="stats-total-hero-icon" aria-hidden="true">📋</span>
      <div className="stats-total-hero-body">
        <strong className="stats-total-hero-value">{Math.round(animated)}</strong>
        <span className="stats-total-hero-label">إجمالي الحوالات</span>
      </div>
    </div>
  )
}

export default function StatsHero({
  transferSummary,
  officeSummary,
  issueCount,
  viewerMode = false,
  viewerSettledTotal = null,
}) {
  const {
    total,
    receivedCount,
    withEmployeeCount,
    reviewHoldCount,
    pickedUpCount,
    unsettledCount,
  } = transferSummary

  const hasIssues = issueCount > 0
  const hasUnsettled = unsettledCount > 0

  return (
    <section className="stats-hero-v2" aria-label="لوحة المؤشرات">
      <div className="stats-hero-v2-primary">
        <TotalHero total={total} />

        <div className="stats-pipeline" aria-label="دورة حياة الحوالة">
          <FlowNode
            icon="📥"
            count={receivedCount}
            label="جديدة"
            tone="amber"
            urgent={receivedCount > 0}
          />
          <FlowNode
            icon="➤"
            count={withEmployeeCount}
            label="الموظف"
            tone="blue"
          />
          <FlowNode
            icon="⏸"
            count={reviewHoldCount}
            label="مراجعة"
            tone="amber"
          />
          <FlowNode
            icon="✓"
            count={pickedUpCount}
            label="سُحبت"
            tone="green"
            isLast
          />
        </div>

        {hasIssues || hasUnsettled ? (
          <div className="stats-alerts">
            {hasIssues ? (
              <AlertPill tone="red" icon="⚠" count={issueCount} label="مشاكل" />
            ) : null}
            {hasUnsettled ? (
              <AlertPill tone="amber" icon="⏳" count={unsettledCount} label="للتسوية" />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="stats-hero-v2-money">
        {viewerMode ? (
          <>
            <MoneyChip
              icon="💰"
              label="مستحق لك"
              value={officeSummary.officeCustomerLiability}
              tone="orange"
            />
            <MoneyChip
              icon="✓"
              label="استلمت سابقاً"
              value={viewerSettledTotal || 0}
              tone="green"
            />
          </>
        ) : (
          <>
            <MoneyChip
              icon="💰"
              label="للزبائن"
              value={officeSummary.officeCustomerLiability}
              tone="orange"
            />
            <MoneyChip
              icon="🏦"
              label="المحاسب"
              value={officeSummary.accountantCashOnHand}
              tone="blue"
            />
            <MoneyChip
              icon="✨"
              label="ربح قابل"
              value={officeSummary.accountantClaimableProfit}
              tone="green"
            />
          </>
        )}
      </div>
    </section>
  )
}
