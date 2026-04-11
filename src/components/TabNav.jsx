const tabs = [
  { key: 'transfers', label: 'الحوالات' },
  { key: 'customers', label: 'الزبائن' },
  { key: 'settlements', label: 'التسويات' },
  { key: 'closing', label: 'الإقفال اليومي' },
  { key: 'issues', label: 'المشاكل' },
]

export default function TabNav({ active, onChange, issueCount }) {
  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab-btn${active === tab.key ? ' tab-btn--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.key === 'issues' && issueCount > 0 ? (
            <span className="tab-badge">{issueCount}</span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
