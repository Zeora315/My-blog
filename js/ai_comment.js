(function () {
  const DEFAULT_CONFIG = {
    enable: false,
    endpoint: "/api/ai-comment",
    model: "deepseek-chat",
    button_text: "AI",
    placeholder: "正在让 AI 阅读文章并生成评论..."
  };

  const AI_ASSISTED_MARKER = "\u2063\u200B\u2062\u200C\u2063";
  const SEND_PROGRESS_DURATION = 22000;
  const SEND_PROGRESS_TIMEOUT = 70000;

  const state = {
    observer: null,
    pending: false,
    typingTimer: null,
    aiDrafts: new WeakMap(),
    submitProgress: new WeakMap()
  };

  function getConfig() {
    return Object.assign({}, DEFAULT_CONFIG, window.SOLITUDE_AI_COMMENT || {});
  }

  function getTextarea() {
    return document.querySelector("#twikoo .el-textarea__inner");
  }

  function getButtonTextarea(button) {
    const submit = button.closest(".tk-submit") || document.querySelector("#twikoo .tk-submit");
    return (submit && submit.querySelector(".el-textarea__inner")) || getTextarea();
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

  function compactText(value) {
    return stripAiMarker(value)
      .replace(/[\s\u00a0`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?，。！？、；：“”‘’（）【】《》…—]/g, "")
      .toLowerCase();
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
      return "AI 接口未部署：当前网页找不到 /api/ai-comment，请把 endpoint 改成已部署的 Worker/API 地址";
    }

    if (text && /<!doctype html|<html/i.test(text)) {
      return "AI 接口返回了网页而不是 JSON，请检查 endpoint 是否指向真正的 API 服务";
    }

    return text.slice(0, 160);
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

  async function requestAiComment(button) {
    const textarea = getButtonTextarea(button);
    const config = getConfig();
    const title = getPageTitle();
    const content = getArticleText();
    const draft = textarea ? getExistingComment(textarea) : "";

    if (!textarea) {
      notify("没有找到评论输入框");
      return;
    }

    if (!content) {
      notify("没有读取到文章内容");
      return;
    }

    if (state.pending) return;
    state.pending = true;
    setActionBusy(button, true);
    button.classList.add("is-loading");

    const oldValue = textarea.value;
    setTextareaValue(textarea, "");

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
      if (!data.comment) throw new Error("AI 接口没有返回内容");

      button.classList.remove("is-loading");
      button.classList.add("is-typing");
      await typeTextareaValue(textarea, data.comment || "");
      rememberAiDraft(textarea, data.comment || "");
      notify("AI 评论已填入评论框");
    } catch (error) {
      setTextareaValue(textarea, oldValue);
      notify(error.message || "AI 评论生成失败");
    } finally {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
      state.pending = false;
      button.classList.remove("is-loading", "is-typing");
      setActionBusy(button, false);
    }
  }

  const icons = {
    comment: `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4.5 12a7.5 7.5 0 1 1 4.1 6.7L5 19.6l1-3.3A7.4 7.4 0 0 1 4.5 12Z" />
        <path d="M17 3.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" />
      </svg>
    `,
  };

  function createButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tk-submit-action-icon solitude-ai-action solitude-ai-comment";
    button.setAttribute("aria-label", "AI 生成评论");
    button.setAttribute("aria-busy", "false");
    button.innerHTML = `
      <span class="solitude-ai-action-icon" aria-hidden="true">${icons.comment}</span>
      <span class="solitude-ai-action-orb" aria-hidden="true"></span>
      <span class="solitude-ai-action-label">AI评论</span>
      <span class="solitude-ai-action-status" aria-hidden="true"></span>
    `;
    button.addEventListener("click", () => requestAiComment(button));
    return button;
  }

  function normalizeActionBar(actionGroup) {
    actionGroup.querySelectorAll("[title]").forEach(element => {
      if (!element.getAttribute("aria-label")) element.setAttribute("aria-label", element.getAttribute("title"));
      element.removeAttribute("title");
    });
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

      const submit = submitButton.closest(".tk-submit");
      const textarea = (submit && submit.querySelector(".el-textarea__inner")) || getTextarea();
      return { button: submitButton, submit, textarea };
    }

    if (event.type === "keyup" && (event.ctrlKey || event.metaKey) && event.target.matches("#twikoo .el-textarea__inner")) {
      const submit = event.target.closest(".tk-submit");
      return { button: getSubmitButton(submit), submit, textarea: event.target };
    }

    return null;
  }

  function handlePotentialSubmit(event) {
    const context = getSubmitContextFromEvent(event);
    if (!context) return;

    markTextareaIfAiAssisted(context.textarea);
    startSubmitProgress(context);
  }

  function isSubmitButtonDisabled(button) {
    return !button || button.disabled || button.classList.contains("is-disabled") || button.getAttribute("disabled") !== null;
  }

  function isSubmitButtonBusy(button) {
    return !!button && (button.disabled || button.classList.contains("is-loading") || button.getAttribute("aria-busy") === "true");
  }

  function setSubmitProgress(button, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    button.style.setProperty("--solitude-send-progress", `${Math.round(clamped * 100)}%`);
  }

  function finishSubmitProgress(button, complete) {
    const entry = state.submitProgress.get(button);
    if (!entry || entry.finishing) return;

    entry.finishing = true;
    cancelAnimationFrame(entry.raf);
    clearInterval(entry.monitor);

    if (complete) {
      setSubmitProgress(button, 1);
      button.classList.add("solitude-submit-complete");
    } else {
      setSubmitProgress(button, 0);
    }

    window.setTimeout(() => {
      button.classList.remove("solitude-submit-loading", "solitude-submit-complete");
      button.style.removeProperty("--solitude-send-progress");
      if (entry.submit) entry.submit.classList.remove("solitude-submit-loading-wrap");
      state.submitProgress.delete(button);
    }, complete ? 420 : 120);
  }

  function startSubmitProgress(context) {
    const { button, submit, textarea } = context;
    if (!button || !textarea || isSubmitButtonDisabled(button) || !stripAiMarker(textarea.value).trim()) return;
    if (state.submitProgress.has(button)) return;

    const startedAt = performance.now();
    const entry = {
      button,
      submit,
      textarea,
      startedAt,
      sawBusy: false,
      finishing: false,
      raf: 0,
      monitor: 0
    };

    state.submitProgress.set(button, entry);
    button.classList.add("solitude-submit-loading");
    if (submit) submit.classList.add("solitude-submit-loading-wrap");

    const draw = () => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(.96, elapsed / SEND_PROGRESS_DURATION);
      setSubmitProgress(button, progress);
      entry.raf = requestAnimationFrame(draw);
    };

    draw();

    entry.monitor = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const isBusy = isSubmitButtonBusy(button);
      const isCleared = !stripAiMarker(textarea.value).trim();

      if (isBusy) entry.sawBusy = true;
      if ((entry.sawBusy && !isBusy) || isCleared || elapsed > SEND_PROGRESS_TIMEOUT) {
        finishSubmitProgress(button, true);
      } else if (!entry.sawBusy && elapsed > 1600) {
        finishSubmitProgress(button, false);
      }
    }, 180);
  }

  function handleTextareaInput(event) {
    if (!event.target.matches("#twikoo .el-textarea__inner")) return;
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
    document.querySelectorAll("#twikoo .tk-content").forEach(content => {
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
    if (!config.enable) return;

    const textarea = getTextarea();
    if (!textarea) return;

    // Twikoo's action bar where emoji and image icons are located
    const actionGroup = document.querySelector("#twikoo .tk-row-actions-start");
    if (actionGroup) {
      normalizeActionBar(actionGroup);
      if (!actionGroup.querySelector(".solitude-ai-comment")) actionGroup.appendChild(createButton());
    }

    bindSubmitMarker();
    renderAiBadges();
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
