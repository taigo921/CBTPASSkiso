# Feature map

自然言語の仕様変更から最初の確認先を決めるための逆引き表。`index.html` は単一ファイルなので、関数名・DOM IDを安定した境界として記す。

## 認証・利用制限

- 機能: Google／メールログイン、許可ユーザー判定、個別アクセス停止、授業時間制限。
- Route / 画面: `#authGate`、`#blockedLoginOverlay`、`#schoolGate`。通常画面にoverlayする。
- 主なUI: `#gbtn`、`#authEmailBox`、`#schoolGateImage`、`#schoolLogout`。
- state / hooks相当: `window.cbtUser`、`schoolPolicy`、`handleAuthState()`、`requireAccess()`、`watchAccess()`、`watchSchoolPolicy()`、`schoolRestriction()`。
- API / service: Firebase Auth、`window.cbtCloud.fetchSchoolPolicy()`。
- DB: `accessControl/{uid}`、`schoolAccess/settings`、初回プロフィール用 `users/{uid}`。
- 関連ファイル: `index.html` のaccess/auth/Firebase bootstrap、`assets/blocked-login.mp4`、`firestore.rules`、`ACCESS_CONTROL_SETUP.md`、`CLASS_HOURS_ACCESS.md`、`SETUP-LOGIN.md`。
- 他Featureとの依存: すべての認証後Featureの前提。Firestoreルール側でも同じ制限を再評価する。

## ホーム・問題集選択・教材読込

- 機能: 問題集1/2/模試の切替、概要、再開、オフライン準備状況。
- Route / 画面: `#home` 内の `#regularHome` と `#mockHome`。URLは `?book=book1|book2` のみ保持。
- 主なUI: `.book-tab`、`#resumeCard`、`#offlineStatus`、`#cloudStatus`。
- state / hooks相当: `BOOKS`、`activeBook`、`QUESTIONS`、`mockHomeSelected`、`renderHome()`、`switchBook()`、`loadBookQuestions()`。
- API / service: `fetch()`、Cache Storage、Service Worker。
- DB: 問題本文はDB不使用。選択中の本はLocalStorage `cbt_settings_v2`。
- 関連ファイル: `index.html` の `BOOKS`/question loading/home、`data/*.json`、`sw.js`。
- 他Featureとの依存: Question CatalogとしてPractice、Study Route、Browse & Analysisへ問題を供給する。

## 通常問題演習

- 機能: 順番、ランダム、復習、お気に入り、図・画像、連問、単問、途中再開、採点・解説。
- Route / 画面: `#quiz`、完了時 `#finish`。
- 主なUI: `#qText`、`#qChoices`、`#qFig`、`#resultBlock`、`#prevBtn`、`#nextBtn`、`#favBtn`。
- state / hooks相当: `session`、`timer`、`startSession()`、`renderQuestion()`、`pick()`、`next()`、`finish()`、`saveSession()`。
- API / service: `saveStats()`、`saveStudyPlans()`、`addStudyTime()`、`cloudSyncSoon()`。
- DB: LocalStorageの本別session・成績。Firestore `users/{uid}` の `progressDataV1` と要約。
- 関連ファイル: `index.html` のtimer/session/quiz/result、`data/*.json`、`guide/*.webp`。
- 他Featureとの依存: Question Catalogを読む。Progress、Study Route、Gamificationへ結果を渡す。

## 学習ルート・忘却曲線

- 機能: 試験日からの日次割当、1/3/7/14/30日復習、追加・無限学習、最終確認、休み／軽め設定、本で進めた範囲登録。
- Route / 画面: `#studyPlan`。出題は共通の `#quiz`。
- 主なUI: `#planStartBtn`、`#planReviewBtn`、`#planCalendarDays`、`#planExtraBox`、`#paperApply`、`#planWhitePassOpen`。
- state / hooks相当: `studyPlans.shared`、`planFor()`、`studyPlanSummary()`、`renderStudyPlan()`、`startStudyPlan()`、`startExtraStudy()`、`startRouteReview()`、`paperProgress`。
- API / service: `saveStudyPlans()`、共通Practice session、`cloudSyncSoon()`。
- DB: LocalStorage `cbt_study_plan_v1` とshared-plan/route-review session。Firestoreの圧縮進捗内 `studyPlans`、`sessions`。
- 関連ファイル: `index.html` のstudy plan/paper progress、`scripts/test_paper_progress.cjs`、`scripts/test_route_review.cjs`。
- 他Featureとの依存: 両問題集のQuestion Catalog、Practice、Progress。問題集固有の成績は越境参照するが、割当は `studyPlans.shared` が所有する。

## 問題一覧・セクション演習

- 機能: 状態で絞り込む一覧、セクション選択、モード選択、掲載順の再開位置。
- Route / 画面: `#list`、`#sectionList`、`#sectionStart`、出題は `#quiz`。
- 主なUI: `#filterBar`、`#listBody`、`#sectionListBody`、`[data-section-mode]`、`#sectionStartBody`。
- state / hooks相当: `listFilter`、`pickedSection`、`settings.sectionMode`、`renderList()`、`renderSectionList()`、`openSectionStart()`、`startSectionModeSession()`。
- API / service: 共通Practice session、`saveSectionUid()`。
- DB: LocalStorage `cbt_section_progress_v1`、`cbt_settings_v2`、本別成績。クラウドへは成績とsessionが同期されるが、セクション再開位置自体は端末保存。
- 関連ファイル: `index.html` のbrowse/section grouping。
- 他Featureとの依存: Question Catalog、Practice、Progress。

## 学習分析・学習時間・XP

- 機能: 正答率、苦手分野、回答時間、日別学習時間、XP、レベル、ランク、連続正解・連続使用。
- Route / 画面: `#stats` とホームのgame card、完了画面。
- 主なUI: `#studyTimeChart`、`#rankList`、`#slowList`、`#fastList`、`#levelUp`。
- state / hooks相当: `statsByBook`、`studyTime`、`game`、`openStats()`、`renderStudyTime()`、`awardXp()`、`rankInfo()`、`levelInfo()`。
- API / service: `saveStats()`、`saveGame()`、`addStudyTime()`、`cloudSyncSoon()`。
- DB: LocalStorage `cbt_stats_books_v1`、`cbt_study_time_v1`、`cbt_game_v1`。Firestoreの個人進捗。
- 関連ファイル: `index.html` のgamification/stats、`scripts/test_rank_progression.cjs`。
- 他Featureとの依存: Practiceが一次データを生成する。Leaderboardへは集計値だけを提供する。

## 麻布模試・科目別演習

- 機能: 6ブロックの問題画像、回答、連問の前進制御、公式解説、別冊写真、科目横断演習。
- Route / 画面: `#mockHome`、`#mockExam`、`#mockSubjectPractice`。
- 主なUI: `#mockBlockSelector`、`#mockQuestionList`、`#mockExamChoices`、`#mockExamResult`、`#mockSubjectSelect`。
- state / hooks相当: `selectedMockBlock`、`mockProgress`、`mockSubjectSession`、`renderMockHome()`、`renderMockExam()`、`startMockSubjectPractice()`。
- API / service: `saveMockProgress()`、`saveMockSubjectPractice()`、画像拡大viewer。
- DB: ブロック別 `togo_mock_azabu2026_block*_v1_{uid}` は圧縮進捗の `mockExams` として同期。科目別 `togo_mock_subject_v1_{uid}_{subject}` は端末のみ。
- 関連ファイル: `index.html` のmock部分、`mock-assets/azabu-2026/blocks.js`、`subjects.js`、`photo-pages.js` と画像、`scripts/test_mock_exam.cjs`、`scripts/test_mock_subjects.cjs`。
- 他Featureとの依存: 通常問題集・通常成績・XPとは分離。Progressはブロック別進捗だけを扱う。

## ガイド編・画像viewer

- 機能: 問題のガイド参照、複数ページ表示、pinch/drag/zoom、問題・模試画像の拡大。
- Route / 画面: overlay `#guideViewer`、`#imageZoomViewer`。
- 主なUI: `#guidePages`、guide zoom controls、`#imageZoomStage`。
- state / hooks相当: `guideZoomState`、`imageZoomState`、`openGuide()`、`openImageZoom()`。
- API / service: なし。
- DB: なし。
- 関連ファイル: `index.html` のguide/image viewer、`guide/*.webp`、問題JSONの `guide_ref`/`image_base64`、模試画像。
- 他Featureとの依存: Practice、Study Route、Mock Examから一方向に呼ばれる共通UI基盤。

## 進捗保存・複数端末同期・バックアップ

- 機能: 即時端末保存、保存失敗警告、進捗export、Firestore transaction、古い形式移行、リアルタイム統合。
- Route / 画面: 全画面共通。ホームの `#cloudStatus`、`#syncNowBtn`、`#exportProgressBtn`、`#storageWarning`。
- 主なUI / state: `safeGet/Set/Remove()`、`progressBackupData()`、`fullStatsPayload()`、`mergeCloudPayloads()`、`encodeCloudProgress()`、`decodeCloudProgress()`、`runCloudSync()`、`cbtMergeCloud()`。
- API / service: `window.cbtCloud.save/readLatest/subscribe`。
- DB: `users/{uid}`。詳細は `database.md`。
- 関連ファイル: `index.html` のstorage/sync/Firebase gateway、`scripts/README-sync.md`、sync/progress browser tests。
- 他Featureとの依存: 学習Featureの保存先となる横断基盤。Feature固有の解釈を増やす場合は、そのFeature側のmerge関数を明示する。

## プロフィール・ランキング

- 機能: 表示名、アバター、許可ユーザー全員の集計ランキング、管理者による既存ユーザー集計更新。
- Route / 画面: `#leaderboard`、`#unameModal`、`#avatarCropModal`。
- 主なUI: `#rankBtn`、`#lbBody`、`#lbRename`、`#lbAvatarInput`、ランキングtab。
- state / hooks相当: `lbMetric`、`leaderboardUsersCache`、`openLeaderboard()`、`renderLeaderboard()`、`leaderboardPublicSummary()`。
- API / service: `window.cbtCloud.publishLeaderboard/refreshLeaderboardMembers/fetchLeaderboard`、`cbtRename()`、`cbtSetAvatar()`。
- DB: private `users/{uid}` からpublic summary `leaderboard/{uid}` を派生。
- 関連ファイル: `index.html` のavatar/leaderboard/Firebase gateway、`firestore.rules`、`MEMBER_LEADERBOARD_SETUP.md`。
- 他Featureとの依存: Access、Progress/Gamificationの集計。個別問題、メール、計画を公開summaryへ入れない。

## 管理者画面

- 機能: ユーザー停止／解除、授業制限on/off、休校日、現在授業だけの解除。
- Route / 画面: `#accessAdmin`。
- 主なUI: `#accessAdminList`、`#schoolEnabled`、`#schoolExemptList`、`#schoolReleaseClass`。
- state / hooks相当: `renderAccessAdmin()`、`renderSchoolSettings()`、`saveSchoolSettings()`、`canManageUsers()`。
- API / service: `window.cbtCloud.fetchAccessUsers/setUserBlocked/fetchSchoolPolicy/setSchoolPolicy/releaseSchoolClass`。
- DB: `users` の管理者list読取、`accessControl/{uid}`、`schoolAccess/settings`、停止時の `leaderboard/{uid}` 削除。
- 関連ファイル: `index.html` のadmin/school/Firebase gateway、`firestore.rules`、アクセス・授業資料。
- 他Featureとの依存: Accessを管理する専用Feature。個人進捗の内容は編集しない。

## 配信・オフライン更新

- 機能: 最新HTML優先、取得済み問題・画像のstale-while-revalidate、オフライン起動、Pages公開。
- Route / 画面: 全体。ホームにキャッシュ状態を表示。
- 主なUI / state: `setupOfflineSupport()`、`offlineQuestionCacheStatus()`、`sw.js` のinstall/fetch handler。
- API / service: Cache Storage、Service Worker、GitHub Actions。
- DB: なし。
- 関連ファイル: `sw.js`、`index.html` のservice worker登録、`.github/workflows/pages.yml`、`.github/workflows/tests.yml`。
- 他Featureとの依存: Question CatalogとFirebase CDN SDK。新しい実行時必須ファイルはアプリシェルまたは取得戦略を決める。
