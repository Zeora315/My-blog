(function () {
  const DEFAULT_CONFIG = {
    enable: false,
    endpoint: "/api/ai-comment",
    model: "deepseek-chat",
    button_text: "AI生成",
    placeholder: "正在让 AI 阅读文章并生成评论..."
  };

  const state = {
    observer: null,
    pending: false,
    typingTimer: null
  };

  function getConfig() {
    return Object.assign({}, DEFAULT_CONFIG, window.SOLITUDE_AI_COMMENT || {});
  }

  function getTextarea() {
    return document.querySelector("#twikoo .el-textarea__inner");
  }

  function setTextareaValue(textarea, value) {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();
  }

  function setButtonText(button, text) {
    const mark = button.querySelector(".solitude-ai-comment-mark");
    if (mark) mark.textContent = text;
  }

  function typeTextareaValue(textarea, value) {
    clearInterval(state.typingTimer);
    setTextareaValue(textarea, "");

    return new Promise(resolve => {
      const chars = Array.from(value || "");
      let index = 0;

      state.typingTimer = setInterval(() => {
        index += 1;
        setTextareaValue(textarea, chars.slice(0, index).join(""));

        if (index >= chars.length) {
          clearInterval(state.typingTimer);
          state.typingTimer = null;
          resolve();
        }
      }, 34);
    });
  }

  function getArticleText() {
    const article = document.querySelector("#article-container") || document.querySelector("article") || document.querySelector("main");
    if (!article) return "";

    return article.innerText
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  }

  function getPageTitle() {
    const heading = document.querySelector(".post-title") || document.querySelector("h1");
    return (heading && heading.textContent.trim()) || document.title.replace(/\s*\|.*$/, "").trim();
  }

  function getExistingComment(textarea) {
    return textarea.value.trim();
  }

  function notify(message) {
    if (window.Snackbar) {
      Snackbar.show({ text: message, pos: "top-center", duration: 5000 });
      return;
    }

    console.info(message);
  }

  async function getErrorMessage(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => ({}));
      return data.error || data.message || "";
    }

    const text = await response.text().catch(() => "");
    if (response.status === 404) {
      return "AI 接口未部署：当前网页找不到 /api/ai-comment，请把 endpoint 改成已部署的 Worker/API 地址";
    }

    if (text && /<!doctype html|<html/i.test(text)) {
      return "AI 接口返回了网页而不是 JSON，请检查 endpoint 是否指向真正的 API 服务";
    }

    return text.slice(0, 160);
  }

  async function requestAiComment(button, textarea) {
    const config = getConfig();
    const title = getPageTitle();
    const content = getArticleText();
    const draft = getExistingComment(textarea);

    if (!content) {
      notify("没有读取到文章内容");
      return;
    }

    if (state.pending) return;
    state.pending = true;
    button.classList.add("is-loading");
    button.disabled = true;
    setButtonText(button, "生成中");

    const oldValue = textarea.value;

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          content,
          draft,
          path: window.location.pathname,
          model: config.model
        })
      });

      if (!response.ok) {
        const detail = await getErrorMessage(response);
        throw new Error(detail || `AI 评论生成失败 HTTP ${response.status}`);
      }

      const data = await response.json().catch(() => ({}));
      if (!data.comment) throw new Error("AI 接口没有返回评论内容");

      button.classList.remove("is-loading");
      button.classList.add("is-typing");
      setButtonText(button, "写入中");
      await typeTextareaValue(textarea, data.comment || "");
      notify("AI 评论已填入评论框");
    } catch (error) {
      setTextareaValue(textarea, oldValue);
      notify(error.message || "AI 评论生成失败");
    } finally {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
      state.pending = false;
      button.classList.remove("is-loading", "is-typing");
      button.disabled = false;
      setButtonText(button, config.button_text);
    }
  }

  function createButton(textarea) {
    const config = getConfig();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "solitude-comment-action solitude-ai-comment";
    button.title = "AI 生成评论";
    button.setAttribute("aria-label", "AI 生成评论");
    button.innerHTML = '<span class="solitude-ai-comment-mark">' + config.button_text + "</span>";
    button.addEventListener("click", () => requestAiComment(button, textarea));
    return button;
  }

  function createReportLink() {
    const config = Object.assign({ enable: false, text: "举报", url: "" }, window.SOLITUDE_COMMENT_REPORT || {});
    if (!config.enable) return null;

    const link = document.createElement("a");
    link.className = "solitude-comment-action solitude-comment-report";
    link.textContent = config.text || "举报";
    link.title = "举报";

    if (config.url) {
      link.href = config.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.href = "javascript:void(0);";
      link.classList.add("is-disabled");
      link.addEventListener("click", () => notify("举报入口稍后配置"));
    }

    return link;
  }

  function ensureActionGroup() {
    const head = document.querySelector("#post-comment .comment-head");
    if (!head) return null;

    let group = head.querySelector(".solitude-comment-actions");
    if (!group) {
      group = document.createElement("div");
      group.className = "solitude-comment-actions";
      head.appendChild(group);
    }

    return group;
  }

  function mountButton() {
    const config = getConfig();
    const actionGroup = ensureActionGroup();
    if (!actionGroup) return;

    const textarea = getTextarea();
    if (config.enable && textarea && !actionGroup.querySelector(".solitude-ai-comment")) {
      actionGroup.insertBefore(createButton(textarea), actionGroup.firstChild);
    }

    if (!actionGroup.querySelector(".solitude-comment-report")) {
      const reportLink = createReportLink();
      if (reportLink) actionGroup.appendChild(reportLink);
    }
  }

  function init() {
    const config = getConfig();
    if (!config.enable) return;

    mountButton();

    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(mountButton);
    state.observer.observe(document.getElementById("twikoo-wrap") || document.body, {
      childList: true,
      subtree: true
    });
  }

  window.SolitudeAIComment = { init };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("pjax:complete", init);
})();
