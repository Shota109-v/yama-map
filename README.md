# 山マップ

天気と季節の見どころから「今行くべき山」がわかる、自分用の登山マップ（PWA）。
要件は [要件定義.md](要件定義.md) を参照。

## 開発

```bash
npm install
npm run dev
```

`main` ブランチに push すると、GitHub Actions が GitHub Pages に公開する（`.github/workflows/deploy.yml`）。
