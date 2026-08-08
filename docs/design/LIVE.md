# SPEC-LIVE — ファイル監視とライブ更新（詳細設計書）

担当 Issue: #8。人間向けの基本仕様書は [docs/spec/LIVE.md](../spec/LIVE.md)。

## 実装方針

`chokidar` で `logDir` 配下の `*.jsonl` を監視 → 変更検知 → SPEC-CORE の増分解析（`buildIndex` の incremental 戦略）→ **SSE（Server-Sent Events）** で差分を push → クライアントは開いているセッションだけを更新する。

伝送方式は Issue 本文の WebSocket から SSE へ変更した（要件合意時の決定・Issue #8 コメント参照）。片方向 push のみなので双方向接続は不要で、SSE なら通常の Express ルートとして実装でき（apiDrift 突き合わせに乗る）、再接続と追い付きをブラウザ標準 `EventSource` の自動再接続 + `Last-Event-ID` で賄える。

### 構成

```
server/
  live.ts           # LiveHub: 購読管理・デバウンス・差分計算・chokidar 監視（transport 非依存）
  routes/live.ts    # GET /api/live（SSE の書式化と接続ライフサイクルだけの薄い層）
web/src/lib/
  live.ts           # EventSource ラッパ（接続状態・append / reset のコールバック）
web/src/views/SessionView.tsx   # 統合（末尾追記・ヘッダ更新・ライブ状態表示）
```

### サーバ（LiveHub）

- `createLiveHub({ logDir, cacheDir, loadTable })` で生成し、`AppOptions.hub` として `createApp` へ注入する（省略時は createApp が内部生成）。テストは自前で生成して `close()` で chokidar を確実に破棄する
- **監視**: chokidar は `logDir` を `ignoreInitial: true` で監視し、`add` / `change` の `*.jsonl` のみ扱う。新規ファイルも自動で対象に入る。watcher は最初の購読者が現れたときに開始する（購読者ゼロの間はファイル変更があっても何もしないため、挙動は常時監視と等価）
- **セッション対応付け**: sessionId はファイル名から拡張子を除いたもの（store.ts と同じ規約）。変更されたファイルのセッションに購読者がいなければ**解析せずに捨てる**（開いていない画面のために重い解析をしない）
- **デバウンス**: 同一ファイルの連続イベントは約 150ms まとめて 1 回の解析・配信にする
- **差分計算**: `buildIndex()`（キャッシュ経由の増分解析）で最新レコード列を取得し、購読者ごとの既知件数 `have` より後ろ `records.slice(have)` を配信する。`records.length < have`（縮小→全再構築）なら `reset` を配信する
- **耐障害**: 解析・読み取りの例外は捕捉してその回の配信をスキップし、監視と接続は維持する。watcher の `error` イベントも同様に無視して継続する

### SSE プロトコル（GET /api/live）

- クエリ: `session`（必須・セッション id）、`have`（クライアントが保持済みのレコード件数。省略時 0）
- 存在しない session id は SSE を開始する前に 404 を返す
- レスポンスは `Content-Type: text/event-stream`。接続直後、`have` より新しいレコードがあれば即座に追い付き分を配信する
- イベント `id:` には配信後の総レコード件数を入れる。EventSource の自動再接続が送る `Last-Event-ID` ヘッダを `have` クエリより優先し、切断中の取りこぼしを再接続時に追い付き配信する
- 約 25 秒間隔でコメント行（`: ping`）を書き、プロキシ等のアイドル切断を防ぐ

| イベント | data | 意味 |
|---|---|---|
| `append` | `{ start, messages, summary, cost }` | `start` 番目以降に `messages` を追記。`summary` / `cost` は更新後の全量 |
| `reset` | `{}` | 全再構築が起きた。クライアントはセッション詳細を取得し直す |

`messages` の要素は `GET /api/sessions/:id` の `messages` と同形（`{ index, ...IndexRecord, cost? }`。assistant にはメッセージ単位の推定コスト付き）。`summary` / `cost` も同エンドポイントの同名フィールドと同形とし、クライアントに差分適用ロジック以外の新しい型を持ち込まない。

### クライアント

- `web/src/lib/live.ts`: `openLive({ sessionId, have, onAppend, onReset, onStatus, eventSourceCtor? })`。`eventSourceCtor` はテストで差し替えるためのコンストラクタ注入（jsdom に EventSource が無いため）。`onStatus` は `'connected' | 'disconnected'` を通知する。再接続は EventSource 標準に任せ、自前のリトライは実装しない
- `SessionView`: 詳細取得後に接続し、`append` で `detail.messages` へ追記・`summary` / `cost` を差し替える。`reset` で `api.session()` を取得し直す。切替・アンマウント時は接続を閉じる
- `bodystore`: 総件数が増えたとき、取得済みの完全ページは保持し、**末尾の部分ページだけをキャッシュから落として**再取得できるようにする（`grow(newTotal)` を追加）
- ライブ状態はヘッダのバッジで表示する（接続中 / 切断）

### 依存の追加

`chokidar` を dependencies に追加する。`ws` は使わない。

## 実測（Issue #8 時点・進行中の実セッションで確認）

| 指標 | 値 |
|---|---|
| 対象 | 進行中セッション 約 1.0 MB・287 レコード時点 |
| 接続時の追い付き配信（have=285） | 即時（`start: 285` の append・id 287） |
| 追記検知 → append 到着 | 数秒以内に id 287 → 289 → 292 と連鎖（start にギャップ・重複なし） |
| 画面反映（リロードなし） | ヘッダが 20.7M → 21.7M tok、$38.57 → $39.72 に自動追従。「● ライブ」バッジ点灯 |

## 受け入れ基準

### 監視と増分解析（server/live.ts）

- [x] `SPEC-LIVE-001` JSONL への追記を検知し、増分解析で追記分のレコードだけを配信する
- [x] `SPEC-LIVE-002` 監視開始後に新しく作成された JSONL ファイルも自動で監視対象に入る
- [x] `SPEC-LIVE-003` 監視対象の解析でエラーが起きても落ちず、以後の変更検知を継続する
- [x] `SPEC-LIVE-004` 同一ファイルへの短時間の連続追記は 1 回の解析・配信にまとめる
- [x] `SPEC-LIVE-005` 購読者がいないセッションのファイル変更では解析を行わない

### SSE 配信（GET /api/live）

- [x] `SPEC-LIVE-010` GET /api/live は text/event-stream で応答し、session で指定したセッションの変更だけを配信する
- [x] `SPEC-LIVE-011` append イベントは追加メッセージ（メッセージ単位コスト付き）と更新後の summary / cost を含み、id は総レコード件数になる
- [x] `SPEC-LIVE-012` 接続時に have より新しいレコードがあれば直ちに追い付き分を配信する
- [x] `SPEC-LIVE-013` Last-Event-ID ヘッダは have クエリより優先され、再接続時の追い付き起点になる
- [x] `SPEC-LIVE-014` 全再構築でレコード件数が減ったら reset イベントを配信する
- [x] `SPEC-LIVE-015` 存在しない session id には SSE を開始せず 404 と JSON エラーを返す
- [x] `SPEC-LIVE-016` クライアントの切断で購読が解除され、以後の変更が残った接続にだけ配信される

### クライアント（web/src/lib/live.ts・SessionView）

- [x] `SPEC-LIVE-020` append イベントで会話の末尾に新しいメッセージ行が追加される
- [x] `SPEC-LIVE-021` append イベントでヘッダの総トークン・推定コストが更新される
- [x] `SPEC-LIVE-022` ライブ状態（接続中 / 切断）が表示され、接続の開閉に追従する
- [x] `SPEC-LIVE-023` reset イベントでセッション詳細を取得し直す
- [x] `SPEC-LIVE-024` 総件数が増えたとき取得済みの完全ページは保持し、末尾の部分ページだけ再取得する

### E2E（Issue #10・tests/e2e）

- [x] `SPEC-LIVE-030` セッション分析画面を開いた状態で JSONL に追記すると、リロードなしで新しいメッセージが会話の末尾に現れる
- [x] `SPEC-LIVE-031` 追記に合わせてヘッダの総トークンが増える
- [x] `SPEC-LIVE-032` 別セッションを開いた状態では、他セッションへの追記で表示中の会話が変わらない
