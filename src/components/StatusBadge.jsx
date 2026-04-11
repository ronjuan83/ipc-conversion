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

function extractSubclasses(text) {
  if (!text) return []
  const matches = text.match(/[A-H]\d{2}[A-Z]/g)
  return matches ? [...new Set(matches)] : []
}

function isEditionWithinScope(edition, scope) {
  if (!edition || !scope) return false
  const value = editionOrder(edition)
  return value > editionOrder(scope.from) && value <= editionOrder(scope.to)
}

export function StatusBadge({ code, data, onSearch, activeVersionTransitions = null, compareRange = null }) {
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]
  const entry = data.subclass_index[code]

  const donated = activeVersionTransitions
    ? (entry?.donated || []).filter(r => activeVersionTransitions.has(r.version))
    : (entry?.donated || [])
  const received = activeVersionTransitions
    ? (entry?.received || []).filter(r => activeVersionTransitions.has(r.version))
    : (entry?.received || [])

  const targetSubs = new Set()
  donated.forEach(rec => {
    extractSubclasses(rec.dst).forEach(sub => {
      if (sub !== code) targetSubs.add(sub)
    })
  })

  const sourceSubs = new Set()
  received.forEach(rec => {
    const fromSub = rec.src_sub || rec.from?.slice(0, 4)
    if (fromSub && fromSub !== code) sourceSubs.add(fromSub)
  })

  const scope = getScopeWindow(activeVersionTransitions, compareRange)
  const showIntro = scope ? isEditionWithinScope(intro, scope) : Boolean(intro)
  const showDeprecated = scope ? isEditionWithinScope(deprAt, scope) : Boolean(depr)
  const hasTransition = donated.length > 0 || received.length > 0
  const isSplit = targetSubs.size > 1
  const isMerge = sourceSubs.size > 1

  const badges = []

  if (showDeprecated && depr) {
    const target = Array.isArray(depr) ? depr.join(', ') : depr
    badges.push(
      <span key="deprecated" className="badge badge-deprecated">
        {deprAt && <span className="depr-version">{deprAt}</span>}
        {' '}已廢棄 → <span className="code-link code-link-badge" onClick={() => onSearch(Array.isArray(depr) ? depr[0] : depr)}>{target}</span>
      </span>
    )
  }

  if (showIntro) {
    badges.push(<span key="new" className="badge badge-new">新增於 {intro}</span>)
  }

  if (isSplit) {
    badges.push(<span key="split" className="badge badge-split">拆分至 {targetSubs.size} 個去向</span>)
  }

  if (isMerge) {
    badges.push(<span key="merge" className="badge badge-merge">合併自 {sourceSubs.size} 個來源</span>)
  }

  if (hasTransition) {
    badges.push(<span key="transfer" className="badge badge-transfer">移轉 {donated.length} 出 {received.length} 入</span>)
  }

  if (badges.length === 0) {
    badges.push(<span key="active" className="badge badge-active">現行有效</span>)
  }

  return <>{badges}</>
}
