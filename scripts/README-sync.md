# Sync regression checks

Run `node scripts/test_sync.cjs` and `node scripts/test_mock_exam.cjs`.
With Playwright available, run `node scripts/test_sync_browser.cjs`.
`PLAYWRIGHT_MODULE` may name an absolute installed Playwright module path.

To check a private exported backup without uploading it, set `PROGRESS_BACKUP` to
its absolute path when running `test_sync.cjs`. Never commit the backup.
The test prints only counts/size, estimates default Firestore index entries, and
checks that encoding/decoding preserves books, plans, mock answers and resumes.

Cloud wire format 9/23-4 stores detailed maps in `progressDataV1` JSON text.
Root book summaries, shared XP and time remain available as before. Migration is
atomic inside the existing transaction: decode old and new records, merge, pack,
then remove obsolete indexed maps in the same write. Legacy reads remain supported.
Malformed packed data throws and blocks writes rather than resetting progress.
All devices must update to read this format.

The September 23 user backup measured 51,249 default index entries before and 310
after, with 483,097 bytes of packed wire JSON. This exceeds the 40,000-entry limit
before migration under default indexing, but not afterwards. Production index
configuration and actual device success are not verified by these isolated tests.
The document 1 MiB size limit is unchanged.

References: https://firebase.google.com/docs/firestore/quotas and
https://firebase.google.com/docs/firestore/query-data/index-overview
