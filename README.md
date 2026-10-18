# 山マップ

天気と季節の見どころから「今行くべき山」がわかる、自分用の登山マップ（PWA）。
公開先：https://shota109-v.github.io/yama-map/ （iPhone の Safari で開き、ホーム画面に追加して使う）

要件は [要件定義.md](要件定義.md) を参照。

## できること

- **地図**：地理院地図に国内の山を表示。拡大するほど百名山（赤）→ 二百・三百名山（緑）→ その他（灰色）と増える。登頂済みは青
- **おすすめ**：日付と見どころ（紅葉・雪山・雲海・霧氷・新緑・高山植物）を選ぶと、天気が悪い山は薄く、見どころが見頃の山はオレンジの輪で表示。一覧タブでおすすめ順に見られる
- **山の詳細**：7日間の天気、見どころの推定、高さごとの紅葉、積雪、SNS・山行記録サイトへの検索リンク、AI による最新情報の調査
- **記録**：登った山・日付・メモ・写真・紅葉の様子。お気に入り。JSON で書き出し・読み込み

## 開発

```bash
npm install
npm run dev
```

主なフォルダ：

| 場所 | 内容 |
|---|---|
| `src/logic/` | 天気の集計・見どころの推定・おすすめ度の計算。アプリと定期計算で共通 |
| `src/data/` | データの読み込み、端末内の保存（IndexedDB） |
| `src/map/` | 地図と山の詳細パネル |
| `src/pages/` | おすすめ・記録・設定の画面 |
| `scripts/` | データを作るスクリプト |

## データ

| ファイル | 作り方 | 更新 |
|---|---|---|
| `public/data/mountains-*.geojson` | `python scripts/build_mountains.py`（国土地理院・OpenStreetMap・Wikidata から作る） | 山のデータを直したいときに手元で実行してコミット |
| `public/data/recommendations.json` | `npx tsx scripts/build-recommendations.ts`（主要な約1,000山の7日分のおすすめ度。約15分） | GitHub Actions が毎朝4時に作る（コミットしない） |

`build-recommendations.ts` は Open-Meteo の1日の無料枠の半分ほどを使うので、何度も実行しないこと。

## 公開

`main` ブランチに push すると、GitHub Actions が GitHub Pages に公開する（`.github/workflows/deploy.yml`）。

- push のとき：おすすめデータは計算せず、公開中のものを使い回す
- 毎朝4時（日本時間）：おすすめデータを計算して公開し直す
- すぐ計算したいとき：GitHub の Actions →「Deploy to GitHub Pages」→「Run workflow」

## 「最新情報を調べる」（AI）

Claude API の Web 検索を使う。API キーはアプリの設定画面で入力し、端末の中（localStorage）にだけ保存する。
1回あたり約20〜40円かかるので、Claude Console で利用額の上限を設定しておく。
