#!/bin/zsh
set -u

PACKAGE_DIR="${0:A:h}"
NODE="$PACKAGE_DIR/payload/runtime/node"

echo "这将停止后台服务并删除本地伴侣程序及其配置。"
read "REPLY?输入 y 确认卸载："
if [[ "$REPLY" != "y" && "$REPLY" != "Y" ]]; then
  echo "已取消。"
  exit 0
fi

"$NODE" "$PACKAGE_DIR/installer.mjs" uninstall
STATUS=$?
echo
read -k 1 "?按任意键关闭窗口…"
echo
exit $STATUS
