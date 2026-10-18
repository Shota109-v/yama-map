import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** 電波がないときに出す帯 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine)
  if (online) return null
  return (
    <div className="offline-banner" role="status">
      オフラインです。前に見た地図・天気・データを表示しています。
    </div>
  )
}
