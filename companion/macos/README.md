# 知乎提问助手本地伴侣程序（macOS）

本安装包内置与文件名所示架构匹配的 Node.js 运行时和后端，用户无需安装 Node.js、npm 或手动打开终端服务。`macos-arm64` 适用于 Apple Silicon，`macos-x64` 适用于 Intel Mac。

## 安装

1. 双击 `install.command`。如果 macOS 拦截，请右键点击它并选择“打开”。
2. 在 Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择：

   `~/Library/Application Support/ZhihuQuestionAssistant/extension`

4. 打开扩展的模型设置，选择：
   - OpenAI-compatible API：填写 Base URL、API Key 和模型名。
   - Codex CLI：需要本机已安装并登录 Codex CLI。

API Key 只保存在当前 Chrome 会话中，完全退出 Chrome 后需重新填写。

## 管理

- `status.command`：检查后台服务。
- `uninstall.command`：停止服务并删除伴侣程序。
- 安装目录：`~/Library/Application Support/ZhihuQuestionAssistant`
- 日志目录：`~/Library/Application Support/ZhihuQuestionAssistant/logs`

## 当前限制

本包尚未进行 Apple 开发者签名和公证，适合小范围测试分发。可在 `build-manifest.json` 中确认包的目标架构。
