# ログイン（Googleアカウント制限）セットアップ手順

CBTPASSを「許可したGmailの友達だけ」使えるようにする設定です。
`index.html` の一番下（`▼ ログイン関所ロジック`）の **2か所だけ** 書き換えれば完成します。

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

## ② index.html に貼る

`index.html` 末尾のこの部分を書き換え：

```js
const CLIENT_ID = "PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com"; // ← ①でコピーしたIDに置換
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

## ③ 反映

`index.html` を commit → push すれば GitHub Pages に反映されます。
数分後に https://taigo921.github.io を開いてログインを確認。

---

## 友達の追加・削除
- **追加**：その人のGmailを「OAuth同意画面のテストユーザー」に足す＋ハッシュを `ALLOW` に足す → push
- **削除**：`ALLOW` からハッシュを消す → push（次回ログインから弾かれる。すでにログイン中の端末は次回リロード時まで有効）

## 仕組みメモ
- ログイン成功時、メアドは端末の `localStorage`（`cbt_auth_email`）に保存され、次回から自動解錠。
- 左下「ログアウト」でその保存を消して関所に戻る。
- メアドは平文でリポジトリに置かず、SHA-256ハッシュで照合しているのでGitHub上に友達のメアドは出ません。
