import { useLiveQuery } from 'dexie-react-hooks'

/**
 * 端末内のデータベースを読む（データが変わると自動で読み直す）。
 * iPhone の WebKit では IndexedDB の読み込みが「Unable to open cursor」などで失敗することがあるため、
 * 失敗しても画面全体を止めず、fallback を返す
 */
export function useSafeLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], fallback: T): T {
  const result = useLiveQuery(async () => {
    try {
      return await querier()
    } catch (e) {
      console.error('端末内のデータを読めませんでした', e)
      return fallback
    }
  }, deps)
  return result ?? fallback
}
