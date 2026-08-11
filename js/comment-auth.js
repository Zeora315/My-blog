(() => {
  const DEFAULT_CONFIG = {
    apiUrl: "/api/demo",
    adminUrl: "/admin",
    profileUrl: "/user-center/",
    siteName: "Zeora Blog"
  };
  const SESSION_KEY = "zeoraTwikooUserSession";

  window.__zeoraCommentAuthCleanup?.();

  const controller = new AbortController();
  const { signal } = controller;
  const state = {
    token: "",
    user: null,
    email: "",
    manualMode: false,
    observer: null,
    layoutObserver: null,
    mounted: false,
    eventsBound: false,
    mutationQueued: false,
    profileCache: new Map(),
    profileIndex: new Map(),
    profileIndexPromise: null,
    authMode: "login",
    authStep: "email",
    authEmail: "",
    rememberSession: true,
    captcha: { enabled: false, provider: "" },
    users: [],
    notifications: [],
    unread: 0,
    filter: { query: "", role: "all", status: "all" },
    submitEl: null,
    reply: { placeholder: null, slot: null, target: null }
  };

  let geetestLoaderPromise = null;
  const captchaLoaderPromises = new Map();
  let fetchPatchInstalled = false;

  window.__zeoraCommentAuthCleanup = () => {
    controller.abort();
    state.observer?.disconnect();
    state.observer = null;
    state.layoutObserver?.disconnect();
    state.layoutObserver = null;
  };
  document.addEventListener("solitude:beforeNavigate", window.__zeoraCommentAuthCleanup, { once: true, signal });

  function config() {
    return Object.assign({}, DEFAULT_CONFIG, window.SOLITUDE_COMMENT_AUTH || {});
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeBadgeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "";
  }

  function badgeStyleAttr(user) {
    const color = normalizeBadgeColor(user?.badgeColor);
    return color ? " style=\"--zca-badge-color: " + escapeHtml(color) + "\"" : "";
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "{}";
      const value = JSON.parse(raw);
      if (!value.sessionToken || !value.user) return null;
      state.rememberSession = Boolean(localStorage.getItem(SESSION_KEY));
      return value;
    } catch (error) {
      return null;
    }
  }

  function writeSession(payload) {
    const storage = state.rememberSession ? localStorage : sessionStorage;
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    storage.setItem(SESSION_KEY, JSON.stringify({
      sessionToken: payload.sessionToken,
      user: payload.user,
      savedAt: Date.now()
    }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    state.token = "";
    state.user = null;
    state.manualMode = false;
  }

  function isManualMode() {
    return state.manualMode;
  }

  function buildApiUrl(action) {
    const url = new URL(config().apiUrl || DEFAULT_CONFIG.apiUrl, window.location.origin);
    url.searchParams.set("action", action);
    return url.toString();
  }

  function adminOrigin() {
    try {
      return new URL(config().adminUrl || DEFAULT_CONFIG.adminUrl, window.location.origin).origin;
    } catch (error) {
      return "";
    }
  }

  async function api(action, options = {}) {
    const headers = {};
    if (state.token) headers["x-session-token"] = state.token;
    if (options.body) headers["content-type"] = "application/json";

    const url = new URL(buildApiUrl(action));
    Object.entries(options.params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });

    let response;
    try {
      response = await fetch(url.toString(), {
        method: options.method || (options.body ? "POST" : "GET"),
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (error) {
      throw new Error("连接评论账号服务失败，请稍后重试。");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "请求失败，请稍后重试。");
    }
    return payload;
  }

  async function refreshHealth() {
    try {
      const payload = await api("health");
      state.captcha = payload.captcha || { enabled: false, provider: "" };
      if (payload.site?.name) window.SOLITUDE_COMMENT_AUTH = Object.assign({}, window.SOLITUDE_COMMENT_AUTH || {}, { siteName: payload.site.name });
    } catch (error) {
      state.captcha = { enabled: false, provider: "" };
    }
  }

  function loadScriptOnce(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    if (captchaLoaderPromises.has(src)) return captchaLoaderPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("人机验证脚本加载失败，请检查网络后重试。"));
      document.head.appendChild(script);
    });
    captchaLoaderPromises.set(src, promise);
    return promise;
  }

  function ensureCaptchaMount(provider) {
    let mount = document.getElementById("zca-captcha-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "zca-captcha-mount";
      mount.style.cssText = "position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:rgba(24,28,39,.38);backdrop-filter:blur(8px);";
      document.body.appendChild(mount);
    }
    mount.innerHTML = `
      <div style="display:grid;gap:14px;width:min(360px,calc(100vw - 32px));padding:18px;border-radius:16px;background:var(--efu-card-bg,#fff);box-shadow:0 18px 48px rgba(0,0,0,.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <strong style="color:var(--efu-fontcolor,#202124);font-size:16px;">${escapeHtml(provider)} 人机验证</strong>
          <button type="button" data-zca-captcha-close style="width:32px;height:32px;border:0;border-radius:50%;background:var(--efu-secondbg,#f4f6f8);color:var(--efu-fontcolor,#202124);cursor:pointer;">×</button>
        </div>
        <div id="zca-captcha-slot" style="display:grid;place-items:center;min-height:78px;"></div>
      </div>
    `;
    return { mount, slot: mount.querySelector("#zca-captcha-slot") };
  }

  function closeCaptchaMount() {
    document.getElementById("zca-captcha-mount")?.remove();
  }

  async function runSiteTokenCaptcha(provider) {
    const siteKey = state.captcha?.siteKey;
    if (!siteKey) throw new Error(`${provider} Site Key 未配置，请检查 Twikoo 评论管理后台。`);
    const scripts = {
      Turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      hCaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
      reCAPTCHA: "https://www.google.com/recaptcha/api.js?render=explicit"
    };
    await loadScriptOnce(scripts[provider]);

    return new Promise((resolve, reject) => {
      const { mount, slot } = ensureCaptchaMount(provider);
      const finish = (token) => {
        closeCaptchaMount();
        resolve(token);
      };
      const fail = () => {
        closeCaptchaMount();
        reject(new Error("人机验证失败，请重新验证。"));
      };
      mount.querySelector("[data-zca-captcha-close]")?.addEventListener("click", () => {
        closeCaptchaMount();
        reject(new Error("请先完成人机验证。"));
      }, { once: true });

      if (provider === "Turnstile" && window.turnstile) {
        window.turnstile.render(slot, { sitekey: siteKey, callback: finish, "error-callback": fail, "expired-callback": fail });
        return;
      }
      if (provider === "hCaptcha" && window.hcaptcha) {
        window.hcaptcha.render(slot, { sitekey: siteKey, callback: finish, "error-callback": fail, "expired-callback": fail });
        return;
      }
      if (provider === "reCAPTCHA" && window.grecaptcha) {
        window.grecaptcha.render(slot, { sitekey: siteKey, callback: finish, "error-callback": fail, "expired-callback": fail });
        return;
      }
      fail();
    });
  }

  async function runGeetestCaptcha() {
    const captchaId = state.captcha?.geetestCaptchaId;
    if (!captchaId) throw new Error("极验 Captcha ID 未配置，请检查 Twikoo 评论管理后台。");
    geetestLoaderPromise = geetestLoaderPromise || loadScriptOnce("https://static.geetest.com/v4/gt4.js");
    await geetestLoaderPromise;
    if (typeof window.initGeetest4 !== "function") throw new Error("极验脚本未就绪，请刷新后重试。");

    return new Promise((resolve, reject) => {
      window.initGeetest4({
        captchaId,
        product: "bind",
        language: "zho"
      }, (captcha) => {
        captcha.onReady(() => captcha.showCaptcha());
        captcha.onSuccess(() => resolve(captcha.getValidate()));
        captcha.onError(() => reject(new Error("人机验证失败，请重新验证。")));
        captcha.onClose?.(() => reject(new Error("请先完成人机验证。")));
      });
    });
  }

  async function runCaptchaChallenge() {
    if (!state.captcha?.enabled) return null;
    if (state.captcha.provider === "Geetest") return runGeetestCaptcha();
    if (["Turnstile", "hCaptcha", "reCAPTCHA"].includes(state.captcha.provider)) {
      return runSiteTokenCaptcha(state.captcha.provider);
    }
    throw new Error(`暂不支持 ${state.captcha.provider || "当前"} 人机验证前端。`);
  }

  function makeNameFromEmail(email) {
    const local = String(email || "").split("@")[0] || "user";
    return local.replace(/[^a-zA-Z0-9_.-\u4e00-\u9fa5]/g, "_").slice(0, 32).padEnd(3, "0");
  }

  function initials(user) {
    return String(user?.displayName || user?.username || "?").trim().slice(0, 1).toUpperCase();
  }

  function avatarHtml(user) {
    if (user?.avatarUrl) {
      return `<span class="zca-avatar"><img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.displayName || user.username)} 的头像" /></span>`;
    }
    return `<span class="zca-avatar" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
  }

  function adminPanelUrl() {
    try {
      return new URL(config().adminUrl || DEFAULT_CONFIG.adminUrl, window.location.origin).toString();
    } catch (error) {
      return DEFAULT_CONFIG.adminUrl;
    }
  }

  function userHandle(user) {
    return String(user?.username || user?.uid || user?.id || "").replace(/^@/, "").trim();
  }

  function publicProfileUrlFromHandle(handleValue) {
    const handle = String(handleValue || "").replace(/^@/, "").trim();
    if (!handle) return window.location.origin;
    try {
      const base = new URL(config().profileUrl || DEFAULT_CONFIG.profileUrl, window.location.origin);
      base.pathname = base.pathname.replace(/\/?$/, "/");
      base.search = "";
      base.hash = "";
      base.searchParams.set("user", handle);
      return base.toString();
    } catch (error) {
      return `${window.location.origin}/user-center/?user=${encodeURIComponent(handle)}`;
    }
  }

  function clearProfileCacheForUser(user) {
    [user?.username, user?.uid, user?.id].forEach((value) => {
      const key = String(value || "").replace(/^@/, "").trim().toLowerCase();
      if (key) state.profileCache.delete(key);
    });
  }

  function publicProfileUrl(user) {
    return publicProfileUrlFromHandle(userHandle(user));
  }

  function resolveProfileTarget(value) {
    const handle = profileHandleFromUrl(value);
    return handle ? publicProfileUrlFromHandle(handle) : value;
  }

  function setInputValue(input, value) {
    if (!input || !value) return;
    if (input.value === value) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncTwikooProfile() {
    const user = state.user;
    if (!user) return;

    const nick = document.querySelector("#twikoo input[name='nick'], #twikoo input[placeholder*='昵称'], #twikoo input[placeholder*='Nick']");
    const mail = document.querySelector("#twikoo input[name='mail'], #twikoo input[type='email'], #twikoo input[placeholder*='邮箱'], #twikoo input[placeholder*='Mail']");
    const link = document.querySelector("#twikoo input[name='link'], #twikoo input[placeholder*='网站'], #twikoo input[placeholder*='链接'], #twikoo input[placeholder*='http']");

    setInputValue(nick, user.displayName || user.username || makeNameFromEmail(user.email));
    setInputValue(mail, user.email);
    setInputValue(link, publicProfileUrl(user));
  }

  function notify(message, isError = false) {
    if (window.Snackbar) {
      Snackbar.show({ text: message, pos: "top-center", duration: isError ? 5200 : 3200 });
      return;
    }
    console[isError ? "warn" : "info"](message);
  }

  function getCommentWrap() {
    return document.querySelector("#post-comment .comment-wrap") || document.querySelector("#twikoo-wrap")?.parentElement;
  }

  function getPostComment() {
    return document.querySelector("#post-comment");
  }

  function applyCommentMode() {
    const post = getPostComment();
    if (!post) return;

    const manual = isManualMode() && !state.user;
    const replyActive = Boolean(state.reply.slot?.isConnected);
    const submit = getTwikooSubmit();
    post.classList.toggle("zca-auth-required", !state.user && !manual);
    post.classList.toggle("zca-auth-granted", Boolean(state.user) && !manual);
    post.classList.toggle("zca-manual-comment", manual);
    post.classList.toggle("zca-reply-active", replyActive);
    if (submit) submit.style.display = !state.user && !manual && !replyActive ? "none" : "";
  }

  function removeManualSwitchButton() {
    document.querySelector("#twikoo .zca-send-switch")?.remove();
  }

  function getTwikooSubmit() {
    if (state.submitEl?.isConnected) return state.submitEl;
    const submit = document.querySelector("#twikoo > .tk-submit") || document.querySelector("#twikoo .tk-submit");
    if (submit) {
      submit.classList.add("zca-primary-submit");
      state.submitEl = submit;
      if (!state.reply.placeholder?.isConnected && submit.parentNode) {
        state.reply.placeholder = document.createComment("zeora-comment-submit-home");
        submit.parentNode.insertBefore(state.reply.placeholder, submit);
      }
    }
    return submit;
  }

  function getTwikooActionRow() {
    return getTwikooSubmit()?.querySelector(".tk-row.actions") || null;
  }

  function ensureManualSwitchButton() {
    removeManualSwitchButton();
  }

  function syncCommentActionOverlay() {
    const submit = getTwikooSubmit();
    const textarea = submit?.querySelector(".el-textarea__inner");
    const actionGroup = submit?.querySelector(".tk-row-actions-start");
    if (!submit || !textarea || !actionGroup) return;

    const submitRect = submit.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const actionHeight = actionGroup.offsetHeight || actionGroup.getBoundingClientRect().height || 32;
    if (!submitRect.width || !textareaRect.width) return;

    actionGroup.style.setProperty("--zca-actions-top", `${Math.max(8, textareaRect.bottom - submitRect.top - actionHeight - 10)}px`);
    actionGroup.style.setProperty("--zca-actions-left", `${Math.max(10, textareaRect.left - submitRect.left + 12)}px`);
    actionGroup.style.setProperty("--zca-actions-max-width", `${Math.max(160, textareaRect.width - 24)}px`);

    const meta = submit.querySelector(".tk-meta-input");
    const profileBar = submit.querySelector(".zeora-comment-auth.is-authorized");
    const anchor = meta && getComputedStyle(meta).display !== "none" ? meta : profileBar;
    const primary = submit.querySelector(".el-button--primary");
    if (anchor && primary) {
      const anchorRect = anchor.getBoundingClientRect();
      const primaryHeight = primary.getBoundingClientRect().height || 34;
      const top = anchorRect.top - submitRect.top + Math.max(0, (anchorRect.height - primaryHeight) / 2);
      primary.style.setProperty("transition", "background .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease", "important");
      primary.style.setProperty("--zca-submit-top", `${Math.max(0, top)}px`);
    }
  }

  function observeCommentLayout() {
    const submit = getTwikooSubmit();
    const textarea = submit?.querySelector(".el-textarea__inner");
    if (!submit || !textarea || typeof ResizeObserver === "undefined") return;

    state.layoutObserver?.disconnect();
    state.layoutObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncCommentActionOverlay);
    });
    state.layoutObserver.observe(submit);
    state.layoutObserver.observe(textarea);
    const meta = submit.querySelector(".tk-meta-input");
    const profileBar = submit.querySelector(".zeora-comment-auth.is-authorized");
    if (meta) state.layoutObserver.observe(meta);
    if (profileBar) state.layoutObserver.observe(profileBar);
  }

  function placeAuthBar(bar) {
    const submit = getTwikooSubmit();
    if (!submit) return false;

    const actionRow = getTwikooActionRow();
    if (actionRow) {
      if (actionRow.nextElementSibling !== bar) actionRow.insertAdjacentElement("afterend", bar);
      return true;
    }

    if (bar.parentElement !== submit || submit.lastElementChild !== bar) submit.appendChild(bar);
    return true;
  }

  function placeProfileBar(bar) {
    const submit = getTwikooSubmit();
    if (!submit) return false;

    const meta = submit.querySelector(".tk-meta-input");
    if (meta) {
      const parent = meta.parentElement || submit;
      if (bar.parentElement !== parent || meta.previousElementSibling !== bar) parent.insertBefore(bar, meta);
      return true;
    }

    return placeAuthBar(bar);
  }

  function placeGateBar(bar) {
    if (state.reply.slot?.isConnected) {
      if (state.reply.slot.firstElementChild !== bar) state.reply.slot.insertBefore(bar, state.reply.slot.firstElementChild);
      return true;
    }

    const wrap = getCommentWrap();
    if (!wrap) return false;

    const twikooWrap = document.getElementById("twikoo-wrap");
    if (twikooWrap?.parentElement === wrap) {
      if (twikooWrap.previousElementSibling !== bar) wrap.insertBefore(bar, twikooWrap);
      return true;
    }

    if (wrap.firstElementChild !== bar) wrap.insertBefore(bar, wrap.firstElementChild);
    return true;
  }

  function directChildByClass(parent, className) {
    return Array.from(parent?.children || []).find((child) => child.classList?.contains(className)) || null;
  }

  function setReplyActive(active) {
    const post = getPostComment();
    if (post) post.classList.toggle("zca-reply-active", Boolean(active));
  }

  function replyControlFromEventTarget(target) {
    const control = target.closest?.("#twikoo button, #twikoo a");
    if (!control || control.closest(".tk-submit")) return null;
    const label = `${control.textContent || ""} ${control.getAttribute("aria-label") || ""} ${control.title || ""}`.trim();
    return /回复/.test(label) ? control : null;
  }

  function ensureReplySlot(comment) {
    let slot = directChildByClass(comment, "zca-reply-composer");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "zca-reply-composer";
      const replies = directChildByClass(comment, "tk-replies");
      if (replies) comment.insertBefore(slot, replies);
      else comment.appendChild(slot);
    }
    return slot;
  }

  function moveComposerToComment(comment) {
    const submit = getTwikooSubmit();
    if (!comment || !submit) return;

    const previous = state.reply.target;
    if (previous && previous !== comment) previous.classList.remove("zca-reply-target");

    const slot = ensureReplySlot(comment);
    if (state.reply.slot && state.reply.slot !== slot) state.reply.slot.remove();
    if (submit.parentElement !== slot) slot.appendChild(submit);
    comment.classList.add("zca-reply-target");
    state.reply.slot = slot;
    state.reply.target = comment;
    setReplyActive(true);
    applyCommentMode();
    renderBar();
    syncTwikooProfile();
    requestAnimationFrame(() => {
      syncCommentActionOverlay();
      observeCommentLayout();
      submit.querySelector(".el-textarea__inner")?.focus?.({ preventScroll: true });
    });
  }

  function scheduleMoveComposerToComment(comment) {
    requestAnimationFrame(() => {
      moveComposerToComment(comment);
      setTimeout(() => moveComposerToComment(comment), 60);
    });
  }

  function restoreReplyComposer() {
    const submit = getTwikooSubmit();
    const placeholder = state.reply.placeholder;
    if (submit && placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(submit, placeholder.nextSibling);
    } else if (submit) {
      document.querySelector("#twikoo")?.insertBefore(submit, document.querySelector("#twikoo .tk-comments") || null);
    }
    state.reply.target?.classList.remove("zca-reply-target");
    state.reply.slot?.remove();
    state.reply.slot = null;
    state.reply.target = null;
    setReplyActive(false);
    applyCommentMode();
    renderBar();
    requestAnimationFrame(() => {
      syncCommentActionOverlay();
      observeCommentLayout();
    });
  }

  function ensureModalRoot() {
    let root = document.getElementById("zeora-comment-auth-modal");
    if (root) return root;
    root = document.createElement("div");
    root.id = "zeora-comment-auth-modal";
    root.className = "zca-modal-root is-hidden";
    document.body.appendChild(root);
    return root;
  }

  function closeModal() {
    const root = document.getElementById("zeora-comment-auth-modal");
    if (!root) return;
    root.classList.add("is-hidden");
    root.innerHTML = "";
  }

  function returnToCommentArea() {
    const post = getPostComment();
    if (!post) return;

    requestAnimationFrame(() => {
      post.scrollIntoView({ behavior: "smooth", block: "center" });
      const textarea = post.querySelector("#twikoo .el-textarea__inner");
      textarea?.focus?.({ preventScroll: true });
      scheduleCommentAuthUiUpdate();
    });
  }

  function setManualMode() {
    state.manualMode = true;
    state.user = null;
    state.token = "";
    localStorage.removeItem(SESSION_KEY);
    closeModal();
    applyCommentMode();
    renderBar();
    notify("已切换为手动填写评论信息。");
  }

  function resetToGate(message = "已返回评论登录。") {
    clearSession();
    removeManualSwitchButton();
    closeModal();
    renderBar();
    notify(message);
  }

  function renderModal(step = "email", message = "") {
    const root = ensureModalRoot();
    const { siteName } = config();
    root.innerHTML = `
      <div class="zca-modal-card" role="dialog" aria-modal="true" aria-labelledby="zcaModalTitle">
        <button class="zca-close" type="button" data-zca-close aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
        <h2 id="zcaModalTitle">${escapeHtml(siteName)}</h2>
        <form class="zca-form ${step === "email" ? "" : "is-hidden"}" data-zca-email-form>
          <input name="email" type="email" required autocomplete="email" placeholder="邮箱" value="${escapeHtml(state.email)}" />
          <button type="submit">发送验证码</button>
        </form>
        <form class="zca-form ${step === "code" ? "" : "is-hidden"}" data-zca-code-form>
          <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
          <button type="submit">登录</button>
          <button class="zca-back" type="button" data-zca-back>上一步</button>
        </form>
        ${message ? `<p class="zca-message">${escapeHtml(message)}</p>` : ""}
        <button class="zca-manual-link" type="button" data-zca-manual>其他方式</button>
      </div>
    `;
    root.classList.remove("is-hidden");
    root.querySelector("input")?.focus();
  }

  function renderEmbeddedLogin(message = "") {
    const root = ensureModalRoot();
    const { siteName } = config();
    const mode = ["login", "register", "reset"].includes(state.authMode) ? state.authMode : "login";
    const step = state.authStep || "email";
    const showEmail = step === "email";
    const showPassword = mode === "login" && step === "password";
    const showRegister = mode === "register" && step === "code";
    const showReset = mode === "reset" && step === "code";
    const title = mode === "register" ? "注册评论账号" : mode === "reset" ? "重置评论密码" : "登录评论账号";
    const lead = mode === "register"
      ? "设置昵称和头像外链，之后评论区会直接使用这份云端资料。"
      : mode === "reset"
        ? "通过邮箱验证码重置密码，完成后会自动登录评论区。"
        : "登录后会同步昵称、头像和个人主页到评论区。";
    root.innerHTML = `
      <div class="zca-modal-card zca-login-modal" role="dialog" aria-modal="true" aria-labelledby="zcaLoginTitle">
        <button class="zca-close" type="button" data-zca-close aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
        <header class="zca-login-head">
          <strong>${escapeHtml(siteName)}</strong>
          <h2 id="zcaLoginTitle">${escapeHtml(title)}</h2>
          <p>${escapeHtml(lead)}</p>
        </header>

        <div class="zca-mode-tabs" role="tablist" aria-label="账号操作">
          <button type="button" data-zca-auth-mode="login" class="${mode === "login" ? "is-active" : ""}">登录</button>
          <button type="button" data-zca-auth-mode="register" class="${mode === "register" ? "is-active" : ""}">注册</button>
          <button type="button" data-zca-auth-mode="reset" class="${mode === "reset" ? "is-active" : ""}">忘记密码</button>
        </div>

        ${state.captcha?.enabled ? `<div class="zca-security-pill">${escapeHtml(state.captcha.provider || "人机验证")} 已启用</div>` : ""}

        <form class="zca-login-form ${showEmail ? "" : "is-hidden"}" data-zca-login-email-form>
          <label>
            <span>邮箱</span>
            <input name="email" type="email" required autocomplete="email" placeholder="name@example.com" value="${escapeHtml(state.authEmail)}" />
          </label>
          <label class="zca-remember-row">
            <input name="rememberMe" type="checkbox" ${state.rememberSession ? "checked" : ""} />
            <span>记住我，下次自动登录</span>
          </label>
          <button class="zca-primary-btn" type="submit">下一步</button>
        </form>

        <form class="zca-login-form ${showPassword ? "" : "is-hidden"}" data-zca-login-password-form>
          <label>
            <span>密码</span>
            <input name="password" type="password" required autocomplete="current-password" />
          </label>
          <div class="zca-form-actions">
            <button class="zca-primary-btn" type="submit">登录</button>
            <button class="zca-quiet-btn" type="button" data-zca-back-email>上一步</button>
          </div>
        </form>

        <form class="zca-login-form ${showRegister ? "" : "is-hidden"}" data-zca-register-form>
          <label>
            <span>邮箱验证码</span>
            <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
          </label>
          <label>
            <span>用户名</span>
            <input name="username" required minlength="3" maxlength="32" autocomplete="username" value="${escapeHtml(makeNameFromEmail(state.authEmail))}" />
          </label>
          <label>
            <span>显示名称</span>
            <input name="displayName" maxlength="64" autocomplete="name" value="${escapeHtml(makeNameFromEmail(state.authEmail))}" />
          </label>
          <label>
            <span>头像外链</span>
            <input name="avatarUrl" type="url" autocomplete="url" placeholder="https://example.com/avatar.png" />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 位" />
          </label>
          <div class="zca-form-actions">
            <button class="zca-primary-btn" type="submit">注册并登录</button>
            <button class="zca-quiet-btn" type="button" data-zca-back-email>上一步</button>
          </div>
        </form>

        <form class="zca-login-form ${showReset ? "" : "is-hidden"}" data-zca-reset-form>
          <label>
            <span>邮箱验证码</span>
            <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 位" />
          </label>
          <div class="zca-form-actions">
            <button class="zca-primary-btn" type="submit">重置并登录</button>
            <button class="zca-quiet-btn" type="button" data-zca-back-email>上一步</button>
          </div>
        </form>

        ${message ? `<p class="zca-message ${message.startsWith("错误：") ? "is-error" : ""}">${escapeHtml(message.replace(/^错误：/, ""))}</p>` : ""}
      </div>
    `;
    root.classList.remove("is-hidden");
    root.querySelector("input:not([type='checkbox'])")?.focus();
  }

  function renderManualWarningModal() {
    const root = ensureModalRoot();
    root.innerHTML = `
      <div class="zca-modal-card zca-manual-warning" role="dialog" aria-modal="true" aria-labelledby="zcaManualWarningTitle">
        <button class="zca-close" type="button" data-zca-close aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
        <div class="zca-warning-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3.2 5.5 5.9v5.6c0 4 2.7 7.7 6.5 8.9 3.8-1.2 6.5-4.9 6.5-8.9V5.9L12 3.2Z" />
            <path d="M12 7.6v5.1" />
            <path d="M12 16.3h.01" />
          </svg>
        </div>
        <h2 id="zcaManualWarningTitle">你的评论信息容易被冒充</h2>
        <p>使用传统免登录评论时，只要别人知道你的昵称和邮箱，就可能冒用你的身份发表评论。</p>
        <p>使用账号登录后评论，可以保护头像、昵称和评论记录，也方便之后管理自己的评论。</p>
        <button class="zca-warning-primary" type="button" data-zca-login>使用账号登录后评论</button>
        <button class="zca-manual-continue" type="button" data-zca-confirm-manual>继续使用传统方式评论</button>
      </div>
    `;
    root.classList.remove("is-hidden");
    root.querySelector("[data-zca-login]")?.focus();
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function formatDate(value) {
    if (!value) return "未知";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未知";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatDateTime(value) {
    if (!value) return "刚刚";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function socialLinks(user) {
    return Array.isArray(user?.socialLinks)
      ? user.socialLinks
        .map((item) => ({
          label: String(item?.label || item?.name || "").trim(),
          url: String(item?.url || item?.href || item?.link || "").trim()
        }))
        .filter((item) => item.label && item.url)
      : [];
  }

  function socialLinksToText(user) {
    return socialLinks(user).map((item) => `${item.label} ${item.url}`).join("\n");
  }

  function parseSocialLinksText(value) {
    return String(value || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const url = parts.pop() || "";
        return { label: parts.join(" ").trim(), url };
      })
      .filter((item) => item.label && item.url);
  }

  function levelFromExperience(experienceValue) {
    const experience = Math.max(0, Math.floor(numeric(experienceValue)));
    let level = 1;
    let spent = 0;
    while (experience >= spent + level && level < 99) {
      spent += level;
      level += 1;
    }
    const progress = Math.max(0, experience - spent);
    const nextRequired = level;
    return {
      experience,
      level,
      label: `Lv.${level}`,
      nextLevel: level + 1,
      progress,
      nextRequired,
      toNext: Math.max(0, nextRequired - progress)
    };
  }

  function levelMeta(user) {
    const experience = numeric(user?.commentExperience ?? user?.commentCount, 0);
    const computed = levelFromExperience(experience);
    const level = Math.max(1, Math.floor(numeric(user?.commentLevel, computed.level)));
    return {
      ...computed,
      level,
      label: user?.commentLevelLabel || `Lv.${level}`,
      nextLevel: Math.max(level + 1, Math.floor(numeric(user?.commentNextLevel, level + 1))),
      progress: Math.max(0, Math.floor(numeric(user?.commentProgress, computed.progress))),
      nextRequired: Math.max(1, Math.floor(numeric(user?.commentNextRequired, computed.nextRequired))),
      toNext: Math.max(0, Math.floor(numeric(user?.commentToNext, computed.toNext)))
    };
  }

  function notificationIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>`;
  }

  function typeLabel(type) {
    if (type === "friend") return "友链";
    if (type === "reply" || type === "comment") return "评论";
    return "系统";
  }

  function renderLevelCard(user) {
    const meta = levelMeta(user);
    const percent = Math.max(0, Math.min(100, (meta.progress / Math.max(1, meta.nextRequired)) * 100));
    return `
      <section class="zca-level-card zca-level-detail-card" aria-label="评论等级">
        <div class="zca-level-card-top">
          <h3>评论等级</h3>
          <span>${escapeHtml(meta.label)}</span>
        </div>
        <div class="zca-level-card-meta">
          <strong>经验：${escapeHtml(meta.experience)}</strong>
          <em>距离 Lv.${escapeHtml(meta.nextLevel)} 还需 ${escapeHtml(meta.toNext)} 点经验</em>
        </div>
        <div class="zca-level-track" aria-hidden="true"><i style="width:${percent}%"></i></div>
      </section>
    `;
  }

  function updateAuthorizedUser(user) {
    if (!user) return;
    clearProfileCacheForUser(user);
    state.profileIndex.clear();
    state.profileIndexPromise = null;
    state.user = user;
    writeSession({ user: state.user, sessionToken: state.token });
    syncTwikooProfile();
    renderBar();
    hydrateCommentAvatars();
    window.dispatchEvent(new CustomEvent("zeora-comment-auth:user", { detail: { user: state.user } }));
  }

  function renderUserCenterModal(panel = "profile", message = "", isError = false) {
    if (!state.user) {
      state.authMode = "login";
      state.authStep = "email";
      renderEmbeddedLogin("请先登录账号，再进入用户中心。");
      return;
    }

    const root = ensureModalRoot();
    const user = state.user;
    const badge = user.badgeLabel || (user.role === "admin" ? "博主" : "");
    const tabs = user.role === "admin"
      ? [["profile", "资料"], ["level", "等级"], ["notice", "通知"], ["admin", "用户"]]
      : [["profile", "资料"], ["password", "密码"], ["notice", "通知"], ["level", "等级"]];
    const activePanel = [...tabs.map(([name]) => name), "password"].includes(panel) ? panel : "profile";
    root.innerHTML = `
      <div class="zca-modal-card zca-account-modal" role="dialog" aria-modal="true" aria-labelledby="zcaAccountTitle">
        <button class="zca-close" type="button" data-zca-close aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
        <header class="zca-account-head">
          <div class="zca-account-avatar-row">
            ${avatarHtml(user)}
          </div>
          <div class="zca-account-title">
            <div class="zca-name-line">
              <h2 id="zcaAccountTitle">${escapeHtml(user.displayName || user.username)}</h2>
              ${badge ? `<span class="zca-role"${badgeStyleAttr(user)}>${escapeHtml(badge)}</span>` : ""}
            </div>
            <div class="zca-account-pills">
              <span>UID: ${escapeHtml(user.uid || String(user.id || "").slice(0, 8))}</span>
              <span>${escapeHtml(user.email || "")}</span>
            </div>
          </div>
          <button class="zca-notice-round" type="button" data-zca-open-notifications aria-label="打开通知">
            ${notificationIcon()}
            ${state.unread ? `<span>${escapeHtml(state.unread)}</span>` : ""}
          </button>
        </header>
        <nav class="zca-account-tabs" aria-label="用户中心">
          ${tabs.map(([name, label]) => `<button type="button" data-zca-center-panel="${name}" class="${name === activePanel ? "is-active" : ""}">${label}</button>`).join("")}
        </nav>
        <section class="zca-account-body" data-zca-account-body></section>
        ${message ? `<p class="zca-message ${isError ? "is-error" : ""}">${escapeHtml(message)}</p>` : ""}
      </div>
    `;
    root.classList.remove("is-hidden");
    renderAccountPanel(activePanel);
  }

  function renderAccountPanel(panel) {
    const body = document.querySelector("[data-zca-account-body]");
    const user = state.user;
    if (!body || !user) return;

    if (panel === "password") {
      body.innerHTML = `
        <form class="zca-account-form" data-zca-password-form>
          <label><span>当前密码</span><input name="currentPassword" type="password" required autocomplete="current-password" /></label>
          <label><span>新密码</span><input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 位" /></label>
          <button class="zca-primary-btn" type="submit">保存新密码</button>
        </form>
      `;
      return;
    }

    if (panel === "notice") {
      body.innerHTML = `
        <div class="zca-notification-panel">
          <div class="zca-panel-head">
            <div>
              <strong>通知</strong>
              <small>评论回复、友链和站点消息会在这里出现</small>
            </div>
            <button class="zca-quiet-btn" type="button" data-zca-mark-notifications>全部已读</button>
          </div>
          <div class="zca-notification-list" data-zca-notification-list>正在加载通知...</div>
        </div>
      `;
      loadNotifications();
      return;
    }

    if (panel === "level") {
      body.innerHTML = renderLevelCard(user);
      return;
    }

    if (panel === "admin") {
      body.innerHTML = `
        <form class="zca-account-form zca-admin-notice-form" data-zca-admin-notification-form>
          <div class="zca-panel-head">
            <div>
              <strong>发送通知</strong>
              <small>可给全部用户或指定用户发送评论、友链、系统通知</small>
            </div>
          </div>
          <div class="zca-admin-notice-grid">
            <label><span>类型</span><select name="type"><option value="friend">友链通知</option><option value="comment">评论通知</option><option value="system">系统通知</option></select></label>
            <label><span>对象</span><select name="target"><option value="all">全部用户</option><option value="user">指定用户</option></select></label>
            <label><span>指定用户</span><input name="userId" placeholder="UID / 邮箱 / 用户名 / ID" /></label>
            <label><span>链接</span><input name="link" placeholder="https://example.com 或 /links/" /></label>
          </div>
          <label><span>标题</span><input name="title" maxlength="80" placeholder="友链通知" /></label>
          <label><span>内容</span><textarea name="body" maxlength="500" required placeholder="写给用户看的通知内容"></textarea></label>
          <button class="zca-primary-btn" type="submit">发送通知</button>
        </form>
        <div class="zca-admin-toolbar">
          <input type="search" data-zca-admin-search placeholder="搜索用户、邮箱、UID" />
          <select data-zca-admin-role>
            <option value="all">全部身份</option>
            <option value="admin">管理员</option>
            <option value="user">普通用户</option>
          </select>
          <select data-zca-admin-status>
            <option value="all">全部状态</option>
            <option value="active">可用</option>
            <option value="blocked">停用</option>
          </select>
          <button class="zca-quiet-btn" type="button" data-zca-admin-refresh>刷新</button>
        </div>
        <div class="zca-admin-table-wrap" data-zca-admin-table>正在加载用户...</div>
      `;
      loadAdminUsers();
      return;
    }

    body.innerHTML = `
      <form class="zca-account-form zca-profile-form" data-zca-profile-form>
        <label><span>显示名称</span><input name="displayName" maxlength="64" required value="${escapeHtml(user.displayName || user.username || "")}" /></label>
        <label><span>头像外链</span><input name="avatarUrl" type="url" value="${escapeHtml(user.avatarUrl || "")}" placeholder="https://example.com/avatar.png" /></label>
        <label><span>主页背景图</span><input name="backgroundUrl" type="url" value="${escapeHtml(user.backgroundUrl || "")}" placeholder="https://example.com/cover.jpg" /></label>
        <label><span>个人网站</span><input name="websiteUrl" value="${escapeHtml(user.websiteUrl || "")}" placeholder="https://example.com" /></label>
        <label><span>个人简介</span><input name="bio" maxlength="120" value="${escapeHtml(user.bio || "")}" placeholder="一句话介绍自己" /></label>
        <label class="zca-full-row"><span>社交链接</span><textarea name="socialLinksText" rows="4" placeholder="B站 https://space.bilibili.com/...\nTwitter https://x.com/...\n抖音 https://www.douyin.com/...">${escapeHtml(socialLinksToText(user))}</textarea></label>
        <label><span>邮箱</span><input value="${escapeHtml(user.email || "")}" disabled /></label>
        ${user.role === "admin" ? `<button class="zca-quiet-btn" type="button" data-zca-center-panel="password">修改密码</button>` : ""}
        <button class="zca-quiet-btn" type="button" data-zca-center-panel="level">查看等级详情</button>
        <button class="zca-primary-btn" type="submit">保存资料</button>
      </form>
    `;
  }

  function renderNotificationItems(items) {
    if (!items.length) {
      return `<p class="zca-empty">暂时没有通知。</p>`;
    }

    return items.map((item) => `
      <article class="zca-notification-item ${item.readAt ? "is-read" : "is-unread"}">
        <span class="zca-notification-type">${escapeHtml(typeLabel(item.type))}</span>
        <div>
          <div class="zca-notification-title">
            <strong>${escapeHtml(item.title || "通知")}</strong>
            <time>${escapeHtml(formatDateTime(item.createdAt))}</time>
          </div>
          <p>${escapeHtml(item.body || "")}</p>
          ${item.link ? `<a href="${escapeHtml(item.link)}">查看</a>` : ""}
        </div>
      </article>
    `).join("");
  }

  async function loadNotifications() {
    const list = document.querySelector("[data-zca-notification-list]");
    if (!list) return;
    list.textContent = "正在加载通知...";
    try {
      const payload = await api("notifications");
      state.notifications = payload.notifications || [];
      state.unread = payload.unread || 0;
      list.innerHTML = renderNotificationItems(state.notifications);
    } catch (error) {
      list.innerHTML = `<p class="zca-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadAdminUsers() {
    const table = document.querySelector("[data-zca-admin-table]");
    if (!table) return;
    table.textContent = "正在加载用户...";
    try {
      const payload = await api("listUsers", { method: "POST", body: {} });
      state.users = payload.users || [];
      renderAdminTable();
    } catch (error) {
      table.innerHTML = `<p class="zca-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderAdminTable() {
    const table = document.querySelector("[data-zca-admin-table]");
    if (!table) return;
    const users = state.users.filter((user) => {
      const text = `${user.displayName} ${user.username} ${user.email} ${user.uid}`.toLowerCase();
      const matchesQuery = !state.filter.query || text.includes(state.filter.query);
      const matchesRole = state.filter.role === "all" || user.role === state.filter.role;
      const matchesStatus = state.filter.status === "all" || user.status === state.filter.status;
      return matchesQuery && matchesRole && matchesStatus;
    });

    if (!users.length) {
      table.innerHTML = `<p class="zca-empty">没有符合条件的用户。</p>`;
      return;
    }

    table.innerHTML = `
      <table class="zca-user-table">
        <thead><tr><th>用户</th><th>UID / 邮箱</th><th>身份</th><th>等级</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${users.map((user) => {
            const level = levelMeta(user);
            const badgeColor = normalizeBadgeColor(user.badgeColor) || (user.role === "admin" ? "#ff5f63" : "#8a94a6");
            return `
              <tr>
                <td><div class="zca-admin-user">${avatarHtml(user)}<span><strong>${escapeHtml(user.displayName || user.username)}</strong><small>@${escapeHtml(user.username || "")}</small></span></div></td>
                <td>UID: ${escapeHtml(user.uid || "")}<br>${escapeHtml(user.email || "")}</td>
                <td>
                  <div class="zca-tag-editor">
                    <input data-zca-badge-label="${escapeHtml(user.id)}" maxlength="20" value="${escapeHtml(user.badgeLabel || (user.role === "admin" ? "博主" : ""))}" placeholder="例如：博主" />
                    <input data-zca-badge-color="${escapeHtml(user.id)}" type="color" value="${escapeHtml(badgeColor)}" aria-label="身份标签颜色" />
                    <button type="button" data-zca-save-badge="${escapeHtml(user.id)}">保存</button>
                  </div>
                </td>
                <td><span class="zca-level-pill">${escapeHtml(level.label)}</span></td>
                <td>${user.status === "blocked" ? "停用" : "可用"}</td>
                <td><div class="zca-row-actions">
                  <button type="button" data-zca-toggle-role="${escapeHtml(user.id)}">${user.role === "admin" ? "移除管理员" : "设为管理员"}</button>
                  <button type="button" data-zca-toggle-status="${escapeHtml(user.id)}">${user.status === "blocked" ? "启用" : "停用"}</button>
                  <button type="button" data-zca-delete-user="${escapeHtml(user.id)}">删除</button>
                </div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function completeAuthorization(user, sessionToken) {
    if (!user || !sessionToken) return;

    clearProfileCacheForUser(user);
    state.user = user;
    state.token = sessionToken;
    state.manualMode = false;
    writeSession({ user: state.user, sessionToken: state.token });
    removeManualSwitchButton();
    syncTwikooProfile();
    closeModal();
    returnToCommentArea();
    notify("已登录评论区，可以直接评论。");
    window.dispatchEvent(new CustomEvent("zeora-comment-auth:user", { detail: { user: state.user } }));
    try {
      renderBar();
      hydrateCommentAvatars();
    } catch (error) {
      console.error("[comment-auth] Failed to render authorized state:", error);
      applyCommentMode();
    }
  }

  function renderBar() {
    applyCommentMode();

    const manual = isManualMode() && !state.user;
    if (!manual) removeManualSwitchButton();

    const wrap = getCommentWrap();
    if (!wrap) return;

    let bar = document.getElementById("zeora-comment-auth");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "zeora-comment-auth";
      bar.className = "zeora-comment-auth";
    }

    if (manual) {
      removeManualSwitchButton();
      bar.remove();
      bar.dataset.zcaState = "";
      window.SolitudeAIComment?.init?.();
      requestAnimationFrame(syncCommentActionOverlay);
      return;
    }

    if (state.user) {
      if (!placeProfileBar(bar)) return;
      const level = levelMeta(state.user);
      const userKey = `user:${state.user.id}:${state.user.displayName}:${state.user.avatarUrl}:${state.user.role}:${level.label}`;
      bar.className = "zeora-comment-auth is-authorized";
      if (bar.dataset.zcaState === userKey) {
        syncTwikooProfile();
        hydrateCommentAvatars();
        return;
      }
      bar.dataset.zcaState = userKey;
      bar.innerHTML = `
        <div class="zca-user-cluster">
          <a class="zca-user zca-user-link" href="${escapeHtml(publicProfileUrl(state.user))}">
            ${avatarHtml(state.user)}
            <span class="zca-name">${escapeHtml(state.user.displayName || state.user.username)}</span>
          </a>
          <button class="zca-link-btn" type="button" data-zca-open-user-center>用户中心</button>
          <button class="zca-link-btn" type="button" data-zca-logout>注销</button>
        </div>
      `;
      syncTwikooProfile();
      hydrateCommentAvatars();
      return;
    }

    if (!placeGateBar(bar)) return;
    bar.className = "zeora-comment-auth is-gated";
    if (bar.dataset.zcaState === "guest") return;
    bar.dataset.zcaState = "guest";
    bar.innerHTML = `
      <div class="zca-choice-panel" aria-label="评论登录方式">
        <div class="zca-login-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 12.3a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Z" />
            <path d="M5.2 20.2v-1.4c0-3 2.3-5.1 5.3-5.1h3c3 0 5.3 2.1 5.3 5.1v1.4" />
          </svg>
        </div>
        <div class="zca-choice-title">请登录后发表评论</div>
        <div class="zca-choice-actions">
          <button class="zca-login-btn" type="button" data-zca-login>去登录</button>
          <button class="zca-manual-btn" type="button" data-zca-manual>其他方式</button>
        </div>
      </div>
    `;
  }

  async function handleEmailSubmit(form) {
    const button = form.querySelector("button");
    const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
    if (!email) return;

    state.email = email;
    button.disabled = true;
    try {
      await api("requestCode", { body: { email } });
      renderModal("code", "验证码已发送，请检查邮箱。");
    } catch (error) {
      renderModal("email", error.message);
    }
  }

  async function handleCodeSubmit(form) {
    const button = form.querySelector("button");
    const code = String(new FormData(form).get("code") || "").trim();
    const displayName = makeNameFromEmail(state.email);

    button.disabled = true;
    try {
      const payload = await api("verifyCode", {
        body: {
          email: state.email,
          code,
          username: displayName,
          displayName
        }
      });
      completeAuthorization(payload.user, payload.sessionToken);
    } catch (error) {
      renderModal("code", error.message);
    }
  }

  function profileLinkFromComment(comment) {
    const link = Array.from(comment.querySelectorAll("a[href]")).find((anchor) => profileHandleFromUrl(anchor.href));
    return link?.href || "";
  }

  function normalizeIdentityKey(value) {
    return String(value || "")
      .replace(/^@/, "")
      .replace(/Lv\.\d+/gi, "")
      .replace(/博主|管理员|普通用户/g, "")
      .replace(/\s+/g, "")
      .trim()
      .toLowerCase();
  }

  function profileKeys(user) {
    return [user?.id, user?.uid, user?.username, user?.displayName]
      .map(normalizeIdentityKey)
      .filter(Boolean);
  }

  function cacheProfileUser(user) {
    if (!user) return;
    profileKeys(user).forEach((key) => state.profileIndex.set(key, user));
    const handle = userHandle(user);
    if (handle) state.profileCache.set(handle.toLowerCase(), Promise.resolve(user));
  }

  async function fetchProfileIndex() {
    if (state.profileIndexPromise) return state.profileIndexPromise;
    state.profileIndexPromise = api("profileIndex")
      .then((payload) => {
        state.profileIndex.clear();
        (payload.users || []).forEach(cacheProfileUser);
        if (state.user) cacheProfileUser(state.user);
        return state.profileIndex;
      })
      .catch(() => {
        if (state.user) cacheProfileUser(state.user);
        return state.profileIndex;
      });
    return state.profileIndexPromise;
  }

  async function fetchProfileByHandle(handle) {
    const normalized = String(handle || "").replace(/^@/, "").trim().toLowerCase();
    if (!normalized) return null;
    if (state.profileCache.has(normalized)) return state.profileCache.get(normalized);
    const promise = api("profile", { params: { handle: normalized } })
      .then((payload) => payload.user || null)
      .catch(() => null);
    state.profileCache.set(normalized, promise);
    return promise;
  }

  function authorNameNodes(comment) {
    return Array.from(comment.querySelectorAll([
      ".tk-nick",
      ".tk-nickname",
      ".tk-author",
      ".tk-user",
      ".tk-meta a",
      ".tk-comment-author",
      ".tk-comment-nick",
      "a[href]"
    ].join(","))).filter((node) => !node.closest(".tk-content, .tk-replies, .OwO, .tk-owo, .tk-preview"));
  }

  function commentIdentityKeys(comment) {
    const keys = new Set();
    comment.querySelectorAll("a[href]").forEach((anchor) => {
      const handle = profileHandleFromUrl(anchor.href);
      if (handle) keys.add(normalizeIdentityKey(handle));
    });
    ["userId", "zeoraUserId", "zeoraUid", "uid", "id", "commentId"].forEach((name) => {
      if (comment.dataset?.[name]) keys.add(normalizeIdentityKey(comment.dataset[name]));
      if (comment.getAttribute?.(`data-${name}`)) keys.add(normalizeIdentityKey(comment.getAttribute(`data-${name}`)));
    });
    authorNameNodes(comment).forEach((node) => {
      const key = normalizeIdentityKey(node.textContent);
      if (key) keys.add(key);
    });
    return [...keys].filter(Boolean);
  }

  function profileForComment(comment, index) {
    for (const key of commentIdentityKeys(comment)) {
      if (index.has(key)) return index.get(key);
    }
    return null;
  }

  function avatarImagesInComment(comment) {
    return Array.from(comment.querySelectorAll(".tk-avatar img, .tk-avatar-img img, img[alt*='头像'], img.tk-avatar-img"))
      .filter((image) => !image.closest(".tk-content, .tk-preview, .OwO, .tk-owo, .tk-owo-emotion"));
  }

  function avatarTargetsInComment(comment) {
    return Array.from(comment.querySelectorAll(".tk-avatar, .tk-avatar-img"))
      .filter((target) => !target.closest(".tk-content, .tk-preview, .OwO, .tk-owo"));
  }

  function applyAvatarToImage(image, user) {
    if (!image || !user?.avatarUrl) return;
    const alreadyApplied = image.dataset.zcaAvatarUrl === user.avatarUrl && image.classList.contains("zca-avatar-ready");
    image.dataset.zcaAvatarUrl = user.avatarUrl;
    image.dataset.zcaAvatarReady = "true";
    image.classList.add("nolazyload", "loaded", "zca-avatar-ready");
    image.classList.remove("lazyload", "lazyloading", "error", "is-error");
    image.removeAttribute("data-src");
    image.removeAttribute("data-lazy-src");
    image.removeAttribute("data-original");
    image.removeAttribute("data-srcset");
    image.removeAttribute("srcset");
    image.srcset = "";
    if (!alreadyApplied || image.src !== user.avatarUrl) image.src = user.avatarUrl;
    image.alt = `${user.displayName || user.username || "用户"} 的头像`;
    image.loading = "eager";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.style.opacity = "1";
    image.style.filter = "none";
  }

  function applyUserToComment(comment, user) {
    if (!comment || !user) return;
    const targetUrl = publicProfileUrl(user);
    avatarImagesInComment(comment).forEach((image) => applyAvatarToImage(image, user));
    avatarTargetsInComment(comment).forEach((target) => {
      target.classList.add("zca-profile-clickable");
      target.dataset.zcaProfileUrl = targetUrl;
      target.setAttribute("role", "link");
      target.setAttribute("tabindex", "0");
      target.setAttribute("title", "查看用户主页");
      target.classList.add("zca-avatar-ready");
      target.style.removeProperty("background-image");
      target.style.removeProperty("background-size");
      target.style.removeProperty("background-position");
    });
    const nameAnchor = authorNameNodes(comment).find((node) => node.matches?.("a[href]")) || comment.querySelector("a[href]");
    if (nameAnchor) {
      nameAnchor.href = targetUrl;
      hydrateCommentBadges(nameAnchor, user);
    }
  }

  function profileHandleFromUrl(href) {
    if (!href) return "";
    try {
      const url = new URL(href, window.location.href);
      const remoteMatch = url.pathname.match(/^\/user\/([^/]+)\/?$/);
      if (remoteMatch) return decodeURIComponent(remoteMatch[1]).replace(/^@/, "").trim();

      const localMatch = url.pathname.match(/^\/user-center\/([^/]+)\/?$/);
      if (localMatch) return decodeURIComponent(localMatch[1]).replace(/^@/, "").trim();

      return (url.searchParams.get("user") || url.searchParams.get("u") || url.searchParams.get("handle") || "").replace(/^@/, "").trim();
    } catch (error) {
      return "";
    }
  }

  async function hydrateCommentAvatars() {
    const index = await fetchProfileIndex();
    const anchors = Array.from(document.querySelectorAll("#twikoo a[href]"))
      .map((anchor) => ({ anchor, handle: profileHandleFromUrl(anchor.href) }))
      .filter((item) => item.handle);

    await Promise.all(anchors.map(async ({ anchor, handle }) => {
      const user = await fetchProfileByHandle(handle);
      if (!user) return;
      cacheProfileUser(user);
      const comment = anchor.closest(".tk-comment, .tk-comment-wrap, .tk-main, .tk-row");
      if (comment) applyUserToComment(comment, user);
      hydrateCommentBadges(anchor, user);
    }));

    document.querySelectorAll("#twikoo .tk-comment, #twikoo .tk-comment-wrap").forEach((comment) => {
      const user = profileForComment(comment, index);
      if (user) applyUserToComment(comment, user);
    });
  }

  function upsertCommentPill(anchor, className, text, reference) {
    const parent = anchor.parentElement;
    if (!parent || !text) return reference;
    let pill = parent.querySelector(`.${className}[data-zca-generated="true"]`);
    if (!pill && commentLineAlreadyHas(parent, className, text)) return reference;
    if (!pill) {
      pill = document.createElement("span");
      pill.className = className;
      pill.dataset.zcaGenerated = "true";
    }
    pill.textContent = text;
    reference.insertAdjacentElement("afterend", pill);
    return pill;
  }

  function commentLineAlreadyHas(parent, className, text) {
    const clone = parent.cloneNode(true);
    clone.querySelectorAll(`.${className}[data-zca-generated="true"]`).forEach((item) => item.remove());
    return clone.textContent.includes(text);
  }

  function hydrateCommentBadges(anchor, user) {
    if (!anchor.textContent.trim()) return;
    const level = levelMeta(user);
    const badge = user.badgeLabel || (user.role === "admin" ? "博主" : "");
    let reference = anchor;
    reference = upsertCommentPill(anchor, "zca-comment-level", level.label, reference);
    if (badge) {
      const rolePill = upsertCommentPill(anchor, "zca-comment-role", badge, reference);
      const color = normalizeBadgeColor(user.badgeColor);
      if (rolePill && color) rolePill.style.setProperty("--zca-badge-color", color);
      if (rolePill && !color) rolePill.style.removeProperty("--zca-badge-color");
    }
  }

  function commentIdentityPayload() {
    const user = state.user;
    if (!user) return {};
    const level = levelMeta(user);
    return {
      nick: user.displayName || user.username || makeNameFromEmail(user.email),
      mail: user.email,
      link: publicProfileUrl(user),
      avatar: user.avatarUrl || "",
      avatarUrl: user.avatarUrl || "",
      userId: user.id,
      zeoraUserId: user.id,
      zeoraUid: user.uid || "",
      badgeLabel: user.badgeLabel || (user.role === "admin" ? "博主" : ""),
      badgeColor: user.badgeColor || "",
      role: user.role || "user",
      commentExperience: level.experience,
      commentLevel: level.level,
      commentLevelLabel: level.label,
      commentNextLevel: level.nextLevel,
      commentProgress: level.progress,
      commentNextRequired: level.nextRequired,
      commentToNext: level.toNext,
      _zeoraCommentAuth: {
        userId: user.id,
        uid: user.uid || "",
        avatarUrl: user.avatarUrl || "",
        displayName: user.displayName || user.username || "",
        profileUrl: publicProfileUrl(user),
        commentLevel: level.level,
        commentLevelLabel: level.label
      }
    };
  }

  function parseJsonBody(value) {
    if (!value || typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function isCommentSubmitPayload(payload) {
    return payload && typeof payload === "object" && payload.event === "COMMENT_SUBMIT";
  }

  function shouldSkipFetchPatch(url) {
    try {
      const target = new URL(url, window.location.href);
      return target.pathname.includes("/api/demo");
    } catch (error) {
      return false;
    }
  }

  async function syncSubmittedComment(comment, response) {
    if (!state.user || !state.token) return;
    try {
      const payload = await api("bindCommentAuthor", {
        method: "POST",
        body: {
          comment,
          response,
          path: window.location.pathname,
          pageUrl: window.location.href
        }
      });
      if (payload.user) updateAuthorizedUser(payload.user);
      if (state.reply.slot?.isConnected) restoreReplyComposer();
      setTimeout(() => {
        syncTwikooProfile();
        hydrateCommentAvatars();
      }, 240);
    } catch (error) {
      console.warn("[comment-auth] Failed to bind submitted comment author:", error);
    }
  }

  async function enrichFetchInput(input, init = {}) {
    const method = String(init.method || input?.method || "GET").toUpperCase();
    if (method !== "POST" || !state.user || !state.token) return null;

    const url = typeof input === "string" || input instanceof URL ? input.toString() : input?.url;
    if (!url || shouldSkipFetchPatch(url)) return null;

    let bodyText = typeof init.body === "string" ? init.body : "";
    if (!bodyText && typeof Request !== "undefined" && input instanceof Request) {
      bodyText = await input.clone().text().catch(() => "");
    }
    const payload = parseJsonBody(bodyText);
    if (!isCommentSubmitPayload(payload)) return null;

    const enriched = { ...payload, ...commentIdentityPayload(), sessionToken: state.token };
    const headers = new Headers(init.headers || input?.headers || {});
    headers.set("content-type", "application/json");
    headers.set("x-session-token", state.token);

    if (typeof Request !== "undefined" && input instanceof Request) {
      return {
        input: new Request(input, { method, headers, body: JSON.stringify(enriched) }),
        init: undefined,
        body: enriched
      };
    }

    return {
      input,
      init: { ...init, method, headers, body: JSON.stringify(enriched) },
      body: enriched
    };
  }

  function installTwikooFetchPatch() {
    if (fetchPatchInstalled || typeof window.fetch !== "function") return;
    fetchPatchInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const enriched = await enrichFetchInput(input, init || {}).catch(() => null);
      const response = enriched
        ? await originalFetch(enriched.input, enriched.init)
        : await originalFetch(input, init);

      if (enriched?.body) {
        response.clone().json()
          .then((payload) => syncSubmittedComment(enriched.body, payload))
          .catch(() => syncSubmittedComment(enriched.body, {}));
      }

      return response;
    };
  }

  function enhanceCommentProfileLinks() {
    document.querySelectorAll("#twikoo .tk-comment:not([data-zca-profile-enhanced])").forEach((comment) => {
      const profileUrl = profileLinkFromComment(comment);
      comment.dataset.zcaProfileEnhanced = "true";
      if (!profileUrl) return;

      const targetUrl = resolveProfileTarget(profileUrl);
      comment.querySelectorAll("a[href]").forEach((anchor) => {
        if (profileHandleFromUrl(anchor.href) === profileHandleFromUrl(profileUrl)) anchor.href = targetUrl;
      });

      const avatar = comment.querySelector(".tk-avatar:not(a), .tk-avatar-img");
      const target = avatar?.closest(".tk-avatar") || avatar;
      if (!target || target.closest("a[href]")) return;

      target.classList.add("zca-profile-clickable");
      target.dataset.zcaProfileUrl = targetUrl;
      target.setAttribute("role", "link");
      target.setAttribute("tabindex", "0");
      target.setAttribute("title", "查看用户主页");
    });
  }

  function updateCommentAuthUi() {
    state.mutationQueued = false;
    renderBar();
    syncTwikooProfile();
    ensureManualSwitchButton();
    if (window.SolitudeAIComment && !document.querySelector("#twikoo .solitude-ai-comment")) {
      window.SolitudeAIComment.init();
    }
    syncCommentActionOverlay();
    observeCommentLayout();
    enhanceCommentProfileLinks();
    hydrateCommentAvatars();
  }

  function scheduleCommentAuthUiUpdate() {
    if (state.mutationQueued) return;
    state.mutationQueued = true;
    requestAnimationFrame(updateCommentAuthUi);
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    document.addEventListener("click", (event) => {
      const guardedSubmit = event.target.closest("#post-comment.zca-auth-required #twikoo .tk-submit .el-button--primary, #post-comment.zca-auth-required #twikoo .tk-submit button[type='submit']");
      if (guardedSubmit) {
        event.preventDefault();
        event.stopPropagation();
        renderEmbeddedLogin("请先登录账号，再发布评论。");
        return;
      }
      const submitControl = event.target.closest("#twikoo .tk-submit button, #twikoo .tk-submit a");
      const submitControlLabel = `${submitControl?.textContent || ""} ${submitControl?.getAttribute?.("aria-label") || ""} ${submitControl?.title || ""}`;
      if (/取消/.test(submitControlLabel)) {
        setTimeout(restoreReplyComposer, 0);
        return;
      }
      const replyControl = replyControlFromEventTarget(event.target);
      if (replyControl) {
        const comment = replyControl.closest(".tk-comment");
        if (comment) scheduleMoveComposerToComment(comment);
        return;
      }
      const profileTarget = event.target.closest("#twikoo [data-zca-profile-url]");
      if (profileTarget) {
        window.location.href = profileTarget.dataset.zcaProfileUrl;
        return;
      }
      if (event.target.closest("[data-zca-confirm-manual]")) {
        setManualMode();
        return;
      }
      if (event.target.closest("[data-zca-login]")) {
        state.manualMode = false;
        state.authMode = "login";
        state.authStep = "email";
        removeManualSwitchButton();
        applyCommentMode();
        renderBar();
        renderEmbeddedLogin();
        return;
      }
      const authModeButton = event.target.closest("[data-zca-auth-mode]");
      if (authModeButton) {
        state.authMode = authModeButton.dataset.zcaAuthMode || "login";
        state.authStep = "email";
        renderEmbeddedLogin();
        return;
      }
      if (event.target.closest("[data-zca-back-email]")) {
        state.authStep = "email";
        renderEmbeddedLogin();
        return;
      }
      if (event.target.closest("[data-zca-open-user-center]")) {
        renderUserCenterModal("profile");
        return;
      }
      if (event.target.closest("[data-zca-open-notifications]")) {
        renderUserCenterModal("notice");
        return;
      }
      const panelButton = event.target.closest("[data-zca-center-panel]");
      if (panelButton) {
        renderUserCenterModal(panelButton.dataset.zcaCenterPanel || "profile");
        return;
      }
      if (event.target.closest("[data-zca-mark-notifications]")) {
        (async () => {
          try {
            const payload = await api("markNotifications", { method: "POST", body: { all: true } });
            state.notifications = payload.notifications || [];
            state.unread = payload.unread || 0;
            const list = document.querySelector("[data-zca-notification-list]");
            if (list) list.innerHTML = renderNotificationItems(state.notifications);
            notify("通知已全部标记为已读。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
        return;
      }
      if (event.target.closest("[data-zca-admin-refresh]")) {
        loadAdminUsers();
        return;
      }
      const badgeButton = event.target.closest("[data-zca-save-badge]");
      if (badgeButton) {
        const id = badgeButton.dataset.zcaSaveBadge;
        const editor = badgeButton.closest(".zca-tag-editor");
        const labelInput = editor?.querySelector("[data-zca-badge-label]");
        const colorInput = editor?.querySelector("[data-zca-badge-color]");
        (async () => {
          try {
            await api("updateUser", {
              method: "POST",
              body: {
                id,
                badgeLabel: labelInput?.value.trim() || "",
                badgeColor: colorInput?.value || "",
              },
            });
            await loadAdminUsers();
            notify("身份标签已保存。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
        return;
      }
      const roleButton = event.target.closest("[data-zca-toggle-role]");
      const statusButton = event.target.closest("[data-zca-toggle-status]");
      const deleteButton = event.target.closest("[data-zca-delete-user]");
      if (roleButton || statusButton || deleteButton) {
        const id = roleButton?.dataset.zcaToggleRole || statusButton?.dataset.zcaToggleStatus || deleteButton?.dataset.zcaDeleteUser;
        const targetUser = state.users.find((user) => user.id === id);
        if (!targetUser) return;
        (async () => {
          try {
            if (roleButton) {
              await api("updateUser", { method: "POST", body: { id, role: targetUser.role === "admin" ? "user" : "admin" } });
            }
            if (statusButton) {
              await api("updateUser", { method: "POST", body: { id, status: targetUser.status === "blocked" ? "active" : "blocked" } });
            }
            if (deleteButton && window.confirm(`确认删除 ${targetUser.displayName || targetUser.username} 吗？`)) {
              await api("deleteUser", { method: "POST", body: { id } });
            }
            await loadAdminUsers();
            notify("用户信息已更新。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
        return;
      }
      if (event.target.closest("[data-zca-manual]")) {
        renderManualWarningModal();
        return;
      }
      if (event.target.closest("[data-zca-close]") || event.target.id === "zeora-comment-auth-modal") {
        closeModal();
        return;
      }
      if (event.target.closest("[data-zca-back]")) {
        renderEmbeddedLogin();
        return;
      }
      if (event.target.closest("[data-zca-reset]")) {
        resetToGate();
        return;
      }
      if (event.target.closest("[data-zca-logout]")) {
        resetToGate("已退出评论账号。");
        return;
      }
      if (event.target.closest("[data-zca-switch-mode]")) {
        renderManualWarningModal();
      }
    }, { signal, capture: true });

    document.addEventListener("submit", (event) => {
      const loginEmailForm = event.target.closest("[data-zca-login-email-form]");
      const loginPasswordForm = event.target.closest("[data-zca-login-password-form]");
      const registerForm = event.target.closest("[data-zca-register-form]");
      const resetForm = event.target.closest("[data-zca-reset-form]");
      const profileForm = event.target.closest("[data-zca-profile-form]");
      const passwordForm = event.target.closest("[data-zca-password-form]");
      const noticeForm = event.target.closest("[data-zca-notice-form]");
      const adminNotificationForm = event.target.closest("[data-zca-admin-notification-form]");
      const emailForm = event.target.closest("[data-zca-email-form]");
      const codeForm = event.target.closest("[data-zca-code-form]");
      if (!emailForm && !codeForm && !loginEmailForm && !loginPasswordForm && !registerForm && !resetForm && !profileForm && !passwordForm && !noticeForm && !adminNotificationForm) return;

      event.preventDefault();
      const submitter = event.submitter || event.target.querySelector("button[type='submit']");
      if (emailForm) handleEmailSubmit(emailForm);
      if (codeForm) handleCodeSubmit(codeForm);

      if (loginEmailForm) {
        const data = formData(loginEmailForm);
        state.authEmail = String(data.email || "").trim().toLowerCase();
        state.rememberSession = data.rememberMe === "on";
        if (!state.authEmail) return;
        if (state.authMode === "login") {
          state.authStep = "password";
          renderEmbeddedLogin();
          return;
        }
        submitter.disabled = true;
        (async () => {
          try {
            const captcha = await runCaptchaChallenge();
            await api("requestCode", { method: "POST", body: { email: state.authEmail, purpose: state.authMode, captcha } });
            state.authStep = "code";
            renderEmbeddedLogin("验证码已发送，请检查邮箱。");
          } catch (error) {
            state.authStep = "email";
            renderEmbeddedLogin(`错误：${error.message}`);
          }
        })();
      }

      if (loginPasswordForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const captcha = await runCaptchaChallenge();
            const payload = await api("login", {
              method: "POST",
              body: { email: state.authEmail, password: formData(loginPasswordForm).password, captcha }
            });
            completeAuthorization(payload.user, payload.sessionToken);
          } catch (error) {
            state.authStep = "password";
            renderEmbeddedLogin(`错误：${error.message}`);
          }
        })();
      }

      if (registerForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const payload = await api("registerWithCode", {
              method: "POST",
              body: { ...formData(registerForm), email: state.authEmail }
            });
            completeAuthorization(payload.user, payload.sessionToken);
          } catch (error) {
            state.authStep = "code";
            renderEmbeddedLogin(`错误：${error.message}`);
          }
        })();
      }

      if (resetForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const payload = await api("resetPassword", {
              method: "POST",
              body: { ...formData(resetForm), email: state.authEmail }
            });
            completeAuthorization(payload.user, payload.sessionToken);
          } catch (error) {
            state.authStep = "code";
            renderEmbeddedLogin(`错误：${error.message}`);
          }
        })();
      }

      if (profileForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(profileForm);
            const payload = await api("updateProfile", {
              method: "POST",
              body: {
                displayName: data.displayName,
                avatarUrl: data.avatarUrl,
                backgroundUrl: data.backgroundUrl,
                websiteUrl: data.websiteUrl,
                bio: data.bio,
                socialLinks: parseSocialLinksText(data.socialLinksText)
              }
            });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("profile", "资料已保存。");
          } catch (error) {
            renderUserCenterModal("profile", error.message, true);
          }
        })();
      }

      if (passwordForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const payload = await api("changePassword", { method: "POST", body: formData(passwordForm) });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("password", "密码已更新。");
          } catch (error) {
            renderUserCenterModal("password", error.message, true);
          }
        })();
      }

      if (noticeForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(noticeForm);
            const payload = await api("updateProfile", {
              method: "POST",
              body: {
                notifications: {
                  emailReplies: data.emailReplies === "on",
                  emailSystem: data.emailSystem === "on",
                  browserPush: data.browserPush === "on"
                }
              }
            });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("notice", "通知设置已保存。");
          } catch (error) {
            renderUserCenterModal("notice", error.message, true);
          }
        })();
      }

      if (adminNotificationForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(adminNotificationForm);
            const payload = await api("createNotification", {
              method: "POST",
              body: {
                type: data.type,
                target: data.target,
                userId: data.userId,
                title: data.title,
                body: data.body,
                link: data.link
              }
            });
            adminNotificationForm.reset();
            renderUserCenterModal("admin", `通知已发送给 ${payload.created || 0} 个用户。`);
          } catch (error) {
            renderUserCenterModal("admin", error.message, true);
          }
        })();
      }
    }, { signal });

    document.addEventListener("input", (event) => {
      if (event.target.matches("#twikoo .el-textarea__inner")) scheduleCommentAuthUiUpdate();
      if (event.target.matches("[data-zca-admin-search]")) {
        state.filter.query = event.target.value.trim().toLowerCase();
        renderAdminTable();
      }
      if (event.target.matches("[data-zca-profile-form] input[name='avatarUrl']")) {
        const preview = document.querySelector("[data-zca-avatar-preview]");
        if (preview) preview.innerHTML = avatarHtml({ ...state.user, avatarUrl: event.target.value.trim() });
      }
    }, { signal });

    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-zca-admin-role]")) {
        state.filter.role = event.target.value;
        renderAdminTable();
      }
      if (event.target.matches("[data-zca-admin-status]")) {
        state.filter.status = event.target.value;
        renderAdminTable();
      }
    }, { signal });

    document.addEventListener("keydown", (event) => {
      const profileTarget = event.target.closest("#twikoo [data-zca-profile-url]");
      if (profileTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        window.location.href = profileTarget.dataset.zcaProfileUrl;
        return;
      }
      if (event.key === "Escape") closeModal();
    }, { signal });

    window.addEventListener("resize", scheduleCommentAuthUiUpdate, { signal });
  }

  async function restoreSession() {
    state.manualMode = false;
    removeManualSwitchButton();
    const saved = readSession();
    if (!saved) {
      applyCommentMode();
      return;
    }

    state.token = saved.sessionToken;
    state.user = saved.user;
    renderBar();
    syncTwikooProfile();
    hydrateCommentAvatars();

    try {
      const payload = await api("me");
      state.user = payload.user;
      writeSession({ sessionToken: state.token, user: state.user });
      renderBar();
      syncTwikooProfile();
      hydrateCommentAvatars();
    } catch (error) {
      clearSession();
      renderBar();
    }
  }

  function mount() {
    if (!document.querySelector("#post-comment, #twikoo-wrap, #twikoo")) return;
    updateCommentAuthUi();

    if (!state.observer) {
      state.observer = new MutationObserver(scheduleCommentAuthUiUpdate);
      state.observer.observe(document.querySelector("#post-comment") || document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function init() {
    if (state.mounted) return;
    state.mounted = true;
    installTwikooFetchPatch();
    refreshHealth();
    bindEvents();
    mount();
    restoreSession();
  }

  document.addEventListener("DOMContentLoaded", init, { signal });
  document.addEventListener("pjax:complete", () => {
    state.mounted = false;
    state.observer?.disconnect();
    state.observer = null;
    init();
  }, { signal });
  if (document.readyState !== "loading") init();
})();
