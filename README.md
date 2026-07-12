# 知乎提问助手 MVP

一个本地运行的 Chrome Manifest V3 扩展。它在普通网页右下角显示一个持久悬浮球，读取当前网页的标题、链接、描述、用户选中文本和主要正文，再请求本地 Node.js 后端生成 6 个适合知乎讨论的问题，每个问题附带 5 个关键词。

本项目只提供问题生成和复制，不会自动填写或发布知乎内容。

## 项目结构

```text
知乎提问小插件/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── contentScript.js
│   ├── serviceWorker.js
│   └── styles.css
├── server/
│   ├── index.js
│   └── zhihuQuestions.schema.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

`contentScript.js` 负责在网页中注入悬浮球、持久面板、正文提取和复制交互。`serviceWorker.js` 负责从扩展后台请求本地后端，避免网页自身的跨域策略影响接口调用。工具栏 popup 只负责模型配置。

## 环境要求

- Node.js 20 或更高版本
- Chrome 浏览器
- 一个可用的 OpenAI-compatible API Key，或已登录的 Codex CLI

## 安装与配置

在项目根目录运行：

```bash
npm install
cp .env.example .env
```

打开 `.env`，填写：

```dotenv
MODEL_PROVIDER=openai
ALLOWED_EXTENSION_IDS=你的_Chrome_扩展_ID
OPENAI_API_KEY=你的真实_API_Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=120000
CODEX_MODEL=
CODEX_TIMEOUT_MS=180000
PORT=3000
```

`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 都有默认值。点击浏览器工具栏中的扩展图标可以打开“模型设置”。自定义 API Base URL 和 API Key 必须成对填写，避免把后端默认 Key 发送给其他地址；全部留空时使用后端默认配置。

## 使用中转站 API

如果中转站兼容 OpenAI Chat Completions API，可以直接修改后端 `.env`：

```dotenv
OPENAI_API_KEY=sk-xxxx
OPENAI_BASE_URL=https://your-relay-domain.com/v1
OPENAI_MODEL=gpt-4o-mini
```

- 中转站必须兼容 OpenAI Chat Completions API。
- `baseURL` 通常需要包含 `/v1`，具体以中转站文档为准。
- 模型名必须使用中转站实际支持的模型名。
- 如果中转站不支持 `response_format: json_schema`，项目会自动降级为普通 JSON prompt 模式。

也可以点击扩展图标，在“模型设置”中填写 API Base URL、API Key 和 Model Name 后保存。普通设置保存在 `chrome.storage.local`，API Key 只保存在 `chrome.storage.session` 中，完全退出 Chrome 后需要重新填写。若要把扩展分发给其他人，建议改用带鉴权的服务端账号体系。

## 使用 Codex CLI

项目也支持把本机 Codex CLI 作为模型提供方。它不是 OpenAI-compatible HTTP 接口，而是由后端为每次请求运行一次非交互命令：

```bash
codex exec --ephemeral --output-schema ...
```

使用前先安装并登录 Codex CLI：

```bash
codex --version
codex login
codex login status
```

然后点击工具栏扩展图标，在“模型设置”中选择“本机 Codex CLI”，保存后即可通过网页悬浮球分析。API Base URL 和 API Key 在该模式下不使用；Model Name 通常留空，让 Codex CLI 使用自己的默认模型。

也可以将后端默认提供方设为 Codex CLI：

```dotenv
MODEL_PROVIDER=codex-cli
CODEX_MODEL=
CODEX_TIMEOUT_MS=180000
```

Codex CLI 模式的实现边界：

- 复用本机 `codex login` 登录态，不会读取 popup 中的 API Key。
- 每次请求使用临时空目录、只读沙箱和临时会话。
- 后端关闭 Codex 的 shell、浏览器、应用、插件和多代理工具，只允许其生成结构化文本。
- OpenAI-compatible API Key 不会传入 Codex 子进程环境。
- 默认超时为 180 秒，可通过 `CODEX_TIMEOUT_MS` 调整。
- 这是个人电脑上的本地自动化适配，不适合作为公网代理、多用户服务或规避 API 计费的方案。
- Codex CLI 或登录接口升级后，可能需要同步调整启动参数。

## 启动后端

普通启动：

```bash
npm start
```

开发模式，修改服务端代码后自动重启：

```bash
npm run dev
```

## macOS 本地伴侣程序

对外分享时，可以使用已构建的 Apple Silicon 本地伴侣包。它内置 Node.js 和生产依赖，接收者无需安装 Node.js、执行 `npm install` 或手动启动后端。

构建命令：

```bash
npm run build:companion:macos
npm run build:companion:macos:x64
npm run build:companion:windows:x64
```

第一条命令构建当前 Mac 架构的包；第二条会从 Node.js 官方下载、校验并封装 Intel `x64` 运行时。交叉构建发现 `.node` 原生依赖时会直接中止，避免生成架构混用的安装包。

第三条命令会生成 Windows x64 ZIP，内置官方 `node.exe`，通过当前用户的 HKCU Run 注册表项实现无管理员权限的隐藏自启动。Windows 原生 Codex CLI 支持仍属实验性；仅安装在 WSL 中的 Codex 暂不会被伴侣程序自动调用。

输出位于 `dist/`，其中 ZIP 文件可直接分享。用户解压后双击 `install.command`，安装器会：

1. 把内置后端安装到 `~/Library/Application Support/ZhihuQuestionAssistant`。
2. 创建并加载用户级 LaunchAgent。
3. 复制固定 ID 的 Chrome 扩展。
4. 自动检测常见位置的 Codex CLI。
5. 通过健康检查确认后端已启动。

分发版扩展的固定 ID 是 `jjlamjjlldhcbojhlkaeggbhldllcood`。当前安装包尚未进行 Apple 开发者签名和公证，适合小范围测试；公开发布前应增加 Developer ID 签名、notarization 和图形化安装器。

看到以下输出即表示启动成功：

```text
知乎提问助手后端已启动：http://localhost:3000
```

也可以访问 `http://localhost:3000/health`，应返回：

```json
{"ok":true}
```

## 在 Chrome 中加载扩展

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目中的 `extension` 目录，不要选择项目根目录。
5. 复制扩展卡片上的 32 位“ID”，填入 `.env` 的 `ALLOWED_EXTENSION_IDS`，然后重启 `npm start`。
6. 把“知乎提问助手”固定到浏览器工具栏。
7. 打开或刷新一个普通网页，右下角会出现蓝色“问”悬浮球。
8. 点击悬浮球展开面板，再点击“分析当前网页”。

扩展安装或刷新后，需要重新加载已经打开的网页，悬浮球才会注入页面。

## 使用方式

1. 打开任意普通 `http/https` 网页。
2. 可选：先选中一段最想讨论的文字。插件会记住最近一次选中的文本并优先分析它。
3. 可选：点击工具栏扩展图标，选择 OpenAI-compatible API 或本机 Codex CLI 并保存。
4. 点击网页右下角蓝色“问”悬浮球。
5. 点击面板顶部永久显示的“分析当前网页”。
6. 每条结果仅展示问题和 5 个关键词，可以点击“复制问题”，也可以直接点击任意关键词复制该关键词。

面板不会因为点击网页其他区域而关闭。点击面板关闭按钮只会暂时收起，已有结果不会清空；再次点击悬浮球即可继续查看。只有再次点击“分析当前网页”并成功生成后，结果列表才会更新。

## 接口说明

### `POST /api/generate-zhihu-questions`

请求示例：

```json
{
  "title": "网页标题",
  "url": "https://example.com/article",
  "description": "网页描述",
  "selectedText": "用户选中的文字",
  "mainText": "网页正文",
  "modelConfig": {
    "provider": "openai",
    "apiKey": "sk-xxxx",
    "baseURL": "https://example.com/v1",
    "model": "gpt-4o-mini"
  }
}
```

Codex CLI 模式只需要传递：

```json
{
  "modelConfig": {
    "provider": "codex-cli",
    "model": ""
  }
}
```

响应示例：

```json
{
  "items": [
    {
      "question": "如何看待……？",
      "keywords": ["公共讨论", "行业趋势", "社会影响", "争议", "观点"]
    }
  ]
}
```

后端会使用 `modelConfig` 中的非空配置，其余字段回退到 `.env`；但自定义 `baseURL` 和 `apiKey` 必须成对提供。`provider=openai` 时，接口先通过 JSON Schema 请求 6 条完整结果；只有当目标服务明确报告不支持该能力时，才会自动改用普通 JSON prompt 模式。`provider=codex-cli` 时，后端通过 Codex CLI 的 `--output-schema` 获取结构化结果。每条结果只包含问题和正好 5 个关键词。

生成内容还会统一遵守以下排版规则：中文与英文或数字之间保留半角空格；英文专有名词使用正确大小写；中文引号统一使用「」和『』。服务端会对空格和引号做二次规范化，专有名词大小写由模型根据官方写法判断。

## 调试方法

### 调试悬浮面板

打开目标网页的 DevTools，在 Elements 中查找 `#zhihu-question-assistant-root`。界面位于该元素的 Shadow DOM 中。修改 `contentScript.js` 后，需要在 `chrome://extensions/` 刷新扩展并重新加载目标网页。

### 调试设置 popup

1. 打开 `chrome://extensions/`。
2. 找到“知乎提问助手”，点击“详细信息”。
3. 在扩展 popup 打开时，右键 popup 空白处，选择“检查”。
4. 在 DevTools 的 Console 和 Network 中查看错误与接口请求。

修改 `extension` 内文件后，在 `chrome://extensions/` 点击扩展卡片上的刷新按钮，然后重新打开目标网页测试。

### 调试 content script

打开目标网页的 DevTools，在 Console 顶部的 JavaScript 上下文下拉菜单中选择扩展对应的 isolated world。也可以在 `contentScript.js` 临时增加日志，刷新扩展和目标网页后观察。

### 调试后端

后端错误会输出到运行 `npm start` 的终端。先确认：

- `http://localhost:3000/health` 可以访问。
- `.env` 位于项目根目录且变量名正确。
- OpenAI 官方项目或中转站账号有余额或可用额度。
- `OPENAI_BASE_URL` 以 `http://` 或 `https://` 开头。
- `OPENAI_MODEL` 是 API 服务实际支持的模型名。
- 使用 Codex CLI 时，`codex login status` 显示已经登录，且运行后端的终端可以找到 `codex` 命令。
- Codex CLI 生成通常比直接 API 请求更慢；超时可通过 `CODEX_TIMEOUT_MS` 调整。

运行静态语法检查和回归测试：

```bash
npm run check
npm test
```

## 常见问题

### 为什么不能把 API Key 放在插件里？

Chrome 扩展代码会下载到用户本机，而且 Key 仍可能出现在调试工具和网络请求中。后端 `.env` 仍是更推荐的配置方式。popup 中的 Key 只在当前 Chrome 会话内存中保留，适合个人本地使用和快速切换中转站；公开产品应由受控后端持有供应商 Key，并为用户提供独立鉴权。

### 为什么不自动发布到知乎？

自动填写或发布涉及用户账号操作、平台规则、内容确认和误操作风险。本 MVP 只提供问题复制，让用户在发布前自行检查事实和措辞，也避免模拟登录或绕过平台交互。

### 为什么有些网页正文抓不到？

常见原因包括：

- 页面是 `chrome://`、Chrome 扩展商店等禁止注入脚本的受限页面。
- 正文位于跨域 iframe、PDF 阅读器或 Shadow DOM 中。
- 页面需要登录、滚动或点击后才异步加载正文。
- 网站结构特殊，没有可识别的 `article`、`main`、`p`、`h1`、`h2`、`h3` 内容。

遇到这种情况，先在页面上选中一段文字再分析。后续也可以接入 Mozilla Readability，提升复杂网页的正文识别率。

### 如何后续接入优质知乎问题样本？

最简单的方式是在服务端增加少量高质量 few-shot 示例，把“网页摘要 -> 优质知乎问题 JSON”放在动态网页内容之前。样本应按领域和问题角度分类，并避免把大量样本塞入每次请求。

样本增多后，建议：

1. 将样本存入数据库或 JSONL 文件，并标注行业、角度和质量分。
2. 根据当前网页主题检索 3 到 5 条最相关样本，再加入 prompt。
3. 建立人工评价集，比较问题真实性、讨论空间、标题自然度和事实准确性。
4. 样本涉及真实知乎内容时，确认使用权限，并避免原样复制问题。

## 安全与边界

- 服务只监听 `127.0.0.1`，用于本机开发。
- 生成接口只允许 `ALLOWED_EXTENSION_IDS` 列出的 Chrome 扩展调用；未配置时默认拒绝。
- 自定义 API Base URL 和 API Key 必须成对提供。
- 服务端会限制 JSON 请求体和每个输入字段长度。
- 网页正文最多使用 12000 字符。
- API 不保存网页内容和生成结果。
- popup 普通配置保存在 `chrome.storage.local`，Key 仅保存在不落盘的 `chrome.storage.session`，并由 service worker 在请求时临时合并。
- 网页内容可能包含提示注入文本，因此生产化时应继续增加内容隔离、审计和输出审核。

## OpenAI 实现说明

OpenAI-compatible 模式使用 OpenAI 官方 JavaScript SDK 的 Chat Completions API。每次请求都会根据最终合并出的 `apiKey`、`baseURL` 和 `model` 动态创建客户端，首先尝试 `response_format: json_schema`；失败时自动降级为普通 JSON prompt，并在本地提取、解析和校验模型返回的 JSON。Codex CLI 模式使用官方 `codex exec` 非交互能力和 `--output-schema`。API Key 不会写入日志或返回给前端错误信息。
