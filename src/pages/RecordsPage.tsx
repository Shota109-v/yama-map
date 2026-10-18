import { useEffect, useState } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { PhotoThumb } from '../components/PhotoThumb'
import { backupIsDue } from '../data/backup'
import { db, refToMountain, type ClimbRecord } from '../data/db'
import { formatEle, loadMajorMountains, type FamousRank, type Mountain } from '../data/mountains'
import { useAllRecords, useFavorites } from '../data/useRecords'
import { useSafeLiveQuery } from '../data/useSafeLiveQuery'
import { formatDateShort } from '../logic/date'
import { KOYO_LABELS } from '../logic/koyo'


type View = 'records' | 'favorites'

type Props = {
  onNewRecord: () => void
  onEditRecord: (record: ClimbRecord) => void
  onShowOnMap: (mountain: Mountain) => void
  onOpenSettings: () => void
}

export function RecordsPage({ onNewRecord, onEditRecord, onShowOnMap, onOpenSettings }: Props) {
  const [view, setView] = useState<View>('records')
  const records = useAllRecords()
  const favorites = useFavorites()
  const [currentRanks, setCurrentRanks] = useState<Map<string, FamousRank> | null>(null)

  useEffect(() => {
    loadMajorMountains().then((c) => {
      const ranks = new Map<string, FamousRank>()
      for (const f of c.features) if (f.properties.rank) ranks.set(f.properties.id, f.properties.rank)
      setCurrentRanks(ranks)
    })
  }, [])

  const climbed = new Map<string, ClimbRecord['mountain']>()
  for (const r of records ?? []) climbed.set(r.mountainId, r.mountain)
  // 記録には登録したときの山の情報が残っているので、名山かどうかは今の山のデータで判定する
  const rankOf = (id: string) => currentRanks?.get(id) ?? climbed.get(id)?.rank
  const climbedHyaku = [...climbed.keys()].filter((id) => rankOf(id) === 1).length
  const climbedSanbyaku = [...climbed.keys()].filter((id) => rankOf(id) !== undefined).length

  return (
    <section className="page">
      <div className="page-title-row">
        <h1>記録</h1>
        <button type="button" className="add-button" onClick={onNewRecord} aria-label="記録を追加">
          ＋ 記録する
        </button>
      </div>

      <div className="stats">
        <div>
          <strong>{climbed.size}</strong>
          <span>登った山</span>
        </div>
        <div>
          <strong>
            {climbedHyaku}
            <small>/100</small>
          </strong>
          <span>百名山</span>
        </div>
        <div>
          <strong>
            {climbedSanbyaku}
            <small>/300</small>
          </strong>
          <span>三百名山</span>
        </div>
      </div>

      {records && backupIsDue(records.length) && (
        <button type="button" className="backup-reminder" onClick={onOpenSettings}>
          しばらく書き出していません。記録が消えたときのために、設定画面からバックアップしてください。
        </button>
      )}

      <div className="chips" role="tablist">
        <button type="button" role="tab" className="chip" aria-selected={view === 'records'} onClick={() => setView('records')}>
          記録 {records?.length ?? 0}
        </button>
        <button
          type="button"
          role="tab"
          className="chip"
          aria-selected={view === 'favorites'}
          onClick={() => setView('favorites')}
        >
          ☆ お気に入り {favorites?.length ?? 0}
        </button>
      </div>

      {view === 'records' && (
        <ul className="recommend-list">
          {records?.length === 0 && <p className="sub">「＋ 記録する」か、山の詳細の「記録する」から書けます。</p>}
          {records?.map((r) => (
            <li key={r.id}>
              <button type="button" className="result record-row" onClick={() => onEditRecord(r)}>
                <RecordThumb record={r} />
                <span className="recommend-main">
                  <span className="result-name">
                    {r.mountain.name}
                    <MountainBadge mountain={refToMountain(r.mountain)} />
                  </span>
                  <span className="result-meta">
                    {r.date.slice(0, 4)}年{formatDateShort(r.date)}・{r.mountain.pref}
                  </span>
                  {r.memo && <span className="result-meta">{r.memo.split('\n')[0]}</span>}
                </span>
                {r.koyo && <span className={`koyo-tag koyo-${r.koyo}`}>{KOYO_LABELS[r.koyo]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === 'favorites' && (
        <ul className="recommend-list">
          {favorites?.length === 0 && <p className="sub">山の詳細の☆でお気に入りに追加できます。</p>}
          {favorites?.map((f) => (
            <li key={f.mountainId}>
              <button type="button" className="result recommend-row" onClick={() => onShowOnMap(refToMountain(f.mountain))}>
                <span className="recommend-main">
                  <span className="result-name">
                    {f.mountain.name}
                    <MountainBadge mountain={refToMountain(f.mountain)} />
                    {climbed.has(f.mountainId) && <span className="badge badge-climbed">登頂済み</span>}
                  </span>
                  <span className="result-meta">
                    {f.mountain.pref}・{formatEle(f.mountain.ele)}
                  </span>
                </span>
                <span className="sub">地図で見る ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecordThumb({ record }: { record: ClimbRecord }) {
  const firstId = record.photoIds[0]
  const photo = useSafeLiveQuery(async () => (firstId ? db.photos.get(firstId) : undefined), [firstId], undefined)
  if (!photo) return <span className="record-thumb record-thumb-empty">⛰</span>
  return <PhotoThumb blob={photo.thumb} className="record-thumb" />
}
