import { useEffect, useState } from 'react'
import { loadAccess, type MountainAccess, type Parking, type Station } from '../data/access'
import { searchName, type Mountain } from '../data/mountains'

type Point = { lat: number; lon: number }

const mapUrl = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`
/** 公共交通での経路（Google マップ） */
const transitUrl = (from: Point, to: Point) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=transit`

/** 詳細パネルの「アクセス」：登山口・最寄り駅・駐車場 */
export function AccessSection({ mountain }: { mountain: Mountain }) {
  // undefined＝読み込み中、null＝データなし
  const [access, setAccess] = useState<MountainAccess | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    loadAccess(mountain.id).then((a) => !cancelled && setAccess(a))
    return () => {
      cancelled = true
    }
  }, [mountain.id])

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${searchName(mountain.name)} 登山口 駐車場`)}`

  return (
    <section>
      <h3>アクセス</h3>
      {access === undefined && <p className="sub">読み込み中…</p>}
      {access === null && <p className="sub">この山のアクセス情報はありません（主要な山のみ）。</p>}

      {access && access.trailheads.length > 0 && (
        <ul className="access-list">
          {access.trailheads.map((t) => (
            <li key={`${t.lat},${t.lon}`}>
              <div className="access-title">
                🚩 <a href={mapUrl(t)} target="_blank" rel="noopener noreferrer">{t.name}</a>
                <span className="sub">（山頂から約{t.kmFromSummit}km）</span>
              </div>
              {t.station && (
                <div className="access-sub">
                  🚉 最寄り駅：<StationName station={t.station} />（登山口から約{t.station.km}km）
                  <a href={transitUrl(t.station, t)} target="_blank" rel="noopener noreferrer">
                    駅からの経路
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {access && access.trailheads.length === 0 && (
        <>
          <p className="note">登山口の位置は登録されていません。山頂からの最寄り駅を表示しています。</p>
          <ul className="access-list">
            {access.stations.map((s) => (
              <li key={`${s.lat},${s.lon}`}>
                <div className="access-title">
                  🚉 <StationName station={s} />
                  <span className="sub">（山頂から約{s.km}km）</span>
                </div>
                <div className="access-sub">
                  <a href={transitUrl(s, mountain)} target="_blank" rel="noopener noreferrer">
                    駅から山の方面への経路
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {access && (
        <>
          <h4 className="access-heading">🅿️ 駐車場</h4>
          {access.parkings.length === 0 ? (
            <p className="sub">近くの駐車場は登録されていません。</p>
          ) : (
            <ul className="access-list">
              {access.parkings.map((p) => (
                <ParkingItem key={`${p.lat},${p.lon}`} parking={p} hasTrailhead={access.trailheads.length > 0} />
              ))}
            </ul>
          )}
        </>
      )}

      <ul className="link-list">
        <li>
          <a href={searchUrl} target="_blank" rel="noopener noreferrer">
            Google マップで「登山口・駐車場」を探す
          </a>
        </li>
      </ul>
      <p className="note">
        OpenStreetMap に登録されている情報で、距離は直線距離です。登録のない登山口・駐車場もあるので、出発前に確認してください。
      </p>
    </section>
  )
}

function StationName({ station }: { station: Station }) {
  return (
    <a href={mapUrl(station)} target="_blank" rel="noopener noreferrer">
      {station.name}
      {station.operator && <span className="sub">（{station.operator}）</span>}
    </a>
  )
}

function ParkingItem({ parking: p, hasTrailhead }: { parking: Parking; hasTrailhead: boolean }) {
  const details = [
    p.capacity && `約${p.capacity}台`,
    p.fee === 'no' ? '無料' : p.fee === 'yes' ? '有料' : '',
  ].filter(Boolean)
  return (
    <li>
      <div className="access-title">
        <a href={mapUrl(p)} target="_blank" rel="noopener noreferrer">
          {p.name || '名前のない駐車場'}
        </a>
        <span className="sub">
          （{hasTrailhead ? '登山口' : '山頂'}から約{p.km}km{details.length ? `・${details.join('・')}` : ''}）
        </span>
      </div>
    </li>
  )
}
