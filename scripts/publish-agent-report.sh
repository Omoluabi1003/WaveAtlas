#!/usr/bin/env bash
set -euo pipefail
agent_branch="$1"
shift
case "$agent_branch" in
  chore/waveatlas-stream-health-agent|chore/global-radio-discovery-agent|chore/waveatlas-operational-agents|chore/waveatlas-queen-memory|chore/waveatlas-queen-reports) ;;
  *) echo 'Unexpected report branch' >&2; exit 1 ;;
esac
# Generated review branches contain only the caller's explicit artifact paths.
# A lease prevents overwriting a branch that changed during this job.
agent_previous_sha="$(git ls-remote --heads origin "refs/heads/$agent_branch" | cut -f1)"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -- "$@"
if git diff --cached --quiet; then
  echo 'No generated report changes to publish.'
  exit 0
fi
git commit -m "chore: refresh ${agent_branch#chore/} report"
git push "--force-with-lease=refs/heads/$agent_branch:$agent_previous_sha" origin "HEAD:refs/heads/$agent_branch"
agent_review_url="https://github.com/${GITHUB_REPOSITORY}/compare/main...${agent_branch}?expand=1"
printf '### Agent report ready for review\n\n[Review generated changes](%s)\n\nThis branch is not merged automatically.\n' "$agent_review_url" >> "$GITHUB_STEP_SUMMARY"
