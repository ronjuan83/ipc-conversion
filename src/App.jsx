import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'
import { IpcNamesProvider, useIpcNames } from './context/IpcNamesContext'
import { normalizeGroupQuery, isGroupQuery } from './utils/ipcParser'
import { buildGroupIndex } from './utils/groupIndex'
import { buildFlowGraph, traceFlow, traceSubclassFlow, versionOrder } from './utils/flowGraph'
import { CodeLink, DstCell } from './components/DstCell'
import { StatusBadge } from './components/StatusBadge'
import { TechClassifier } from './components/TechClassifier'


function DonatedSection({ donated, onSearch, ipcGroups }) {
  if (!donated || donated.length === 0) return null

  const byVersion = {}
  donated.forEach(item => {
    if (!byVersion[item.version]) byVersion[item.version] = []
    byVersion[item.version].push(item)
  })

  return (
    <div className="history-section">
      <h3 className="section-title donated-title">
        <span className="section-icon">→</span>
        捐出紀錄（此分類的組移入其他分類）
        <span className="count-badge">{donated.length} 筆</span>
      </h3>
      {Object.entries(byVersion).map(([ver, items]) => (
        <div key={ver} className="version-group">
          <div className="version-label">{ver}</div>
          <table className="move-table">
            <thead>
              <tr>
                <th>原始組號</th>
                <th>移入目的地</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="code-cell"><DstCell dst={item.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                  <td className="code-cell"><DstCell dst={item.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ReceivedSection({ received, onSearch, ipcGroups }) {
  if (!received || received.length === 0) return null

  const byVersion = {}
  received.forEach(item => {
    if (!byVersion[item.version]) byVersion[item.version] = []
    byVersion[item.version].push(item)
  })

  return (
    <div className="history-section">
      <h3 className="section-title received-title">
        <span className="section-icon">←</span>
        接收紀錄（其他分類的組移入此分類）
        <span className="count-badge">{received.length} 筆</span>
      </h3>
      {Object.entries(byVersion).map(([ver, items]) => (
        <div key={ver} className="version-group">
          <div className="version-label">{ver}</div>
          <table className="move-table">
            <thead>
              <tr>
                <th>原始組號</th>
                <th>移入目的地</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="code-cell"><DstCell dst={item.from} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                  <td className="code-cell"><DstCell dst={item.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// Inline flow summary shown directly in SubclassCard
function FlowSummary({ code, flowGraph, data, onSearch, activeVersionTransitions, directionFilter }) {
  if (!flowGraph) return null
  const isSubclass = /^[A-H]\d{2}[A-Z]$/.test(code)
  const rawFlow = isSubclass
    ? traceSubclassFlow(code, flowGraph, data.subclass_index)
    : traceFlow(code, flowGraph)
  if (rawFlow.edges.length === 0) return null

  const originSub = code.slice(0, 4)
  const relevantEdges = rawFlow.edges.filter(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    const isRelevantSub = fromSub === originSub || toSub === originSub
    return isRelevantSub &&
      (!activeVersionTransitions || activeVersionTransitions.has(e.version)) &&
      filterEdgeByDirection(e, originSub, directionFilter)
  })
  if (relevantEdges.length === 0) return null

  // Group by version → subclass pairs
  const byVersion = {}
  relevantEdges.forEach(e => {
    if (!byVersion[e.version]) byVersion[e.version] = []
    byVersion[e.version].push(e)
  })
  const sortedVersions = Object.keys(byVersion).sort((a, b) => versionOrder(a) - versionOrder(b))

  const palette = ['#0d6efd', '#dc3545', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#ffc107', '#17a2b8']
  const allSubs = new Set()
  relevantEdges.forEach(e => { allSubs.add(e.from.slice(0, 4)); allSubs.add(e.to.slice(0, 4)) })
  const subColors = {}
  let ci = 0
  ;[...allSubs].sort().forEach(s => { subColors[s] = palette[ci++ % palette.length] })

  return (
    <div className="flow-summary-section">
      <div className="flow-summary-header">
        <span className="section-icon">⟷</span>
        跨版本流變摘要
        <span className="count-badge">{relevantEdges.length} 筆異動、{sortedVersions.length} 個版本</span>
      </div>
      <div className="flow-summary-body">
        {sortedVersions.map(ver => {
          const edges = byVersion[ver]
          const subFlows = {}
          edges.forEach(e => {
            const fromSub = e.from.slice(0, 4)
            const toSub = e.to.slice(0, 4)
            if (fromSub === toSub) return
            const key = `${fromSub}→${toSub}`
            if (!subFlows[key]) subFlows[key] = { fromSub, toSub, count: 0 }
            subFlows[key].count++
          })
          const entries = Object.values(subFlows)
          if (entries.length === 0) return null

          return (
            <div key={ver} className="flow-summary-ver">
              <span className="flow-summary-ver-label">{ver}</span>
              <div className="flow-summary-flows">
                {entries.map((sf, i) => {
                  const isOut = sf.fromSub === originSub
                  return (
                    <span key={i} className="flow-summary-item">
                      <span className={`tl-direction ${isOut ? 'out' : 'in'}`}>{isOut ? '捐出' : '移入'}</span>
                      <span className="flow-sub-chip flow-sub-chip-sm" style={{ borderColor: subColors[sf.fromSub], color: subColors[sf.fromSub] }}
                            onClick={() => onSearch(sf.fromSub)}>{sf.fromSub}</span>
                      <span className="flow-arrow-sm">→</span>
                      <span className="flow-sub-chip flow-sub-chip-sm" style={{ borderColor: subColors[sf.toSub], color: subColors[sf.toSub] }}
                            onClick={() => onSearch(sf.toSub)}>{sf.toSub}</span>
                      <span className="flow-count-sm">{sf.count}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubclassCard({ code, data, onSearch, ipcGroups, flowGraph, activeVersionTransitions, compareRange, directionFilter }) {
  const { getSubclassName } = useIpcNames()
  const summary = buildCodeScopeSummary(code, data, activeVersionTransitions, compareRange)
  const { donated, received } = filterRecordsByDirection(summary.donated, summary.received, directionFilter)
  const name = getSubclassName(code)
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]
  const hasFlowData = donated.length > 0 || received.length > 0

  const [viewTab, setViewTab] = useState('summary') // 'summary' | 'list' | 'timeline'

  // Precompute flow data for list/timeline tabs
  const rawFlow = flowGraph && hasFlowData
    ? traceSubclassFlow(code, flowGraph, data.subclass_index)
    : { edges: [], nodes: [] }
  const originSub = code.slice(0, 4)
  const relevantEdges = rawFlow.edges.filter(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    const isRelevantSub = fromSub === originSub || toSub === originSub
    return isRelevantSub &&
      (!activeVersionTransitions || activeVersionTransitions.has(e.version)) &&
      filterEdgeByDirection(e, originSub, directionFilter)
  })
  const byVersion = {}
  relevantEdges.forEach(e => {
    if (!byVersion[e.version]) byVersion[e.version] = []
    byVersion[e.version].push(e)
  })
  const sortedVersions = Object.keys(byVersion).sort((a, b) => versionOrder(a) - versionOrder(b))

  const palette = ['#0d6efd', '#dc3545', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#ffc107', '#17a2b8']
  const allSubs = new Set()
  relevantEdges.forEach(e => { allSubs.add(e.from.slice(0, 4)); allSubs.add(e.to.slice(0, 4)) })
  const subColors = {}
  let ci = 0
  ;[...allSubs].sort().forEach(s => { subColors[s] = palette[ci++ % palette.length] })

  const [expandedSections, setExpandedSections] = useState({})
  function toggleSection(key) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {name && <span className="subclass-name">{name}</span>}
        </div>
        <div className="card-header-actions">
          <StatusBadge code={code} data={data} onSearch={onSearch} activeVersionTransitions={activeVersionTransitions} compareRange={compareRange} />
          {hasFlowData && flowGraph && (
            <div className="sankey-toggle">
              <button className={`toggle-btn ${viewTab === 'summary' ? 'active' : ''}`} onClick={() => setViewTab('summary')}>摘要</button>
              <button className={`toggle-btn ${viewTab === 'list' ? 'active' : ''}`} onClick={() => setViewTab('list')}>列表</button>
              <button className={`toggle-btn ${viewTab === 'timeline' ? 'active' : ''}`} onClick={() => setViewTab('timeline')}>時間軸</button>
            </div>
          )}
        </div>
      </div>

      {intro && (
        <div className="info-row">
          <span className="info-label">引入版本：</span>
          <span className="info-value">{intro}</span>
          <span className="info-note">
            （此分類於 {intro} 版新設，在此之前不存在）
          </span>
        </div>
      )}
      {depr && (
        <div className="info-row">
          <span className="info-label">廢棄去向：</span>
          <span className="info-value">{Array.isArray(depr) ? depr.join(', ') : depr}</span>
          {deprAt && <span className="info-note">（於 {deprAt} 版廢棄）</span>}
        </div>
      )}

      {compareRange && activeVersionTransitions && (
        <div className="compare-summary-card">
          <div className="compare-summary-title">兩版本比較摘要</div>
          <div className="compare-summary-meta">
            <span>{compareRange.from} → {compareRange.to}</span>
            <span>涵蓋 {activeVersionTransitions.size} 次版本轉換</span>
            <span>移出 {donated.length} 筆</span>
            <span>移入 {received.length} 筆</span>
            <span>目前篩選：{DIRECTION_OPTIONS.find(option => option.value === directionFilter)?.label || '全部'}</span>
          </div>
        </div>
      )}

      {!hasFlowData ? (
        <div className="no-moves">
          {directionFilter === 'unchanged' && summary.unchanged
            ? '此分類在目前版本範圍內未出現跨分類異動。'
            : '此分類在目前篩選條件下無符合的跨分類異動。'}
        </div>
      ) : (
        <>
          {viewTab === 'summary' && (
            <FlowSummary code={code} flowGraph={flowGraph} data={data} onSearch={onSearch} activeVersionTransitions={activeVersionTransitions} directionFilter={directionFilter} />
          )}

          {viewTab === 'list' && (
            <>
              <DonatedSection donated={donated} onSearch={onSearch} ipcGroups={ipcGroups} />
              <ReceivedSection received={received} onSearch={onSearch} ipcGroups={ipcGroups} />
            </>
          )}

          {viewTab === 'timeline' && (
            <TimelineChart
              sortedVersions={sortedVersions}
              byVersion={byVersion}
              originSub={originSub}
              subColors={subColors}
              expandedSections={expandedSections}
              toggleSection={toggleSection}
              onSearch={onSearch}
              data={data}
              ipcGroups={ipcGroups}
            />
          )}
        </>
      )}
    </div>
  )
}

// Card for exact group-level code (4th/5th level)
function GroupCard({ code, groupIndex, onSearch, ipcGroups, activeVersionTransitions, compareRange, directionFilter }) {
  const { getSubclassName } = useIpcNames()
  const subclass = code.slice(0, 4)
  const subclassName = getSubclassName(subclass)

  const summary = buildGroupScopeSummary(code, groupIndex, activeVersionTransitions)
  const { donated, received } = filterRecordsByDirection(summary.donated, summary.received, directionFilter)

  const byVersionDonated = {}
  donated.forEach(e => {
    const v = e.record.version
    if (!byVersionDonated[v]) byVersionDonated[v] = []
    byVersionDonated[v].push(e)
  })

  const byVersionReceived = {}
  received.forEach(e => {
    const v = e.record.version
    if (!byVersionReceived[v]) byVersionReceived[v] = []
    byVersionReceived[v].push(e)
  })

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {subclassName && (
            <span className="subclass-name">所屬分類：<CodeLink text={subclass} onSearch={onSearch} /> {subclassName}</span>
          )}
        </div>
        <div className="group-card-badges">
          {donated.length > 0 && <span className="badge badge-deprecated">{donated.length} 筆移出</span>}
          {received.length > 0 && <span className="badge badge-new">{received.length} 筆移入</span>}
        </div>
      </div>

      {compareRange && activeVersionTransitions && (
        <div className="compare-summary-card">
          <div className="compare-summary-title">兩版本比較摘要</div>
          <div className="compare-summary-meta">
            <span>{compareRange.from} → {compareRange.to}</span>
            <span>涵蓋 {activeVersionTransitions.size} 次版本轉換</span>
            <span>移出 {donated.length} 筆</span>
            <span>移入 {received.length} 筆</span>
            <span>目前篩選：{DIRECTION_OPTIONS.find(option => option.value === directionFilter)?.label || '全部'}</span>
          </div>
        </div>
      )}

      {donated.length > 0 && (
        <div className="history-section">
          <h3 className="section-title donated-title">
            <span className="section-icon">→</span>
            此組號移出紀錄
            <span className="count-badge">{donated.length} 筆</span>
          </h3>
          {Object.entries(byVersionDonated).map(([ver, items]) => (
            <div key={ver} className="version-group">
              <div className="version-label">{ver}</div>
              <table className="move-table">
                <thead>
                  <tr>
                    <th>原始組號</th>
                    <th>移入目的地</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i}>
                      <td className="code-cell"><DstCell dst={e.record.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {received.length > 0 && (
        <div className="history-section">
          <h3 className="section-title received-title">
            <span className="section-icon">←</span>
            此組號接收紀錄
            <span className="count-badge">{received.length} 筆</span>
          </h3>
          {Object.entries(byVersionReceived).map(([ver, items]) => (
            <div key={ver} className="version-group">
              <div className="version-label">{ver}</div>
              <table className="move-table">
                <thead>
                  <tr>
                    <th>原始組號</th>
                    <th>移入目的地</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i}>
                      <td className="code-cell"><DstCell dst={e.record.from} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {donated.length === 0 && received.length === 0 && (
        <div className="no-moves">
          {directionFilter === 'unchanged' && summary.unchanged
            ? '此組號在目前版本範圍內未出現跨分類異動。'
            : '此組號在目前篩選條件下無符合的 crosswalk 記錄。'}
        </div>
      )}
    </div>
  )
}

// List for prefix group-level search
function GroupList({ prefix, matches, groupIndex, onSelect, activeVersionTransitions, directionFilter }) {
  if (matches.length === 0) {
    return <div className="no-result">找不到以「{prefix}」開頭的 IPC 組號。</div>
  }

  const visibleMatches = matches.filter(code => matchesDirectionFilter(
    buildGroupScopeSummary(code, groupIndex, activeVersionTransitions),
    directionFilter
  ))

  if (visibleMatches.length === 0) {
    return <div className="no-result">目前篩選條件下，找不到以「{prefix}」開頭的 IPC 組號。</div>
  }

  return (
    <div className="prefix-results">
      <div className="prefix-header">
        找到 {visibleMatches.length} 個以「{prefix}」開頭的組號：
      </div>
      <div className="prefix-grid">
        {visibleMatches.map(code => {
          const summary = buildGroupScopeSummary(code, groupIndex, activeVersionTransitions)
          return (
            <div
              key={code}
              className="prefix-item"
              onClick={() => onSelect(code)}
            >
              <div className="prefix-item-code">{code}</div>
              <div className="prefix-item-stats">
                {summary.donated.length > 0 && <span className="stat donated-stat">移出 {summary.donated.length}</span>}
                {summary.received.length > 0 && <span className="stat received-stat">移入 {summary.received.length}</span>}
                {summary.unchanged && <span className="stat no-stat">本範圍無異動</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrefixList({ prefix, data, onSearch, activeVersionTransitions, compareRange, directionFilter }) {
  const { getSubclassName } = useIpcNames()
  // Merge all known subclass codes from subclass_index, introduced_in, and deprecated_to
  const allCodes = new Set([
    ...Object.keys(data.subclass_index),
    ...Object.keys(data.introduced_in || {}),
    ...Object.keys(data.deprecated_to || {})
  ])
  const matches = [...allCodes]
    .filter(k => k.startsWith(prefix.toUpperCase()))
    .sort()
    .map(code => buildCodeScopeSummary(code, data, activeVersionTransitions, compareRange))
    .filter(summary => matchesDirectionFilter(summary, directionFilter))

  if (matches.length === 0) {
    return <div className="no-result">目前篩選條件下，找不到以「{prefix}」開頭的 IPC 分類代碼。</div>
  }

  return (
    <div className="prefix-results">
      <div className="prefix-header">
        找到 {matches.length} 個以「{prefix.toUpperCase()}」開頭的分類代碼：
      </div>
      <div className="prefix-grid">
        {matches.map(summary => {
          const code = summary.code
          const donated = summary.donated.length
          const received = summary.received.length
          return (
            <div key={code} className={`prefix-item ${summary.showDeprecated ? 'is-deprecated' : ''}`} onClick={() => onSearch(code)}>
              <div className="prefix-item-code">{code}</div>
              {getSubclassName(code) && (
                <div className="prefix-item-name">{getSubclassName(code)}</div>
              )}
              <div className="prefix-item-stats">
                {donated > 0 && <span className="stat donated-stat">捐出 {donated}</span>}
                {received > 0 && <span className="stat received-stat">接收 {received}</span>}
                {summary.showIntro && <span className="stat intro-stat">新增</span>}
                {summary.showDeprecated && <span className="stat depr-stat">廢棄</span>}
                {summary.unchanged && (
                  <span className="stat no-stat">本範圍無異動</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline Chart: git-log style vertical timeline ──

function TimelineChart({ sortedVersions, byVersion, originSub, subColors, expandedSections, toggleSection, onSearch, data, ipcGroups }) {
  return (
    <div className="timeline-chart">
      {sortedVersions.map(ver => {
        const edges = byVersion[ver]
        const subFlows = {}
        edges.forEach(e => {
          const fromSub = e.from.slice(0, 4)
          const toSub = e.to.slice(0, 4)
          if (fromSub === toSub) return
          const key = `${fromSub}→${toSub}`
          if (!subFlows[key]) subFlows[key] = { fromSub, toSub, edges: [] }
          subFlows[key].edges.push(e)
        })
        const flowEntries = Object.entries(subFlows)
        if (flowEntries.length === 0) return null

        const isOutgoing = flowEntries.some(([, sf]) => sf.fromSub === originSub)
        const isIncoming = flowEntries.some(([, sf]) => sf.toSub === originSub)
        const dotClass = isOutgoing && isIncoming ? 'both' : isOutgoing ? 'out' : 'in'

        return (
          <div key={ver} className="tl-version">
            <div className={`tl-dot ${dotClass}`} />
            <div className="tl-content">
              <div className="tl-ver-label">{ver}</div>
              {flowEntries.map(([key, sf]) => {
                const sectionKey = `${ver}|${key}`
                const isOpen = expandedSections[sectionKey]
                const isOut = sf.fromSub === originSub
                return (
                  <div key={key} className="tl-flow-row">
                    <div className="tl-flow-summary" onClick={() => toggleSection(sectionKey)}>
                      <span className={`tl-direction ${isOut ? 'out' : 'in'}`}>{isOut ? '捐出' : '移入'}</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.fromSub], color: subColors[sf.fromSub] }}
                            onClick={e => { e.stopPropagation(); onSearch(sf.fromSub) }}>{sf.fromSub}</span>
                      <span className="tl-arrow">→</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.toSub], color: subColors[sf.toSub] }}
                            onClick={e => { e.stopPropagation(); onSearch(sf.toSub) }}>{sf.toSub}</span>
                      <span className="tl-count">{sf.edges.length} 筆</span>
                      <span className={`flow-sub-toggle ${isOpen ? 'open' : ''}`}>▸</span>
                    </div>
                    {isOpen && (() => {
                      // Use original records from subclass_index instead of flowGraph edges
                      const srcEntry = data.subclass_index[sf.fromSub] || {}
                      const rawRecords = (srcEntry.donated || []).filter(r =>
                        r.version === ver && r.dst && new RegExp(sf.toSub).test(r.dst)
                      )
                      return rawRecords.length > 0 ? (
                        <table className="move-table flow-detail-table">
                          <thead><tr><th>原始組號</th><th>移入目的地</th></tr></thead>
                          <tbody>
                            {rawRecords.map((r, i) => (
                              <tr key={i}>
                                <td className="code-cell"><DstCell dst={r.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                                <td className="code-cell"><DstCell dst={r.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      ) : (
                        <table className="move-table flow-detail-table">
                          <thead><tr><th>原始組號</th><th>移入目的地</th></tr></thead>
                          <tbody>
                            {sf.edges.map((e, i) => (
                              <tr key={i}>
                                <td className="code-cell"><span className="code-link" onClick={() => onSearch(e.from)}>{e.from}</span></td>
                                <td className="code-cell"><span className="code-link" onClick={() => onSearch(e.to)}>{e.to}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResultToolbar({ directionFilter, setDirectionFilter, onDownload, downloadDisabled }) {
  return (
    <div className="result-toolbar">
      <div className="direction-filter-group">
        <span className="direction-filter-label">方向篩選</span>
        <div className="direction-filter-buttons">
          {DIRECTION_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`direction-filter-btn ${directionFilter === option.value ? 'active' : ''}`}
              onClick={() => setDirectionFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="download-btn"
        onClick={onDownload}
        disabled={downloadDisabled}
      >
        下載目前結果 CSV
      </button>
    </div>
  )
}

const EXAMPLES = ['H01L', 'B01J', 'G06K', 'B29D', 'H10B', 'B81B', 'G06Q', 'E21B', 'F24S', 'C40B']
const DIRECTION_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'out', label: '移出' },
  { value: 'in', label: '移入' },
  { value: 'unchanged', label: '未變動' },
]

function parseTransitionVersion(verStr) {
  const m = verStr.match(/(\d{4}\.\d{2})→(\d{4}\.\d{2})/)
  if (!m) return null
  return { from: m[1], to: m[2] }
}

function editionOrder(verStr) {
  const m = verStr.match(/(\d{4})\.(\d{2})/)
  if (!m) return 0
  return parseInt(m[1], 10) * 100 + parseInt(m[2], 10)
}

function getScopeWindow(activeVersionTransitions, compareRange) {
  if (compareRange) return { from: compareRange.from, to: compareRange.to }
  if (!activeVersionTransitions || activeVersionTransitions.size !== 1) return null
  const only = [...activeVersionTransitions][0]
  return parseTransitionVersion(only)
}

function isEditionWithinScope(edition, scope) {
  if (!edition || !scope) return false
  const value = editionOrder(edition)
  return value > editionOrder(scope.from) && value <= editionOrder(scope.to)
}

function extractSubclasses(text) {
  if (!text) return []
  const matches = text.match(/[A-H]\d{2}[A-Z]/g)
  return matches ? [...new Set(matches)] : []
}

function buildCodeScopeSummary(code, data, activeVersionTransitions, compareRange) {
  const entry = data.subclass_index[code] || {}
  const donated = activeVersionTransitions
    ? (entry.donated || []).filter(r => activeVersionTransitions.has(r.version))
    : (entry.donated || [])
  const received = activeVersionTransitions
    ? (entry.received || []).filter(r => activeVersionTransitions.has(r.version))
    : (entry.received || [])

  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]
  const scope = getScopeWindow(activeVersionTransitions, compareRange)
  const showIntro = scope ? isEditionWithinScope(intro, scope) : Boolean(intro)
  const showDeprecated = scope ? isEditionWithinScope(deprAt, scope) : Boolean(depr)

  return {
    code,
    donated,
    received,
    intro,
    depr,
    deprAt,
    showIntro,
    showDeprecated,
    unchanged: donated.length === 0 && received.length === 0 && !showIntro && !showDeprecated,
  }
}

function buildGroupScopeSummary(code, groupIndex, activeVersionTransitions) {
  const entries = groupIndex[code] || []
  const filteredEntries = activeVersionTransitions
    ? entries.filter(e => activeVersionTransitions.has(e.record.version))
    : entries

  const donated = filteredEntries.filter(e => e.type === 'donated')
  const received = filteredEntries.filter(e => e.type === 'received')

  return {
    code,
    entries: filteredEntries,
    donated,
    received,
    unchanged: donated.length === 0 && received.length === 0,
  }
}

function matchesDirectionFilter(summary, directionFilter) {
  if (directionFilter === 'out') return summary.donated.length > 0
  if (directionFilter === 'in') return summary.received.length > 0
  if (directionFilter === 'unchanged') return summary.unchanged
  return true
}

function filterRecordsByDirection(donated, received, directionFilter) {
  if (directionFilter === 'out') return { donated, received: [] }
  if (directionFilter === 'in') return { donated: [], received }
  if (directionFilter === 'unchanged') return { donated: [], received: [] }
  return { donated, received }
}

function filterEdgeByDirection(edge, originSub, directionFilter) {
  if (directionFilter === 'all') return true
  if (directionFilter === 'out') return edge.from.slice(0, 4) === originSub
  if (directionFilter === 'in') return edge.to.slice(0, 4) === originSub
  return false
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return ''
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const escape = value => {
    const text = value == null ? '' : String(value)
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  const header = columns.map(escape).join(',')
  const body = rows.map(row => columns.map(col => escape(row[col])).join(',')).join('\n')
  return `\ufeff${header}\n${body}`
}

function triggerCsvDownload(filename, rows) {
  if (!rows || rows.length === 0) return
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Read ?ipc= and ?ver= from URL
function getIpcFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return (params.get('ipc') || '').trim().toUpperCase()
}
function getVerFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('ver') || ''
}
function getModeFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'compare' ? 'compare' : 'single'
}
function getFromFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('from') || ''
}
function getToFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('to') || ''
}

const initialIpc = getIpcFromUrl()
const initialVer = getVerFromUrl()
const initialMode = getModeFromUrl()
const initialFrom = getFromFromUrl()
const initialTo = getToFromUrl()

function AppInner() {
  const { getSubclassName, loadGroupTitles } = useIpcNames()
  const [query, setQuery] = useState(initialIpc)
  const [input, setInput] = useState(initialIpc)
  const [data, setData] = useState(null)
  const [groupIndex, setGroupIndex] = useState(null)
  const [flowGraph, setFlowGraph] = useState(null)
  const [ipcGroups, setIpcGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [viewMode, setViewMode] = useState(initialMode)
  const [directionFilter, setDirectionFilter] = useState('all')
  const [selectedVersion, setSelectedVersion] = useState(initialVer) // '' = all versions
  const [compareFrom, setCompareFrom] = useState(initialFrom)
  const [compareTo, setCompareTo] = useState(initialTo)

  const inputRef = useRef(null)
  const suggRef = useRef(null)
  const skipPushRef = useRef(false) // avoid pushing state on popstate

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}ipc_data.json`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${base}ipc_groups.json`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([d, g]) => {
        setData(d)
        setGroupIndex(buildGroupIndex(d.subclass_index))
        setFlowGraph(buildFlowGraph(d.subclass_index))
        if (g) setIpcGroups(g)
        setLoading(false)
        if (initialIpc) loadGroupTitles() // preload if URL has query
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Memoize version dropdown options (avoid re-computing on every render)
  const versionOptions = useMemo(() => {
    if (!data) return []
    const vers = new Set()
    Object.values(data.subclass_index).forEach(e => {
      ;(e.donated || []).forEach(r => vers.add(r.version))
      ;(e.received || []).forEach(r => vers.add(r.version))
    })
    return [...vers].sort((a, b) => versionOrder(a) - versionOrder(b))
  }, [data])

  const editionOptions = useMemo(() => {
    const editions = new Set()
    versionOptions.forEach(ver => {
      const parsed = parseTransitionVersion(ver)
      if (!parsed) return
      editions.add(parsed.from)
      editions.add(parsed.to)
    })
    return [...editions].sort((a, b) => editionOrder(a) - editionOrder(b))
  }, [versionOptions])

  useEffect(() => {
    if (!editionOptions.length) return
    if (!compareFrom) setCompareFrom(editionOptions[0])
    if (!compareTo) setCompareTo(editionOptions[editionOptions.length - 1])
  }, [editionOptions, compareFrom, compareTo])

  const compareError = useMemo(() => {
    if (viewMode !== 'compare' || !compareFrom || !compareTo) return ''
    if (editionOrder(compareFrom) >= editionOrder(compareTo)) {
      return '起點版本必須早於終點版本。'
    }
    return ''
  }, [viewMode, compareFrom, compareTo])

  const compareTransitionList = useMemo(() => {
    if (viewMode !== 'compare' || compareError || !compareFrom || !compareTo) return null
    return versionOptions.filter(ver => {
      const parsed = parseTransitionVersion(ver)
      if (!parsed) return false
      return editionOrder(parsed.from) >= editionOrder(compareFrom) &&
             editionOrder(parsed.to) <= editionOrder(compareTo)
    })
  }, [viewMode, compareError, compareFrom, compareTo, versionOptions])

  const activeVersionTransitions = useMemo(() => {
    if (viewMode === 'single') {
      return selectedVersion ? new Set([selectedVersion]) : null
    }
    if (compareError) return new Set()
    if (!compareTransitionList) return null
    return new Set(compareTransitionList)
  }, [viewMode, selectedVersion, compareError, compareTransitionList])

  const compareRange = useMemo(() => {
    if (viewMode !== 'compare' || compareError || !compareFrom || !compareTo) return null
    return {
      from: compareFrom,
      to: compareTo,
      transitions: compareTransitionList?.length || 0,
    }
  }, [viewMode, compareError, compareFrom, compareTo, compareTransitionList])

  // Build set of subclasses that have records in the active transition scope
  const versionFilteredSubs = useMemo(() => {
    if (!data || !activeVersionTransitions) return null
    const subs = new Set()
    Object.entries(data.subclass_index).forEach(([sub, entry]) => {
      const hasDonated = (entry.donated || []).some(r => activeVersionTransitions.has(r.version))
      const hasReceived = (entry.received || []).some(r => activeVersionTransitions.has(r.version))
      if (hasDonated || hasReceived) subs.add(sub)
    })
    return subs
  }, [data, activeVersionTransitions])

  useEffect(() => {
    if (!data || !groupIndex || input.length < 1) {
      setSuggestions([])
      return
    }
    const up = input.toUpperCase()

    if (isGroupQuery(up)) {
      // Group-level autocomplete
      const normalized = normalizeGroupQuery(up)
      let matches = Object.keys(groupIndex)
        .filter(k => k.startsWith(normalized))
      if (versionFilteredSubs) {
        matches = matches.filter(k => versionFilteredSubs.has(k.slice(0, 4)))
      }
      setSuggestions(matches.sort().slice(0, 10))
    } else {
      // Subclass-level autocomplete (include introduced_in and deprecated_to codes)
      const allSubs = new Set([
        ...Object.keys(data.subclass_index),
        ...Object.keys(data.introduced_in || {}),
        ...Object.keys(data.deprecated_to || {})
      ])
      let all = [...allSubs].sort()
      if (versionFilteredSubs) {
        all = all.filter(k => versionFilteredSubs.has(k))
      }
      const matches = all.filter(k => k.startsWith(up)).slice(0, 10)
      setSuggestions(matches)
    }
  }, [input, data, groupIndex, versionFilteredSubs])

  useEffect(() => {
    function handleClick(e) {
      if (
        suggRef.current && !suggRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowSugg(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Sync URL with search state
  function pushUrl(code, ver = selectedVersion, mode = viewMode, from = compareFrom, to = compareTo) {
    if (skipPushRef.current) { skipPushRef.current = false; return }
    const base = window.location.pathname
    const params = new URLSearchParams()
    if (code) params.set('ipc', code)
    if (mode === 'compare') {
      params.set('mode', 'compare')
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    } else if (ver) {
      params.set('ver', ver)
    }
    const qs = params.toString()
    const url = qs ? `${base}?${qs}` : base
    window.history.pushState({
      ipc: code,
      ver: ver || '',
      mode,
      from: from || '',
      to: to || '',
    }, '', url)
  }

  // Listen for browser back/forward
  useEffect(() => {
    function onPopState(e) {
      const ipc = e.state?.ipc || getIpcFromUrl()
      const ver = e.state?.ver || getVerFromUrl()
      const mode = e.state?.mode || getModeFromUrl()
      const from = e.state?.from || getFromFromUrl()
      const to = e.state?.to || getToFromUrl()
      skipPushRef.current = true
      setQuery(ipc)
      setInput(ipc)
      setSelectedVersion(ver)
      setViewMode(mode)
      setCompareFrom(from)
      setCompareTo(to)
      setShowSugg(false)
    }
    window.addEventListener('popstate', onPopState)
    window.history.replaceState({
      ipc: initialIpc,
      ver: initialVer,
      mode: initialMode,
      from: initialFrom,
      to: initialTo,
    }, '', window.location.href)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleSearch(value) {
    const raw = (value !== undefined ? value : input).trim().toUpperCase()
    if (!raw) return
    loadGroupTitles() // lazy load 7.8MB group titles on first search
    const v = isGroupQuery(raw) ? normalizeGroupQuery(raw) : raw
    setQuery(v)
    setInput(v)
    setShowSugg(false)
    pushUrl(v)
    // Scroll to results after a short delay for rendering
    setTimeout(() => {
      const card = document.querySelector('.subclass-card, .prefix-results')
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') setShowSugg(false)
  }

  function handleSuggClick(code) {
    setInput(code)
    setQuery(code)
    setShowSugg(false)
    pushUrl(code)
  }

  // Compute result
  let result = null
  if (data && groupIndex && query) {
    const up = query.toUpperCase()

    if (isGroupQuery(up)) {
      // Group-level search
      const normalized = normalizeGroupQuery(up)
      if (groupIndex[normalized]) {
        result = { type: 'group-exact', code: normalized }
      } else {
        // Fallback: check if code falls within a range in subclass records
        const sub = normalized.slice(0, 4)
        const entry = data.subclass_index[sub]
        if (entry) {
          const fallbackEntries = []
          const rangeRe = /([A-H]\d{2}[A-Z]\s+\d+\/\d+)\s*-\s*(\d+\/\d+)/g
          const allRecs = [...(entry.donated || []), ...(entry.received || [])]
          for (const rec of allRecs) {
            const fields = [rec.dst, rec.src_group, rec.from].filter(Boolean)
            for (const field of fields) {
              let m
              while ((m = rangeRe.exec(field)) !== null) {
                const rangeStart = m[1]
                const rangeEndGroup = m[2]
                if (rangeStart.slice(0, 4) === sub) {
                  // Check if normalized falls within this range
                  const qGroup = normalized.split(/\s+/)[1]
                  const sGroup = rangeStart.split(/\s+/)[1]
                  if (qGroup >= sGroup && qGroup <= rangeEndGroup) {
                    // Found a range containing this code
                    const type = rec.src_group ? 'donated' : 'received'
                    fallbackEntries.push({ type, subclass: sub, record: rec })
                  }
                }
              }
              rangeRe.lastIndex = 0
            }
          }
          if (fallbackEntries.length > 0) {
            // Deduplicate and inject into groupIndex for this session
            const seen = new Set()
            const deduped = fallbackEntries.filter(e => {
              const key = JSON.stringify(e.record)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            setGroupIndex(prev => ({ ...prev, [normalized]: deduped }))
            result = { type: 'group-exact', code: normalized }
          }
        }
        if (!result) {
          let matches = Object.keys(groupIndex)
            .filter(k => k.startsWith(normalized))
            .sort()
          if (versionFilteredSubs) {
            matches = matches.filter(k => versionFilteredSubs.has(k.slice(0, 4)))
          }
          result = { type: 'group-prefix', prefix: normalized, matches }
        }
      }
    } else {
      // Subclass-level search (existing logic)
      if (data.subclass_index[up]) {
        result = { type: 'exact', code: up }
      } else {
        const depr = data.deprecated_to[up]
        const intro = data.introduced_in[up]
        if (depr || intro) {
          result = { type: 'exact', code: up }
        } else {
          result = { type: 'prefix', prefix: up }
        }
      }
    }
  }

  const scopeLabel = compareRange
    ? `${compareRange.from}→${compareRange.to}`
    : activeVersionTransitions && activeVersionTransitions.size === 1
      ? [...activeVersionTransitions][0]
      : '全部版本'

  const exportRows = (() => {
    if (compareError || !result || !data || !groupIndex) return []

    if (result.type === 'exact') {
      const summary = buildCodeScopeSummary(result.code, data, activeVersionTransitions, compareRange)
      if (directionFilter === 'unchanged') {
        return summary.unchanged ? [{
          query_type: 'subclass',
          query_code: result.code,
          query_name: getSubclassName(result.code),
          scope: scopeLabel,
          direction_filter: '未變動',
          status: '未變動',
        }] : []
      }
      const filtered = filterRecordsByDirection(summary.donated, summary.received, directionFilter)
      return [
        ...filtered.donated.map(rec => ({
          query_type: 'subclass',
          query_code: result.code,
          query_name: getSubclassName(result.code),
          scope: scopeLabel,
          version: rec.version,
          direction: '移出',
          source_subclass: result.code,
          source_code: rec.src_group,
          target_subclass: extractSubclasses(rec.dst).join(' | '),
          target_code: rec.dst,
        })),
        ...filtered.received.map(rec => ({
          query_type: 'subclass',
          query_code: result.code,
          query_name: getSubclassName(result.code),
          scope: scopeLabel,
          version: rec.version,
          direction: '移入',
          source_subclass: rec.src_sub || rec.from?.slice(0, 4) || '',
          source_code: rec.from,
          target_subclass: result.code,
          target_code: rec.dst,
        })),
      ]
    }

    if (result.type === 'group-exact') {
      const summary = buildGroupScopeSummary(result.code, groupIndex, activeVersionTransitions)
      if (directionFilter === 'unchanged') {
        return summary.unchanged ? [{
          query_type: 'group',
          query_code: result.code,
          scope: scopeLabel,
          direction_filter: '未變動',
          status: '未變動',
        }] : []
      }
      const filtered = filterRecordsByDirection(summary.donated, summary.received, directionFilter)
      return [
        ...filtered.donated.map(item => ({
          query_type: 'group',
          query_code: result.code,
          scope: scopeLabel,
          version: item.record.version,
          direction: '移出',
          source_code: item.record.src_group,
          target_code: item.record.dst,
          target_subclass: extractSubclasses(item.record.dst).join(' | '),
        })),
        ...filtered.received.map(item => ({
          query_type: 'group',
          query_code: result.code,
          scope: scopeLabel,
          version: item.record.version,
          direction: '移入',
          source_code: item.record.from,
          source_subclass: item.record.src_sub || item.record.from?.slice(0, 4) || '',
          target_code: item.record.dst,
          target_subclass: item.record.dst?.slice(0, 4) || '',
        })),
      ]
    }

    if (result.type === 'prefix') {
      return [...new Set([
        ...Object.keys(data.subclass_index),
        ...Object.keys(data.introduced_in || {}),
        ...Object.keys(data.deprecated_to || {}),
      ])]
        .filter(code => code.startsWith(result.prefix.toUpperCase()))
        .sort()
        .map(code => buildCodeScopeSummary(code, data, activeVersionTransitions, compareRange))
        .filter(summary => matchesDirectionFilter(summary, directionFilter))
        .map(summary => ({
          query_type: 'subclass-prefix',
          prefix: result.prefix.toUpperCase(),
          code: summary.code,
          name: getSubclassName(summary.code),
          scope: scopeLabel,
          donated_count: summary.donated.length,
          received_count: summary.received.length,
          introduced_in_scope: summary.showIntro ? summary.intro : '',
          deprecated_at_scope: summary.showDeprecated ? summary.deprAt || '' : '',
          deprecated_to: summary.showDeprecated ? (Array.isArray(summary.depr) ? summary.depr.join(' | ') : summary.depr || '') : '',
          status: summary.unchanged
            ? '未變動'
            : [
                summary.donated.length > 0 ? '移出' : '',
                summary.received.length > 0 ? '移入' : '',
                summary.showIntro ? '新增' : '',
                summary.showDeprecated ? '廢棄' : '',
              ].filter(Boolean).join(' | '),
        }))
    }

    if (result.type === 'group-prefix') {
      return result.matches
        .filter(code => matchesDirectionFilter(buildGroupScopeSummary(code, groupIndex, activeVersionTransitions), directionFilter))
        .map(code => {
          const summary = buildGroupScopeSummary(code, groupIndex, activeVersionTransitions)
          return {
            query_type: 'group-prefix',
            prefix: result.prefix,
            code,
            scope: scopeLabel,
            donated_count: summary.donated.length,
            received_count: summary.received.length,
            status: summary.unchanged
              ? '未變動'
              : [
                  summary.donated.length > 0 ? '移出' : '',
                  summary.received.length > 0 ? '移入' : '',
                ].filter(Boolean).join(' | '),
          }
        })
    }

    return []
  })()

  function handleDownloadResult() {
    if (!result || exportRows.length === 0) return
    const filename = `${query || 'ipc'}-${directionFilter}-${scopeLabel}.csv`
      .replace(/[^\w.-]+/g, '_')
    triggerCsvDownload(filename, exportRows)
  }

  return (
    <>
    <nav className="site-nav">
      <div className="site-nav-inner">
        <span className="site-nav-brand">IPC 對照工具</span>
        <a href={import.meta.env.BASE_URL} className="site-nav-link active">版本查詢</a>
        <a href={`${import.meta.env.BASE_URL}reclassify.html`} className="site-nav-link">批次重分類</a>
        <a href={`${import.meta.env.BASE_URL}reclassify-class.html`} className="site-nav-link">重分類二階</a>
        <a href={`${import.meta.env.BASE_URL}reclassify-subclass.html`} className="site-nav-link">重分類三階</a>
        <a href="https://github.com/ronjuan83/ipc-conversion" target="_blank" rel="noreferrer" className="site-nav-github">GitHub</a>
      </div>
    </nav>
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">IPC 版本異動與對照查詢</h1>
        <p className="app-subtitle">
          查詢國際專利分類（IPC）在不同版本間的沿革、移轉與重分類線索，涵蓋 1994–2026 年共 24 個版本
        </p>
      </header>

      <main className="app-main">
        <div className="search-box">
          <div className="search-mode-switch" role="tablist" aria-label="查詢模式">
            <button
              type="button"
              className={`mode-switch-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => setViewMode('single')}
            >
              單一版本
            </button>
            <button
              type="button"
              className={`mode-switch-btn ${viewMode === 'compare' ? 'active' : ''}`}
              onClick={() => setViewMode('compare')}
            >
              兩版本比較
            </button>
          </div>
          <div className="search-input-wrap">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="輸入 IPC 代碼或組號，例如 H01L、H01L 21 或 H01L 21/677"
              value={input}
              onChange={e => { setInput(e.target.value); setShowSugg(true) }}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              autoComplete="off"
              spellCheck={false}
              aria-label="搜尋 IPC 分類代碼"
            />
            {viewMode === 'single' && (
              <select className="version-select" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)} aria-label="選擇 IPC 版本">
                <option value="">全部版本</option>
                {versionOptions.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            )}
            <button className="search-btn" onClick={() => handleSearch()} disabled={loading} aria-label="搜尋">
              搜尋
            </button>
            {showSugg && suggestions.length > 0 && (
              <ul className="suggestions" ref={suggRef}>
                {suggestions.map(code => (
                  <li key={code} className="suggestion-item" onMouseDown={() => handleSuggClick(code)}>
                    <span className="sugg-code">{code}</span>
                    {getSubclassName(code.slice(0, 4)) && !isGroupQuery(code) && (
                      <span className="sugg-name">{getSubclassName(code)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {viewMode === 'single' ? (
            <div className="filter-helper">
              可鎖定單一版本轉換，例如只查看 <code>2006.01→2010.01</code> 的異動。
            </div>
          ) : (
            <div className="compare-toolbar">
              <label className="compare-field">
                <span>起點版</span>
                <select className="version-select compare-select" value={compareFrom} onChange={e => setCompareFrom(e.target.value)} aria-label="選擇起點版本">
                  {editionOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="compare-arrow">→</div>
              <label className="compare-field">
                <span>終點版</span>
                <select className="version-select compare-select" value={compareTo} onChange={e => setCompareTo(e.target.value)} aria-label="選擇終點版本">
                  {editionOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="compare-helper">
                {compareError
                  ? compareError
                  : `會彙整區間內 ${compareRange?.transitions || 0} 次相鄰版本轉換。`}
              </div>
            </div>
          )}
        </div>

        <TechClassifier onSearch={handleSearch} />

        <div className="example-chips">
          <span className="example-label">範例：</span>
          {EXAMPLES.map(ex => (
            <button key={ex} className="chip" onClick={() => handleSearch(ex)}>
              {ex}
            </button>
          ))}
        </div>

        <div className="result-area">
          {!loading && !error && compareRange && (
            <div className="compare-banner">
              <div className="compare-banner-title">兩版本比較模式</div>
              <div className="compare-banner-meta">
                <span>{compareRange.from} → {compareRange.to}</span>
                <span>涵蓋 {compareRange.transitions} 次版本轉換</span>
              </div>
            </div>
          )}
          {!loading && !error && !compareError && result && (
            <ResultToolbar
              directionFilter={directionFilter}
              setDirectionFilter={setDirectionFilter}
              onDownload={handleDownloadResult}
              downloadDisabled={exportRows.length === 0}
            />
          )}
          {loading && <div className="loading">載入資料中…</div>}
          {error && <div className="error-msg">資料載入失敗：{error}</div>}
          {!loading && !error && compareError && (
            <div className="error-msg">{compareError}</div>
          )}
          {!loading && !error && !query && (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <p>輸入 IPC 分類代碼或組號（如 <code>H01L</code>、<code>H01L 21/677</code>）查詢其版本異動與對照線索</p>
              <p className="empty-sub">
                支援分類代碼（如 <code>H01L</code>）、組號（如 <code>H01L 21/677</code>）或前綴搜尋（如 <code>H01</code>、<code>H01L 21</code>），也可切換到兩版本比較模式查看區間變化
              </p>
            </div>
          )}
          {!loading && !error && !compareError && result && result.type === 'exact' && (
            <SubclassCard code={result.code} data={data} onSearch={handleSearch} ipcGroups={ipcGroups} flowGraph={flowGraph} activeVersionTransitions={activeVersionTransitions} compareRange={compareRange} directionFilter={directionFilter} />
          )}
          {!loading && !error && !compareError && result && result.type === 'prefix' && (
            <PrefixList prefix={result.prefix} data={data} onSearch={handleSearch} activeVersionTransitions={activeVersionTransitions} compareRange={compareRange} directionFilter={directionFilter} />
          )}
          {!loading && !error && !compareError && result && result.type === 'group-exact' && (
            <GroupCard code={result.code} groupIndex={groupIndex} onSearch={handleSearch} ipcGroups={ipcGroups} activeVersionTransitions={activeVersionTransitions} compareRange={compareRange} directionFilter={directionFilter} />
          )}
          {!loading && !error && !compareError && result && result.type === 'group-prefix' && (
            <GroupList
              prefix={result.prefix}
              matches={result.matches}
              groupIndex={groupIndex}
              activeVersionTransitions={activeVersionTransitions}
              directionFilter={directionFilter}
              onSelect={code => { setInput(code); setQuery(code) }}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        資料來源：WIPO IPC 調和表（IPC v6 → 2026.01）與本地整理索引｜ 更新日期：2026-04-06
      </footer>
    </div>
    </>
  )
}

export default function App() {
  return (
    <IpcNamesProvider>
      <AppInner />
    </IpcNamesProvider>
  )
}
