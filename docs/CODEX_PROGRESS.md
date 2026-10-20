# Codex progress

最終更新: 2026-10-20

基準コミット: `54e8de9`（main）

状態: 保守基盤の整備完了。アプリ機能の新規実装は進行していない。

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

現在開発中のアプリ機能はない。継続保守の基盤、`AGENTS.md`、`docs/` の逆引き資料、現行認証に合わせたログイン設定資料は `codex/maintenance-foundation` ブランチへ保存済み。アプリの実行コード、DB schema、本番環境は変更していない。

## 未完了タスクと優先順位

### P0

- 重大な既知の実装不具合は現在なし。新しいユーザー報告が来た場合は、再現とデータ保全を最優先する。
- 現在のP0作業はなし。

### P1

- 実iOSホーム画面、Safari、実Firebaseを使うログイン・停止・授業解除・同期は自動テストと別に実機確認が必要。

### P2

- 2028年以降も運用する前に、クライアントと `firestore.rules` の祝日表を同時更新する。
- 科目別模試の途中記録は端末専用で、クラウド同期と進捗exportの対象外。仕様変更の依頼があるまで勝手に同期対象へ含めない。
- `index.html` の機能分割は、変更対象Featureを実際に外部ファイルへ切り出す必要が生じたときだけ `features/<feature>/` 単位で行う。全面書換えはしない。

## 発見した不具合・不整合

- 修正済み: `SETUP-LOGIN.md` が廃止済みの `cbt_auth_email` とクライアント側だけの許可設定を説明していた。Firebase Auth、`ALLOW`／`approvedHashes()`、別配備のルール公開へ修正した。
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

## 自動再開の状態

このスレッドで利用できるツールとクラウド環境capabilityには、Thread Automation、cron、定期タスク作成機能がない。そのため1時間おきの自動実行は未設定であり、設定済みとみなしてはいけない。利用制限の残量や正確な回復時刻を取得するAPIも提供されていない。

再開は、このスレッドへユーザーが指示を送るか、クライアント側で利用可能なAutomationをユーザーが設定した場合に行う。再開時はこの文書、`git status`、HEAD、実コードを照合する。

## 次回再開時の具体的な作業

1. `git status --short` とHEADを確認し、この文書の基準コミット以降の変更を把握する。
2. 未コミットの保守資料だけが残っている場合は、差分・リンク・記載した関数名を再検証する。
3. ユーザーから新しい不具合・仕様変更がある場合は `feature-map.md` から対象領域を特定し、P0として優先する。
4. 新しい依頼がなければ、最新main以後のCI／Pages／Firebaseルール変更をread-onlyで確認し、外部変更や公開が必要な地点で止める。
5. 作業終了前に、完了内容、テスト、残課題、次の一手をこの文書へ反映する。
