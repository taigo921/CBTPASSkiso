# ログイン（Googleアカウント制限）セットアップ手順

toGOを「許可したGoogle／Firebase Authユーザーだけ」使えるようにする設定です。
現在はクライアントの許可hashだけでなく、Firebase Authentication、`accessControl`、授業時間、Firestoreルールでも制限します。許可ユーザーを変更するときは `index.html` と `firestore.rules` を同じ変更で更新してください。

> ⚠️ 前提：これは「普通の人・知らない人を追い払う関所」です。
> データ本体（`data/*.json`）はURL直打ちで技術的には取得できます（github.io無料構成の限界）。
> 中身の完全な流出防止まではできない点は承知の上で運用してください。

---

## ① Google の「クライアントID」を作る

1. https://console.cloud.google.com/ にログイン（自分のGoogleアカウント）
2. 上部でプロジェクトを新規作成（名前は何でもOK：例 `cbtpass`）
3. 左メニュー「APIとサービス」→「OAuth 同意画面」
   - User Type：**外部** を選択して作成
   - アプリ名・サポートメール（自分）を入力して保存
   - 「テストユーザー」に **自分＋友達のGmail** を追加
     （※テスト状態のままなら、ここに載ってない人はそもそもログインできない＝おまけの二重ロック）
4. 左メニュー「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   - アプリの種類：**ウェブ アプリケーション**
   - 「承認済みの JavaScript 生成元」に次を追加：
     - `https://taigo921.github.io`
     - （ローカル確認するなら `http://localhost:8000` なども）
   - リダイレクトURIは不要（空でOK）
   - 作成すると出る **クライアントID**（`......apps.googleusercontent.com`）をコピー

## ② アプリとFirestoreルールへ反映する

GoogleクライアントIDを変更する場合は、`index.html` の `GIS_CLIENT_ID` を更新します。Firebaseプロジェクト自体を変更する場合だけ、同じ認証ブロックの `firebaseConfig` も更新します。

許可ユーザーは `index.html` の `ALLOW` と、`firestore.rules` の `approvedHashes()` の両方へ同じSHA-256 hashを登録します。

```js
const GIS_CLIENT_ID = "PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com";
const ALLOW = [
  "（自分のメールのハッシュ）",   // 自分@gmail.com
  "（友達のメールのハッシュ）",   // 友達@gmail.com
];
```

### メールのハッシュの出し方
ブラウザでこのページを開き、開発者ツールのコンソール（F12 → Console）で：

```js
await cbtHash('friend@gmail.com')
```

と打つと出る長い16進文字列を、`ALLOW` に貼るだけ。人数分くり返す。

> セットアップ前でも使える単体版（どのページのコンソールでも動く）：
> ```js
> (async e=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.toLowerCase().trim())))].map(x=>x.toString(16).padStart(2,'0')).join(''))('friend@gmail.com')
> ```

**⚠️ 自分のメールのハッシュを入れ忘れると自分もログインできなくなります。**

## ③ テストと反映

1. `ALLOW` と `approvedHashes()` の一致を含むアクセス制御・Firestore Emulatorテストを実行します。コマンドは `docs/development.md` を参照してください。
2. `firestore.rules` をレビュー済みコミットから手動ルール公開workflowで反映します。Pagesの公開だけではルールは変わりません。
3. ルール反映後にアプリをmainへ反映し、GitHub Pages workflowの成功と配信内容を確認します。
4. 許可ユーザー、未許可ユーザー、停止ユーザーでログイン結果を確認します。本番ユーザーをテスト目的で停止しないでください。

---

## 友達の追加・削除
- **追加**：OAuth同意画面がテスト状態なら対象Googleアカウントもテストユーザーに追加し、hashを `ALLOW` と `approvedHashes()` に追加する。
- **削除**：hashを両方から削除する。即時停止が必要なら、管理者画面のUID単位のアクセス停止も使用する。

## 仕組みメモ
- ログイン状態の永続化はFirebase Authenticationが管理する。アプリ独自の `cbt_auth_email` は使用しない。
- 左下「ログアウト」は `auth.signOut()` を実行して認証関所へ戻る。
- メアドは平文でリポジトリに置かず、SHA-256ハッシュで照合しているのでGitHub上に友達のメアドは出ません。
- Firestoreは同じ許可hashに加え、メール確認、個別停止、授業時間をサーバー側で再判定する。ボタン非表示やクライアント判定だけを認可境界にしない。
