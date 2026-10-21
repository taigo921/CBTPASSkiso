# Sync regression checks

Run `node scripts/test_sync.cjs` and `node scripts/test_mock_exam.cjs`.
With Playwright available, run `node scripts/test_sync_browser.cjs`.
`PLAYWRIGHT_MODULE` may name an absolute installed Playwright module path.

To check a private exported backup without uploading it, set `PROGRESS_BACKUP` to
its absolute path when running `test_sync.cjs`. Never commit the backup.
The test prints only counts/size, estimates default Firestore index entries, and
checks that encoding/decoding preserves books, plans, mock answers and resumes.

Cloud wire format 10/21-1 stores detailed maps as JSON text split into 600 KB or
smaller documents under `users/{uid}/progressChunks`. The user document keeps a
`progressDataV2` manifest with generation, count and length. Root book summaries,
shared XP and time remain available as before. Manifest and chunks are replaced in
one transaction. Missing, mixed-generation or malformed chunks throw and block
writes rather than resetting progress. The reader also merges legacy
`progressDataV1` and top-level detailed maps before removing them in the next
successful v2 transaction, so an old device cannot silently erase newer answers.

The September 23 user backup measured 51,249 default index entries before and 310
after, with 483,097 bytes of packed wire JSON. This exceeds the 40,000-entry limit
before migration under default indexing, but not afterwards. Production index
configuration and actual device success are not verified by these isolated tests.
The format avoids the 1 MiB document/string limit; each write is also bounded to
12 chunks so the 10 MiB transaction limit retains headroom.

References: https://firebase.google.com/docs/firestore/quotas and
https://firebase.google.com/docs/firestore/query-data/index-overview
