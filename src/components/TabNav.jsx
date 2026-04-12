const tabs = [
  { key: 'transfers', icon: '↗', label: 'حوالات' },
  { key: 'customers', icon: '👤', label: 'زبائن' },
  { key: 'settlements', icon: '✓', label: 'تسويات' },
  { key: 'closing', icon: '📊', label: 'إقفال' },
  { key: 'issues', icon: '!', label: 'مشاكل' },
]

export default function TabNav({ active, onChange, issueCount }) {
  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`nav-item${active === tab.key ? ' nav-item--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          <span className="nav-icon">
            {tab.icon}
            {tab.key === 'issues' && issueCount > 0 ? (
              <span className="nav-badge">{issueCount}</span>
            ) : null}
          </span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
