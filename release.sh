#!/bin/bash
# CueJump 发布脚本：让「本地安装的那份」和「仓库/Release 里的那份」永远是同一次构建
#
#   ./release.sh 1.2.3     指定版本
#   ./release.sh           自动 patch +1
#   ./release.sh --dry-run 只打印将要做的事
#
# 做四件事：bump 版本 → 打包 + 装进 IINA → 提交并打 tag → 建 GitHub Release
set -euo pipefail
cd "$(dirname "$0")"

DRY=0
ARG=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    *) ARG="$a" ;;
  esac
done

# ---------- 1. 版本 ----------
CUR=$(python3 -c "import json;print(json.load(open('Info.json'))['version'])")
if [ -n "$ARG" ]; then
  NEW="$ARG"
else
  NEW=$(python3 - "$CUR" <<'PY'
import sys
a = sys.argv[1].split('.')
a[-1] = str(int(a[-1]) + 1)
print('.'.join(a))
PY
)
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "工作区有未提交改动，先处理再发布。" >&2
  exit 1
fi

echo "版本：$CUR → $NEW"

python3 - "$NEW" <<'PY'
import json, sys, io
new = sys.argv[1]
with open('Info.json') as f:
    d = json.load(f)
d['version'] = new
d['ghVersion'] = int(d.get('ghVersion', 0)) + 1   # 更新检查用的整数，每次发布 +1
with io.open('Info.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
print("Info.json: version=%s ghVersion=%s" % (d['version'], d['ghVersion']))
PY

if [ "$DRY" = "1" ]; then
  echo "[dry-run] 后续会：打包 → 安装 → 提交 → tag v$NEW → push → gh release create"
  git checkout -- Info.json 2>/dev/null || true
  exit 0
fi

# ---------- 2. 打包 + 本地安装 ----------
ARCHIVE=$(/Applications/IINA.app/Contents/MacOS/iina-plugin pack . | sed -n 's/^Created archive //p' | tail -1)
echo "打包：$ARCHIVE"

PLUGINS="$HOME/Library/Application Support/com.colliderli.iina/plugins"
ID=$(python3 -c "import json;print(json.load(open('Info.json'))['identifier'])")
DEST="$PLUGINS/$ID.iinaplugin"
mkdir -p "$DEST"
rsync -a --delete ./ "$DEST/" \
  --exclude '*.iinaplgz' --exclude '*.md' --exclude 'docs' \
  --exclude '.gitignore' --exclude 'LICENSE' --exclude '.git' --exclude 'release.sh'
echo "已安装：$DEST（重启 IINA 生效）"

# ---------- 3. 提交 + tag ----------
git add -A
git commit -q -m "CueJump $NEW"
git tag "v$NEW"
git push -q origin main
git push -q origin "v$NEW"
echo "已推送 main 与 tag v$NEW"

# ---------- 4. Release ----------
gh release create "v$NEW" "$ARCHIVE" \
  --title "CueJump $NEW" \
  --notes "Release $NEW."
echo "Release: $(gh release view "v$NEW" --json url --jq .url)"
