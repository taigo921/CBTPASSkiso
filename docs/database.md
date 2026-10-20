# Data and database map

## Source of truth

- Firestoreの認可、必須フィールド、型、上限: `firestore.rules`。
- 個人進捗の現行wire形式、migration、merge: `index.html` の `fullStatsPayload()`、`encodeCloudProgress()`、`decodeCloudProgress()`、`mergeCloudPayloads()`。
- 同期形式の背景と制限: `scripts/README-sync.md`。
- 通常問題: `data/*.json`。登録対象は `index.html` の `BOOKS`。
- 模試: `mock-assets/azabu-2026/blocks.js`、`subjects.js`、`photo-pages.js`。

この文書は索引であり、schema全文を複製しない。フィールドを変える場合は上記実装とルールを先に更新する。

## Firestore

### `users/{uid}`

- 役割: 本人のプロフィールと詳細学習進捗。UIDはFirebase Auth UID。
- 主なフィールド:
  - profile: `username`、`email`、`avatar`、`updatedAt`
  - root summary: `activeBook`、`answered`、`correct`、`accuracy`、`distinct`、`bestStreak`、`dayStreak`
  - shared summary/state: `game`、`studyTime`、本別summaryの `books`
  - packed detail: `progressDataV1`。version 1のJSON文字列で `books` の問題別記録・rank attempts、`studyPlans`、`mockExams`、`sessions` を保持
- リレーション: Firebase Auth userと1対1。本人の内容から `leaderboard/{uid}` を派生する。`accessControl/{uid}` がblockedなら本人の読書きを拒否する。
- 使用Feature: Progress & Sync、プロフィール、通常演習、学習ルート、模試、分析、ランキング集計元。
- DBアクセス: `window.cbtCloud.save/readLatest/subscribe`、`cbtMergeCloud()`、`cbtRename()`、`cbtSetAvatar()`。
- 権限: 本人は非停止かつ利用可能時間のみget/write。管理者はget/list。一般ユーザーは他人の文書を読めない。

`perQ`、`rankAttempts`、`studyPlans`、`mockExams`、`sessions` は旧形式のtop-level mapとして残さず、保存transactionで削除する。旧クライアント互換の読込は維持する。

### `leaderboard/{uid}`

- 役割: 許可ユーザーへ公開できるランキング用summaryだけを保持。
- 主なフィールド: `username`、`avatar`、`answered`、`correct`、`accuracy`、`bestStreak`、`dayStreak`、`lastDay`、`game: {xp}`、`updatedAt`。
- リレーション: `users/{uid}` と同じUID。コピー元はprivate user documentだが、詳細進捗・メール・学習計画は含めない。
- 使用Feature: Leaderboard & Profile。
- DBアクセス: `leaderboardPublicSummary()`、`publishLeaderboard()`、`refreshLeaderboardMembers()`、`fetchLeaderboard()`。
- 権限: メール確認済み・許可済み・非停止・利用可能時間のmemberがlist/get。本人または管理者が厳密なfield schemaで書込。管理者が削除。

### `accessControl/{uid}`

- 役割: UID単位のアクセス停止。学習記録とは分離する。
- 主なフィールド: `blocked`、`updatedAt`、`updatedBy`。
- リレーション: 対象 `users/{uid}` が存在するときだけ管理者が作成・更新。停止時は対応するleaderboard行をクライアントtransactionで削除する。
- 使用Feature: Access & Identity、Access Administration。
- DBアクセス: `requireAccess()`、`watchAccess()`、`fetchAccessUsers()`、`setUserBlocked()`。
- 権限: 本人は自分のgetのみ、管理者はget/listと他人のcreate/update。deleteは禁止。

### `schoolAccess/settings`

- 役割: 授業時間制限の全体設定、休校日、現在授業だけの解除。
- 主なフィールド: `enabled`、`exemptDates`、任意の `releasedPeriod`、`updatedAt`、`updatedBy`。
- リレーション: `firestore.rules` の `schoolOpen()` が全member accessの判定で参照する。
- 使用Feature: Access & Identity、Access Administration。
- DBアクセス: `fetchSchoolPolicy()`、`setSchoolPolicy()`、`releaseSchoolClass()`、`watchSchoolPolicy()`。
- 権限: 認証ユーザーはgetのみ。確認済み管理者だけが制約付きでcreate/update。list/deleteは禁止。

## LocalStorage

|key / pattern|内容|クラウド同期|
|---|---|---|
|`cbt_stats_books_v1`|本別の問題履歴・集計・rank attempts|はい。`users.progressDataV1` と本別summary|
|`cbt_settings_v2`|選択中の本、遅い回答の秒数、セクションmode|いいえ|
|`cbt_session_v3_book1`, `_book2`|通常演習の中断session|はい|
|`cbt_session_v3_shared-plan`, `_route-review`|計画・総復習の中断session|はい|
|`cbt_section_progress_v1`|セクション掲載順の端末内再開位置|いいえ|
|`cbt_study_plan_v1`|shared study plan、日次割当、本の自己申告進捗|はい|
|`cbt_game_v1`|XP、日次bonus日|はい|
|`cbt_study_time_v1`|日別秒数・問題数・本別時間|はい|
|`togo_mock_azabu2026_block{1..6}_v1_{uid}`|ブロック別模試の位置・回答|はい|
|`togo_mock_subject_v1_{uid}_{subject}`|科目別模試session|いいえ。export対象外|
|`togo_sync_backup_20260923_{uid}`|同期形式移行前の端末backup|いいえ|
|`togo_blocked_login_notice_v1`|停止画面mediaの再表示状態|いいえ|

旧key `cbt_stats_v2` は本別形式へのmigration入力としてのみ読む。`cbt_questions_v1` と `cbt_session_v2` は定数が残るが、現行の主要保存先ではない。

LocalStorageが失敗した場合は最新値を `_memStore` に保持して警告を出す。容量問題を解決するために学習記録を自動削除してはいけない。

## 問題データ

通常問題の1要素は、`uid`、`display_no`、`section`、`category`、`subject`、`guide_ref`、`has_image`、`question`、`choices`、`answer`、`explanation_intro`、`explanation` を基本とし、図がある問題は `image_base64` または画像参照を持つ。UIDが回答履歴、計画、セクション、同期の結合keyであるため、公開後のUID変更はmigrationなしで行わない。

模試問題はblockと問番号の組で識別し、正解、選択肢key、問題画像、解説画像を持つ。科目分類は `(block, no)` から `subjects.js` で引く。通常問題のUID空間や成績へ混ぜない。

## データフロー上の不変条件

- クラウド保存はread-merge-writeを同じFirestore transactionで行う。
- 回答回数、XP、best streakなど既存の累積値を古い端末で減らさない。
- malformedな `progressDataV1` は空データとして上書きせず、保存を止める。
- leaderboard公開失敗はprivate progress同期の失敗として扱わない。
- access停止や授業制限で個人進捗を削除しない。
- 許可メールhashは `index.html` の `ALLOW` と `firestore.rules` の `approvedHashes()` を一致させる。
