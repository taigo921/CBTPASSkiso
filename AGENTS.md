# toGO development and publication

Read CLOUD_HANDOFF.md and scripts/README-sync.md before changes. Use the existing checkout; do not create a worktree unless requested.

For requested fixes, preserve the existing static app and GitHub Pages hosting. Test before publication. Run all four scripts/test_{sync,mock_exam,admin_ranking,route_review}.cjs tests, scripts/test_sync_browser.cjs with an available Playwright/Chromium installation, git diff --check, and JSON parsing for data files. Add targeted checks when a change needs them. Never publish when a required test fails or has not run successfully.

For major changes to authentication, synchronization, or personal data, finish implementation and tests on a review branch, explain the concrete change and risks, and obtain explicit user confirmation before merging or publishing. A general request to enable future publication does not approve those specific changes. Do not delete or reset personal progress to resolve bugs. Never commit private backups, passwords, private keys, or tokens.

For routine fixes requested by the user, proceed through testing and production publication using the verified existing Pages configuration. Inspect the current Pages source and deployment mechanism before changing it. Use a branch/PR and reviewable changes; stage only intended files. A successful Git push is not proof of deployment. Verify the deployment result and compare the served content with the intended commit. Report any missing GitHub API, workflow, or Pages permissions precisely; do not infer API authorization from Git proxy access. Firebase rules require a separate authorized deployment and are not deployed by GitHub Pages.

Until Pages source and a test-gated deployment path are verified, do not claim automated production publication is configured. Do not add a deployment workflow based on a guessed Pages source.
