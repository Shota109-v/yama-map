import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { PhotoThumb } from '../components/PhotoThumb'
import { backupIsDue } from '../data/backup'
import { db, refToMountain, type ClimbRecord } from '../data/db'
import { formatEle, type Mountain } from '../data/mountains'
import { formatDateShort } from '../logic/date'
import { KOYO_LABELS } from '../logic/koyo'

/** 名山の数（データの件数。百名山は 100、二百・三百名山は Wikidata に載っている分） */
const FAMOUS_TOTAL = { 1: 100, 2: 196 }

type View = 'records' | 'favorites'

type Props = {
  onNewRecord: () => void
  onEditRecord: (record: ClimbRecord) => void
  onShowOnMap: (mountain: Mountain) => void
  onOpenSettings: () => void
}

export function RecordsPage({ onNewRecord, onEditRecord, onShowOnMap, onOpenSettings }: Props) {
  const [view, setView] = useState<View>('records')
  const records = useLiveQuery(() => db.records.orderBy('date').reverse().toArray(), [])
  const favorites = useLiveQuery(() => db.favorites.orderBy('addedAt').reverse().toArray(), [])

  const climbed = new Map<string, ClimbRecord['mountain']>()
  for (const r of records ?? []) climbed.set(r.mountainId, r.mountain)
  const countRank = (rank: 1 | 2) => [...climbed.values()].filter((m) => m.rank === rank).length

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
            {countRank(1)}
            <small>/{FAMOUS_TOTAL[1]}</small>
          </strong>
          <span>百名山</span>
        </div>
        <div>
          <strong>
            {countRank(2)}
            <small>/{FAMOUS_TOTAL[2]}</small>
          </strong>
          <span>二百・三百名山</span>
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
  const photo = useLiveQuery(async () => (firstId ? db.photos.get(firstId) : undefined), [firstId])
  if (!photo) return <span className="record-thumb record-thumb-empty">⛰</span>
  return <PhotoThumb blob={photo.thumb} className="record-thumb" />
}
