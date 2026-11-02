# 皿洗いゲーム — 開発メモ

情報表現基礎III「遊びのデザイン」のグループワーク課題。デザインコースのチームで、コードを書くのは1人だけ。
別のPCで clone しても、ここを読めば続きから開発できるようにしておく。

## ゲームの仕様（2026/11/02 版）

- 2人1組のチームが2つ。5枚の皿の汚れを落とし切るまでのタイムを競う
- **指示役**：スマホで全部の皿の状態と順番を見られる。実行役に指示を出す
- **実行役**：頭・両手・両足にマーカーを付ける。今洗っている皿しか見えない。皿ごとに決まった部位で洗う

### プレイ前（セッティング）
- 汚れは「拡散度 3 × 中心からの距離 3」の 9 パターン。そこから 5 枚が選ばれる
- 皿の初期の向きは、システムが 90° ごとにランダムに決める
- 指示役は左右 90° 回転ボタンで 5 枚を回して、実行役が消しやすいようにセッティングする
- **使う部位もセッティングで決める**。5 色（= 5 部位）のブロックが 1 皿に 1 つずつ付いていて、指示役はブロックを並べ替えて部位を割り当てる（初期の割り当てはランダム）
  - 別の皿のところへドラッグするか、2 つ続けてタップすると入れ替わる
  - 入れ替えしかできないので、5 ターンで各部位を 1 回ずつ使うルールは自動で守られる
- 向きと部位を合わせて「この部位ならこの向きが消しやすい」を考えるのが、指示役の作戦
- セッティングは **30 秒**（`SETUP_SECONDS`。もっと短くするかも）。時間切れの時の状態で自動確定。**早く確定するボタンは無い**（間に合わないくらいがゲーム性）

### プレイ中
- プレイ画面の上には、今の皿で使う部位の色と名前だけを出す。皿の縁もその色のパステル（5 色の丸のトレイは、部位が前もって決まるので廃止した）
- 実行役はその部位で汚れを消す。その部位のマーカーでしか消えない
- 指示役は声で応援・アドバイスする（スマホでは皿ごとの汚れの残りと部位が見られる）
- 11/01 版の「プレイ中に指示役が部位を選び、プレイ画面には出さない」はやめた

### 決めたこと
- 皿（パターン・初期の向き・順番）は**チームごとにランダム**。運も楽しさのうち（10/21 版の「2チームで同じ汚れ」はやめた）
- 皿の縁は、割り当てた部位の色のパステル（練習用の皿だけ白）
- マーカーの色は、カメラと会場の明るさでかなり変わる。**色の初期値はコードに入れず、遊ぶ前に毎回 `/calibrate` で合わせる**

リポジトリ: https://github.com/usamimi39/dish-game （public）
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
   ├─ Director.tsx  # 指示役スマホ。setup では皿を回して部位のブロックを並べ替え、playing では進み具合を見る
   ├─ DishCanvas.tsx   # 汚れを消せる皿（入力はマウス / カメラ）
   ├─ DishPreview.tsx  # 指示役用の皿サムネイル
   ├─ QrCode.tsx       # URL を QR コードの SVG にする（uqr）。スタート画面の右下に指示役の URL を出す
   ├─ Calibrate.tsx    # /calibrate: カメラ映像を見ながらマーカーの色の判定範囲を合わせる
   ├─ tracking/
   │  ├─ color.ts      # HSV 変換・判定範囲の初期値（SPONGES の色から作る）・クリックした色から範囲を作る
   │  ├─ detect.ts     # 1フレームを5色に分けて、色ごとにいちばん大きい塊の重心を出す
   │  ├─ worker.ts     # detect を Web Worker で動かす
   │  ├─ tracker.ts    # カメラ → Worker → 結果の配信。露出と WB の固定
   │  ├─ settings.ts   # 判定範囲・左右反転・カメラの選択（localStorage に保存）
   │  └─ useTracker.ts
   ├─ draw.ts       # 皿と汚れの描画
   └─ useRoom.ts    # WebSocket 接続・サーバーとの時計合わせ・タイマー
```

### 状態の流れ

```
lobby →（練習の皿をきれいにする）→ setup（30秒）→（DO のアラーム）→ playing（5ターン）→ finished →（次のチームへ）→ lobby
```

- サーバー（`GameRoom`）が `RoomState` を持っていて、何か変わるたびに `{ type: "state", state, now }` を全員に配る
- プレイ画面が送るもの: `start` / `progress`（今の皿の汚れの残り。200ms ごと）/ `cleared` / `reset`（次のチームへ）
- 指示役が送るもの: `rotate`（皿を回す）/ `swap`（2 枚の皿の部位を入れ替える）。どちらも setup 中だけで、締め切りを過ぎたら無視
- 不正なメッセージはサーバーが無視する
- setup の締め切りは `ctx.storage.setAlarm` で予約していて、`onAlarm` で playing に進む。タイマーはそこから始まる
- 皿（`Dish`）= `{ spread, distance, seed, rotation, sponge }`。`sponge` は `createDishes` でランダムな並びを割り当てて、5 枚で必ず全部違う
- 汚れは `createDirt({ seed, spread, distance, rotation })` で決まる。回転 0 のとき、中心から離れた汚れは皿の上側に寄る。`rotation` は時計回りに 90° × n
  - カメラは映像の上を皿の上に当てはめているので、上の汚れは頭、下は足が届きやすい。これがセッティングの作戦になる
- スポンジ（`SPONGES`）= 体の部位に付けるマーカー。色と部位は固定で対応している（赤=頭、紫=右手、青=左手、緑=右足、黄=左足）
  - `color` は Figma の Frame 4（`37:2`）、`used`（使い終わった色）は Frame 5（`37:3`）、`pastel` は `color` に白を 55% 混ぜた色（皿の縁）
- 汚れの量は描画した canvas のアルファ値の合計で測る。`CLEAR_THRESHOLD`（3%）を下回ったら `cleared`。`toughness` は全パターン 2
- タイマーはサーバーの `startedAt` / `finishedAt` / `setupEndsAt` と、`now` から求めた時計のずれで計算する。なので画面ごとにずれない

## コマンド

```sh
pnpm install
pnpm dev          # http://localhost:5173（Worker と DO もこれ1本で動く）
pnpm build        # tsc -b && vite build
pnpm lint         # Biome で lint とフォーマットの確認（CI と同じ）
pnpm format       # Biome で直せるものを直す（import の並び替えとフォーマット）
pnpm deploy       # Cloudflare にデプロイ
pnpm cf-typegen   # wrangler.jsonc を変えたら必ず実行（worker-configuration.d.ts を作り直す）
```

ローカルでは、ブラウザのタブを2つ開いて `/screen/TEST` と `/director/TEST` で試せる。
カメラで遊ぶときは `/screen/TEST?input=camera`。色の調整は `/calibrate`（同じブラウザの別タブで変えると、プレイ画面にもすぐ反映される）。
Windows のブラウザから `localhost:5173` を開けば、Windows につないだ Web カメラがそのまま使える（`localhost` は HTTPS でなくてもカメラを使える）。

### 色トラッキング

- カメラ映像を 320×180 に縮めて Worker に送る。Worker が前のフレームを処理し終わるまで、次のフレームは送らない（1フレーム 2ms くらい）
- 各ピクセルを HSV にして、色相が `hue ± hueTolerance` の中で、彩度・明度が下限以上なら、その色と判定する。範囲が重なったら色相が近いほうを選ぶ
- 色ごとに、つながっているピクセルの塊でいちばん大きいものの重心を使う。12 ピクセル未満の塊はノイズとして捨てる
- カメラモードでは、`DishCanvas` がその皿の部位のマーカーだけを追う。練習用の皿は、どの色のマーカーでも消せる
- カメラ映像の全体を皿の全体に当てはめている（左右反転あり）。位置が一気に 30% 以上飛んだら線でつながない。ブレを抑えるために少しなめらかにしている
- 判定範囲の初期値は `SPONGES` の色から作った仮の値。遊ぶ前に毎回、本番のカメラと照明で `/calibrate` から登録し直す

## デプロイ

- **GitHub Actions**（`.github/workflows/ci.yml`）: push と PR で `pnpm lint` と `pnpm build`（型チェック込み）を回す。main への push で通ったら `pnpm run deploy` で本番に上げる
  - リポジトリの Secrets に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` が要る。無いあいだはデプロイだけ飛ばす（CI は赤くならない）
  - トークンは Cloudflare ダッシュボードの「Edit Cloudflare Workers」テンプレートで作る。Zone は `onnenai.cc` を選ぶ
- Biome の設定は `biome.json`。Markdown は対象外（CLAUDE.md の書き方を変えないため）。`noNonNullAssertion` と `useButtonType` は切っている
- 本番: **https://sponge-man.onnenai.cc**（`wrangler.jsonc` の `routes` に `custom_domain: true` で指定）
- `onnenai.cc` が同じ Cloudflare アカウントにあれば、`pnpm deploy` だけで DNS レコードと証明書も作られる。ダッシュボードで DNS を手で足す必要はない
  - 同じ名前の DNS レコードがすでにあると失敗するので、そのときは先に消す
- 初回だけ `pnpm wrangler login`（ブラウザで許可する）。ブラウザが開けない環境では、API トークンを `CLOUDFLARE_API_TOKEN` に入れる
- `pnpm deploy` は `pnpm build` のあとに `wrangler deploy` を実行する。`@cloudflare/vite-plugin` が書き出した `dist/dish_game/wrangler.json` が使われる
- Durable Objects は SQLite 版（`new_sqlite_classes`）なので、無料プランでも動く
- 確認だけなら `pnpm build && pnpm wrangler deploy --dry-run`（ログインしなくても動く）
- 色の設定は `localStorage` に入っているので、URL が変わると（localhost → 本番）`/calibrate` でやり直しになる

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
- [x] GitHub に push
- [x] 本番の設定（`sponge-man.onnenai.cc`）。`--dry-run` は通った
- [x] CI/CD（GitHub Actions: lint + build、main で自動デプロイ）
- [ ] Cloudflare に初デプロイ（Secrets を入れて main に push する。手元からなら `pnpm wrangler login` → `pnpm deploy`）
- [x] 3. 色トラッキングの土台（`/calibrate`、Worker での判定、カメラモード `?input=camera`）
- [x] セッティング（30秒で皿を回す）と、指示役が部位を選ぶルール（11/01 版の仕様）
  - WebSocket の流れと汚れ 9 パターンの見た目はスクリプトで確認済み。**ブラウザでの画面はまだ見ていない**
- [x] `/calibrate` のデバッグ機能（カーソルの下の色と判定されない理由、追加で登録、1色だけ表示、軌跡、設定のコピー／貼り付け）
- [x] 実物のマーカーを `/calibrate` で登録して、5 色を分けて追えるのを確認した（11/02）
- [x] セッティングで部位も決める（ブロックの並べ替え）。プレイ画面に部位を出し、縁をその色に（11/02 版の仕様）
  - WebSocket の流れはスクリプトで確認済み。**ドラッグの操作感はスマホの実機でまだ見ていない**
- [x] UI 調整：セッティングの1行を「番号・皿・部位ブロック・回転ボタン（角丸四角）」の横並びに。プレイ画面のトレイを廃止し、部位の表示は色と名前だけに
- [ ] カメラのどの範囲を皿に当てはめるか決める（今は映像全体。実行役の動ける範囲に合わせて、範囲を切り取る設定が要るかも）
- [ ] 4. Figma に合わせて見た目を作る（シンクの背景、皿5色、汚れの画像、フォント）
- [ ] 5. 試合の流れ：タイトル → チームA → チームB → スコアボード（2チームのタイムを比べる）
- [ ] プレイログ（皿ごとのタイム・部位）を DO に保存して JSON で書き出す（発表・レポートの材料）
- [x] スタート画面に指示役用の QR コードを出す（`location.origin` から作るので、本番では本番の URL になる）
- [ ] 6. 会場リハ：本番の照明とプロジェクターの下で色を調整し直す

## まだ決めていないこと

- タイトル（Figma の「タイトル案」から選ぶ）
- 色と部位の組み合わせ（今は仮で赤=頭…黄=左足。`SPONGES` の `part` を書き換えれば変えられる）
- セッティングの時間（今は 30 秒。もっと短くするかも）
- 汚れの量や落ちにくさのバランス（9 パターンの `SPREADS` / `DISTANCES`、`toughness`）
- 部位を間違えて拭いたときのペナルティ（今はそもそも判定していない）
- 歴代ランキングを出すか（出すなら D1 を足す）
