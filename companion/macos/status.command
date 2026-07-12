#!/bin/zsh
set -u

PACKAGE_DIR="${0:A:h}"
NODE="$PACKAGE_DIR/payload/runtime/node"

"$NODE" "$PACKAGE_DIR/installer.mjs" status
STATUS=$?
if [[ $STATUS -eq 0 ]]; then
  /usr/bin/curl -sS http://127.0.0.1:3000/health || true
  echo
fi
echo
read -k 1 "?按任意键关闭窗口…"
echo
exit $STATUS
