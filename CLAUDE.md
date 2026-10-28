# 皿洗いゲーム — 開発メモ

情報表現基礎III「遊びのデザイン」のグループワーク課題。デザインコースのチームで、コードを書くのは1人だけ。
別のPCで clone しても、ここを読めば続きから開発できるようにしておく。

## ゲームの仕様（2026/10/21 版）

- 2人1組のチームが2つ。5枚の皿の汚れを落とし切るまでのタイムを競う
- 汚れは5枚それぞれ難易度が違う。汚れのパターンは2チームで同じ。皿が出てくる順番はランダム
- **指示役**：スマホで全部の皿の状態と順番を見られる。実行役に指示を出す
- **実行役**：頭・両手・両足にマーカーを付ける。今洗っている皿しか見えない。指示役の指示どおりに体を使う
- 1枚の皿に使える体の部位は1つだけで、システムがランダムに決めて指示役に伝える
- 使ったスポンジは汚れて再利用できない → **部位は5枚の皿で重複しない**（5部位を5枚に1つずつ割り当てる）

デザイン: Figma `IeqczFMfF017XaAp2WIqsh`（https://www.figma.com/design/IeqczFMfF017XaAp2WIqsh ）
- `9:4` タイトル画面（皿をきれいにするとゲームスタート）
- `19:2` / `28:70` ゲーム背景（シンク）
- `3:4` 指示役スマホ「皿一覧」
- `18:67` 素材置き場（皿5色・汚れ・シンクの画像）
- `28:120` スコアボード（まだ中身なし）

## 決まったこと

| 項目 | 決定 | 理由 |
|---|---|---|
| センサー | 体の先端にビビッドな色のアイテムを付け、Webカメラで色を追う | 皿の「どこを」拭いているかが位置で分かる。骨格推定より軽い |
| 対戦形式 | 1チームずつ順番に遊ぶ | プロジェクターもカメラも1台で済む |
| 会場 | インターネットあり → クラウドに置く | |
| フロント | Vite + React + TypeScript（ルーターなし） | 画面が3つだけ。SSR も SEO もいらない |
| 描画 | Canvas 2D | 汚れはマスクを `destination-out` で削るだけで作れる |
| バックエンド | Cloudflare Workers + Durable Objects（PartyServer） | 無料で使える。`*.onnenai.cc` のドメインもある。WebSocket と相性がいい |
| DB | 今はなし。試合結果は DO のストレージに置く | 歴代ランキングが欲しくなったら D1 を足す |
| リポジトリ | pnpm のパッケージ1つ（ワークスペースに分けない） | `@cloudflare/vite-plugin` でフロントと Worker を1つにまとめられる |

カメラ映像の処理は**プロジェクター用PCのブラウザの中だけ**で行う。サーバーには映像を送らず、汚れの残りだけを送る。

## 構成

```
src/
├─ shared/game.ts   # ルール・型・メッセージ。フロントと Worker の両方から import する
├─ worker/index.ts  # GameRoom（Durable Object）: 1ルーム = 1試合
└─ client/
   ├─ main.tsx      # パスで画面を出し分ける（/, /screen/:room, /director/:room）
   ├─ Home.tsx      # ルームを作る / コードを入れて指示役で参加
   ├─ Screen.tsx    # プロジェクター用のプレイ画面
   ├─ Director.tsx  # 指示役スマホの「皿一覧」
   ├─ DishCanvas.tsx   # 汚れを消せる皿（今はポインターで消す）
   ├─ DishPreview.tsx  # 指示役用の皿サムネイル
   ├─ SpongeTray.tsx   # プレイ画面下のスポンジ5色（使い終わった色は暗くなる）
   ├─ draw.ts       # 皿と汚れの描画
   └─ useRoom.ts    # WebSocket 接続・サーバーとの時計合わせ・タイマー
```

### 状態の流れ

- サーバー（`GameRoom`）が `RoomState` を持っていて、何か変わるたびに `{ type: "state", state, now }` を全員に配る
- プレイ画面が送るもの: `start` / `progress`（今の皿の汚れの残り。200ms ごと）/ `cleared` / `next`（同じ汚れで次のチームへ）/ `reset`（汚れを作り直す）
- 指示役画面は表示するだけで、何も送らない
- `seed` は `reset` するまで変わらない。汚れは `createDirt(seed, kind)` で決まるので、2チームが同じ汚れで遊べる。皿の順番と部位は `start` のたびにシャッフルする
- スポンジ（`SPONGES`）= 体の部位に付けるマーカー。色と部位は固定で対応している（赤=頭、紫=右手、青=左手、緑=右足、黄=左足）
  - `color` は Figma の Frame 4（`37:2`）、`used`（使い終わった色）は Frame 5（`37:3`）、`pastel`（皿の縁取り）は `color` に白を 55% 混ぜた色
  - 1枚の皿に1色。ゲームごとにシャッフルして順番に使う。ポインターにはその色の丸が付いてくる
- 皿の `kind` は汚れの種類と難易度だけを表す。縁の色はその皿で使うスポンジのパステル色
- 汚れの量は描画した canvas のアルファ値の合計で測る。`CLEAR_THRESHOLD`（3%）を下回ったら `cleared`
- 皿の種類の番号（`kind` 0〜4）がそのまま難易度。番号が大きいほど汚れが多くて、`toughness` も高い（こすれる量が `0.5 / toughness` になる）
- タイマーはサーバーの `startedAt` / `finishedAt` と、`now` から求めた時計のずれで計算する。なので画面ごとにずれない

## コマンド

```sh
pnpm install
pnpm dev          # http://localhost:5173（Worker と DO もこれ1本で動く）
pnpm build        # tsc -b && vite build
pnpm deploy       # Cloudflare にデプロイ
pnpm cf-typegen   # wrangler.jsonc を変えたら必ず実行（worker-configuration.d.ts を作り直す）
```

ローカルでは、ブラウザのタブを2つ開いて `/screen/TEST` と `/director/TEST` で試せる。

## 注意

- このリポジトリには `pnpm-workspace.yaml` を置いてある。親ディレクトリに別の pnpm ワークスペースがあっても巻き込まれないようにするため。消さないこと
- partysocket の `party` 名は、DO のバインディング名をケバブケースにしたもの（`GameRoom` → `game-room`）。WebSocket の URL は `/parties/game-room/<room>`
- `wrangler.jsonc` の `run_worker_first: ["/parties/*"]` がないと、WebSocket のリクエストが SPA の index.html に吸われてしまう
- WSL2 の NAT 構成では、スマホの実機から開発サーバーに入れない。実機で試すならデプロイするか、`.wslconfig` で `networkingMode=mirrored` にする
- プレイ画面での動作は、まだブラウザで目視確認していない（WSL のヘッドレス Chrome に `libnspr4` が無かったため）。WebSocket の流れはスクリプトで確認済み

## 進み具合

- [x] 1. 雛形（Vite + React + Worker）
- [x] 2. ルームでつながる + マウスで汚れを消す MVP
- [x] スポンジの色（1皿1色・再利用なし・ポインターに付いてくる丸）
- [ ] GitHub に push（リポジトリの場所がまだ決まっていない。案: `usamimi39/dish-game` の private）
- [ ] Cloudflare に初デプロイ（`dish.onnenai.cc` みたいなサブドメインを付ける）
- [ ] 3. 色トラッキング `/calibrate`
  - getUserMedia → 320×180 に縮める → Web Worker で HSV に分けて5色を判別 → 色ごとに重心と面積を出す
  - マーカーをクリックして HSV の範囲を登録する。設定は localStorage に保存する
  - カメラの自動露出とホワイトバランスを固定する（`MediaStreamTrack.applyConstraints`）。面積が小さすぎるものはノイズとして捨てる
  - `DishCanvas` の pointermove を「指定された部位のマーカー位置」に置き換える。マウスで遊べるモードはデバッグ用に残す
- [ ] 4. Figma に合わせて見た目を作る（シンクの背景、皿5色、汚れの画像、フォント）
- [ ] 5. 試合の流れ：タイトル → チームA → チームB → スコアボード（2チームのタイムを比べる）
- [ ] プレイログ（皿ごとのタイム・部位）を DO に保存して JSON で書き出す（発表・レポートの材料）
- [ ] プレイ画面に指示役用の QR コードを出す
- [ ] 6. 会場リハ：本番の照明とプロジェクターの下で色を調整し直す

## まだ決めていないこと

- タイトル（Figma の「タイトル案」から選ぶ）
- 色と部位の組み合わせ（今は仮で赤=頭…黄=左足。`SPONGES` の `part` を書き換えれば変えられる）
- 部位を間違えて拭いたときのペナルティ（今はそもそも判定していない）
- 歴代ランキングを出すか（出すなら D1 を足す）
