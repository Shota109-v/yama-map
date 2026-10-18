/**
 * 外から来た URL（AI の調査結果の情報源など）を、リンクとして安全なものだけにする。
 * javascript: などのリンクを押すとページ内でスクリプトが動いてしまうため、http(s) 以外は使わない
 */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
