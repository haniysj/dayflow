import { GripVertical } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dow, fmtTime, hmToMin, minToHM, nowMinutes, todayStr, weekdayName } from '../lib/dates'
import { L } from '../lib/i18n'
import { layoutOverlaps } from '../lib/logic'

export interface GridItem {
  key: string
  kind: 'event' | 'task'
  title: string
  date: string
  start: number
  end: number
  color: string
  done?: boolean
  sub?: string
  movable: boolean
  ref: any
}
export interface AllDayItem { key: string; title: string; color: string; est?: boolean; done?: boolean; onClick?: () => void }

/** An item drawn as one continuous bar from `start` to `end` (inclusive dates) */
export interface SpanItem extends AllDayItem { start: string; end: string; rank: number; ord?: number }

export interface SpanBar { item: SpanItem; c1: number; c2: number; lane: number; before: boolean; after: boolean }

/**
 * Lay out bars over a run of consecutive dates (one calendar week row, or a week/day column set).
 * Longer and earlier items get the top lanes; items beyond `maxLanes` are counted per column as hidden.
 */
export function layoutSpans(items: SpanItem[], dates: string[], maxLanes: number) {
  const first = dates[0], last = dates[dates.length - 1]
  const col = (d: string) => dates.indexOf(d)
  const inRange = items.filter(i => i.end >= first && i.start <= last)
    .sort((a, b) => a.rank - b.rank || a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || (a.ord ?? 0) - (b.ord ?? 0) || a.title.localeCompare(b.title))
  const occ: boolean[][] = []
  const bars: SpanBar[] = []
  const hidden = dates.map(() => 0)
  for (const item of inRange) {
    const c1 = item.start < first ? 0 : col(item.start)
    const c2 = item.end > last ? dates.length - 1 : col(item.end)
    if (c1 < 0 || c2 < 0) continue
    let lane = 0
    while ((occ[lane] ||= []).slice(c1, c2 + 1).some(Boolean)) lane++
    if (lane >= maxLanes) { for (let c = c1; c <= c2; c++) hidden[c]++; continue }
    for (let c = c1; c <= c2; c++) occ[lane][c] = true
    bars.push({ item, c1, c2, lane, before: item.start < first, after: item.end > last })
  }
  return { bars, hidden, lanes: Math.min(maxLanes, occ.length) }
}


interface Props {
  dates: string[]
  items: GridItem[]
  allDay?: Record<string, AllDayItem[]>
  /** when given, all-day items are drawn as continuous bars across the columns */
  spans?: SpanItem[]
  startHour: number
  endHour: number
  slotMin: number
  workdays: number[]
  showHead?: boolean
  onSlot: (date: string, time: string) => void
  onOpen: (it: GridItem) => void
  onMove: (it: GridItem, date: string, start: string, end: string) => void
  onDropTask?: (taskId: string, date: string, time: string) => void
  onHeadClick?: (date: string) => void
  compact?: boolean
}

export function TimeGrid(p: Props) {
  const hourPx = p.compact ? 44 : 56
  const pxPerMin = hourPx / 60
  const startMin = p.startHour * 60
  const endMin = Math.max(p.endHour * 60, startMin + 60)
  const height = (endMin - startMin) * pxPerMin
  const today = todayStr()
  const [now, setNow] = useState(nowMinutes())
  useEffect(() => { const t = setInterval(() => setNow(nowMinutes()), 60000); return () => clearInterval(t) }, [])
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ key: string; mode: 'move' | 'resize'; y0: number; x0: number; start: number; end: number; col: number; dStart: number; dEnd: number; dCol: number } | null>(null)
  const [dropAt, setDropAt] = useState<string | null>(null)
  const snap = Math.max(5, Math.min(p.slotMin, 15))

  // scroll to "now" (or work start) on first render
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = p.dates.includes(today) ? now - 60 : 7.5 * 60
    el.scrollTop = Math.max(0, (target - startMin) * pxPerMin)
  }, [])

  const cols = useMemo(() => p.dates.map(d => layoutOverlaps(p.items.filter(i => i.date === d).map(i => ({ item: i, start: i.start, end: i.end })))), [p.items, p.dates])

  const onPointerDown = (e: React.PointerEvent, it: GridItem, colIdx: number, mode: 'move' | 'resize') => {
    if (!it.movable) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ key: it.key, mode, y0: e.clientY, x0: e.clientX, start: it.start, end: it.end, col: colIdx, dStart: it.start, dEnd: it.end, dCol: colIdx })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dy = Math.round(((e.clientY - drag.y0) / pxPerMin) / snap) * snap
    let dCol = drag.col
    if (drag.mode === 'move' && p.dates.length > 1 && gridRef.current) {
      const w = (gridRef.current.clientWidth - 54) / p.dates.length
      const dir = document.documentElement.dir === 'rtl' ? -1 : 1
      dCol = Math.max(0, Math.min(p.dates.length - 1, drag.col + Math.round(((e.clientX - drag.x0) * dir) / w)))
    }
    if (drag.mode === 'move') {
      const len = drag.end - drag.start
      const s = Math.max(0, Math.min(24 * 60 - len, drag.start + dy))
      setDrag({ ...drag, dStart: s, dEnd: s + len, dCol })
    } else setDrag({ ...drag, dEnd: Math.max(drag.start + snap, Math.min(24 * 60, drag.end + dy)) })
  }
  const onPointerUp = () => {
    if (!drag) return
    const it = p.items.find(i => i.key === drag.key)
    const changed = drag.dStart !== drag.start || drag.dEnd !== drag.end || drag.dCol !== drag.col
    setDrag(null)
    if (it && changed) p.onMove(it, p.dates[drag.dCol], minToHM(drag.dStart), minToHM(drag.dEnd))
    else if (it) p.onOpen(it)
  }

  const hours: number[] = []
  for (let m = startMin; m <= endMin; m += 60) hours.push(m)
  const slots: number[] = []
  for (let m = startMin; m < endMin; m += p.slotMin) slots.push(m)
  const style = { ['--cols' as any]: p.dates.length }

  return (
    <div>
      {p.showHead !== false && p.dates.length > 1 && (
        <div className="tg-head" style={style}>
          <div />
          {p.dates.map(d => {
            const we = !p.workdays.includes(dow(d))
            return (
              <div key={d} className={`h${d === today ? ' today' : ''}${we ? ' weekend' : ''}`} onClick={() => p.onHeadClick?.(d)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && p.onHeadClick?.(d)}>
                <div className="tiny">{weekdayName(d, 'short')}</div>
                <span className="n">{+d.slice(8)}</span>
              </div>
            )
          })}
        </div>
      )}
      {p.spans && (() => {
        const { bars, hidden, lanes } = layoutSpans(p.spans, p.dates, 4)
        if (!bars.length && !hidden.some(Boolean)) return null
        const rows = lanes + (hidden.some(Boolean) ? 1 : 0)
        return (
          <div className="allday" style={style}>
            <div className="tiny muted" style={{ textAlign: 'center', padding: '6px 0' }}>{L('اليوم كله', 'All day')}</div>
            <div className="allday-lanes" style={{ gridTemplateColumns: `repeat(${p.dates.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}>
              {p.dates.map((d, i) => <div key={d} className="allday-cell" style={{ gridColumn: i + 1, gridRow: '1 / -1' }} />)}
              {bars.map(b => (
                <button key={b.item.key} className={`chip mbar${b.item.est ? ' est' : ''}${b.item.done ? ' done' : ''}${b.before ? ' cb' : ''}${b.after ? ' ca' : ''}`}
                  style={{ ['--c' as any]: b.item.color, gridColumn: `${b.c1 + 1} / ${b.c2 + 2}`, gridRow: b.lane + 1 }} onClick={b.item.onClick} title={b.item.title}>{b.item.title}</button>
              ))}
              {hidden.map((n, i) => n > 0 && <button key={'m' + i} className="more" style={{ gridColumn: i + 1, gridRow: lanes + 1 }} onClick={() => p.onHeadClick?.(p.dates[i])}>+{n}</button>)}
            </div>
          </div>
        )
      })()}
      {!p.spans && p.allDay && Object.values(p.allDay).some(a => a.length) && (
        <div className="allday" style={style}>
          <div className="tiny muted" style={{ textAlign: 'center', padding: '6px 0' }}>{L('اليوم كله', 'All day')}</div>
          {p.dates.map(d => (
            <div key={d} className="allday-cell">
              {(p.allDay![d] || []).map(a => (
                <button key={a.key} className={`chip${a.est ? ' est' : ''}${a.done ? ' done' : ''}`} style={{ ['--c' as any]: a.color }} onClick={a.onClick} title={a.title}>{a.title}</button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg-scroll" ref={scrollRef} style={p.compact ? { maxHeight: 520 } : undefined}>
        <div className="tg" style={{ ...style, height }} ref={gridRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          <div className="tg-hours" aria-hidden>
            {hours.map(m => <div key={m} className="tg-hour" style={{ top: (m - startMin) * pxPerMin }}>{m === startMin ? '' : fmtTime(minToHM(m)).replace(':00', '')}</div>)}
          </div>
          {p.dates.map((d, ci) => {
            const we = !p.workdays.includes(dow(d))
            return (
              <div key={d} className={`tg-col${we ? ' weekend' : ''}${d === today && p.dates.length > 1 ? ' today' : ''}`}>
                {hours.map(m => <div key={m} className="tg-line" style={{ top: (m - startMin) * pxPerMin }} />)}
                {slots.map(m => {
                  const id = `${d}|${m}`
                  return (
                    <div key={m} className={`tg-slot${dropAt === id ? ' drop' : ''}`} style={{ top: (m - startMin) * pxPerMin, height: p.slotMin * pxPerMin }}
                      role="button" tabIndex={-1} aria-label={`${L('إضافة في', 'Add at')} ${fmtTime(minToHM(m))}`}
                      onClick={() => p.onSlot(d, minToHM(m))}
                      onDragOver={e => { if (p.onDropTask && e.dataTransfer.types.includes('text/df-task')) { e.preventDefault(); setDropAt(id) } }}
                      onDragLeave={() => setDropAt(x => (x === id ? null : x))}
                      onDrop={e => { e.preventDefault(); setDropAt(null); const tid = e.dataTransfer.getData('text/df-task'); if (tid) p.onDropTask?.(tid, d, minToHM(m)) }} />
                  )
                })}
                {d === today && now >= startMin && now <= endMin && <div className="tg-now" style={{ top: (now - startMin) * pxPerMin }} />}
                {cols[ci].map(({ item: it, start, end, col, cols: n }) => {
                  const isDrag = drag?.key === it.key
                  const s = isDrag ? drag!.dStart : start
                  const e2 = isDrag ? drag!.dEnd : end
                  if (isDrag && drag!.dCol !== ci) return null
                  const top = Math.max(0, (s - startMin) * pxPerMin)
                  const h = Math.max(22, (e2 - Math.max(s, startMin)) * pxPerMin - 2)
                  if (e2 <= startMin || s >= endMin) return null
                  return (
                    <div key={it.key} className={`blk${it.done ? ' done' : ''}${isDrag ? ' dragging' : ''}`}
                      style={{ ['--c' as any]: it.color, top, height: h, insetInlineStart: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                      role="button" tabIndex={0} aria-label={`${it.title} ${fmtTime(minToHM(s))}–${fmtTime(minToHM(e2))}`}
                      onClick={e => { e.stopPropagation(); if (!drag && !(e.target as HTMLElement).closest('.grip,.rsz')) p.onOpen(it) }} onKeyDown={e => e.key === 'Enter' && p.onOpen(it)}>
                      <b>{it.title}</b>
                      {h > 34 && <span className="tm">{fmtTime(minToHM(s))} – {fmtTime(minToHM(e2))}</span>}
                      {h > 52 && it.sub && <div className="tiny muted ellipsis">{it.sub}</div>}
                      {it.movable && <>
                        <span className="grip" onPointerDown={e => onPointerDown(e, it, ci, 'move')} aria-hidden title={L('اسحب للنقل', 'Drag to move')}><GripVertical size={14} /></span>
                        <span className="rsz" onPointerDown={e => onPointerDown(e, it, ci, 'resize')} aria-hidden title={L('اسحب لتغيير المدة', 'Drag to resize')} />
                      </>}
                    </div>
                  )
                })}
                {drag && drag.dCol === ci && drag.col !== ci && (() => {
                  const it = p.items.find(i => i.key === drag.key)!
                  return <div className="blk dragging" style={{ ['--c' as any]: it.color, top: (drag.dStart - startMin) * pxPerMin, height: (drag.dEnd - drag.dStart) * pxPerMin - 2, insetInlineStart: 2, width: 'calc(100% - 4px)' }}><b>{it.title}</b></div>
                })()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const toGridMinutes = (start?: string | null, end?: string | null, fallbackLen = 30) => {
  const s = hmToMin(start)
  const e = end ? hmToMin(end) : s + fallbackLen
  return { start: s, end: e > s ? e : s + fallbackLen }
}
