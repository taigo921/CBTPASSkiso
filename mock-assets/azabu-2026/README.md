# Azabu CBT mock exam 2026

The mock tab contains blocks 1–6: 60, 60, 60, 60, 40, 40 questions (320 total).

## Blocks 2–6 import

Source: user-supplied `9:19麻布模試/CBT模試2026 解答と解説.pdf` in the parent workspace. PDF page numbers below are one-based file pages, not printed page numbers.

- Block 2: pages 36–67, 60 questions.
- Block 3: pages 69–100, 60 questions.
- Block 4: pages 102–134, 60 questions.
- Block 5: pages 136–171, 40 questions, variable 5–10 choices.
- Block 6: pages 173–203, 40 questions, 5 choices.

Question panels are cropped from the supplied answer/explanation book to avoid importing the user's selected radio buttons from the exam screenshots. Answer boxes were extracted with OCR. Ambiguous block 3 question 41 (C) and block 5 question 8 (I) were checked visually. Every question crop was inspected on contact sheets. Question 24 in block 2 needed the boundary detector corrected to avoid confusing the word 問題 in a choice with the explanation heading.

`blocks.js` contains the 260 added records. Question images are in `block2`–`block6`; official explanation pages are shared under `explanations`. Multi-page explanations retain their page sequence.

## Behavior

Blocks 1–4 permit question-list and previous/next navigation. Blocks 5–6 are forward-only: confirmed answers cannot be changed, the next unanswered item is derived from saved answers, and future questions cannot be skipped to. Correctness and explanations are only shown after the entire linked block is finished. Finished review is read-only.

Progress is stored locally, separately for each block and signed-in UID, under `togo_mock_azabu2026_block{N}_v1_{uid}`. The existing block 1 key is preserved. This does not add cloud synchronization for mock progress.

## Verification

Run `node scripts/test_mock_exam.cjs`: 2,049 assertions cover catalog counts, image paths, answer choices, block/user isolation, interrupted selection and answer restoration, all 80 linked confirmations, navigation locks, and read-only review. All inline JavaScript is syntax-checked.

A separate local Chromium smoke test passed at tablet (1024px) and phone (390px) widths, including reload/resume, all 40 answers in each linked block, list locking, block 2 previous/next, and no page JavaScript errors. Authentication was isolated with a test user; production cloud data was not touched. iPhone/iPad hardware and real authentication were not tested by that smoke test.

## Subject practice

The user-provided answer/subject tables for all six blocks classify all 320 questions into 21 subjects. `subjects.js` preserves table order; it adds metadata without changing answer keys or source images. The mock tab can collect the chosen subject across blocks. Every linked group stays complete and in order; correctness and explanation pages become available only when the entire subject practice is finished.

Practice answers use separate per-subject, per-user local storage keys (`togo_mock_subject_v1_...`). They do not overwrite the original block results or change XP, normal study progress, or cloud records. This practice mode is local to the device and is not included in cloud sync/export. Run `node scripts/test_mock_subjects.cjs` and the browser smoke test in addition to existing regression checks.
