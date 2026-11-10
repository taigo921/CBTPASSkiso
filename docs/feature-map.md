# Feature map

自然言語の仕様変更から最初の確認先を決めるための逆引き表。`index.html` は単一ファイルなので、関数名・DOM IDを安定した境界として記す。

## 認証・利用制限

- 機能: Google／メールログイン、許可ユーザー判定、個別アクセス停止、追加教材の利用許可、授業時間制限。
- Route / 画面: `#authGate`、`#blockedLoginOverlay`、`#schoolGate`。通常画面にoverlayする。
- 主なUI: `#gbtn`、`#authEmailBox`、`#schoolGateImage`、`#schoolLogout`。
- state / hooks相当: `window.cbtUser`、`canUseExtraMaterials()`、`schoolPolicy`、`handleAuthState()`、`requireAccess()`、`watchAccess()`、`watchMaterialAccess()`、`watchSchoolPolicy()`、`refreshSchoolClock()`、`schoolRestriction()`。
- API / service: Firebase Auth、`window.cbtCloud.fetchSchoolPolicy()`、GitHub PagesのHTTP `Date` header（授業判定用サーバー時刻）。
- DB: `accessControl/{uid}`、`materialAccess/{uid}`、`schoolAccess/settings`、初回プロフィール用 `users/{uid}`。
- 関連ファイル: `index.html` のaccess/auth/Firebase bootstrap、`assets/blocked-login.gif`、`firestore.rules`、`ACCESS_CONTROL_SETUP.md`、`CLASS_HOURS_ACCESS.md`、`SETUP-LOGIN.md`。
- 他Featureとの依存: すべての認証後Featureの前提。Web／ホーム画面アプリともログイン時に配信サーバー時刻へ固定し、Firestoreルール側でも `request.time` で同じ制限を再評価する。

## ホーム・問題集選択・教材読込

- 機能: 問題集1/2/模試/CBT辞典/歯科理工Formsの切替、概要、再開、オフライン準備状況。
- Route / 画面: `#home` 内の `#regularHome`、`#mockHome`、`#dictionaryHome`。URLは `?book=book1|book2` のみ保持。
- 主なUI: `.book-tab`、`#resumeCard`、`#offlineStatus`、`#cloudStatus`。
- state / hooks相当: `BOOKS`、`activeBook`、`QUESTIONS`、`mockHomeSelected`、`dictionaryHomeSelected`、`dentalMaterialsHomeSelected`、`renderHome()`、`switchBook()`、`loadBookQuestions()`。
- API / service: `fetch()`、Cache Storage、Service Worker。
- DB: 問題本文はDB不使用。選択中の本はLocalStorage `cbt_settings_v2`。麻布模試・CBT辞典・歯科理工の表示許可は `materialAccess/{uid}`。
- 関連ファイル: `index.html` の `BOOKS`/question loading/home、`data/*.json`、`sw.js`。
- 他Featureとの依存: Question CatalogとしてPractice、Study Route、Browse & Analysisへ問題を供給する。追加教材は管理者または `extra=true` の本人だけ表示・遷移でき、権限喪失時は問題集ホームへ戻す。

## 通常問題演習

- 機能: 順番、ランダム、復習、お気に入り、図・画像、連問、単問、途中再開、採点・解説。
- Route / 画面: `#quiz`、完了時 `#finish`。
- 主なUI: `#qProgress`（回答後の解説画面に表示する、問題別の正解数・直近回答・ルート終了進捗）、`#qText`、`#qChoices`、`#qFig`、`#resultBlock`、`#prevBtn`、`#nextBtn`、`#favBtn`。
- state / hooks相当: `session`、`timer`、`startSession()`、`renderQuestion()`、`pick()`、`next()`、`finish()`、`saveSession()`。
- API / service: `saveStats()`、`saveStudyPlans()`、`addStudyTime()`、`cloudSyncSoon()`。
- DB: LocalStorageの本別session・成績。Firestore `users/{uid}` の `progressDataV2` manifest・要約と `users/{uid}/progressChunks/*` の詳細記録。
- 関連ファイル: `index.html` のtimer/session/quiz/result、`data/*.json`、`guide/*.webp`。
- 他Featureとの依存: Question Catalogを読む。Progress、Study Route、Gamificationへ結果を渡す。

## 学習ルート・忘却曲線

- 機能: 試験日からの日次割当、1/3/7日間隔の復習、当日の課題で間違えた問題を正解するまで同日中に再出題、問題ごとに1日1回（その日の最初の回答）だけ更新する3回連続正解または解説内容を説明できる自己確認による終了判定、追加・無限学習、休み／軽め設定、本で進めた範囲登録。
- Route / 画面: `#studyPlan`。出題は共通の `#quiz`。
- 主なUI: `#planStartBtn`、`#planReviewBtn`、`#planCalendarDays`、`#planExtraBox`、`#paperApply`、`#planWhitePassOpen`。
- state / hooks相当: `studyPlans.shared`、`planFor()`、`studyPlanSummary()`、`renderStudyPlan()`、`startStudyPlan()`、`startExtraStudy()`、`startRouteReview()`、`paperProgress`。
- API / service: `saveStudyPlans()`、共通Practice session、`cloudSyncSoon()`。
- DB: LocalStorage `cbt_study_plan_v1` とshared-plan/route-review session。ルート項目の `streakDay` は連続正解を最後に更新したローカル日付、日次割当の `retry` は問題UIDごとの最終誤答時刻と解消時刻を保持する。Firestoreの圧縮進捗内 `studyPlans`、`sessions`。
- 関連ファイル: `index.html` のstudy plan/paper progress、`scripts/test_paper_progress.cjs`、`scripts/test_route_review.cjs`、`scripts/test_study_plan_load.cjs`、`scripts/test_plan_wrong_retry.cjs`、`scripts/test_question_progress.cjs`。
- 他Featureとの依存: 両問題集のQuestion Catalog、Practice、Progress。学習ルートが有効な間は共通Practiceで各問題のその日最初の回答だけが連続正解数を更新し、3連続に達した問題を既存割当からも完了扱いにする。回答数、正解数、XP、ランキング、学習時間、履歴は同日再回答でも従来どおり記録する。割当自体は `studyPlans.shared` が所有する。

## 問題一覧・セクション演習

- 機能: 状態で絞り込む一覧、一覧で「間違えた問題」に絞った全問の連続演習、セクション選択、モード選択、掲載順の再開位置。
- Route / 画面: `#list`、`#sectionList`、`#sectionStart`、出題は `#quiz`。
- 主なUI: `#filterBar`、`#listBody`、`#sectionListBody`、`[data-section-mode]`、`#sectionStartBody`。
- state / hooks相当: `listFilter`、`pickedSection`、`settings.sectionMode`、`renderList()`、`startWrongListSession()`、`renderSectionList()`、`openSectionStart()`、`startSectionModeSession()`。
- API / service: 共通Practice session、`saveSectionUid()`。
- DB: LocalStorage `cbt_section_progress_v1`、`cbt_settings_v2`、本別成績。クラウドへは成績とsessionが同期されるが、セクション再開位置自体は端末保存。
- 関連ファイル: `index.html` のbrowse/section grouping。
- 他Featureとの依存: Question Catalog、Practice、Progress。

## 学習分析・学習時間・XP

- 機能: 現在正答率、苦手分野、回答時間、日別学習時間、XP、レベル、ランク、連続正解・連続使用。現在正答率は、回答済みの各問題について最新回答だけを1件ずつ集計する。
- Route / 画面: `#stats` とホームのgame card、完了画面。
- 主なUI: `#studyTimeChart`、`#rankList`、`#slowList`、`#fastList`、`#levelUp`。
- state / hooks相当: `statsByBook`、`studyTime`、`game`、`openStats()`、`renderStudyTime()`、`awardXp()`、`rankInfo()`、`levelInfo()`。
- API / service: `saveStats()`、`saveGame()`、`addStudyTime()`、`cloudSyncSoon()`。
- DB: LocalStorage `cbt_stats_books_v1`、`cbt_study_time_v1`、`cbt_game_v1`。Firestoreの個人進捗。
- 関連ファイル: `index.html` のgamification/stats、`scripts/test_rank_progression.cjs`。
- 他Featureとの依存: Practiceが一次データを生成する。Leaderboardへは集計値だけを提供する。

## 麻布模試・科目別演習

- 機能: 6ブロックの問題画像、回答、連問の前進制御、公式解説、別冊写真、科目横断演習。科目別演習は、各問の確定直後に正誤・公式解説を確認する「1問ずつ答え合わせ」（初期値）と、全問終了後にまとめて確認する「本番形式」を選べる。回答開始後は保存済みのモードを固定し、完了後は前後移動・不正解だけの絞り込みで見直す。
- Route / 画面: `#mockHome`、`#mockExam`、`#mockSubjectPractice`。
- 主なUI: `#mockBlockSelector`、`#mockQuestionList`、`#mockExamChoices`、`#mockExamResult`、`#mockSubjectSelect`、`[data-mock-subject-mode]`、`#mockSubjectResult`、`#mockSubjectReviewNav`。
- state / hooks相当: `selectedMockBlock`、`mockProgress`、`mockSubjectSession`（`mode`、画面内だけの `feedbackKey`、`wrongOnly` を含む）、`renderMockHome()`、`renderMockExam()`、`startMockSubjectPractice()`。
- API / service: `saveMockProgress()`、`saveMockSubjectPractice()`、画像拡大viewer。
- DB: ブロック別 `togo_mock_azabu2026_block*_v1_{uid}` は圧縮進捗の `mockExams` として同期し、回答成績をランキング集計へ渡す。科目別 `togo_mock_subject_v1_{uid}_{subject}` は端末のみで、従来の `answers` に `mode` を追加する。`mode` のない回答済み旧データは本番形式として扱う。
- 関連ファイル: `index.html` のmock部分、`mock-assets/azabu-2026/blocks.js`、`subjects.js`、`photo-pages.js` と画像、`scripts/test_mock_exam.cjs`、`scripts/test_mock_subjects.cjs`。
- 他Featureとの依存: 通常問題集・通常成績・XPとは分離。Progressはブロック別進捗を同期し、Leaderboardはその公開集計だけを使う。

## CBT辞典演習

- 機能: 辞典② 956問、辞典③の誌上模試1（320問）・模試2（304問）を選び、原本ID順または領域／ブロック別に解く。正誤確定後に公式解説を表示し、教材別・端末別に再開する。
- Route / 画面: `#dictionaryHome`、`#dictionaryPractice`。
- 主なUI: `[data-dictionary-source]`、`#dictionaryStart`、`[data-dictionary-group]`、`#dictionaryQuestionImage`、`#dictionaryChoices`、`#dictionaryResult`、`#dictionaryExplanationImage`。
- state / hooks相当: `features/dictionary-practice/dictionary-practice.js` 内の `SOURCES`、`sourceKey`、`manifest`、`progress`、`currentIndex`、`renderHome()`、`open()`、`renderQuestion()`、`submit()`。
- API / service: 各教材manifestの静的fetch、LocalStorage、共通 `openImageZoom()`、`cloudSyncSoon()`。
- DB: 辞典②、辞典③模試1、模試2で異なるLocalStorage keyを使い、圧縮進捗の `practiceSets` として本人のFirestoreへ同期する。
- 関連ファイル: `features/dictionary-practice/`、`dictionary-assets/exercises/`、`dictionary-assets/mock-exams/`、`scripts/import_cbt_dictionary.py`、`scripts/import_cbt_dictionary3.py`、各静的テスト、`scripts/test_dictionary_browser.cjs`。
- 他Featureとの依存: Access後に利用し、画面切替と画像viewerを共用する。通常問題集、Study Route、Gamificationとは分離し、Progress & Syncへ専用履歴、Leaderboardへ公開集計だけを渡す。

## 歯科理工Forms演習

- 機能: 学校配布の歯科理工Formsで正答確認済みの47問を、CBT辞典とは別のホームタブから解く。単一選択と複数選択を採点し、回答後に正答参照画像を表示する。
- Route / 画面: ホームの `[data-book="dentalMaterials"]`、共用UIの `#dictionaryHome` と `#dictionaryPractice`。
- 主なUI: 歯科理工tab、`#dictionaryStart`、`#dictionaryQuestionImage`、`#dictionaryChoices`、`#dictionaryResult`、`#dictionaryExplanationImage`。
- state / hooks相当: `dentalMaterialsHomeSelected` と、共用viewer内の `SOURCES.dentalMaterials`、manifest、専用progress。
- API / service: 歯科理工manifestの静的fetch、LocalStorage、共通 `openImageZoom()`、`cloudSyncSoon()`。
- DB: `togo_dental_materials_forms_progress_v1_{uid}` を使い、辞典進捗と分けたまま圧縮進捗の `practiceSets` として本人のFirestoreへ同期する。
- 関連ファイル: `index.html`、`features/dictionary-practice/`、`dictionary-assets/dental-materials/`、`scripts/import_dental_materials_forms.py`、`scripts/test_dental_materials_forms.cjs`、`scripts/test_dictionary_browser.cjs`。
- 他Featureとの依存: Dictionary Practiceとは表示基盤だけを共用する。通常問題集、Study Route、Gamificationとは分離し、Progress & Syncへ専用履歴、Leaderboardへ公開集計だけを渡す。

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
- 主なUI / state: `safeGet/Set/Remove()`、`progressBackupData()`、`fullStatsPayload()`、`mergeCloudPayloads()`、`encodeCloudProgress()`、`decodeCloudProgress()`、`runCloudSync()`、`abandonCloudSyncAttempt()`、`cbtMergeCloud()`。
- API / service: `window.cbtCloud.save/readLatest/subscribe`。
- DB: `users/{uid}`。詳細は `database.md`。
- 関連ファイル: `index.html` のstorage/sync/Firebase gateway、`scripts/README-sync.md`、sync/progress browser tests。
- 他Featureとの依存: 学習Featureの保存先となる横断基盤。模試は `mockExams`、辞典・歯科理工は `practiceSets` の専用merge規則で統合する。保存Promiseが120秒で終わらない試行は世代を無効化して再試行し、古い完了結果で現在の同期状態を巻き戻さない。

## プロフィール・ランキング

- 機能: 表示名、アバター、許可ユーザー全員の集計ランキング、管理者による既存ユーザー集計更新。問題集1・2、麻布模試、CBT辞典、歯科理工について、回答数・正解数は全回答の累計、正答率は各問題の最新回答だけを合算する。
- Route / 画面: `#leaderboard`、`#unameModal`、`#avatarCropModal`。
- 主なUI: `#rankBtn`、`#lbBody`、`#lbRename`、`#lbAvatarInput`、ランキングtab。
- state / hooks相当: `lbMetric`、`leaderboardUsersCache`、`openLeaderboard()`、`renderLeaderboard()`、`leaderboardPublicSummary()`。
- API / service: `window.cbtCloud.publishLeaderboard/refreshLeaderboardMembers/fetchLeaderboard`、`cbtRename()`、`cbtSetAvatar()`。
- DB: private `users/{uid}` からpublic summary `leaderboard/{uid}` を派生。
- 関連ファイル: `index.html` のavatar/leaderboard/Firebase gateway、`firestore.rules`、`MEMBER_LEADERBOARD_SETUP.md`。
- 他Featureとの依存: Access、Progress/Gamificationの集計。個別問題、メール、計画を公開summaryへ入れない。

## 管理者画面

- 機能: ユーザー停止／解除、追加教材の許可／取り消し、授業制限on/off、休校日、現在授業だけの解除。
- Route / 画面: `#accessAdmin`。
- 主なUI: `#accessAdminList`、`#schoolEnabled`、`#schoolExemptList`、`#schoolReleaseClass`。
- state / hooks相当: `renderAccessAdmin()`、`renderSchoolSettings()`、`saveSchoolSettings()`、`canManageUsers()`。
- API / service: `window.cbtCloud.fetchAccessUsers/setUserBlocked/setMaterialAccess/fetchSchoolPolicy/setSchoolPolicy/releaseSchoolClass`。
- DB: `users` の管理者list読取、`accessControl/{uid}`、`materialAccess/{uid}`、`schoolAccess/settings`、停止時の `leaderboard/{uid}` 削除。
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
