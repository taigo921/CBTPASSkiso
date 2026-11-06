# Sync regression checks

Run `node scripts/test_sync.cjs` and `node scripts/test_mock_exam.cjs`.
With Playwright available, run `node scripts/test_sync_browser.cjs`.
`PLAYWRIGHT_MODULE` may name an absolute installed Playwright module path.

To check a private exported backup without uploading it, set `PROGRESS_BACKUP` to
its absolute path when running `test_sync.cjs`. Never commit the backup.
The test prints only counts/size, estimates default Firestore index entries, and
checks that encoding/decoding preserves books, plans, mock answers, dictionary /
dental-material attempts and resumes.

Cloud wire format 10/21-1 stores detailed maps as JSON text split into 600 KB or
smaller documents under `users/{uid}/progressChunks`. The user document keeps a
`progressDataV2` manifest with generation, count and length. Root book summaries,
shared XP and time remain available as before. Manifest and chunks are replaced in
one transaction. Missing, mixed-generation or malformed chunks throw and block
writes rather than resetting progress. The reader also merges legacy
`progressDataV1` and top-level detailed maps before removing them in the next
successful v2 transaction, so an old device cannot silently erase newer answers.
The packed detail also contains `practiceSets`: CBT辞典②、辞典③模試1・2、
学校Forms歯科理工のattempt logsを教材別にマージし、ランキングでは累計回答数・
累計正解数と各問題の最新回答による正答率だけを公開する。

The September 23 user backup measured 51,249 default index entries before and 310
after, with 483,097 bytes of packed wire JSON. This exceeds the 40,000-entry limit
before migration under default indexing, but not afterwards. Production index
configuration and actual device success are not verified by these isolated tests.
The format avoids the 1 MiB document/string limit; each write is also bounded to
12 chunks so the 10 MiB transaction limit retains headroom.

Automatic writes are debounced for 30 seconds and automatic leaderboard summary
publication is limited to once per 10 minutes per open app session. A Firestore
`resource-exhausted` response starts an hour-scale backoff with jitter; subsequent
local changes remain dirty but do not cancel that backoff. The user can still use
`今すぐ同期` to retry explicitly. This prevents multiple open devices from retrying
every minute and prolonging a project-level daily quota exhaustion.

References: https://firebase.google.com/docs/firestore/quotas and
https://firebase.google.com/docs/firestore/query-data/index-overview
