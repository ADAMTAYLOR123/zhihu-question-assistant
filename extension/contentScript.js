(() => {
  if (globalThis.__ZH_QA_FLOATING_ASSISTANT_LOADED__) {
    return;
  }
  globalThis.__ZH_QA_FLOATING_ASSISTANT_LOADED__ = true;

  const MODEL_CONFIG_STORAGE_KEY = "modelConfig";
  let lastSelectedText = "";
  let isAnalyzing = false;

  const host = document.createElement("div");
  host.id = "zhihu-question-assistant-root";
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${getStyles()}</style>
    <button class="floating-ball" type="button" aria-label="打开知乎提问助手" title="知乎提问助手">
      <span>问</span>
    </button>
    <section class="panel" aria-label="知乎提问助手">
      <header class="panel-header">
        <div>
          <p class="eyebrow">ZH QUESTION LAB</p>
          <h1>知乎提问助手</h1>
        </div>
        <button class="close-button" type="button" aria-label="收起面板">×</button>
      </header>
      <div class="panel-body">
        <button class="analyze-button" type="button">分析当前网页</button>
        <div class="loading is-hidden" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span>正在生成问题，已有结果会继续保留…</span>
        </div>
        <div class="error is-hidden" role="alert"></div>
        <div class="empty-state">点击上方按钮，生成 6 个问题和对应关键词。</div>
        <div class="results" aria-live="polite"></div>
      </div>
    </section>
  `;

  const ball = shadow.querySelector(".floating-ball");
  const panel = shadow.querySelector(".panel");
  const closeButton = shadow.querySelector(".close-button");
  const analyzeButton = shadow.querySelector(".analyze-button");
  const loadingElement = shadow.querySelector(".loading");
  const errorElement = shadow.querySelector(".error");
  const emptyState = shadow.querySelector(".empty-state");
  const resultsElement = shadow.querySelector(".results");

  ball.addEventListener("click", () => panel.classList.toggle("is-open"));
  closeButton.addEventListener("click", () => panel.classList.remove("is-open"));
  analyzeButton.addEventListener("click", analyzeCurrentPage);

  document.addEventListener("selectionchange", rememberSelectedText, { passive: true });

  async function analyzeCurrentPage() {
    if (isAnalyzing) return;

    setLoading(true);
    showError("");

    try {
      const pageData = extractPageContent();
      if (pageData.selectedText.length < 50 && pageData.mainText.length < 200 && pageData.description.length < 100) {
        throw new Error("当前页面正文较少，可以先选中一段文字再分析。");
      }

      const modelConfig = await getStoredModelConfig();
      const response = await chrome.runtime.sendMessage({
        type: "GENERATE_ZHIHU_QUESTIONS",
        payload: { ...pageData, modelConfig },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "生成问题失败，请重试。");
      }

      renderResults(response.data.items);
    } catch (error) {
      showError(error instanceof Error ? error.message : "发生未知错误，请重试。");
    } finally {
      setLoading(false);
    }
  }

  function extractPageContent() {
    const currentSelection = cleanText(globalThis.getSelection()?.toString() || "");
    if (currentSelection) {
      lastSelectedText = currentSelection;
    }

    return {
      title: cleanText(document.title).slice(0, 500),
      url: location.href,
      description: cleanText(
        document.querySelector('meta[name="description"]')?.content ||
          document.querySelector('meta[property="og:description"]')?.content ||
          "",
      ).slice(0, 1500),
      selectedText: (currentSelection || lastSelectedText).slice(0, 12000),
      mainText: extractMainText().slice(0, 12000),
    };
  }

  function extractMainText() {
    const preferredBlocks = [...document.querySelectorAll("article, main, [role='main']")]
      .map(extractCleanBlock)
      .filter((text) => text.length >= 80)
      .sort((left, right) => right.length - left.length);

    if (preferredBlocks.length > 0) {
      return preferredBlocks[0];
    }

    return joinUniqueBlocks(
      [...document.querySelectorAll("p, h1, h2, h3")]
        .filter((element) => !element.closest("nav, aside, footer, form, [aria-hidden='true']"))
        .map((element) => cleanText(element.innerText || element.textContent || ""))
        .filter((text) => text.length >= 2),
    );
  }

  function extractCleanBlock(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("nav, aside, footer, form, script, style, noscript, [aria-hidden='true']").forEach((item) => item.remove());
    return cleanText(clone.textContent || "");
  }

  function joinUniqueBlocks(blocks) {
    const unique = new Set();
    for (const block of blocks) {
      unique.add(block);
    }
    return cleanText([...unique].join("\n\n"));
  }

  function rememberSelectedText() {
    const selectedText = cleanText(globalThis.getSelection()?.toString() || "");
    if (selectedText) {
      lastSelectedText = selectedText.slice(0, 12000);
    }
  }

  async function getStoredModelConfig() {
    const stored = await chrome.storage.local.get(MODEL_CONFIG_STORAGE_KEY);
    const value = stored[MODEL_CONFIG_STORAGE_KEY];
    return value && typeof value === "object" ? value : {};
  }

  function renderResults(items) {
    resultsElement.replaceChildren();
    emptyState.classList.add("is-hidden");

    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "result-card";

      const heading = document.createElement("div");
      heading.className = "result-heading";

      const number = document.createElement("span");
      number.className = "number";
      number.textContent = String(index + 1).padStart(2, "0");

      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.type = "button";
      copyButton.textContent = "复制问题";
      copyButton.addEventListener("click", () => copyWithFeedback(copyButton, item.question));

      heading.append(number, copyButton);

      const question = document.createElement("h2");
      question.textContent = item.question;

      const keywords = document.createElement("div");
      keywords.className = "keywords";
      item.keywords.slice(0, 5).forEach((keyword) => {
        const chip = document.createElement("button");
        chip.className = "keyword-chip";
        chip.type = "button";
        chip.textContent = keyword;
        chip.title = `复制关键词：${keyword}`;
        chip.setAttribute("aria-label", `复制关键词：${keyword}`);
        chip.addEventListener("click", () => copyWithFeedback(chip, keyword));
        keywords.append(chip);
      });

      card.append(heading, question, keywords);
      resultsElement.append(card);
    });
  }

  async function copyWithFeedback(button, text) {
    const originalLabel = button.textContent;
    try {
      await copyText(text);
      button.textContent = "已复制";
    } catch {
      button.textContent = "复制失败";
    }
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1400);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // 部分网页或浏览器环境会暴露 Clipboard API，但拒绝实际写入，继续使用兼容方案。
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("复制失败");
  }

  function setLoading(loading) {
    isAnalyzing = loading;
    analyzeButton.disabled = loading;
    analyzeButton.textContent = loading ? "分析中…" : "分析当前网页";
    loadingElement.classList.toggle("is-hidden", !loading);
  }

  function showError(message) {
    errorElement.textContent = message;
    errorElement.classList.toggle("is-hidden", !message);
  }

  function cleanText(value) {
    return String(value)
      .replace(/\u00a0/g, " ")
      .replace(/[\t\f\v ]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getStyles() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      button { font: inherit; }
      .floating-ball, .panel {
        font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
      }
      .floating-ball {
        position: fixed; right: 22px; bottom: 24px; z-index: 2147483647;
        width: 56px; height: 56px; border: 0; border-radius: 50%; cursor: pointer;
        color: #fff; background: linear-gradient(145deg, #1684ff, #0057dc);
        box-shadow: 0 12px 28px rgba(0, 91, 220, .32); font-size: 22px; font-weight: 800;
        transition: transform .18s ease, box-shadow .18s ease;
      }
      .floating-ball:hover { transform: translateY(-2px); box-shadow: 0 15px 32px rgba(0, 91, 220, .4); }
      .panel {
        position: fixed; right: 22px; bottom: 92px; z-index: 2147483646;
        display: flex; flex-direction: column; width: min(390px, calc(100vw - 28px));
        max-height: min(720px, calc(100vh - 116px)); overflow: hidden;
        color: #172033; background: #f5f8fc; border: 1px solid rgba(207, 218, 234, .95);
        border-radius: 18px; box-shadow: 0 24px 64px rgba(24, 39, 75, .22);
        opacity: 0; pointer-events: none; transform: translateY(12px) scale(.98);
        transition: opacity .18s ease, transform .18s ease;
      }
      .panel.is-open { opacity: 1; pointer-events: auto; transform: none; }
      .panel-header {
        display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto;
        padding: 16px 17px 14px; color: #fff;
        background: linear-gradient(135deg, #172b4d, #0066ff);
      }
      .eyebrow { margin: 0 0 3px; font-size: 9px; font-weight: 800; letter-spacing: .14em; opacity: .74; }
      h1 { margin: 0; font-size: 17px; line-height: 1.25; }
      .close-button {
        width: 30px; height: 30px; border: 0; border-radius: 8px; cursor: pointer;
        color: #fff; background: rgba(255, 255, 255, .14); font-size: 22px; line-height: 1;
      }
      .panel-body { min-height: 0; overflow-y: auto; padding: 14px; }
      .analyze-button {
        position: sticky; top: 0; z-index: 2; width: 100%; border: 0; border-radius: 11px;
        padding: 11px 14px; cursor: pointer; color: #fff; background: #0066ff;
        box-shadow: 0 8px 18px rgba(0, 102, 255, .2); font-size: 13px; font-weight: 750;
      }
      .analyze-button:disabled { cursor: wait; opacity: .68; }
      .loading, .error, .empty-state { margin-top: 11px; border-radius: 10px; padding: 10px 11px; font-size: 12px; line-height: 1.55; }
      .loading { display: flex; align-items: center; gap: 8px; color: #315179; background: #eaf2ff; }
      .spinner { width: 14px; height: 14px; border: 2px solid rgba(0, 102, 255, .2); border-top-color: #0066ff; border-radius: 50%; animation: spin .8s linear infinite; }
      .error { color: #9b2c2c; background: #fff0f0; border: 1px solid #ffd6d6; }
      .empty-state { color: #7b879b; background: #fff; border: 1px dashed #d8e0eb; text-align: center; }
      .results { display: grid; gap: 10px; margin-top: 11px; }
      .result-card { padding: 13px; border: 1px solid #e0e7f1; border-radius: 12px; background: #fff; box-shadow: 0 6px 18px rgba(31, 46, 75, .05); }
      .result-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .number { color: #0066ff; font-size: 10px; font-weight: 800; letter-spacing: .08em; }
      .copy-button { border: 1px solid #dce3ee; border-radius: 7px; padding: 5px 8px; cursor: pointer; color: #47546b; background: #fff; font-size: 10px; font-weight: 700; }
      .copy-button:hover { border-color: #8db9fb; color: #0058dc; background: #f5f9ff; }
      h2 { margin: 9px 0 10px; color: #172033; font-size: 15px; line-height: 1.55; font-weight: 750; }
      .keywords { display: flex; flex-wrap: wrap; gap: 6px; }
      .keyword-chip {
        border: 1px solid transparent; border-radius: 999px; padding: 4px 8px; cursor: pointer;
        color: #315179; background: #edf4ff; font-size: 10px; line-height: 1.3;
        transition: color .15s ease, background .15s ease, border-color .15s ease;
      }
      .keyword-chip:hover { color: #0058dc; background: #e0edff; border-color: #a9cafd; }
      .keyword-chip:focus-visible { outline: 2px solid #0066ff; outline-offset: 2px; }
      .is-hidden { display: none !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 520px) {
        .floating-ball { right: 14px; bottom: 16px; }
        .panel { right: 14px; bottom: 82px; max-height: calc(100vh - 100px); }
      }
    `;
  }
})();
