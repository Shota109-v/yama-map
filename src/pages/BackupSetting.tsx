import { useState } from 'react'
import { BACKUP_REMIND_DAYS, exportBackup, importBackup, lastExportAt, markExported } from '../data/backup'

/** 登山記録・お気に入りの書き出しと読み込み */
export function BackupSetting() {
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastAt, setLastAt] = useState(() => lastExportAt())

  const doExport = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const { blob, filename } = await exportBackup(includePhotos)
      const file = new File([blob], filename, { type: 'application/json' })
      // iPhone では共有シートから「ファイルに保存」で iCloud Drive などに保存できる
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename })
        } catch (e) {
          // 共有シートを閉じただけなら、書き出したことにしない
          if ((e as Error).name === 'AbortError') return
          throw e
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
      markExported()
      setLastAt(lastExportAt())
      setMessage(`書き出しました（${(blob.size / 1024 / 1024).toFixed(1)}MB）`)
    } catch (e) {
      setMessage(`書き出せませんでした：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const r = await importBackup(file)
      setMessage(
        `読み込みました：記録 ${r.records}件・お気に入り ${r.favorites}件・写真 ${r.photos}枚` +
          (r.skipped ? `（手元の方が新しい記録 ${r.skipped}件はそのまま）` : '') +
          (r.invalid ? `。形が正しくないデータ ${r.invalid}件は読み飛ばしました` : ''),
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backup">
      <p className="sub">
        最後に書き出した日：
        {lastAt ? new Date(lastAt).toLocaleDateString('ja-JP') : 'まだ書き出していません'}
      </p>
      <label className="check">
        <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
        写真も含める（ファイルが大きくなります）
      </label>
      <div className="backup-buttons">
        <button type="button" className="research-button" onClick={doExport} disabled={busy}>
          書き出す
        </button>
        <label className={`research-button secondary-button${busy ? ' is-disabled' : ''}`}>
          読み込む
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={busy}
            onChange={(e) => {
              doImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {message && <p className="sub">{message}</p>}
      <p className="note">
        登山記録とお気に入りは、この端末のブラウザの中にだけ保存されています。機種変更や万一データが消えたときのために、
        {BACKUP_REMIND_DAYS}日に1回くらい書き出して、iCloud Drive などに保存しておいてください。
        読み込むと、同じ記録は新しい方が残ります。
      </p>
    </div>
  )
}
