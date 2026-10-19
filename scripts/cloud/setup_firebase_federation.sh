#!/usr/bin/env bash
# Run once in Google Cloud Shell, signed in as a project IAM administrator.
set -euo pipefail
project=cbtpass-a680e
pool=cbtpass-github
provider=repo-1283596898
account=cbtpass-rules-publisher
role=cbtpassRulesPublisher
repo_id=1283596898
workflow='taigo921/CBTPASSkiso/.github/workflows/firebase-rules.yml@refs/heads/main'
command -v gcloud >/dev/null
number=$(gcloud projects describe "$project" --format='value(projectNumber)')
test -n "$number"
gcloud services enable firebaserules.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$project"
if ! gcloud iam service-accounts describe "$account@$project.iam.gserviceaccount.com" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$account" --project="$project" --display-name='CBTPASS Firestore rules publication'
fi
permissions='firebaserules.rulesets.create,firebaserules.rulesets.get,firebaserules.releases.get,firebaserules.releases.update'
if gcloud iam roles describe "$role" --project="$project" >/dev/null 2>&1; then
  gcloud iam roles update "$role" --project="$project" --title='CBTPASS rules publisher' --permissions="$permissions" --stage=GA
else
  gcloud iam roles create "$role" --project="$project" --title='CBTPASS rules publisher' --permissions="$permissions" --stage=GA
fi
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$account@$project.iam.gserviceaccount.com" --role="projects/$project/roles/$role" --condition=None >/dev/null
if ! gcloud iam workload-identity-pools describe "$pool" --location=global --project="$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool" --location=global --project="$project" --display-name='CBTPASS GitHub'
fi
condition="assertion.repository_id == '$repo_id' && assertion.repository_owner_id == '287651220' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '$workflow'"
provider_args=(--project="$project" --location=global --workload-identity-pool="$pool" --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition="$condition")
if gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$provider" "${provider_args[@]}"
else
  gcloud iam workload-identity-pools providers create-oidc "$provider" "${provider_args[@]}"
fi
gcloud iam service-accounts add-iam-policy-binding "$account@$project.iam.gserviceaccount.com" --project="$project" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository_id/$repo_id" >/dev/null
printf '\nGitHub Actions repository variables (public resource names, not secrets):\n'
printf 'FIREBASE_WIF_PROVIDER=projects/%s/locations/global/workloadIdentityPools/%s/providers/%s\n' "$number" "$pool" "$provider"
printf 'FIREBASE_DEPLOY_SERVICE_ACCOUNT=%s@%s.iam.gserviceaccount.com\n' "$account" "$project"
