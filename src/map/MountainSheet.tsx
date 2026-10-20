import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { getMountainOutlook, type MountainOutlook } from '../data/forecastCache'
import { formatEle, searchName, type Mountain } from '../data/mountains'
import { formatDateShort, toDateKey } from '../logic/date'
import { estimateKoyo, isKoyoSeason, KOYO_LABELS, type KoyoStage } from '../logic/koyo'
import { isNotable, SIGHTS, sightScore, sightTitle } from '../logic/sights'
import { SightTag } from '../components/SightTag'
import type { DayOutlook } from '../logic/outlook'
import { WEATHER_CLASS_LABELS } from '../logic/recommend'
import { CLIMB_HOURS, describeWeather, type DaySummary } from '../logic/weather'
import type { ClimbRecord } from '../data/db'
import { AccessSection } from './AccessSection'
import { LatestInfoSection } from './LatestInfo'
import { useMountainRecords } from '../data/useRecords'
import { FavoriteButton, MyRecordsSection } from './MyRecords'

type Snap = 'peek' | 'full'

/** 「要点」のときに見えている高さの目安（px）。地図を動かす量の計算に使う。実際の高さは見出しを測って決める */
export const PEEK_HEIGHT = 160
/** これ以上動かしたらドラッグとみなす（px） */
const DRAG_THRESHOLD = 6
/** 指を離したときの勢いを、どれだけ先まで反映するか（ms） */
const FLICK_PROJECTION_MS = 180

type Props = {
  mountain: Mountain
  /** 要点に表示する日（地図で選んでいる日） */
  targetDate: string
  onClose: () => void
  /** 「記録する」を押したとき */
  onRecord: (mountain: Mountain) => void
  /** 自分の記録を押したとき */
  onEditRecord: (record: ClimbRecord) => void
}

export function MountainSheet({ mountain, targetDate, onClose, onRecord, onEditRecord }: Props) {
  const records = useMountainRecords(mountain.id)
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

  const [forecast, setForecast] = useState<MountainOutlook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [todayKey] = useState(() => toDateKey(new Date()))

  // 山ごとに作り直される（呼び出し側で key を山の id にしている）ので、取得は最初の1回だけ
  useEffect(() => {
    let cancelled = false
    getMountainOutlook(mountain).then(
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
              {records.length > 0 && <span className="badge badge-climbed">登頂済み</span>}
            </div>
            <div className="sub">
              {mountain.yomi && `${mountain.yomi}・`}
              {mountain.pref}・{formatEle(mountain.ele)}
            </div>
          </div>
          <div className="sheet-title-actions">
            <FavoriteButton mountain={mountain} />
            <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="sheet-summary">
          {error && <span className="sub">{error}</span>}
          {!error && !forecast && <span className="sub">天気を読み込み中…</span>}
          {forecast && !target && <span className="sub">{formatDateShort(targetDate)}の予報はまだありません</span>}
          {target && <DayLine label={formatDateShort(targetDate)} day={target.weather} />}
          {target && <VerdictLine day={target} />}
        </div>
      </div>

      <div className="sheet-body">
        {target && (
          <section>
            <h3>おすすめ度（{formatDateShort(targetDate)}）</h3>
            <p className={`verdict verdict-${verdictOf(target)}`}>{verdictLabel(target)}</p>
            <ul className="reason-list">
              {target.judgement.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {target.sights
                .filter((s) => s.level === 'peak')
                .map((s) => (
                  <li key={s.id}>
                    {SIGHTS[s.id].name}：{s.label}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {target && target.sights.length > 0 && (
          <section>
            <h3>見どころ（推定・{formatDateShort(targetDate)}）</h3>
            <ul className="koyo-levels">
              {target.sights.map((s) => (
                <li key={s.id}>
                  <span>{sightTitle(s.id)}</span>
                  <span className={`koyo-tag level-${s.level}`}>{s.label}</span>
                </li>
              ))}
            </ul>
            <p className="note">
              気象データから推定した目安です。雲海は早朝の雲の高さ、霧氷は夜〜朝の気温・湿度・風、雪山は推定積雪から判断しています。
            </p>
          </section>
        )}

        {forecast && isKoyoSeason(targetDate) && forecast.koyoLevels.length > 0 && (
          <section>
            <h3>紅葉（推定・{formatDateShort(targetDate)}）</h3>
            <ul className="koyo-levels">
              {forecast.koyoLevels.map((level, i) => {
                const stage = estimateKoyo(level.mins, targetDate).stage
                return (
                  <li key={i}>
                    <span>
                      {i === 0 ? '山頂付近' : '中腹'}
                      {level.elevation !== null && `（${level.elevation.toLocaleString()}m）`}
                    </span>
                    <KoyoTag stage={stage} />
                  </li>
                )
              })}
            </ul>
            <p className="note">
              最低気温の移り変わりから推定した目安です（8℃を下回ると色づき始め、冷え込むほど進む）。
              山頂付近が見頃を過ぎていても、中腹が見頃のことがあります。
            </p>
          </section>
        )}

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
                    <ForecastRow key={d.date} day={d.weather} highlight={d.date === targetDate} />
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
              <SnowLine snowDepthCm={today.weather.snowDepthCm} />
              <p className="note">気象モデルによる推定値です。実際の積雪は山小屋や自治体の情報で確認してください。</p>
            </>
          ) : (
            <p className="sub">{error ?? '読み込み中…'}</p>
          )}
        </section>

        <MyRecordsSection
          mountain={mountain}
          records={records}
          onRecord={() => onRecord(mountain)}
          onEditRecord={onEditRecord}
        />

        <AccessSection mountain={mountain} />

        <LatestInfoSection mountain={mountain} targetDate={targetDate} />

        <section>
          <h3>リンク</h3>
          <ul className="link-list">
            <li>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${searchName(mountain.name)} ${mountain.pref.split(/\s+/)[0]} 登山道 状況`)}`}
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

type Verdict = 'recommended' | 'ok' | 'bad'

function verdictOf(day: DayOutlook): Verdict {
  if (day.judgement.cls === 'bad') return 'bad'
  return day.highlighted ? 'recommended' : 'ok'
}

function verdictLabel(day: DayOutlook): string {
  const v = verdictOf(day)
  if (v === 'recommended') return 'おすすめ'
  if (v === 'bad') return 'おすすめしない（天気が悪い）'
  return WEATHER_CLASS_LABELS[day.judgement.cls]
}

/** 要点に出す判定の1行（おすすめ・期待できる見どころ・積雪） */
function VerdictLine({ day }: { day: DayOutlook }) {
  const notable = day.sights
    .filter((s) => isNotable(s.level) || (s.id === 'koyo' && s.level === 'past'))
    .sort((a, b) => sightScore(b.level) - sightScore(a.level))
    .slice(0, 2)
  return (
    <div className="day-line">
      <span className={`verdict verdict-${verdictOf(day)}`}>{verdictLabel(day)}</span>
      {notable.map((s) => (
        <SightTag key={s.id} id={s.id} level={s.level} />
      ))}
      {day.weather.snowDepthCm !== null && day.weather.snowDepthCm >= 1 && (
        <span className="warn">積雪 約{day.weather.snowDepthCm}cm</span>
      )}
    </div>
  )
}

function KoyoTag({ stage, prefix = '' }: { stage: KoyoStage; prefix?: string }) {
  return (
    <span className={`koyo-tag koyo-${stage}`}>
      {prefix}
      {KOYO_LABELS[stage]}
    </span>
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
