# 許可ユーザー向けランキング（公開前確認待ち）

アプリだけの更新では完了しません。Firebaseのルールを先に公開し、その後にテスト済みPRをmainへ反映します。

## 共有する情報

表示名、写真アイコン、問題集1・2を合算した回答数・正解数・正答率・連続正解・連続使用・XPを、ログイン許可リストにあるメール確認済みユーザー間で共有します。

- ランキング専用の `leaderboard/{uid}` を使用。
- Gmail、問題ごとの履歴、学習計画、模試の回答、保存された詳細JSONは共有しません。
- `users/{uid}` の既存ルールを一般ユーザー向けに緩めません。自分の文書と従来の管理者だけがアクセスできます。
- ランキング用の書き込み失敗は、学習記録の同期失敗とは扱いません。
- 更新版でログイン・同期した人からランキングに反映されます。全員の既存データを管理者権限で一括移行する処理はありません。

## Firebaseで必要な操作

このクラウド環境にはFirebase管理用の接続がありません。秘密鍵・トークンをチャットやGitHubに貼る必要はありません。

1. Firebase Consoleの `cbtpass-a680e` → Firestore Database → ルールを開く。
2. 既存の `/users/{uid}` の許可が維持されることを確認し、このPRの `firestore.rules` にある `approvedHashes`・`canonicalEmail`・`approvedMember`・`validLeaderboard` と `/leaderboard/{uid}` のルールを反映する。既存の別用途のルールがあれば消さずに保持する。
3. Firebase側でルールを公開したら、その旨を返信する。
4. 共有する情報への公開承認後、アプリのPRをmainにマージしてPagesへ配備する。
5. 許可・メール確認済みの実アカウントでログイン・同期し、ランキング表示を確認する。この実アカウント確認はクラウドの疑似ブラウザーテストとは別。

本番ルールの内容や実ユーザーの認証は、この環境から検証できていません。現在のルールのコピーは必ず手元に残してください。

## 今後ユーザーを追加するとき

`index.html` の `ALLOW` と `firestore.rules` の `approvedHashes` に同じハッシュを追加します。Firebaseのルールも別途公開が必要です。CIは両リストの一致を検証します。

## テスト

通常の回帰テスト・ブラウザーテストに加え、CIの `firestore-rules` ジョブでFirebase Emulatorを使用します。プロジェクトIDは `demo-cbtpass-member-ranking` に固定し、実ユーザーや本番DBを操作しません。

ローカルでは `FIREBASE_TEST_MODULES` にテスト用node_modulesを指定し、Firestore Emulator経由で `node scripts/test_leaderboard_rules.cjs` を実行します。エミュレーターがなければテストは失敗します。
