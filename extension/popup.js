const MODEL_CONFIG_STORAGE_KEY = "modelConfig";
const API_KEY_SESSION_STORAGE_KEY = "modelApiKey";

const providerInput = document.querySelector("#providerInput");
const baseUrlInput = document.querySelector("#baseUrlInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const modelInput = document.querySelector("#modelInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const clearSettingsButton = document.querySelector("#clearSettingsButton");
const settingsStatus = document.querySelector("#settingsStatus");
const apiConfigFields = [...document.querySelectorAll(".api-config-field")];
const apiSecurityNotice = document.querySelector("#apiSecurityNotice");
const codexNotice = document.querySelector("#codexNotice");
const modelHint = document.querySelector("#modelHint");

saveSettingsButton.addEventListener("click", saveModelSettings);
clearSettingsButton.addEventListener("click", clearModelSettings);
providerInput.addEventListener("change", updateProviderFields);
loadModelSettings();

async function loadModelSettings() {
  try {
    const modelConfig = await getStoredModelConfig();
    providerInput.value = modelConfig.provider || "";
    baseUrlInput.value = modelConfig.baseURL || "";
    const sessionKey = await chrome.storage.session.get(API_KEY_SESSION_STORAGE_KEY);
    apiKeyInput.value = sessionKey[API_KEY_SESSION_STORAGE_KEY] || "";
    modelInput.value = modelConfig.model || "";
    updateProviderFields();
  } catch {
    showSettingsStatus("读取设置失败，请重新打开扩展。", true);
  }
}

async function saveModelSettings() {
  const modelConfig = readSettingsForm();
  if (modelConfig.provider !== "codex-cli" && modelConfig.baseURL && !isHttpUrl(modelConfig.baseURL)) {
    showSettingsStatus("API Base URL 必须以 http:// 或 https:// 开头。", true);
    return;
  }
  if (modelConfig.provider !== "codex-cli" && Boolean(modelConfig.baseURL) !== Boolean(modelConfig.apiKey)) {
    showSettingsStatus("API Base URL 和 API Key 必须同时填写。", true);
    return;
  }

  try {
    const { apiKey, ...persistedConfig } = modelConfig;
    await chrome.storage.local.set({ [MODEL_CONFIG_STORAGE_KEY]: persistedConfig });
    if (apiKey) {
      await chrome.storage.session.set({ [API_KEY_SESSION_STORAGE_KEY]: apiKey });
    } else {
      await chrome.storage.session.remove(API_KEY_SESSION_STORAGE_KEY);
    }
    showSettingsStatus("设置已保存。悬浮球下次分析时会使用新配置。", false);
  } catch {
    showSettingsStatus("保存失败，请重试。", true);
  }
}

async function clearModelSettings() {
  try {
    await Promise.all([
      chrome.storage.local.remove(MODEL_CONFIG_STORAGE_KEY),
      chrome.storage.session.remove(API_KEY_SESSION_STORAGE_KEY),
    ]);
    providerInput.value = "";
    baseUrlInput.value = "";
    apiKeyInput.value = "";
    modelInput.value = "";
    updateProviderFields();
    showSettingsStatus("设置已清空，将使用后端默认配置。", false);
  } catch {
    showSettingsStatus("清空失败，请重试。", true);
  }
}

async function getStoredModelConfig() {
  const stored = await chrome.storage.local.get(MODEL_CONFIG_STORAGE_KEY);
  const value = stored[MODEL_CONFIG_STORAGE_KEY];
  return value && typeof value === "object" ? value : {};
}

function readSettingsForm() {
  const usesCodex = providerInput.value === "codex-cli";
  return {
    provider: providerInput.value,
    baseURL: usesCodex ? "" : baseUrlInput.value.trim(),
    apiKey: usesCodex ? "" : apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  };
}

function updateProviderFields() {
  const usesCodex = providerInput.value === "codex-cli";
  apiConfigFields.forEach((field) => field.classList.toggle("is-hidden", usesCodex));
  apiSecurityNotice.classList.toggle("is-hidden", usesCodex);
  codexNotice.classList.toggle("is-hidden", !usesCodex);
  modelInput.placeholder = usesCodex ? "留空使用 Codex CLI 默认模型" : "gpt-4o-mini";
  modelHint.textContent = usesCodex
    ? "通常建议留空；填写后会作为 codex exec --model 参数。"
    : "API 模式下留空时使用后端模型配置。";
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function showSettingsStatus(message, isError) {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle("is-error", isError);
}
