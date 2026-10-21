# Codex progress

最終更新: 2026-10-21

基準コミット: `322ca66`（同期chunk修正）

状態: 停止GIF修正と進捗分割同期を本番公開済み。実機報告の問題集1画像 `C2-065`・`C3-100` を原本PDFから完全な図へ差し替え、公開確認を行う。

## プロジェクト全体の目標

認証済みの利用者が、歯科国試の問題集1・2と2026年麻布模試を、通常演習・学習ルート・科目別演習で安全に継続利用できること。端末保存と複数端末同期で進捗を失わず、アクセス制御、授業時間制限、ランキング、オフライン更新を既存仕様どおり維持する。

完成判定は、主要画面と保存経路が動作し、CIの回帰・ブラウザー・Firestoreルールテストが成功し、重大な既知不具合がなく、本番固有事項を未検証のまま完了扱いしていない状態とする。

## 完成済みの機能

- 問題集1・2、問題一覧、セクション演習、通常／ランダム／復習／画像／お気に入り／連問モード。
- 忘却曲線ベースの学習ルート、追加・無限学習、総復習、本で進めた範囲の登録。
- 回答履歴、学習時間、XP、レベル、ランク、苦手分析、中断再開。
- 麻布模試6ブロック320問、連問制御、公式解説、別冊写真、21科目の科目別演習。
- LocalStorage保存、保存失敗警告、進捗export、Firestore transaction同期、旧形式migration、複数端末merge。
- Google／メール認証、許可hash、個別停止、授業時間制限、休校日・授業単位解除。
- private進捗と分離した公開summaryランキング、表示名、アバター。
- Service Workerによるオフライン利用と更新、GitHub Actionsのテスト付きPages公開。
- 問題画像870件と模試別冊写真188問の原資料監査。
- Codex向けのarchitecture、feature map、database、route、development資料。

## 現在開発している機能

問題集1の報告画像を原本PDFと照合し、欠けた図・画像内に残った問題文を修正する。問題文、選択肢、正答、UID、掲載順は変更しない。

## 未完了タスクと優先順位

### P0

- `C2-065`・`C3-100` の完全な図をPagesへ公開し、実機表示を確認する。
- 報告端末で更新後に「今すぐ同期」を実行し、1MiB超過エラーの解消と別端末への記録反映を確認する。

### P1

- 実iOSホーム画面、Safari、実Firebaseを使うログイン・停止・授業解除・同期は自動テストと別に実機確認が必要。

### P2

- 2028年以降も運用する前に、クライアントと `firestore.rules` の祝日表を同時更新する。
- 科目別模試の途中記録は端末専用で、クラウド同期と進捗exportの対象外。仕様変更の依頼があるまで勝手に同期対象へ含めない。
- `index.html` の機能分割は、変更対象Featureを実際に外部ファイルへ切り出す必要が生じたときだけ `features/<feature>/` 単位で行う。全面書換えはしない。

## 発見した不具合・不整合

- 修正済み: `SETUP-LOGIN.md` が廃止済みの `cbt_auth_email` とクライアント側だけの許可設定を説明していた。Firebase Auth、`ALLOW`／`approvedHashes()`、別配備のルール公開へ修正した。
- 修正済み: ログイン停止画面がMP4の自動再生に依存し、iPhoneで映像が表示されないことがあった。GIFを遅延読込する `img` へ変更し、自動再生制限とHTTP Range処理への依存を除いた。
- 修正済み: 詳細記録が増えると単一 `progressDataV1` がFirestoreの約1MiB上限を超えていた。600KB以下の複数文書へ分割し、root manifestと同一transactionで保存するv2形式へ移行した。
- `CLOUD_HANDOFF.md` の「公開前」「確認待ち」は時点付き履歴であり、現在の未完了一覧ではない。現行状態は実コード、workflow、`firestore.rules`、この文書を優先する。
- 競合同期はイベントログ方式ではないため、複数端末が同時にオフライン回答した全イベントの完全合算までは保証しない。既存merge規則で累積値の後退を防ぐ。

## テスト結果

2026-10-20の保守資料整備時に次を成功確認:

- `test_firebase_publication.py` とCloud Shell setup scriptの構文。
- sync、progress preservation、mock exam、mock subjects、app update、access control、school hours、admin ranking、paper progress、route review、rank progressionのNode回帰。
- 全21 `data/*.json` のparse、記載DOM ID、Markdown link、`git diff --check`。
- アクセス制御、全員掲載ランキング、授業時間の対象回帰を再実行し成功。`ALLOW` と `approvedHashes()` の16 hash一致を確認。
- GitHub ActionsのPages run `39427914990` が最新main `54e8de9` で成功し、Pages設定がworkflow方式・status builtであることをread-only確認。
- Firebase rules run `39184883228` が `4130180` のルールを公開・検証済み。公開ログのSHA-256 `6057b5f...09ef9b` と現在の `firestore.rules` が一致し、その後ルール変更がないことをread-only確認。

この資料整備後にはアプリコードを変更していない。Playwright 2本、Firestore Emulator 3本、実Firebase、実端末は今回の資料変更に対して再実行していない。該当機能を変更した回では `docs/development.md` のマトリクスに従って実行する。

2026-10-21の停止GIF修正で次を成功確認:

- `test_app_update.cjs`、`test_access_control.cjs`、`test_school_hours.cjs`。
- `test_blocked_login_browser.cjs` をスマホ／タブレットで実行し、停止、再起動後の復元、授業ロック、解除、全画面GIF表示を確認。
- `test_sync_browser.cjs` を実行し、2端末同期と停止画面を含む回帰を確認。
- GitHub Actions run `39539716231` の回帰、Firestoreルールテスト、Pages配備が成功。本番のGIFがHTTP 200・`image/gif`で返り、公開物のSHA-256がローカルと一致することを確認。
- 実iPhoneでの最終表示確認は未実施。

2026-10-21の進捗chunk修正で次を成功確認:

- `test_sync.cjs` 46項目（1MiB超の多言語データ、分割上限、lossless round-trip、欠損chunk拒否を含む）と標準Node回帰一式。
- `test_sync_browser.cjs` と `test_blocked_login_browser.cjs`。
- Firestore Emulatorでaccess、leaderboard、school rules一式と、root・chunk複数文書transactionを確認。
- GitHub Actions read-only run `39575667612` の全回帰と本番接続確認が成功。
- Firebase rules run `39575954735` でchunk subcollection用ルールを先行公開し、live contents検証が成功。
- GitHub Actions Pages run `39576413408` の全回帰、2端末ブラウザ同期、Firestoreルールテスト、Pages配備が成功。本番からbuild ID `20261021-progress-chunks-1` とv2同期コードが配信されることを確認。

## 自動再開の状態

このスレッドで利用できるツールとクラウド環境capabilityには、Thread Automation、cron、定期タスク作成機能がない。そのため1時間おきの自動実行は未設定であり、設定済みとみなしてはいけない。利用制限の残量や正確な回復時刻を取得するAPIも提供されていない。

再開は、このスレッドへユーザーが指示を送るか、クライアント側で利用可能なAutomationをユーザーが設定した場合に行う。再開時はこの文書、`git status`、HEAD、実コードを照合する。

## 次回再開時の具体的な作業

1. 報告端末でアプリを完全終了して再起動し、「今すぐ同期」を実行する。
2. 1MiB超過エラーの解消、端末記録の保持、可能なら別端末への記録反映を確認する。
3. 実機で問題が残る場合は、画面の同期IDとエラー文を基に再現・修正する。
