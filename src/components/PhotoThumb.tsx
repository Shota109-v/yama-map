import { useEffect, useRef } from 'react'

/** Blob（端末に保存した写真）を画像として表示する */
export function PhotoThumb({ blob, alt = '', className }: { blob: Blob; alt?: string; className?: string }) {
  const imgRef = useRef<HTMLImageElement>(null)
  // 表示用の URL は表示している間だけ作り、外したら解放する
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    if (imgRef.current) imgRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img ref={imgRef} alt={alt} className={className} />
}
