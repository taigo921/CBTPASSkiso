# Development and release

## 変更時の調査順

1. ユーザーの言葉に対応する領域を `feature-map.md` で特定する。
2. 画面遷移が変わる場合は `routes.md`、保存・権限が変わる場合は `database.md` を読む。
3. `rg` で記載されたDOM ID・関数名を `index.html` とテストから検索する。
4. source of truthを変更し、影響する回帰テストを追加・更新する。

## 構造上の方針

現在はビルドなしの静的アプリで、`index.html` の処理順とglobal stateに既存テストが依存する。機能追加と無関係な全面module化は行わない。機能を外部ファイルへ切り出す実益がある場合は `features/<feature-name>/` を単位とし、UI、state、validation、serviceを近接配置する。`components/`、`hooks/`、`utils/` のようなアプリ横断の技術レイヤーだけを新設しない。

共有へ移す対象は、認証、Firestore gateway、storage/sync、question catalog、汎用viewerのように複数Featureが同じ契約で使うものに限る。Feature AがFeature Bの内部変数を直接触る代わりに、既存の保存・session・gateway関数を境界にする。

## Build and test

ビルドコマンドはない。静的ファイルがそのまま配信物になる。CIの完全な定義は `.github/workflows/tests.yml` がsource of truth。

通常のローカル回帰:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_firebase_publication.py
bash -n scripts/cloud/setup_firebase_federation.sh
node scripts/test_sync.cjs
node scripts/test_progress_preservation.cjs
node scripts/test_mock_exam.cjs
node scripts/test_mock_subjects.cjs
node scripts/test_app_update.cjs
node scripts/test_access_control.cjs
node scripts/test_school_hours.cjs
node scripts/test_admin_ranking.cjs
node scripts/test_paper_progress.cjs
node scripts/test_route_review.cjs
node scripts/test_rank_progression.cjs
git diff --check
```

加えて全 `data/*.json` をJSON parserで読む。UI、認証、同期、storage、レスポンシブ表示を変えた場合は、Playwrightを用意して次も実行する。

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/test_sync_browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/test_blocked_login_browser.cjs
```

Playwright管理外のChromiumを使う環境では、両スクリプトに `PLAYWRIGHT_EXECUTABLE_PATH=/absolute/path/to/chromium` も渡せる。

Firestore権限を変えた場合は、実プロジェクトではなくローカルFirestore Emulatorで `test_access_rules.cjs`、`test_leaderboard_rules.cjs`、`test_school_rules.cjs` を実行する。CIが使うNode、Java、依存versionはworkflowを参照する。

変更対象に応じた最低追加確認:

|変更|重点テスト|
|---|---|
|問題JSON・問題数|JSON parse、UID重複・answer・画像、該当画面。登録は `BOOKS` と `sw.js` も確認|
|通常演習・進捗|sync、progress preservation、browser two-device|
|学習ルート|paper progress、route review、sync|
|模試|mock exam、mock subjects|
|XP・ランク|rank progression、sync|
|認証・停止・授業|access control、school hours、blocked login browser、rules emulator|
|ランキング|admin ranking、leaderboard rules、sync|
|Service Worker・更新|app update、browser tests|

## Release boundaries

- Pages: `.github/workflows/pages.yml`。`main` push後、reusable testsに成功したcommitだけをGitHub Pagesへ出す。公開対象はworkflowの `git archive` リストがsource of truth。
- Firestore rules: `.github/workflows/firebase-rules.yml` の手動workflow。レビュー済み40桁commitを指定し、まずread-only check、明示承認後だけpublishする。Pagesとは別配備。
- 認証、同期、個人データ、権限、公開データ範囲の変更はレビューbranchで実装・テストし、影響と順序を説明して承認を得る。必要なルールが先かアプリが先かを機能資料で確認する。
- pushやworkflow開始だけを完了としない。Actions成功と、配信された `index.html` などが意図したcommitに一致することを確認する。
- private backup、password、private key、tokenをcommitしない。本番ユーザーの停止やデータ変更をテスト目的で行わない。

詳細なWIF設定は `FIREBASE_DEPLOY_CONNECTION.md`、アクセス・授業・ランキングの配備順は各機能資料を参照する。`CLOUD_HANDOFF.md` は履歴ログとしてのみ使う。

## Docs update rule

次が変わった場合は同じ変更で地図を更新する。

- Featureの責務・依存方向: `feature-map.md`、必要なら `architecture.md`
- screen、入口、戻り先、URL状態: `routes.md` と `feature-map.md`
- Firestore collection、field、権限、LocalStorage key、主要sync形式: `database.md` と `feature-map.md`
- ディレクトリ、技術、外部サービス、主要データフロー、認証基盤: `architecture.md`
- test/build/release手順: この文書と必要なら `AGENTS.md` の索引

文言、色、余白など地図が変わらないUI調整や、契約を変えない内部修正ではdocs更新は不要。同じ詳細を複数文書へコピーせず、`AGENTS.md` は入口、feature-mapは逆引き、architectureは全体、databaseは保存契約、routesは画面、workflow/rules/codeは実行可能なsource of truthとして扱う。
