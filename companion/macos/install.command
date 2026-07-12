#!/bin/zsh
set -u

PACKAGE_DIR="${0:A:h}"
NODE="$PACKAGE_DIR/payload/runtime/node"

echo "正在安装知乎提问助手本地伴侣程序…"
"$NODE" "$PACKAGE_DIR/installer.mjs" install
STATUS=$?

if [[ $STATUS -eq 0 ]]; then
  echo
  echo "安装成功。请在 Chrome 打开 chrome://extensions，加载以下目录："
  echo "$HOME/Library/Application Support/ZhihuQuestionAssistant/extension"
else
  echo
  echo "安装失败，退出码：$STATUS"
fi

echo
read -k 1 "?按任意键关闭窗口…"
echo
exit $STATUS
