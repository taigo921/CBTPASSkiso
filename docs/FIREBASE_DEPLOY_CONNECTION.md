# Firebaseルール公開の連携（初回設定待ち）

GitHub ActionsのOIDCとGoogle Workload Identity Federationを使い、秘密鍵を保存せず短時間の権限で接続します。このクラウド端末へGoogleの個人アカウントをログインさせる方式ではありません。Codexは既存のGitHub権限で手動ワークフローを実行します。

## Google管理者の初回操作

Google Cloud Shellをプロジェクト `cbtpass-a680e` のIAM管理権限を持つアカウントで開き、`scripts/cloud/setup_firebase_federation.sh` を確認して実行してください。

作成・更新するリソース:

- サービスアカウント `cbtpass-rules-publisher`。
- プロジェクトのカスタムロール `cbtpassRulesPublisher`: rulesets.create/get、releases.get/update の4権限。Firestore個人データの読取り・変更、Authユーザー管理、IAM管理権限は与えません。
- Workload Identity Pool `cbtpass-github` とProvider `repo-1283596898`。
- GitHubのrepository ID・owner ID・main参照・正確な公開ワークフローのworkflow_refを条件にした信頼設定。そのリポジトリに限定したサービスアカウントの一時利用許可。
- Firebase Rules、IAM、IAM Credentials、STSのAPI有効化。

このロールはプロジェクト内のRules APIへの権限です。IAMだけではFirestoreの1リリースだけに完全分離できないため、公開コードは `projects/cbtpass-a680e/releases/cloud.firestore` に固定します。既存の同名ロール・Providerがある場合は設定を更新します。Owner/Editor権限やサービスアカウント鍵は作りません。GitHub mainへのコード変更権限を持つ人は、このワークフローを通じてルールを変更できる点に注意してください。

出力の `FIREBASE_WIF_PROVIDER` と `FIREBASE_DEPLOY_SERVICE_ACCOUNT` は公開可能なリソース名であり、トークン・秘密鍵ではありません。確認したプロジェクト番号1081031054072と専用アカウントを公開ワークフローに固定しました。この環境のGitHub連携はActions変数の読み書きが403で拒否されるため、変数登録は不要です。エラー時はそのエラーを伝え、秘密鍵・トークンを貼らないでください。

## 接続検証と公開

接続用PRの承認・マージ後、ワークフロー `Firebase rules (manual, keyless)` を **mainから**実行します。

- `rules_commit`: レビュー済みルールを含む40桁のコミットSHA。ブランチ名は拒否します。
- `publish`: 初期値false。最初はfalseのまま、読み取りだけで実際の接続を確認します。
- 同じコミットを既存の回帰・ブラウザー・Firestore Emulatorテストに渡します。授業制限のテストファイルがあるコミットはその検証も実行します。
- テスト失敗時は認証・公開ジョブに進みません。認証のid-token権限は公開ジョブだけに付与します。PRやpushによる自動公開はしません。
- 具体的なルール変更の承認を得た後に限りpublish=trueで実行し、新しいrulesetの作成→リリース更新→リリース名とソース全文の照合を行います。直前のruleset名をログに残します。トークンや個人データはログに出しません。
- ルールだけの反映を確認してからアプリのPRをマージし、既存のPagesテスト・公開・配信内容確認を行います。

`source_ref`未指定の既存のPages/PRテストは従来どおり対象コミットを検証します。アプリの機能・現在のFirestoreルール・本番データはこの接続準備だけでは変更しません。

## 状態と検証の区別

ローカルテストは公開APIの順序、作成失敗時の非公開、プロジェクト不一致の拒否、反映内容不一致の検出、Cloud Shellスクリプトの初回／再実行のコマンド生成を模擬します。シェル構文・YAML解析・既存の必須テストも確認します。

Google IAMの実設定と本番APIの接続は、Google管理者の初回設定後に読み取り確認が成功して初めて完了です。Google側が拒否した場合は処理を止め、その権限・設定の不足を調べます。接続用PRも、AGENTS.mdの重要な認証変更に対する確認を得るまでマージしません。

## 連携解除

管理者が対象Providerを無効化するか、サービスアカウントのWorkload Identity Userバインディングを削除します。GitHub Actions変数の削除だけではGoogle側の信頼設定自体は消えません。
