export type LatLon = { lat: number; lon: number }

/** 2点間の直線距離（km） */
export function distanceKm(a: LatLon, b: LatLon): number {
  const r = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km).toLocaleString()}km`
}

/** 現在地を1回だけ取る */
export function getCurrentPosition(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('この端末では現在地を使えません'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? '現在地の利用が許可されていません（iPhone の設定 → プライバシー → 位置情報サービスで許可してください）'
              : '現在地を取得できませんでした',
          ),
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    )
  })
}
