import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { getMountainForecast, type MountainForecast } from '../data/forecastCache'
import { formatEle, type Mountain } from '../data/mountains'
import { formatDateShort, toDateKey } from '../logic/date'
import { CLIMB_HOURS, describeWeather, type DaySummary } from '../logic/weather'

type Snap = 'peek' | 'full'

/** 「要点」のときに見えている高さの目安（px）。地図を動かす量の計算に使う。実際の高さは見出しを測って決める */
export const PEEK_HEIGHT = 160
/** これ以上動かしたらドラッグとみなす（px） */
const DRAG_THRESHOLD = 6
/** 指を離したときの勢いを、どれだけ先まで反映するか（ms） */
const FLICK_PROJECTION_MS = 180

type Props = {
  mountain: Mountain
  /** 要点に表示する日（ステップ4で地図の日付切り替えとつなぐ） */
  targetDate: string
  onClose: () => void
}

export function MountainSheet({ mountain, targetDate, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snap>('peek')
  const [sheetHeight, setSheetHeight] = useState(0)
  const [peekHeight, setPeekHeight] = useState(PEEK_HEIGHT)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const drag = useRef<{
    startY: number
    moved: boolean
    /** 直近の指の位置（勢いの計算用） */
    lastY: number
    lastT: number
    velocity: number
  } | null>(null)

  const [forecast, setForecast] = useState<MountainForecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [todayKey] = useState(() => toDateKey(new Date()))

  // 山ごとに作り直される（呼び出し側で key を山の id にしている）ので、取得は最初の1回だけ
  useEffect(() => {
    let cancelled = false
    getMountainForecast(mountain).then(
      (f) => !cancelled && setForecast(f),
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [mountain])

  // パネル全体と見出しの高さを測る。要点表示は見出しがちょうど見える高さにする
  // （iPhone では文字の折り返しで見出しの高さが変わるため、固定値にしない）
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    const header = headerRef.current
    if (!sheet || !header) return
    const observer = new ResizeObserver(() => {
      setSheetHeight(sheet.offsetHeight)
      setPeekHeight(header.offsetHeight)
    })
    observer.observe(sheet)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const peekOffset = Math.max(sheetHeight - peekHeight, 0)
  const baseOffset = snap === 'full' ? 0 : peekOffset
  const offset = Math.max(0, baseOffset + (dragOffset ?? 0))

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    const now = performance.now()
    drag.current = { startY: e.clientY, moved: false, lastY: e.clientY, lastT: now, velocity: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return
    d.moved = true
    const now = performance.now()
    if (now > d.lastT) d.velocity = (e.clientY - d.lastY) / (now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    setDragOffset(dy)
  }

  /** 指を離した位置と勢いから、いちばん近い状態（全部・要点・閉じる）に吸着させる */
  const finishDrag = (canTap: boolean) => {
    const d = drag.current
    drag.current = null
    setDragOffset(null)
    if (!d) return
    if (!d.moved) {
      // タップで要点 ⇔ 全部を切り替える
      if (canTap) setSnap((s) => (s === 'peek' ? 'full' : 'peek'))
      return
    }
    // しばらく止まってから離した場合は勢いを無視する。勢いが強すぎても1段だけ動くよう上限をつける
    const rawVelocity = performance.now() - d.lastT > 100 ? 0 : d.velocity
    const velocity = Math.max(-2, Math.min(2, rawVelocity))
    const projected = baseOffset + (d.lastY - d.startY) + velocity * FLICK_PROJECTION_MS
    // 全部表示からは要点まで、要点からは全部表示か閉じるまで（一気に閉じないようにする）
    const targets: [Snap | 'closed', number][] =
      snap === 'full'
        ? [
            ['full', 0],
            ['peek', peekOffset],
          ]
        : [
            ['full', 0],
            ['peek', peekOffset],
            ['closed', sheetHeight],
          ]
    const [nearest] = targets.reduce((a, b) =>
      Math.abs(b[1] - projected) < Math.abs(a[1] - projected) ? b : a,
    )
    if (nearest === 'closed') onClose()
    else setSnap(nearest)
  }

  const target = forecast?.days.find((d) => d.date === targetDate)
  const today = forecast?.days.find((d) => d.date === todayKey)

  return (
    <div
      ref={sheetRef}
      className={`sheet${dragOffset === null ? ' sheet-animated' : ''}`}
      style={{ transform: `translateY(${offset}px)` }}
      data-snap={snap}
    >
      <div
        ref={headerRef}
        className="sheet-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finishDrag(true)}
        // iOS が操作を打ち切った場合はタップとみなさない
        onPointerCancel={() => finishDrag(false)}
      >
        <div className="sheet-handle" />
        <div className="sheet-title-row">
          <div>
            <div className="sheet-title">
              {mountain.name}
              <MountainBadge mountain={mountain} />
            </div>
            <div className="sub">
              {mountain.yomi && `${mountain.yomi}・`}
              {mountain.pref}・{formatEle(mountain.ele)}
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="sheet-summary">
          {error && <span className="sub">{error}</span>}
          {!error && !forecast && <span className="sub">天気を読み込み中…</span>}
          {forecast && !target && <span className="sub">{formatDateShort(targetDate)}の予報はまだありません</span>}
          {target && <DayLine label={formatDateShort(targetDate)} day={target} />}
          {today && <SnowLine snowDepthCm={today.snowDepthCm} />}
        </div>
      </div>

      <div className="sheet-body">
        <section>
          <h3>天気（7日間）</h3>
          {forecast ? (
            <>
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>天気</th>
                    <th>気温</th>
                    <th>風</th>
                    <th>降水</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.days.map((d) => (
                    <ForecastRow key={d.date} day={d} highlight={d.date === targetDate} />
                  ))}
                </tbody>
              </table>
              <p className="note">
                標高 {forecast.elevation.toLocaleString()}m 地点の予報です。天気・風・降水は登山の時間帯（
                {CLIMB_HOURS.from}〜{CLIMB_HOURS.to}時）の値で、気温はその日の最高／最低です。
                山頂の風は予報より強いことが多いので目安にしてください。
              </p>
            </>
          ) : (
            <p className="sub">{error ?? '読み込み中…'}</p>
          )}
        </section>

        <section>
          <h3>積雪</h3>
          {today ? (
            <>
              <SnowLine snowDepthCm={today.snowDepthCm} />
              <p className="note">気象モデルによる推定値です。実際の積雪は山小屋や自治体の情報で確認してください。</p>
            </>
          ) : (
            <p className="sub">{error ?? '読み込み中…'}</p>
          )}
        </section>

        <section>
          <h3>リンク</h3>
          <ul className="link-list">
            <li>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${mountain.name} ${mountain.pref.split(/\s+/)[0]} 登山道 状況`)}`}
                target="_blank"
                rel="noopener"
              >
                登山道の状況を検索する
              </a>
            </li>
            <li>
              <a
                href={`https://maps.gsi.go.jp/#15/${mountain.lat}/${mountain.lon}/`}
                target="_blank"
                rel="noopener"
              >
                地理院地図で開く
              </a>
            </li>
            <li>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mountain.lat},${mountain.lon}`}
                target="_blank"
                rel="noopener"
              >
                Google マップで開く（登山口・駐車場など）
              </a>
            </li>
          </ul>
        </section>

        <p className="note caution">
          表示している情報は目安です。出発前に気象庁などの公式の気象情報と、現地の最新情報を必ず確認してください。
        </p>
      </div>
    </div>
  )
}

function DayLine({ label, day }: { label: string; day: DaySummary }) {
  const w = describeWeather(day.weatherCode)
  return (
    <div className="day-line">
      <span className="day-line-date">{label}</span>
      <span>
        {w.icon} {w.label}
      </span>
      <span>風 {Math.round(day.windMax)}m/s</span>
      {day.precipProbMax !== null && <span>降水 {day.precipProbMax}%</span>}
      {day.thunder && <span className="warn">雷</span>}
    </div>
  )
}

function SnowLine({ snowDepthCm }: { snowDepthCm: number | null }) {
  if (snowDepthCm === null) return <div className="sub">積雪：不明</div>
  if (snowDepthCm < 1) return <div className="sub">積雪：なし（推定）</div>
  return (
    <div className="warn">
      積雪：約{snowDepthCm}cm（推定）・雪山装備が必要です
    </div>
  )
}

function ForecastRow({ day, highlight }: { day: DaySummary; highlight: boolean }) {
  const w = describeWeather(day.weatherCode)
  return (
    <tr className={highlight ? 'highlight' : undefined}>
      <td>{formatDateShort(day.date)}</td>
      <td>
        <span title={w.label}>{w.icon}</span>
        {day.thunder && <span className="warn"> 雷</span>}
      </td>
      <td>
        <span className="temp-max">{Math.round(day.tempMax)}</span>/
        <span className="temp-min">{Math.round(day.tempMin)}</span>℃
      </td>
      <td>{Math.round(day.windMax)}m/s</td>
      <td>{day.precipProbMax === null ? '—' : `${day.precipProbMax}%`}</td>
    </tr>
  )
}
