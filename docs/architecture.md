# Architecture

## 目的と技術構成

toGOは、歯科国試の問題集・麻布模試を演習し、回答履歴、学習計画、XP、学習時間を端末とクラウドへ保存する認証必須のWebアプリである。

|領域|実装|
|---|---|
|フロントエンド|HTML/CSS/vanilla JavaScript。主要UIとロジックは `index.html` のインラインスクリプト|
|配信|GitHub Pages。ビルドなし。`.github/workflows/pages.yml` が公開対象を組み立てる|
|オフライン|`sw.js`、Cache Storage、LocalStorage|
|認証|Firebase Authentication。Google Identity Servicesとメール・パスワード|
|データベース|Cloud Firestore（Firebase compat SDK 10.12.2をCDN読込）|
|問題データ|`data/*.json`、模試は `mock-assets/azabu-2026/`、辞典演習は `dictionary-assets/exercises/`、`dictionary-assets/mock-exams/`、`dictionary-assets/dental-materials/`|
|テスト|Node.jsの静的・DOM・同期回帰、Playwright、Firestore Emulator、Python/Shell検査|

アプリ固有のサーバーやServer Actionはない。ブラウザがFirebase AuthとFirestoreへ直接接続し、`firestore.rules` が認可と書込形状を強制する。

## リポジトリ構造

|パス|責務|
|---|---|
|`index.html`|全画面、画面遷移、問題演習、学習計画、同期、認証、管理機能|
|`sw.js`|アプリシェル・Firebase SDK・取得済み教材のキャッシュ戦略|
|`data/`|通常問題集のJSON。問題本文のsource of truth|
|`guide/`|ガイド編ページ画像|
|`mock-assets/azabu-2026/`|模試の設問、正解、科目分類、写真ページ、問題・解説画像|
|`dictionary-assets/exercises/`|辞典②の検証済みmanifest、問題画像、公式解説画像。原本PDFは含めない|
|`dictionary-assets/mock-exams/`|辞典③の誌上模試1・2（原本に実在する624問）のmanifest、問題画像、公式解説画像。原本PDFは含めない|
|`dictionary-assets/dental-materials/`|学校配布の歯科理工Forms 50問のうち、正答画面またはユーザー確認で正答を確定できた47問のmanifest、問題画像、正答参照画像。未確定3問と原本PDFは含めない|
|`features/dictionary-practice/`|辞典演習専用のUI、端末進捗、出題・採点ロジック|
|`assets/`|アプリUIで使う静的メディア|
|`firestore.rules`|Firestoreの権限・公開データ形状のsource of truth|
|`scripts/`|回帰テスト、Firebaseルール公開補助、クラウド設定補助|
|`.github/workflows/`|CI、Pages、Firestoreルール公開|
|`docs/`|現在構造の地図と機能別の運用資料|
|`CLOUD_HANDOFF.md`|過去変更の運用ログ。現在仕様のsource of truthではない|

## Feature / Domain

現状は単一HTMLのため物理ディレクトリではなく、次の論理境界で保守する。変更箇所の詳細は `feature-map.md` を参照する。

|Feature / Domain|責務|主な依存|
|---|---|---|
|Access & Identity|ログイン、許可メール、個別停止、授業時間ゲート|Firebase Auth、Firestore access policy|
|Question Catalog|問題集選択、JSON読込、問題UID・ガイド参照|`data/`、Cache Storage|
|Practice Session|出題、選択肢シャッフル、採点、タイマー、中断再開|Question Catalog、Progress|
|Study Route|忘却曲線、日次課題、追加学習、本の進捗登録|Question Catalog、Practice、Progress|
|Browse & Analysis|問題一覧、セクション演習、成績・苦手・学習時間|Question Catalog、Progress|
|Mock Exam|ブロック別模試、連問、科目別演習、解説画像|模試アセット、Progressの一部|
|Dictionary Practice|辞典②、辞典③誌上模試の原本ID別演習、採点、公式解説、辞典専用端末進捗|辞典manifest、画像viewer|
|Dental Materials Practice|学校Forms歯科理工の独立入口、単一／複数選択採点、正答参照画像、専用端末進捗|歯科理工manifest、画像viewer|
|Progress & Sync|LocalStorage、バックアップ、複数端末マージ、Firestore保存|Firestore、各学習Feature|
|Gamification|XP、レベル、ランク、連続記録|Practice、Progress|
|Leaderboard & Profile|表示名・写真、公開集計、ランキング表示|Progressの集計、Access|
|Access Administration|停止／解除、授業制限、休校日、授業単位解除|Access、Firestore|
|Delivery & Offline|Service Worker、更新、教材キャッシュ、Pages公開|Question Catalog、GitHub Actions|

### 依存方向

1. Access & Identityがアプリ利用可否を決める。
2. Question CatalogがPractice、Study Route、Browse & Analysisへ問題を供給する。
3. PracticeがProgressの公開された保存関数を通じて回答履歴を更新し、Study RouteとGamificationがその結果を受ける。
4. Progress & Syncが各Featureの保存対象を集約してFirestoreへ同期する。同期処理が画面Featureの内部UIを所有しない。
5. Leaderboardは個人進捗から許可された集計だけを派生させる。公開集計から個人進捗へは書き戻さない。
6. Access Administrationは権限データを管理するが、個人の学習記録を編集・削除しない。
7. Dictionary PracticeとDental Materials Practiceは相互の進捗や通常問題集の成績・Study Route・Gamificationへ書き込まない。専用履歴はProgress & Syncへ渡し、Leaderboardはそこから公開集計だけを派生する。実装上は画像問題ビューアを共用する。

新規ファイルへ切り出す場合は、まず `features/<feature-name>/` にUI・状態・サービス・型相当を同居させる。共有候補は2つ以上のFeatureが同じ契約で使用することを確認してから、認証・保存・問題カタログなどの基盤へ昇格する。この静的構成で複数JSを追加するときは、`index.html` の読込順と `sw.js` のアプリシェルも同時に扱う。

## 画面と状態管理

URLルーターはない。`showOnly(id)` が `index.html` 内のsectionを切り替え、ログイン、個別停止、授業制限、ガイド、画像拡大は独立したoverlayとして重なる。例外的なURL状態は `?book=book1|book2` のみで、選択中の問題集を復元する。

状態管理ライブラリは使わず、次の3層で管理する。

- メモリ: `activeBook`、`statsByBook`、`session`、`studyPlans`、`mockProgress`、辞典Feature内部stateなど。
- LocalStorage: 端末即時保存とオフライン継続。利用不能時は `_memStore` に退避し警告する。
- Firestore: 認証ユーザー単位の複数端末同期。`runCloudSync()` → `window.cbtCloud.save()` のtransactionでサーバー値とマージする。

詳細進捗はJSON文字列へ圧縮し、`users/{uid}/progressChunks` に600KB以下で分割して、Firestoreの文書サイズとindex entry上限を避ける。ルートの `progressDataV2` manifestと全chunkをtransactionで同時更新し、古い `progressDataV1` 形式も読込時に統合する。同期規則は `scripts/README-sync.md` と `database.md` を参照する。

## API / service境界

`index.html` の `window.cbtCloud` がブラウザ内のFirestore gatewayである。

- 学校設定: `fetchSchoolPolicy`、`releaseSchoolClass`、`setSchoolPolicy`
- 個人進捗: `save`、`readLatest`、`subscribe`
- ランキング: `publishLeaderboard`、`refreshLeaderboardMembers`、`fetchLeaderboard`
- 管理: `fetchAccessUsers`、`setUserBlocked`
- メール確認: `refreshAdminVerification`、`refreshLeaderboardVerification`、`sendLeaderboardVerification`

FeatureからFirestoreを増やす場合は、この境界と `firestore.rules`、`database.md` を同時に見直す。プロフィール名・画像には現状直接書込が残るが、一般ユーザーへ他人の `users` 文書を公開しない契約は維持する。

## 主要データフロー

### 起動と認証

1. Firebase Authがユーザーを復元する。
2. クライアントの許可メールhashと `accessControl/{uid}` を確認する。
3. GitHub PagesのHTTP `Date` headerで時刻を校正し、`schoolAccess/settings` と校正済み日本時間から授業制限を確認する。
4. `users/{uid}` をサーバー優先で読み、ローカル進捗へマージする。
5. 問題JSONを選択中の本から読み、画面を表示し購読を開始する。

Firestore側でも許可メール、個別停止、授業時間を再判定する。クライアント表示だけを認可境界として扱わない。

### 通常演習と同期

1. Question CatalogからUID列を作り、`session` へ保存する。
2. 回答確定で問題別成績、タイマー、計画、XP、学習時間をLocalStorageへ保存する。
3. `cloudSyncSoon()` が保存をまとめ、`runCloudSync()` が端末バックアップを確認する。
4. `window.cbtCloud.save()` がtransaction内でサーバー値と端末値をマージし、確定値を返す。
5. 確定値をローカルへ再統合する。公開条件を満たす場合だけ、別処理でランキング集計を更新する。

### 模試

問題と正解は模試アセットから読み、ブロック進捗は通常問題集と分離する。ブロック1〜6の進捗は個人進捗へ同期するが、科目別演習の `togo_mock_subject_v1_*` は現状端末のみで、クラウド同期・エクスポート対象外である。

### CBT辞典演習

`dictionary-assets/exercises/manifest.json` の辞典② 956問と `dictionary-assets/mock-exams/manifest.json` の辞典③ 624問を読み、辞典タブ内で教材を切り替える。教材別の回答履歴はLocalStorageへ即時保存し、`practiceSets` として本人の分割進捗へ同期する。通常問題集・学習ルート・XPとは分離し、ランキングには回答成績の集計だけを含める。

### 歯科理工Forms演習

`dictionary-assets/dental-materials/manifest.json` の47問を、ホームの独立した「歯科理工」タブから開く。実装上は `features/dictionary-practice/` の画像問題ビューアを再利用するが、CBT辞典の教材選択には表示せず、進捗keyも分離する。正答画面またはユーザー確認のない3問は公開対象から除外し、manifestの `unresolved` をsource of truthとする。単一選択と複数選択を採点し、回答確定後だけ正答参照画像を表示する。専用履歴は `practiceSets` として本人へ同期し、通常問題集・CBT辞典・学習ルート・XPとは混ぜず、ランキングには回答成績の集計だけを含める。

## 認証・権限

- 許可ユーザー: `index.html` の `ALLOW` hashと `firestore.rules` の `approvedHashes()` の一致が必要。
- 管理者: メール確認済みの固定管理者メール。画面、`window.cbtCloud`、Firestoreルールの3層で制限する。
- 個別停止: `accessControl/{uid}`。停止しても学習記録は削除しない。
- 授業制限: クライアントはGitHub PagesのHTTP `Date` headerを基準にし、Firestoreは `schoolAccess/settings` と `request.time`（JST換算）で再判定する。管理者、休校日、休日、授業単位解除は例外。
- ランキング: メール確認済みの許可・非停止ユーザーだけが公開集計を閲覧する。

## 外部サービスと共通基盤

- GitHub Pages / Actions: 静的配信、テスト、公開。
- Firebase Authentication / Cloud Firestore: 認証、個人進捗、権限、ランキング。
- Google Identity Services: Googleログイン。iOSホーム画面モードではメール・パスワード導線を使う。
- Google Cloud Workload Identity Federation: 秘密鍵なしの手動Firestoreルール公開。設定は `FIREBASE_DEPLOY_CONNECTION.md`。
- ブラウザ基盤: LocalStorage、Cache Storage、Service Worker、FileReader/Canvas（バックアップ・画像拡大・アバター加工）。
