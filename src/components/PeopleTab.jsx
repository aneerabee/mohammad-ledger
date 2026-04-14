import { useMemo, useState } from 'react'
import {
  PERSON_KIND,
  buildPeopleList,
  getReceiverColorClass,
} from '../lib/people'
import CopyButton from './CopyButton'

function PersonTable({
  kind,
  transfers,
  overrides,
  onUpsertPerson,
  readOnly = false,
}) {
  const [query, setQuery] = useState('')
  const [addDraft, setAddDraft] = useState({ name: '', legacyCount: '', isTurkish: false })
  const [editingKey, setEditingKey] = useState(null)
  // Edit draft now holds both the numeric count and the Turkish flag
  const [editDraft, setEditDraft] = useState({ legacyCount: '', isTurkish: false })
  // Filter: show only Turkish receivers (receiver tab only)
  const [turkishOnly, setTurkishOnly] = useState(false)

  const isReceiver = kind === PERSON_KIND.RECEIVER

  const people = useMemo(
    () => buildPeopleList(transfers, overrides, kind),
    [transfers, overrides, kind],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ar')
    let list = people
    if (turkishOnly && isReceiver) {
      list = list.filter((p) => p.isTurkish)
    }
    if (q) {
      list = list.filter((p) => p.name.toLocaleLowerCase('ar').includes(q))
    }
    return list
  }, [people, query, turkishOnly, isReceiver])

  const totalSystem = people.reduce((s, p) => s + p.systemCount, 0)
  const totalLegacy = people.reduce((s, p) => s + p.legacyCount, 0)
  const totalAll = totalSystem + totalLegacy
  const turkishCount = isReceiver ? people.filter((p) => p.isTurkish).length : 0

  function submitAdd(e) {
    e.preventDefault()
    if (!addDraft.name.trim()) return
    const patch = {
      name: addDraft.name,
      legacyCount: addDraft.legacyCount,
    }
    // Only include isTurkish for receivers (senders never get the flag)
    if (isReceiver) patch.isTurkish = addDraft.isTurkish
    onUpsertPerson(patch)
    setAddDraft({ name: '', legacyCount: '', isTurkish: false })
  }

  function startEditLegacy(row) {
    setEditingKey(row.key)
    setEditDraft({
      legacyCount: String(row.legacyCount || 0),
      isTurkish: Boolean(row.isTurkish),
    })
  }

  function saveEditLegacy(row) {
    const patch = { name: row.name, legacyCount: editDraft.legacyCount }
    if (isReceiver) patch.isTurkish = editDraft.isTurkish
    onUpsertPerson(patch)
    setEditingKey(null)
    setEditDraft({ legacyCount: '', isTurkish: false })
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditDraft({ legacyCount: '', isTurkish: false })
  }

  return (
    <div className="people-table-wrap">
      <div className="people-toolbar">
        {readOnly ? (
          <div className="people-toolbar-spacer" />
        ) : (
          <form className="people-add-inline" onSubmit={submitAdd}>
            <input
              value={addDraft.name}
              onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={isReceiver ? 'إضافة مستلم' : 'إضافة مرسل'}
            />
            <input
              className="people-count-input"
              inputMode="numeric"
              value={addDraft.legacyCount}
              onChange={(e) => setAddDraft((d) => ({ ...d, legacyCount: e.target.value }))}
              placeholder="قديم"
            />
            {isReceiver ? (
              <label
                className="people-turkish-toggle"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="علّم هذا المستلم كمواطن تركي"
              >
                <input
                  type="checkbox"
                  checked={addDraft.isTurkish}
                  onChange={(e) => setAddDraft((d) => ({ ...d, isTurkish: e.target.checked }))}
                />
                <span>🇹🇷 تركي</span>
              </label>
            ) : null}
            <button type="submit" className="action-btn action-btn--blue action-btn--xs">إضافة</button>
          </form>
        )}

        <div className="people-toolbar-spacer" />

        {isReceiver ? (
          <button
            type="button"
            onClick={() => setTurkishOnly((v) => !v)}
            className={`action-btn action-btn--xs ${turkishOnly ? 'action-btn--blue' : 'ghost-button'}`}
            title={turkishOnly ? 'عرض كل المستلمين' : 'عرض الأتراك فقط'}
          >
            🇹🇷 {turkishOnly ? `أتراك فقط (${turkishCount})` : `كل المستلمين · ${turkishCount} تركي`}
          </button>
        ) : null}

        <input
          className="search-input people-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث..."
        />

        <div className="people-totals">
          <span>قديم <strong>{totalLegacy}</strong></span>
          <span>نظام <strong>{totalSystem}</strong></span>
          <span>المجموع <strong>{totalAll}</strong></span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state compact">
          {query ? 'لا توجد نتائج' : isReceiver ? 'لا يوجد مستلمون بعد' : 'لا يوجد مرسلون بعد'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th className="num-col">قديم</th>
                <th className="num-col">النظام</th>
                <th className="num-col">المجموع</th>
                {readOnly ? null : <th className="action-col"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const colorClass = isReceiver ? getReceiverColorClass(row.colorLevel) : ''
                const isEditing = editingKey === row.key
                return (
                  <tr key={row.key}>
                    <td className={`person-name-cell ${colorClass}`}>
                      <div className="person-name-wrap">
                        <span className="person-name-text">
                          {isReceiver && row.isTurkish ? (
                            <span className="person-flag" title="مستلم تركي" style={{ marginInlineEnd: 4 }}>🇹🇷</span>
                          ) : null}
                          {row.name}
                        </span>
                        <CopyButton text={row.name} />
                      </div>
                    </td>
                    <td className="num-col">
                      {isEditing && !readOnly ? (
                        <input
                          className="table-input table-input--sm people-edit-input"
                          inputMode="numeric"
                          value={editDraft.legacyCount}
                          onChange={(e) => setEditDraft((d) => ({ ...d, legacyCount: e.target.value }))}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditLegacy(row)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                        />
                      ) : (
                        <span className="person-count-legacy">{row.legacyCount}</span>
                      )}
                    </td>
                    <td className="num-col">
                      <span className="person-count-system">{row.systemCount}</span>
                    </td>
                    <td className="num-col">
                      <span className={`person-count-total ${colorClass}`}>{row.total}</span>
                    </td>
                    {readOnly ? null : (
                      <td className="action-col">
                        {isEditing ? (
                          <div className="action-group" style={{ gap: 6 }}>
                            {isReceiver ? (
                              <label
                                className="person-turkish-inline"
                                title="علّم هذا المستلم كتركي"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={editDraft.isTurkish}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, isTurkish: e.target.checked }))}
                                />
                                <span>🇹🇷</span>
                              </label>
                            ) : null}
                            <button
                              className="action-btn action-btn--green action-btn--xs"
                              onClick={() => saveEditLegacy(row)}
                            >
                              ✓
                            </button>
                            <button
                              className="action-btn ghost-button action-btn--xs"
                              onClick={cancelEdit}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            className="action-btn ghost-button action-btn--xs"
                            onClick={() => startEditLegacy(row)}
                            title="تعديل العدد القديم والجنسية"
                          >
                            تعديل
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PeopleTab({
  transfers,
  senders,
  receivers,
  onUpsertSender,
  onUpsertReceiver,
  readOnly = false,
}) {
  // Receivers is always the default tab — it's the priority per user spec
  const [activeKind, setActiveKind] = useState(PERSON_KIND.RECEIVER)

  const receiversCount = useMemo(
    () => buildPeopleList(transfers, receivers, PERSON_KIND.RECEIVER).length,
    [transfers, receivers],
  )
  const sendersCount = useMemo(
    () => buildPeopleList(transfers, senders, PERSON_KIND.SENDER).length,
    [transfers, senders],
  )

  return (
    <section className="panel people-panel">
      <div className="panel-head compact">
        <h2>الأشخاص</h2>
        <div className="people-sub-tabs">
          <button
            type="button"
            className={`people-sub-tab ${activeKind === PERSON_KIND.RECEIVER ? 'people-sub-tab--active' : ''}`}
            onClick={() => setActiveKind(PERSON_KIND.RECEIVER)}
          >
            المستلمون
            <span className="people-sub-tab-count">{receiversCount}</span>
          </button>
          <button
            type="button"
            className={`people-sub-tab ${activeKind === PERSON_KIND.SENDER ? 'people-sub-tab--active' : ''}`}
            onClick={() => setActiveKind(PERSON_KIND.SENDER)}
          >
            المرسلون
            <span className="people-sub-tab-count">{sendersCount}</span>
          </button>
        </div>
      </div>

      {activeKind === PERSON_KIND.RECEIVER ? (
        <>
          <div className="people-legend">
            <span className="legend-item"><span className="legend-swatch receiver-level-yellow" /> 4</span>
            <span className="legend-item"><span className="legend-swatch receiver-level-blue" /> 5</span>
            <span className="legend-item"><span className="legend-swatch receiver-level-red" /> 6</span>
            <span className="legend-item"><span className="legend-swatch receiver-level-red-striped" /> 7+</span>
            <span className="text-muted" style={{ fontSize: '0.7rem' }}>الألوان حسب المجموع (قديم + نظام)</span>
          </div>
          <PersonTable
            kind={PERSON_KIND.RECEIVER}
            transfers={transfers}
            overrides={receivers}
            onUpsertPerson={onUpsertReceiver}
            readOnly={readOnly}
          />
        </>
      ) : (
        <PersonTable
          kind={PERSON_KIND.SENDER}
          transfers={transfers}
          overrides={senders}
          onUpsertPerson={onUpsertSender}
          readOnly={readOnly}
        />
      )}
    </section>
  )
}
