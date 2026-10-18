// Claude API のキー。この端末の中（localStorage）だけに保存し、公開しているページやデータには含めない

const KEY = 'yama-map:anthropic-api-key'

export function loadApiKey(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveApiKey(value: string | null): void {
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    // 保存できない環境（プライベートブラウズなど）では毎回入力が必要になる
  }
}
