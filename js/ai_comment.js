(function () {
  window.__solitudeAICommentCleanup?.();

  const controller = new AbortController();
  const { signal } = controller;
  const DEFAULT_CONFIG = {
    enable: false,
    endpoint: "/api/demo?action=aiComment",
    model: "deepseek-mimo",
    button_text: "AI评论",
    polish_text: "AI润色",
    placeholder: "正在让 AI 阅读文章并生成评论..."
  };

  const AI_ASSISTED_MARKER = "\u2063\u200B\u2062\u200C\u2063";

  const state = {
    observerQueued: false,
    retryTimer: null,
    retryCount: 0,
    pending: false,
    typingTimer: null,
    aiDrafts: new WeakMap()
  };

  window.__solitudeAICommentCleanup = () => {
    controller.abort();
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
    clearInterval(state.typingTimer);
    state.typingTimer = null;
  };
  document.addEventListener("solitude:beforeNavigate", window.__solitudeAICommentCleanup, { once: true, signal });

  function getConfig() {
    return Object.assign({}, DEFAULT_CONFIG, window.SOLITUDE_AI_COMMENT || {});
  }

  function getTextarea() {
    const submit = getCommentComposerSubmits()[0];
    return (submit && submit.querySelector(".tk-input .el-textarea__inner, .el-textarea__inner")) || null;
  }

  function getButtonTextarea(button) {
    const submit = getCommentComposerSubmit(button.closest(".tk-submit")) || getCommentComposerSubmits()[0];
    return (submit && submit.querySelector(".tk-input .el-textarea__inner, .el-textarea__inner")) || getTextarea();
  }

  function stripAiMarker(value) {
    return String(value || "").split(AI_ASSISTED_MARKER).join("");
  }

  function setTextareaValue(textarea, value) {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();
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
    return stripAiMarker(textarea.value).trim();
  }

  function getSessionToken() {
    const keys = ["zeoraTwikooUserSession", "twikooUserCenterSessionToken"];
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        if (key === "twikooUserCenterSessionToken") return raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.sessionToken) return parsed.sessionToken;
        } catch (error) {
          // Ignore unrelated storage content.
        }
      }
    }
    return "";
  }

  function compactText(value) {
    return stripAiMarker(value)
      .replace(/[\s\u00a0`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?，。！？、；：“”‘’（）【】《》…—]/g, "")
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function lcsLength(source, target) {
    const sourceChars = Array.from(source).slice(0, 800);
    const targetChars = Array.from(target).slice(0, 800);
    const row = new Array(targetChars.length + 1).fill(0);

    sourceChars.forEach(sourceChar => {
      let previous = 0;
      targetChars.forEach((targetChar, index) => {
        const current = row[index + 1];
        row[index + 1] = sourceChar === targetChar
          ? previous + 1
          : Math.max(row[index + 1], row[index]);
        previous = current;
      });
    });

    return row[targetChars.length];
  }

  function isAiDraftStillPresent(currentValue, generatedValue) {
    const current = compactText(currentValue);
    const generated = compactText(generatedValue);

    if (!current || !generated) return false;
    if (current === generated || current.includes(generated)) return true;
    if (generated.includes(current) && current.length >= 12) return true;

    const overlap = lcsLength(current, generated);
    return overlap / Math.min(current.length, generated.length) >= 0.72 && overlap / generated.length >= 0.35;
  }

  function rememberAiDraft(textarea, value) {
    if (!textarea || !value) return;
    state.aiDrafts.set(textarea, stripAiMarker(value));
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
      return "AI 评论接口未部署或路径不正确，请在用户中心管理页检查 AI 配置";
    }

    if (text && /<!doctype html|<html/i.test(text)) {
      return "AI 接口返回了网页而不是 JSON，请检查用户中心管理页里的接口地址";
    }

    return text.slice(0, 160);
  }

  function endpointCandidates(config) {
    const primary = String(config.endpoint || DEFAULT_CONFIG.endpoint || "").trim() || DEFAULT_CONFIG.endpoint;
    const candidates = [];
    const knownDeadEndpoint = (value) => {
      try {
        const url = new URL(value, window.location.origin);
        return /^https?:\/\/ai\.zeora\.qzz\.io$/i.test(url.origin);
      } catch (error) {
        return false;
      }
    };
    const push = (value) => {
      const endpoint = String(value || "").trim();
      if (endpoint && !knownDeadEndpoint(endpoint) && !candidates.includes(endpoint)) candidates.push(endpoint);
    };

    push(primary);
    push(config.fallback_endpoint);
    push("/api/ai-comment");
    return candidates;
  }

  function networkErrorMessage(endpoint) {
    let target = endpoint;
    try {
      const url = new URL(endpoint, window.location.origin);
      target = url.origin + url.pathname;
    } catch (error) {
      target = endpoint;
    }
    return `AI 接口连接失败：${target} 没有响应，请检查 Twikoo 后端和用户中心管理页里的 AI 配置。`;
  }

  function getActionButtons() {
    return Array.from(document.querySelectorAll("#twikoo .solitude-ai-action"));
  }

  function setActionBusy(activeButton, isBusy) {
    getActionButtons().forEach(button => {
      button.disabled = isBusy;
      button.setAttribute("aria-busy", button === activeButton && isBusy ? "true" : "false");
      if (button !== activeButton || !isBusy) {
        button.classList.remove("is-loading", "is-typing");
      }
    });
  }

  async function requestAiComment(button, mode = "generate") {
    const textarea = getButtonTextarea(button);
    const config = getConfig();
    const title = getPageTitle();
    const content = getArticleText();
    const draft = textarea ? getExistingComment(textarea) : "";
    const actionMode = mode === "polish" ? "polish" : "generate";

    if (!textarea) {
      notify("没有找到评论输入框");
      return;
    }

    if (actionMode === "generate" && !content) {
      notify("没有读取到文章内容");
      return;
    }

    if (actionMode === "polish" && !draft) {
      notify("请先写一点内容，再使用 AI 润色");
      return;
    }

    if (state.pending) return;
    state.pending = true;
    setActionBusy(button, true);
    button.classList.add("is-loading");

    const oldValue = textarea.value;
    if (actionMode === "generate") setTextareaValue(textarea, "");

    try {
      let data = null;
      let lastError = null;
      const requestBody = JSON.stringify({
        title,
        content,
        draft,
        mode: actionMode,
        path: window.location.pathname,
        model: config.model
      });

      for (const endpoint of endpointCandidates(config)) {
        try {
          const headers = { "Content-Type": "application/json" };
          const token = getSessionToken();
          if (token) headers["x-session-token"] = token;

          const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: requestBody
          });

          if (!response.ok) {
            const detail = await getErrorMessage(response);
            throw new Error(detail || `AI 评论${actionMode === "polish" ? "润色" : "生成"}失败 HTTP ${response.status}`);
          }

          data = await response.json().catch(() => ({}));
          break;
        } catch (error) {
          lastError = /Failed to fetch|NetworkError|Load failed/i.test(error.message || "")
            ? new Error(networkErrorMessage(endpoint))
            : error;
        }
      }

      if (!data && lastError) throw lastError;
      if (!data.comment) throw new Error("AI 接口没有返回内容");

      button.classList.remove("is-loading");
      button.classList.add("is-typing");
      await typeTextareaValue(textarea, data.comment || "");
      rememberAiDraft(textarea, data.comment || "");
      notify(actionMode === "polish" ? "AI 润色已填入评论框" : "AI 评论已填入评论框");
    } catch (error) {
      setTextareaValue(textarea, oldValue);
      notify(error.message || (actionMode === "polish" ? "AI 润色失败" : "AI 评论生成失败"));
    } finally {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
      state.pending = false;
      button.classList.remove("is-loading", "is-typing");
      setActionBusy(button, false);
    }
  }

  const icons = {
    comment: '<i class="solitude fas fa-robot" aria-hidden="true"></i>',
    polish: '<i class="solitude fas fa-pen" aria-hidden="true"></i>',
    mention: '<i class="solitude fas fa-at" aria-hidden="true"></i>'
  };

  const COMPOSER_EXCLUDE_SELECTOR = [
    ".tk-admin-container",
    ".tk-admin",
    ".tk-login",
    ".tk-panel",
    ".zca-modal-root",
    ".zca-modal-card",
    ".uc-modal-root",
    ".uc-modal-card"
  ].join(",");

  function getCommentComposerSubmit(submit) {
    if (!submit || !submit.matches?.("#twikoo .tk-submit")) return null;
    if (submit.closest(COMPOSER_EXCLUDE_SELECTOR)) return null;
    if (!submit.querySelector(".tk-row.actions .tk-row-actions-start")) return null;
    if (!submit.querySelector(".tk-input .el-textarea__inner, .el-textarea__inner")) return null;
    return submit;
  }

  function getCommentComposerSubmits() {
    return Array.from(document.querySelectorAll("#twikoo .tk-submit"))
      .map(getCommentComposerSubmit)
      .filter(Boolean);
  }

  function markCommentComposer(submit) {
    const composer = getCommentComposerSubmit(submit);
    if (!composer) return null;
    composer.classList.add("solitude-comment-editor");
    return composer;
  }

  function createButton(mode = "generate") {
    const config = getConfig();
    const isPolish = mode === "polish";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tk-submit-action-icon solitude-ai-action solitude-ai-${isPolish ? "polish" : "comment"}`;
    button.dataset.solitudeAiMode = isPolish ? "polish" : "generate";
    button.setAttribute("aria-label", isPolish ? "AI 润色评论" : "AI 生成评论");
    button.setAttribute("aria-busy", "false");
    button.innerHTML = `
      <span class="solitude-ai-action-icon" aria-hidden="true">${isPolish ? icons.polish : icons.comment}</span>
      <span class="solitude-ai-action-label">${escapeHtml(isPolish ? (config.polish_text || "AI润色") : (config.button_text || "AI评论"))}</span>
      <span class="solitude-ai-action-status" aria-hidden="true"></span>
    `;
    button.addEventListener("click", () => requestAiComment(button, button.dataset.solitudeAiMode === "polish" ? "polish" : "generate"));
    return button;
  }

  function insertMentionShortcut(textarea) {
    if (!textarea) return;
    const current = textarea.value || "";
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " @" : "@";
    const next = `${current.slice(0, start)}${prefix}${current.slice(end)}`;
    textarea.value = next;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start + prefix.length, start + prefix.length);
  }

  function createMentionButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tk-submit-action-icon zca-at-action solitude-mention-action";
    button.setAttribute("aria-label", "插入 @");
    button.innerHTML = `<span aria-hidden="true">${icons.mention}</span>`;
    button.addEventListener("click", () => {
      const submit = button.closest(".tk-submit");
      insertMentionShortcut(submit?.querySelector(".el-textarea__inner") || getTextarea());
    });
    return button;
  }

  function mountMentionButton(actionGroup) {
    if (actionGroup.querySelector(".solitude-mention-action, .zca-at-action")) return;
    const button = createMentionButton();
    const first = actionGroup.firstElementChild;
    if (first?.nextSibling) actionGroup.insertBefore(button, first.nextSibling);
    else actionGroup.appendChild(button);
  }

  function normalizeActionBar(actionGroup) {
    Array.from(actionGroup.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) node.remove();
    });

    Array.from(actionGroup.children).forEach(element => {
      if (!element.hasAttribute("title")) return;
      if (!element.getAttribute("aria-label")) element.setAttribute("aria-label", element.getAttribute("title"));
      element.removeAttribute("title");
    });
  }

  function normalizeOwoTitle(value) {
    const label = String(value || "").trim();
    if (!label) return "";
    return label.replace(/^:+|:+$/g, "").trim();
  }

  function preserveOwoShortcodeTitles(actionGroup) {
    actionGroup.querySelectorAll(".OwO-item").forEach(item => {
      if (item.getAttribute("title")) return;
      const title = normalizeOwoTitle(item.getAttribute("aria-label"));
      if (title) item.setAttribute("title", title);
    });
  }

  function openOwoWhenReady(owo) {
    if (!owo || owo.querySelector(".OwO-body")) return;
    let attempts = 0;
    owo.classList.add("solitude-owo-pending");

    const retry = () => {
      const logo = owo.querySelector(".OwO-logo");
      if (logo) {
        owo.classList.remove("solitude-owo-pending");
        logo.click();
        preserveOwoShortcodeTitles(owo);
        return;
      }

      attempts += 1;
      if (attempts < 16) {
        setTimeout(retry, 120);
      } else {
        owo.classList.remove("solitude-owo-pending");
        notify("表情包还在加载，请稍后再点一次");
      }
    };

    setTimeout(retry, 0);
  }

  function bindOwoPendingOpen(actionGroup) {
    if (actionGroup.dataset.solitudeOwoPendingBound === "true") return;
    actionGroup.dataset.solitudeOwoPendingBound = "true";
    actionGroup.addEventListener("click", event => {
      const owo = event.target.closest(".OwO");
      if (!owo || owo.querySelector(".OwO-body")) return;
      openOwoWhenReady(owo);
    }, true);
  }

  function markTextareaIfAiAssisted(textarea) {
    if (!textarea) return;

    const hadMarker = textarea.value.includes(AI_ASSISTED_MARKER);
    const currentValue = stripAiMarker(textarea.value);
    const generatedValue = state.aiDrafts.get(textarea);

    if (!currentValue.trim() || !isAiDraftStillPresent(currentValue, generatedValue)) {
      if (hadMarker) setTextareaValue(textarea, currentValue);
      return;
    }

    setTextareaValue(textarea, `${currentValue}${AI_ASSISTED_MARKER}`);
  }

  function getSubmitButton(submit) {
    return submit && submit.querySelector(".el-button--primary, button[type='submit']");
  }

  function getSubmitContextFromEvent(event) {
    if (event.type === "click") {
      const submitButton = event.target.closest("#twikoo .tk-submit .el-button--primary, #twikoo .tk-submit button[type='submit']");
      if (!submitButton) return null;

      const submit = getCommentComposerSubmit(submitButton.closest(".tk-submit"));
      if (!submit) return null;

      const textarea = submit.querySelector(".tk-input .el-textarea__inner, .el-textarea__inner") || getTextarea();
      return { button: submitButton, submit, textarea };
    }

    if (event.type === "keyup" && (event.ctrlKey || event.metaKey) && event.target.matches("#twikoo .el-textarea__inner")) {
      const submit = getCommentComposerSubmit(event.target.closest(".tk-submit"));
      if (!submit) return null;
      return { button: getSubmitButton(submit), submit, textarea: event.target };
    }

    return null;
  }

  function handlePotentialSubmit(event) {
    const context = getSubmitContextFromEvent(event);
    if (!context) return;

    markTextareaIfAiAssisted(context.textarea);
  }

  function handleTextareaInput(event) {
    if (!event.target.matches("#twikoo .el-textarea__inner")) return;
    if (!getCommentComposerSubmit(event.target.closest(".tk-submit"))) return;
    if (event.isTrusted && event.target.value.includes(AI_ASSISTED_MARKER)) {
      const cursor = event.target.selectionStart;
      setTextareaValue(event.target, stripAiMarker(event.target.value));
      event.target.setSelectionRange(cursor, cursor);
    }
    if (!stripAiMarker(event.target.value).trim()) state.aiDrafts.delete(event.target);
  }

  function bindSubmitMarker() {
    const twikoo = document.querySelector("#twikoo");
    if (!twikoo || twikoo.dataset.solitudeAiMarkerBound === "true") return;

    twikoo.dataset.solitudeAiMarkerBound = "true";
    twikoo.addEventListener("click", handlePotentialSubmit, true);
    twikoo.addEventListener("keyup", handlePotentialSubmit, true);
    twikoo.addEventListener("input", handleTextareaInput, true);
  }

  function stripAiMarkerFromElement(element) {
    let found = element.textContent.includes(AI_ASSISTED_MARKER);
    if (!found) return false;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const markedNodes = [];

    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes(AI_ASSISTED_MARKER)) markedNodes.push(walker.currentNode);
    }

    markedNodes.forEach(node => {
      node.nodeValue = stripAiMarker(node.nodeValue);
    });

    return found;
  }

  function getDirectChildByClass(element, className) {
    return Array.from(element.children).find(child => child.classList.contains(className));
  }

  function getOrCreateExtrasContainer(commentMain, content) {
    let extras = getDirectChildByClass(commentMain, "tk-extras");
    if (extras) return extras;

    extras = document.createElement("div");
    extras.className = "tk-extras solitude-ai-extras";
    content.insertAdjacentElement("afterend", extras);
    return extras;
  }

  function appendAiBadge(extras) {
    if (getDirectChildByClass(extras, "solitude-ai-assisted-badge")) return;

    const badge = document.createElement("div");
    badge.className = "tk-extra solitude-ai-assisted-badge";
    badge.innerHTML = '<span class="tk-extra-text">由AI辅助生成</span>';
    extras.appendChild(badge);
  }

  function renderAiBadges() {
    document.querySelectorAll("#twikoo .tk-content:not([data-solitude-ai-badge-checked])").forEach(content => {
      content.dataset.solitudeAiBadgeChecked = "true";
      const commentMain = content.parentElement;
      if (!commentMain) return;

      const isMarked = commentMain.dataset.solitudeAiAssisted === "true" || stripAiMarkerFromElement(content);
      if (!isMarked) return;

      commentMain.dataset.solitudeAiAssisted = "true";
      appendAiBadge(getOrCreateExtrasContainer(commentMain, content));
    });
  }

  function mountButton() {
    const config = getConfig();
    const textarea = getTextarea();
    if (!textarea) return false;

    document.querySelectorAll("#twikoo .tk-submit .tk-row-actions-start").forEach(actionGroup => {
      const submit = markCommentComposer(actionGroup.closest(".tk-submit"));
      if (!submit) return;
      normalizeActionBar(actionGroup);
      preserveOwoShortcodeTitles(actionGroup);
      bindOwoPendingOpen(actionGroup);
      mountMentionButton(actionGroup);
      if (config.enable && !actionGroup.querySelector(".solitude-ai-comment")) actionGroup.appendChild(createButton("generate"));
      if (config.enable && !actionGroup.querySelector(".solitude-ai-polish")) actionGroup.appendChild(createButton("polish"));
    });

    if (config.enable) bindSubmitMarker();
    renderAiBadges();
    return true;
  }

  function scheduleMountButton(retry = true) {
    if (state.observerQueued) return;
    state.observerQueued = true;
    requestAnimationFrame(() => {
      state.observerQueued = false;
      const mounted = mountButton();
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
      if (!mounted && retry && state.retryCount < 24) {
        state.retryCount += 1;
        state.retryTimer = setTimeout(() => scheduleMountButton(true), 250);
      } else if (mounted) {
        state.retryCount = 0;
      }
    });
  }

  function init() {
    scheduleMountButton(true);
  }

  window.SolitudeAIComment = { init, mount: () => scheduleMountButton(false) };

  document.addEventListener("DOMContentLoaded", init, { signal });
  document.addEventListener("pjax:complete", init, { signal });
  window.addEventListener("twikoo:loaded", () => scheduleMountButton(false), { signal });
  if (document.readyState !== "loading") init();
})();
