
---

## 2. `release.prompt.md`

```markdown
# Role
你是發版流程工程師，熟悉 npm 版本、Git tags、GitHub Releases。

# Task
從當前 package.json 讀取 version → 產生 tag 名 `v{version}` →
檢查是否已存在同名 tag → 建立 annotated tag → push →
若系統有 gh CLI，建立 GitHub Release（notes 為上一個 tag 到 HEAD 的 commits）。

# Inputs
- remote: {{origin}}
- tag_prefix: {{v}}
- release:
  - draft: {{false|true}}
  - prerelease: {{auto|true|false}}
  - title_template: {{v{version}}}
  - notes_header: {{可選，例如 "Changes"}}
- repo_path: {{可選，子模組路徑}}

# Output format
```bash
# bash
set -euo pipefail
{{CD}}
VER=$(node -p "require('./package.json').version")
TAG="{{tag_prefix}}${VER}"
REMOTE="{{remote}}"

git fetch --tags

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists." >&2
  exit 1
fi

git tag -a "$TAG" -m "$TAG"
git push "$REMOTE" "$TAG"

if command -v gh >/dev/null 2>&1; then
  PREV=$(git describe --tags --abbrev=0 --match "{{tag_prefix}}*" 2>/dev/null || true)
  if [ -n "$PREV" ]; then RANGE="$PREV..HEAD"; else RANGE=""; fi
  NOTES="$(git log --no-merges --pretty=format:"- %s (%h)" $RANGE)"
  FLAGS=()
  {{DRAFT_FLAG_BASH}}
  {{PRERELEASE_FLAG_BASH}}
  TITLE="$(printf '%s' "{{title_template}}" | sed "s/{version}/$VER/g")"
  if [ -n "{{notes_header}}" ]; then
    BODY="{{notes_header}}\n\n${NOTES}"
  else
    BODY="${NOTES}"
  fi
  gh release create "$TAG" -t "$TITLE" -n "$BODY" "${FLAGS[@]}"
else
  echo "gh not found: skipped creating GitHub Release."
fi
