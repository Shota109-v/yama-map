import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { PhotoThumb } from '../components/PhotoThumb'
import {
  db,
  refToMountain,
  toMountainRef,
  type ClimbRecord,
  type MountainRef,
  type ObservedKoyo,
  type Photo,
} from '../data/db'
import { formatEle } from '../data/mountains'
import { deleteRecord, saveRecord } from '../data/records'
import { toDateKey } from '../logic/date'
import { KOYO_LABELS } from '../logic/koyo'
import { SearchPanel } from '../map/SearchPanel'

const KOYO_OPTIONS: (ObservedKoyo | null)[] = [null, 'before', 'starting', 'peak', 'past']

export type EditorRequest = { record?: ClimbRecord; mountain?: MountainRef }

type Props = EditorRequest & { onClose: () => void }

/** 登山記録を書く・直す画面（画面全体に重ねて表示） */
export function RecordEditor({ record, mountain: initialMountain, onClose }: Props) {
  const [mountain, setMountain] = useState<MountainRef | null>(record?.mountain ?? initialMountain ?? null)
  const [picking, setPicking] = useState(!mountain)
  const [date, setDate] = useState(() => record?.date ?? toDateKey(new Date()))
  const [memo, setMemo] = useState(record?.memo ?? '')
  const [koyo, setKoyo] = useState<ObservedKoyo | null>(record?.koyo ?? null)
  const [keepPhotoIds, setKeepPhotoIds] = useState<string[]>(record?.photoIds ?? [])
  const [newPhotos, setNewPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingPhotos = useLiveQuery(async (): Promise<Photo[]> => {
    if (!record) return []
    return (await db.photos.bulkGet(record.photoIds)).filter((p): p is Photo => p !== undefined)
  }, [record])

  // 端末の「戻る」操作の代わりに Esc でも閉じられるようにする（PC 用）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (picking) {
    return (
      <SearchPanel
        onSelect={(m) => {
          setMountain(toMountainRef(m))
          setPicking(false)
        }}
        onClose={() => (mountain ? setPicking(false) : onClose())}
      />
    )
  }

  const save = async () => {
    if (!mountain) return
    setSaving(true)
    setError(null)
    try {
      await saveRecord({ id: record?.id, mountain, date, memo, koyo, keepPhotoIds, newPhotos })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!record || !window.confirm('この記録を削除しますか？（写真も削除されます）')) return
    await deleteRecord(record.id)
    onClose()
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <button type="button" className="text-button" onClick={onClose}>
          キャンセル
        </button>
        <strong>{record ? '記録を直す' : '記録する'}</strong>
        <button type="button" className="text-button editor-save" onClick={save} disabled={saving || !mountain}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      <div className="editor-body">
        <label className="field">
          <span className="field-label">山</span>
          <button type="button" className="field-mountain" onClick={() => setPicking(true)}>
            {mountain && (
              <>
                <span className="result-name">
                  {mountain.name}
                  <MountainBadge mountain={refToMountain(mountain)} />
                </span>
                <span className="result-meta">
                  {mountain.pref}・{formatEle(mountain.ele)}（タップで変更）
                </span>
              </>
            )}
          </button>
        </label>

        <label className="field">
          <span className="field-label">登った日</span>
          <input type="date" className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="field">
          <span className="field-label">紅葉の様子</span>
          <div className="chips chips-wrap">
            {KOYO_OPTIONS.map((k) => (
              <button
                key={k ?? 'none'}
                type="button"
                className="chip"
                aria-selected={koyo === k}
                onClick={() => setKoyo(k)}
              >
                {k ? KOYO_LABELS[k] : '記録しない'}
              </button>
            ))}
          </div>
          <span className="note">記録した様子は、紅葉の推定の精度を確かめるのにも使えます。</span>
        </div>

        <label className="field">
          <span className="field-label">メモ</span>
          <textarea
            className="search-input"
            rows={5}
            value={memo}
            placeholder="ルート、天気、気づいたことなど"
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">写真</span>
          <div className="photo-grid">
            {existingPhotos
              ?.filter((p) => keepPhotoIds.includes(p.id))
              .map((p) => (
                <div key={p.id} className="photo-cell">
                  <PhotoThumb blob={p.thumb} />
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label="写真を外す"
                    onClick={() => setKeepPhotoIds((ids) => ids.filter((id) => id !== p.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            {newPhotos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="photo-cell">
                <PhotoThumb blob={f} />
                <button
                  type="button"
                  className="photo-remove"
                  aria-label="写真を外す"
                  onClick={() => setNewPhotos((ps) => ps.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <label className="photo-add">
              ＋
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  setNewPhotos((ps) => [...ps, ...files])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        {error && <p className="warn">{error}</p>}

        {record && (
          <button type="button" className="danger-button" onClick={remove}>
            この記録を削除する
          </button>
        )}
      </div>
    </div>
  )
}
