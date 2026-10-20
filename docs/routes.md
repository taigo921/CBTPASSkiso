# Screen and route map

このアプリにURLルーターはない。すべて `index.html` 上のsectionで、`showOnly(id)` が表示を切り替える。認証・授業制限・viewerはsectionとは別のoverlayである。ブラウザURLで保持する画面状態は問題集選択の `?book=book1|book2` だけ。

|Route / screen|目的|関連Feature|主なUI|使用データ|主要関連箇所|
|---|---|---|---|---|---|
|`#authGate`|Google／メールログイン、未許可案内|Access & Identity|`#gbtn`, `#authEmailBox`, `#authErr`|Firebase Auth、許可メールhash|`index.html` auth/Firebase bootstrap、`SETUP-LOGIN.md`|
|`#blockedLoginOverlay`|個別停止ユーザーへ停止表示|Access & Identity|`#blockedLoginBack`|`accessControl/{uid}`、端末notice key|`setBlockedLoginImage()`, `requireAccess()`, `watchAccess()`|
|`#schoolGate`|授業中の利用停止と自動解除|Access & Identity|`#schoolGateImage`, `#schoolGateMessage`, logout|`schoolAccess/settings`、JST時間割|`schoolRestriction()`, `updateSchoolGate()`, `firestore.rules`|
|`#home` / `#regularHome`|問題集選択、成績概要、再開、各機能入口|Question Catalog、Progress|book tabs、`#resumeCard`、mode buttons|問題JSON、本別成績、session、settings|`renderHome()`, `switchBook()`|
|`#home` / `#mockHome`|模試block・科目選択、問題一覧|Mock Exam|block selector、filters、subject picker|模試assets、block別進捗|`renderMockHome()`|
|`#studyPlan`|日次学習ルート、calendar、追加学習、本の進捗|Study Route|plan buttons/calendar/paper form|両問題集、shared plan、成績|`renderStudyPlan()` とplan関数群|
|`#quiz`|通常問題・計画・セクションの共通出題|Practice Session|question/choices/figure/answer/footer|問題、`session`、本別成績|`startSession()`, `renderQuestion()`, `pick()`, `next()`|
|`#finish`|session結果と問題別review|Practice Session|score、review accordion|`session.records`|`finish()`|
|`#stats`|学習時間、苦手分野、速度分析|Browse & Analysis|time chart、rank/slow/fast lists|本別成績、学習時間、settings|`openStats()`, `renderStudyTime()`|
|`#list`|全問題を状態で絞り込み、単問開始|Browse & Analysis|`#filterBar`, `#listBody`|問題、本別成績|`openList()`, `renderList()`|
|`#sectionList`|セクションと出題modeを選択|Browse & Analysis|section mode buttons/list|問題、本別成績、settings|`openSectionList()`, `renderSectionList()`|
|`#sectionStart`|掲載順modeの開始位置を選択|Browse & Analysis|`#sectionStartBody`|問題、端末内section再開位置|`openSectionStart()`, `startSectionModeSession()`|
|`#mockExam`|block別模試、採点、公式解説|Mock Exam|source image、A-E、prev/next、zoom|block問題、写真page、block進捗|`renderMockExam()`, `submitMockExam()`|
|`#mockSubjectPractice`|科目をblock横断で順番演習|Mock Exam|subject question/choices/review|科目分類、端末内科目session|`startMockSubjectPractice()`, `renderMockSubjectPractice()`|
|`#leaderboard`|公開集計の順位、名前・写真編集|Leaderboard & Profile|tabs、list、rename、avatar|`leaderboard/{uid}`、本人profile|`openLeaderboard()`, `renderLeaderboard()`|
|`#accessAdmin`|停止／解除、授業制限・休校日管理|Access Administration|user list、school controls|`users`, `accessControl`, `schoolAccess`|`openAccessAdmin()`, `renderAccessAdmin()`, `renderSchoolSettings()`|
|`#guideViewer` overlay|ガイド編の参照と拡大|Guide Viewer|page images、zoom controls|`guide/*.webp`、`guide_ref`|`openGuide()`, `buildGuidePages()`|
|`#imageZoomViewer` overlay|問題・模試画像の拡大|Guide Viewer|zoom/pan stage|表示中の画像URL/data URL|`openImageZoom()` とpointer handlers|
|`#unameModal` / `#avatarCropModal`|プロフィール入力・写真crop|Leaderboard & Profile|text input、canvas、zoom|`users/{uid}` profile|`askUsername()`, avatar関数群|
|`#storageWarning`|端末保存失敗とbackup誘導|Progress & Sync|warning、export button|LocalStorage失敗key|`safeSet()`, `updateStorageWarning()`|

## 主な遷移

- 認証成功 → access確認 → 授業確認 → cloud merge → `#home`。
- `#home` → 通常mode／学習計画／一覧／セクション → 共通 `#quiz` → `#finish` または元画面。
- `#home` の模試tab → `#mockExam` または `#mockSubjectPractice` → 模試home。
- `#home` → `#stats`、`#leaderboard`、管理者のみ `#accessAdmin`。
- どの学習画面からでもガイド／画像viewerをoverlay表示でき、閉じると元のscreenを維持する。
- 個別停止または授業制限の通知は現在screenをoverlayし、許可が戻った後に認証・同期を再確認する。

新しいscreenを追加するときは、markup、`showOnly()` のscreen一覧、入口event、戻り先、footer/timerの表示、再開状態、access overlayとの共存を一組で変更する。
