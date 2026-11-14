# Mac開発環境への移行手順

最終確認日: 2026-11-07

この文書は、現在のCodexクラウド環境からMacへ `CBTPASSkiso` の開発を移し、修正、テスト、本番公開を継続するための手順です。アプリ本体はGitHubを正とし、Git管理外の原本PDFだけを別途移します。

## 1. 移行対象と現在の基準

- GitHub: `https://github.com/taigo921/CBTPASSkiso.git`
- 本番: `https://taigo921.github.io/CBTPASSkiso/`
- 移行直前のアプリ基準コミット: `934d0bd40cf5bdc0ec90748f0feac36f497da50b`
- 作業開始時は必ず最新の `origin/main` を取得する。上記コミットへ巻き戻さない。
- アプリはHTML/CSS/vanilla JavaScriptの静的サイトで、ビルド工程はない。
- 生成済みの問題JSON、画像、辞典②・③、学校Forms歯科理工、麻布模試はGitに含まれる。
- 学習記録は利用端末のLocalStorageとFirestoreにあり、開発フォルダの移行対象ではない。

クラウド側で確認した規模は、作業ツリー約897MB、Git履歴約665MBです。原本PDF、Playwrightのブラウザ、テスト用依存を含め、Macには最低5GB程度の空きを用意してください。

## 2. Gitとは別に移す必要があるファイル

現在のクラウド環境で、Git管理外かつ今後の画像修正に必要な原本は次の1件です。

|クラウド上の場所|Macでの推奨場所|サイズ|SHA-256|
|---|---|---:|---|
|`/workspace/clinical.pdf`|`~/Documents/CBTPASS-sources/clinical.pdf`|1,309,687,974 bytes|`458634e5e442eb3458917ea330cedaf9657d27cb3e66f3b6b556ab85caad64ef`|

クラウド画面から直接ダウンロードできない場合は、共有Driveにある同じ臨床PDFをMacへ再ダウンロードします。コピー後に確認します。

```sh
shasum -a 256 ~/Documents/CBTPASS-sources/clinical.pdf
stat -f '%z bytes' ~/Documents/CBTPASS-sources/clinical.pdf
```

SHAまたはサイズが異なる場合、そのPDFを既存のcrop座標で使わないでください。ページ構成が違う可能性があります。

辞典②、辞典③、学校Forms歯科理工の原本PDFは、現在のクラウド作業領域には残っていません。生成済み教材はGitから復元できますが、再インポートするときだけ共有Driveから原本を再取得してください。原本PDFはGitへ追加しません。

次はMacへコピーしません。

- `/workspace/.codex`、`.aws`、`.cache`、`.cloud-setup`
- `/opt/codex/...` のPlaywright
- クラウド側の `.git` フォルダそのもの
- トークン、Cookie、Firebaseサービスアカウント鍵

認証情報をファイルで移す必要はありません。MacでGitHub CLIへログインし直します。本番Firebaseルールは鍵ファイルではなくGitHub ActionsのOIDCで公開します。

## 3. Macへ必要なソフトを入れる

先にXcode Command Line ToolsとHomebrewを用意します。

```sh
xcode-select --install
```

Homebrewが未導入なら、`https://brew.sh/` の公式手順で導入します。その後、次を実行します。

```sh
brew update
brew install git gh node@24 python@3.12 openjdk@21 poppler
```

Node 24とJava 21をシェルから使えるようにします。Apple Silicon/Intelのどちらでも `brew --prefix` が正しい場所を返します。

```sh
echo 'export PATH="$(brew --prefix node@24)/bin:$(brew --prefix openjdk@21)/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

確認します。

```sh
git --version
node --version
npm --version
python3.12 --version
java -version
gh --version
pdftoppm -v
```

基準はNode 24、Python 3.12、Java 21です。

## 4. GitHubへログインしてcloneする

```sh
gh auth login --web --git-protocol https
gh auth setup-git
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/taigo921/CBTPASSkiso.git
cd CBTPASSkiso
git fetch --prune origin
git switch main
git pull --ff-only origin main
```

初回確認:

```sh
git status --short
git rev-parse HEAD
git rev-parse origin/main
git remote -v
```

`git status --short` は空、HEADと `origin/main` は一致している必要があります。

## 5. Pythonの画像/PDFツールを用意する

リポジトリ内へ仮想環境を作らず、Macユーザー用の仮想環境を使います。

```sh
mkdir -p ~/.venvs
python3.12 -m venv ~/.venvs/cbtpass
source ~/.venvs/cbtpass/bin/activate
python -m pip install --upgrade pip
python -m pip install 'PyMuPDF==1.26.6' 'Pillow==12.3.0' 'pypdfium2==5.3.0'
python -c 'import fitz, PIL, pypdfium2; print(fitz.version[0], PIL.__version__)'
```

新しいターミナルで画像処理をするときは、先に次を実行します。

```sh
source ~/.venvs/cbtpass/bin/activate
cd ~/Developer/CBTPASSkiso
```

画像を再生成すると、ライブラリやWebP encoderの差でバイト列が変わることがあります。固定SHAテストが落ちた場合は、テストを無理に通すためにSHAだけを書き換えず、原本との目視照合、正答、全パネル、切れの有無を確認してから意図的に更新してください。

## 6. PlaywrightとFirebase Emulator用依存を用意する

依存はリポジトリ外のキャッシュへ入れます。

```sh
export CBT_TOOLS_DIR="$HOME/Library/Caches/CBTPASSkiso"
mkdir -p "$CBT_TOOLS_DIR"
npm install --prefix "$CBT_TOOLS_DIR/browser" --no-audit --no-fund playwright@1.58.2
"$CBT_TOOLS_DIR/browser/node_modules/.bin/playwright" install chromium
npm install --prefix "$CBT_TOOLS_DIR/access-tools" --no-audit --no-fund firebase-tools@14.17.0 firebase@11.10.0 @firebase/rules-unit-testing@4.0.1
```

クラウド固有の `/opt/codex/...` や `/usr/bin/chromium` はMacでは使いません。PlaywrightがインストールしたChromiumをそのまま使います。

## 7. 移行直後の検証

### 7.1 通常回帰

Python仮想環境を有効にして、リポジトリ直下で実行します。

```sh
source ~/.venvs/cbtpass/bin/activate
cd ~/Developer/CBTPASSkiso
set -e
PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_firebase_publication.py
bash -n scripts/cloud/setup_firebase_federation.sh
for test in \
  test_sync \
  test_progress_preservation \
  test_mock_exam \
  test_mock_subjects \
  test_guide_zoom \
  test_app_update \
  test_access_control \
  test_school_hours \
  test_admin_ranking \
  test_paper_progress \
  test_route_review \
  test_study_plan_load \
  test_question_progress \
  test_current_accuracy \
  test_reported_question_images \
  test_dictionary_practice \
  test_dictionary3_practice \
  test_dental_materials_forms \
  test_rank_progression
do
  node "scripts/${test}.cjs"
done
node -e "const fs=require('fs'); for(const f of fs.readdirSync('data').filter(x=>x.endsWith('.json'))) JSON.parse(fs.readFileSync('data/'+f,'utf8')); console.log('PASS all data JSON')"
git diff --check
```

### 7.2 ブラウザ回帰

```sh
export CBT_TOOLS_DIR="$HOME/Library/Caches/CBTPASSkiso"
export PLAYWRIGHT_MODULE="$CBT_TOOLS_DIR/browser/node_modules/playwright"
node scripts/test_sync_browser.cjs
node scripts/test_blocked_login_browser.cjs
node scripts/test_dictionary_browser.cjs
```

### 7.3 Firestoreルール回帰

`firestore.rules`、認証、停止、授業制限、ランキング、同期形式を変えたときに実行します。

```sh
export CBT_TOOLS_DIR="$HOME/Library/Caches/CBTPASSkiso"
export FIREBASE_TEST_MODULES="$CBT_TOOLS_DIR/access-tools/node_modules"
export FIREBASE_EMULATORS_PATH="$CBT_TOOLS_DIR/firebase-emulators"
export CBT_REPO_DIR="$PWD"
export CBT_RULES_RUN="$(mktemp -d)"
node -e "require('fs').writeFileSync(process.env.CBT_RULES_RUN+'/firebase.json',JSON.stringify({firestore:{rules:process.env.CBT_REPO_DIR+'/firestore.rules'},emulators:{firestore:{host:'127.0.0.1',port:8080},ui:{enabled:false},singleProjectMode:true}}))"
cd "$CBT_RULES_RUN"
"$CBT_TOOLS_DIR/access-tools/node_modules/.bin/firebase" emulators:exec --only firestore --project demo-cbtpass-access --config firebase.json "node $CBT_REPO_DIR/scripts/test_access_rules.cjs && node $CBT_REPO_DIR/scripts/test_leaderboard_rules.cjs && node $CBT_REPO_DIR/scripts/test_school_rules.cjs"
cd "$CBT_REPO_DIR"
```

すべて成功すればMacへの基本移行は完了です。CIの完全な定義は常に `.github/workflows/tests.yml` を優先します。

## 8. ローカル表示

アプリはビルド不要です。リポジトリ直下で簡易サーバーを起動します。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

別ターミナルで確認します。

```sh
open http://127.0.0.1:8000/
```

終了はサーバーを動かしたターミナルで `Ctrl+C` です。本番ユーザーの進捗をテスト目的で変更しないでください。

## 9. 普段の作業開始手順

```sh
cd ~/Developer/CBTPASSkiso
git fetch --prune origin
git status --short
git log -1 --oneline origin/main
git switch -c codex/mac-work-YYYYMMDD origin/main
```

作業前に次を読みます。

1. `AGENTS.md`
2. `CONTINUATION.md`
3. `docs/CODEX_PROGRESS.md`
4. `docs/feature-map.md`
5. 変更内容に応じて `docs/routes.md`、`docs/database.md`、`docs/architecture.md`
6. テストと公開は `docs/development.md`

既存の変更がある状態で、`git reset --hard` や `git checkout --` を使って消さないでください。

## 10. 臨床PDFから画像を直す例

まずpreviewだけを作り、目視後に `--apply` します。

```sh
source ~/.venvs/cbtpass/bin/activate
cd ~/Developer/CBTPASSkiso
python scripts/restore_clinical_full_figures.py \
  ~/Documents/CBTPASS-sources/clinical.pdf \
  --uid E2-4-10-192 \
  --preview-dir /tmp/cbtpass-previews
open /tmp/cbtpass-previews/E2-4-10-192.webp
```

正しいことを確認した場合だけ適用します。

```sh
python scripts/restore_clinical_full_figures.py \
  ~/Documents/CBTPASS-sources/clinical.pdf \
  --uid E2-4-10-192 \
  --apply
node scripts/test_reported_question_images.cjs
git diff --check
```

UID、原本ページ、crop座標、固定画像SHA、問題の正答を同じ変更で記録します。原本PDF自体はcommitしません。

## 11. commit・公開手順

変更後は最低でも `docs/development.md` の対応テストを実行し、差分を確認します。

```sh
git status --short
git diff --check
git diff --stat
git add -p
git status --short
# git add -p に出ない新規ファイルだけは、内容を確認して個別に git add する
git commit -m '変更内容を表す短いメッセージ'
```

レビュー済みコミットを本番へ反映する運用では、最新 `main` との競合がないことを確認してから反映します。

```sh
git fetch origin
git rebase origin/main
git status --short
# rebase後のコミットでも必要な回帰テストを再実行する
git push -u origin HEAD
git push origin HEAD:main
```

`main` へのpushでPagesワークフローが起動します。push成功だけで公開完了にしません。

```sh
export CBT_COMMIT_SHA="$(git rev-parse HEAD)"
gh run list --commit "$CBT_COMMIT_SHA" --limit 10
```

`Regression tests` と `Test and publish Pages` の両方が成功し、本番URLの配信内容がローカルと一致するところまで確認します。Service Workerや教材を変えた場合は、`index.html` の `SERVICE_WORKER_BUILD` と `sw.js` の `APP_BUILD` を同じ新しい値にします。

## 12. Firestoreルールの本番公開

Pages公開とFirestoreルール公開は別です。`firestore.rules` を変えたときは次の順序を守ります。

1. ローカルのFirestore Emulatorテストを通す。
2. 対象コミットを40桁SHAで確定する。
3. GitHub Actionsの `Firebase rules (manual, keyless)` を `main` から `publish=false` で実行し、read-only接続確認を通す。
4. 変更内容の明示承認後だけ、同じコミットを `publish=true` で実行する。
5. ルール公開成功後に、それを必要とするアプリをPagesへ公開する。

CLI例:

```sh
export CBT_RULES_COMMIT="$(git rev-parse HEAD)"
gh workflow run firebase-rules.yml --ref main -f rules_commit="$CBT_RULES_COMMIT" -f publish=false
```

`publish=true` は、本番権限を変更する明示承認を得た場合だけ使用します。サービスアカウント鍵や個人トークンを作成・保存・貼付しません。

## 13. Mac側Codexへ最初に渡す指示

Mac側の新しいCodexセッションでは、次をそのまま最初に伝えます。

> `~/Developer/CBTPASSkiso` を作業対象にしてください。最初に `AGENTS.md`、`docs/MAC_MIGRATION.md`、`CONTINUATION.md`、`docs/CODEX_PROGRESS.md`、`docs/development.md` を読み、`git status`、HEAD、`origin/main`、実コードを照合してください。完了済み作業を繰り返さず、既存変更を消さないでください。臨床原本は `~/Documents/CBTPASS-sources/clinical.pdf` にあります。通常回帰、Playwright、必要時はFirestore Emulatorを実行し、公開時はActions成功と本番配信物の一致まで確認してください。

## 14. 移行完了チェックリスト

- [ ] `origin/main` のcloneが完了した
- [ ] `git status --short` が空である
- [ ] GitHubへのpush権限を確認した
- [ ] Node 24、Python 3.12、Java 21が使える
- [ ] Python PDF/画像ライブラリを仮想環境へ入れた
- [ ] Playwright Chromiumを入れた
- [ ] 通常回帰、全JSON、ブラウザ回帰が成功した
- [ ] 必要ならFirestore Emulator 3テストが成功した
- [ ] `clinical.pdf` のサイズとSHA-256が一致した
- [ ] 原本PDFや認証情報をGitへ追加していない
- [ ] Mac側Codexが継続文書と現在のHEADを確認した

ここまで完了したら、クラウド側の作業領域を参照しなくても通常開発と公開を継続できます。
