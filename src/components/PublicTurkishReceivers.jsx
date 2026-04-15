import { useMemo, useState } from 'react'
import { buildPeopleList } from '../lib/people'
import CopyButton from './CopyButton'

export default function PublicTurkishReceivers({ transfers, receivers }) {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const all = buildPeopleList(transfers || [], receivers || [], 'receiver')
    const turkish = all.filter((r) => r.isTurkish)
    return turkish.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [transfers, receivers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(q))
  }, [rows, query])

  const totalCount = rows.length
  const totalAll = rows.reduce((sum, r) => sum + (r.total || 0), 0)

  return (
    <div className="public-list-shell public-list-shell--tr" dir="ltr" lang="tr">
      <header className="public-list-header">
        <h1>🇹🇷 Türk Alıcılar Listesi</h1>
        <p className="public-list-intro">
          Bu liste Western Office sisteminden canlı olarak güncellenir.
          Her alıcının toplam havale sayısını gösterir.
        </p>
        <div className="public-list-summary">
          <span className="public-chip"><strong>{totalCount}</strong> alıcı</span>
          <span className="public-chip"><strong>{totalAll}</strong> toplam havale</span>
        </div>
      </header>

      <input
        className="public-search"
        type="search"
        placeholder="İsim ile ara..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="public-empty">
          {query ? 'Sonuç bulunamadı' : 'Henüz Türk alıcı yok'}
        </div>
      ) : (
        <ol className="public-list">
          {filtered.map((row, idx) => (
            <li key={row.key} className="public-row">
              <span className="public-row-rank">{idx + 1}</span>
              <div className="public-row-body">
                <div className="public-row-name">
                  <span className="public-row-flag" aria-hidden="true">🇹🇷</span>
                  <span className="public-row-name-text">{row.name}</span>
                  <CopyButton
                    text={row.name}
                    idleLabel="Kopyala"
                    successLabel="✓ Kopyalandı"
                    title={`İsmi kopyala: ${row.name}`}
                    ariaLabel={`İsmi kopyala: ${row.name}`}
                  />
                </div>
              </div>
              <span className="public-count public-count--total" title="Toplam havale">
                <strong>{row.total}</strong>
                <em>Toplam</em>
              </span>
            </li>
          ))}
        </ol>
      )}

      <footer className="public-list-footer">
        <span>Liste otomatik güncellenir · Western Office</span>
      </footer>
    </div>
  )
}
