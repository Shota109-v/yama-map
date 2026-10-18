import { formatDateShort } from '../logic/date'
import { CLIMBED_COLOR, HIGHLIGHT_COLOR } from './mountainLayers'

type Props = { date: string; generatedAt: string | null; onClose: () => void }

/** 地図の点の見方 */
export function Legend({ date, generatedAt, onClose }: Props) {
  return (
    <div className="legend" role="dialog" aria-label="凡例">
      <div className="legend-header">
        <strong>地図の見方</strong>
        <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <ul>
        <li>
          <Dot color="#d64545" size={14} /> 日本百名山
        </li>
        <li>
          <Dot color="#2f8f5b" size={12} /> 日本二百・三百名山
        </li>
        <li>
          <Dot color="#7a8580" size={10} /> その他の山
        </li>
        <li>
          <Dot color={CLIMBED_COLOR} size={12} /> 登頂済み（記録した山。大きさは上のグループのまま）
        </li>
        <li>
          <span className="legend-ring" style={{ borderColor: HIGHLIGHT_COLOR }}>
            <Dot color="#d64545" size={10} />
          </span>
          おすすめ（天気が悪くなく、紅葉が見頃）
        </li>
        <li>
          <Dot color="#d64545" size={12} faded /> 天気が悪い
        </li>
      </ul>
      <p className="note">
        {formatDateShort(date)}の予報で判定しています。拡大するほど表示する山が増えます。
        {generatedAt && (
          <>
            <br />
            おすすめの計算：
            {new Date(generatedAt).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </>
        )}
        {!generatedAt && (
          <>
            <br />
            おすすめのデータがまだありません（毎朝4時ごろに更新されます）。
          </>
        )}
      </p>
    </div>
  )
}

function Dot({ color, size, faded }: { color: string; size: number; faded?: boolean }) {
  return (
    <span
      className="legend-dot"
      style={{ width: size, height: size, background: color, opacity: faded ? 0.3 : 1 }}
    />
  )
}
