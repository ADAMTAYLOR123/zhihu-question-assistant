const API_URL = "http://localhost:3000/api/generate-zhihu-questions";
const REQUEST_TIMEOUT_MS = 200000;
const API_KEY_SESSION_STORAGE_KEY = "modelApiKey";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GENERATE_ZHIHU_QUESTIONS") {
    return undefined;
  }

  withSessionApiKey(message.payload)
    .then(requestQuestions)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "生成问题失败，请重试。",
      });
    });

  return true;
});

async function withSessionApiKey(payload) {
  if (payload?.modelConfig?.provider === "codex-cli") return payload;
  const stored = await chrome.storage.session.get(API_KEY_SESSION_STORAGE_KEY);
  const apiKey = stored[API_KEY_SESSION_STORAGE_KEY];
  return {
    ...payload,
    modelConfig: {
      ...payload?.modelConfig,
      apiKey: typeof apiKey === "string" ? apiKey : "",
    },
  };
}

async function requestQuestions(payload) {
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("生成请求超时，请稍后重试。");
    }
    throw new Error("无法连接本地后端。请确认已运行 npm start，并且服务地址为 http://localhost:3000。");
  } finally {
    clearTimeout(timeout);
  }

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || `请求失败（HTTP ${response.status}）。`);
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("后端没有返回问题列表，请重试。");
  }

  return data;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
