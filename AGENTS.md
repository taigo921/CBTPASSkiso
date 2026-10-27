# toGO project guide

## Project

歯科国試向けの問題演習・学習計画・模試・成績同期を提供する、認証必須の静的Webアプリ。GitHub Pagesで配信し、Firebase AuthenticationとCloud Firestoreを利用する。

技術構成はHTML/CSS/vanilla JavaScript、Service Worker、Firebase compat SDK。ビルド工程やアプリ固有バックエンドはない。

## Start here

- 作業再開・現在の優先順位: [`docs/CODEX_PROGRESS.md`](docs/CODEX_PROGRESS.md)
- 自動／手動再開時の中断点: [`CONTINUATION.md`](CONTINUATION.md)
- 機能の変更: [`docs/feature-map.md`](docs/feature-map.md)
- 画面・遷移の変更: [`docs/routes.md`](docs/routes.md)
- 全体構造・依存方向: [`docs/architecture.md`](docs/architecture.md)
- Firestore・ローカル保存・権限: [`docs/database.md`](docs/database.md)
- テスト・公開・docs更新条件: [`docs/development.md`](docs/development.md)

## Project-specific architecture rules

- 主要DomainはAccess、Question Catalog、Practice、Study Route、Analysis、Mock Exam、Progress & Sync、Gamification、Leaderboard、Administration、Delivery。責務と起点は `docs/feature-map.md` を正とする。
- 本番アプリはビルド工程のない単一ページで、画面・主要ロジックは `index.html` にある。見た目だけの整理目的で `src/` やビルドツールを導入しない。
- 既存コードでは `docs/feature-map.md` の機能境界を守る。新規コードを分離するときは、技術レイヤー別ではなく `features/<feature>/` にその機能のUI・状態・サービスを近接配置する。複数機能で実際に共有する認証、保存、問題カタログ、UI基盤だけを `core/` 相当に置く。
- Feature間で別Featureの内部状態を直接変更しない。問題演習から成績・計画へは既存の保存関数、クラウド処理へは `window.cbtCloud` を境界として接続する。
- 個人の詳細進捗は `users/{uid}`、公開可能な集計だけは `leaderboard/{uid}` に置く。一般ユーザーへ `users` や `accessControl` の一覧権限を与えない。
- 進捗の修正でデータを削除・初期化しない。複数端末の値は既存のマージ規則と圧縮形式を維持する。

## Sources of truth

- 問題集の登録と件数: `index.html` の `BOOKS`、問題本文: `data/*.json`
- 模試: `mock-assets/azabu-2026/blocks.js`、`subjects.js`、`photo-pages.js` と同配下の画像
- Firestoreの許可条件・書込形状: `firestore.rules`
- ローカル／クラウド進捗形式とマージ: `index.html` の storage/sync 部分、補足は `scripts/README-sync.md`
- CI: `.github/workflows/tests.yml`、Pages公開: `.github/workflows/pages.yml`、ルール公開: `.github/workflows/firebase-rules.yml`

## Verification and cautions

- テストコマンドは `docs/development.md` の変更別マトリクスに従う。ビルドコマンドはない。
- FirebaseルールはPages公開では反映されない。認証・同期・個人データ・権限を変える場合は、実装とエミュレータテストをレビュー可能なブランチで完成させ、具体的な影響を示して公開承認を得る。
- Pages公開はActionsワークフローの成功と配信内容の一致まで確認する。push成功だけを公開完了としない。
- `CLOUD_HANDOFF.md` は変更履歴・運用ログであり、現在構造の入口には使わない。仕様の現在値は上記source of truthと `docs/` を優先する。
- 継続作業の開始時と終了時に `docs/CODEX_PROGRESS.md` を実コードと照合して更新する。過去の未完了表記だけを根拠に実装を再実行しない。
