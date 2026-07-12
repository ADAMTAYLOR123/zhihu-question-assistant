# 知乎提问助手本地伴侣程序（Windows x64）

本安装包内置 Windows x64 Node.js 和后端，无需另行安装 Node.js 或 npm，也无需长期保持命令行窗口。

## 安装

1. 解压全部文件，双击 `install.cmd`。
2. 在 Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择：

   `%LOCALAPPDATA%\ZhihuQuestionAssistant\extension`

4. 在扩展设置中选择 OpenAI-compatible API 或本机 Codex CLI。

请保留解压后的安装包目录，后续的状态检查和卸载入口位于该目录中。

后端会通过当前用户的 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 在登录时隐藏启动，不需要管理员权限。

## Codex CLI 限制

Windows 原生 Codex CLI 支持仍属实验性。安装器只会自动识别 `codex.exe`；仅安装在 WSL 内的 Codex 不会被当前 Windows 伴侣程序直接调用。这种情况下请使用 OpenAI-compatible API 模式。

## 管理

- `status.cmd`：检查服务状态。
- `uninstall.cmd`：停止服务、删除自启动项并卸载。
- 安装位置：`%LOCALAPPDATA%\ZhihuQuestionAssistant`
- 日志位置：`%LOCALAPPDATA%\ZhihuQuestionAssistant\logs`

当前 ZIP 未做 Windows 代码签名，SmartScreen 可能显示来源未知警告，适合小范围测试。
