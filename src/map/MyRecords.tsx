import { useLiveQuery } from 'dexie-react-hooks'
import { db, toMountainRef, type ClimbRecord } from '../data/db'
import type { Mountain } from '../data/mountains'
import { toggleFavorite } from '../data/records'
import { formatDateShort } from '../logic/date'
import { KOYO_LABELS } from '../logic/koyo'

/** お気に入りの☆ボタン */
export function FavoriteButton({ mountain }: { mountain: Mountain }) {
  const isFavorite = useLiveQuery(async () => !!(await db.favorites.get(mountain.id)), [mountain.id])
  return (
    <button
      type="button"
      className={`icon-button favorite-button${isFavorite ? ' is-on' : ''}`}
      aria-label={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加'}
      aria-pressed={!!isFavorite}
      onClick={() => toggleFavorite(toMountainRef(mountain))}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  )
}

type Props = {
  mountain: Mountain
  records: ClimbRecord[]
  onRecord: () => void
  onEditRecord: (record: ClimbRecord) => void
}

/** 詳細パネルの「自分の記録」 */
export function MyRecordsSection({ records, onRecord, onEditRecord }: Props) {
  return (
    <section>
      <h3>自分の記録</h3>
      {records.length === 0 && <p className="sub">まだ記録はありません。</p>}
      {records.length > 0 && (
        <ul className="link-list">
          {records.map((r) => (
            <li key={r.id}>
              <button type="button" className="result" onClick={() => onEditRecord(r)}>
                <span className="result-name">
                  {formatDateShort(r.date)} {r.date.slice(0, 4)}年
                  {r.koyo && <span className={`koyo-tag koyo-${r.koyo} inline-tag`}>紅葉 {KOYO_LABELS[r.koyo]}</span>}
                </span>
                {r.memo && <span className="result-meta">{r.memo.split('\n')[0]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="research-button secondary-button" onClick={onRecord}>
        ✎ 記録する
      </button>
    </section>
  )
}
