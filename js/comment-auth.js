(() => {
  const DEFAULT_CONFIG = {
    apiUrl: "/api/demo",
    adminUrl: "/admin",
    profileUrl: "/user-center/",
    siteName: "Zeora Blog"
  };
  const SESSION_KEY = "zeoraTwikooUserSession";
  const CENTER_SESSION_TOKEN_KEY = "twikooUserCenterSessionToken";
  const CENTER_SESSION_USER_KEY = "twikooUserCenterSessionUser";
  const ANONYMOUS_EMAIL = "anonymous@zeora.local";
  const ANONYMOUS_NAMES = [
    "优雅的火龙果",
    "路过的星尘",
    "清醒的汽水",
    "安静的月光",
    "慢热的云朵",
    "会发光的句号"
  ];
  const DEFAULT_SHOP_ITEMS = [
    { key: "quark", name: "夸克网盘会员", description: "兑换后按填写手机号发放会员权益。", price: 100, stock: 10, enabled: true },
    { key: "bilibili", name: "B站大会员", description: "兑换后按填写手机号发放会员权益。", price: 100, stock: 10, enabled: true },
    { key: "tencent", name: "腾讯视频会员", description: "兑换后按填写手机号发放会员权益。", price: 100, stock: 10, enabled: true },
    { key: "netease", name: "网易云音乐会员", description: "兑换后按填写手机号发放会员权益。", price: 100, stock: 10, enabled: true }
  ];
  const SOCIAL_LIMIT = 5;
  const SOCIAL_PRESETS = [
    { label: "个人主页", url: "https://", tone: "website", platform: "" },
    { label: "个人博客", url: "https://", tone: "website", platform: "" },
    { label: "Bilibili", url: "https://space.bilibili.com/", tone: "bilibili", platform: "bilibili" },
    { label: "GitHub", url: "https://github.com/", tone: "github", platform: "github" },
    { label: "抖音", url: "https://www.douyin.com/user/", tone: "douyin", platform: "douyin" },
    { label: "Twitter", url: "https://x.com/", tone: "twitter", platform: "twitter" }
  ];

  window.__zeoraCommentAuthCleanup?.();

  const controller = new AbortController();
  const { signal } = controller;
  const state = {
    token: "",
    user: null,
    email: "",
    manualMode: false,
    anonymousMode: false,
    anonymousName: "",
    mounted: false,
    eventsBound: false,
    mutationQueued: false,
    retryTimer: null,
    retryCount: 0,
    profileCache: new Map(),
    profileIndex: new Map(),
    profileIndexPromise: null,
    authMode: "login",
    authStep: "email",
    authIdentifier: "",
    authEmail: "",
    rememberSession: true,
    captcha: { enabled: false, provider: "" },
    users: [],
    shopItems: [],
    aiConfig: null,
    aiConfigs: [],
    aiEditConfig: null,
    aiEditingNew: false,
    redemptions: [],
    notifications: [],
    unread: 0,
    adminPanel: "notice",
    filter: { query: "", role: "all", status: "all" },
    submitEl: null,
    replyContext: null
  };

  let geetestLoaderPromise = null;
  const captchaLoaderPromises = new Map();
  let fetchPatchInstalled = false;

  window.__zeoraCommentAuthCleanup = () => {
    controller.abort();
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
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
    localStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    localStorage.removeItem(CENTER_SESSION_USER_KEY);
    sessionStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    sessionStorage.removeItem(CENTER_SESSION_USER_KEY);
    storage.setItem(SESSION_KEY, JSON.stringify({
      sessionToken: payload.sessionToken,
      user: payload.user,
      savedAt: Date.now()
    }));
    storage.setItem(CENTER_SESSION_TOKEN_KEY, payload.sessionToken || "");
    storage.setItem(CENTER_SESSION_USER_KEY, JSON.stringify(payload.user || null));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    localStorage.removeItem(CENTER_SESSION_USER_KEY);
    sessionStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    sessionStorage.removeItem(CENTER_SESSION_USER_KEY);
    state.token = "";
    state.user = null;
    state.manualMode = false;
    state.anonymousMode = false;
    state.anonymousName = "";
    state.replyContext = null;
  }

  function isManualMode() {
    return state.manualMode;
  }

  function anonymousConfig() {
    const fallback = { avatarUrl: "/img/default_avatar.avif", names: ANONYMOUS_NAMES };
    const configured = window.SOLITUDE_COMMENT_AUTH?.anonymous || {};
    const names = Array.isArray(configured.names) && configured.names.length
      ? configured.names.map((item) => String(item || "").trim()).filter(Boolean)
      : fallback.names;
    return {
      avatarUrl: configured.avatarUrl || fallback.avatarUrl,
      names: names.length ? names : fallback.names
    };
  }

  function pickAnonymousName(current = "") {
    const names = anonymousConfig().names;
    if (names.length <= 1) return names[0] || ANONYMOUS_NAMES[0];
    let next = current;
    let guard = 0;
    while (next === current && guard < 8) {
      next = names[Math.floor(Math.random() * names.length)];
      guard += 1;
    }
    return next || names[0] || ANONYMOUS_NAMES[0];
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
    if (!input) return;
    const nextValue = String(value ?? "");
    if (input.value === nextValue) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeSetter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function twikooProfileInputs() {
    const nick = document.querySelector("#twikoo input[name='nick'], #twikoo input[placeholder*='昵称'], #twikoo input[placeholder*='Nick']");
    const mail = document.querySelector("#twikoo input[name='mail'], #twikoo input[type='email'], #twikoo input[placeholder*='邮箱'], #twikoo input[placeholder*='Mail']");
    const link = document.querySelector("#twikoo input[name='link'], #twikoo input[placeholder*='网站'], #twikoo input[placeholder*='链接'], #twikoo input[placeholder*='http']");
    return { nick, mail, link };
  }

  function clearTwikooProfileInputs() {
    const { nick, mail, link } = twikooProfileInputs();
    setInputValue(nick, "");
    setInputValue(mail, "");
    setInputValue(link, "");
  }

  function syncTwikooProfile() {
    const { nick, mail, link } = twikooProfileInputs();
    if (state.anonymousMode && !state.user) {
      if (!state.anonymousName) state.anonymousName = pickAnonymousName();
      setInputValue(nick, state.anonymousName);
      setInputValue(mail, ANONYMOUS_EMAIL);
      setInputValue(link, "");
      return;
    }

    const user = state.user;
    if (!user) return;
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
    const anonymous = state.anonymousMode && !state.user;
    const submit = getTwikooSubmit();
    post.classList.toggle("zca-auth-required", !state.user && !manual && !anonymous);
    post.classList.toggle("zca-auth-granted", Boolean(state.user) && !manual);
    post.classList.toggle("zca-manual-comment", manual);
    post.classList.toggle("zca-anonymous-comment", anonymous);
    if (submit) submit.style.removeProperty("display");
  }

  function removeManualSwitchButton() {
    document.querySelector("#twikoo .zca-send-switch")?.remove();
  }

  function getTwikooSubmit() {
    if (state.submitEl?.isConnected) return state.submitEl;
    const submit = document.querySelector("#twikoo > .tk-submit")
      || Array.from(document.querySelectorAll("#twikoo .tk-submit")).find((item) => !item.closest(".tk-comment, .tk-replies"));
    if (submit) {
      submit.classList.add("zca-primary-submit");
      state.submitEl = submit;
    }
    return submit;
  }

  function getTwikooActionRow() {
    return getTwikooSubmit()?.querySelector(".tk-row.actions") || null;
  }

  function ensureManualSwitchButton() {
    removeManualSwitchButton();
  }

  function placeAuthBar(bar) {
    const submit = getTwikooSubmit();
    if (!submit) return false;

    const parent = submit.parentElement;
    if (!parent) return false;

    if (bar.parentElement !== parent || submit.nextElementSibling !== bar) {
      submit.insertAdjacentElement("afterend", bar);
    }
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
    state.anonymousMode = false;
    state.anonymousName = "";
    state.replyContext = null;
    state.user = null;
    state.token = "";
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    localStorage.removeItem(CENTER_SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    sessionStorage.removeItem(CENTER_SESSION_USER_KEY);
    closeModal();
    applyCommentMode();
    renderBar();
    requestAnimationFrame(clearTwikooProfileInputs);
    notify("已切换为手动填写评论信息。");
  }

  function setAnonymousMode(name = "") {
    state.manualMode = false;
    state.anonymousMode = true;
    state.anonymousName = name || pickAnonymousName(state.anonymousName);
    state.replyContext = null;
    state.user = null;
    state.token = "";
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    localStorage.removeItem(CENTER_SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(CENTER_SESSION_TOKEN_KEY);
    sessionStorage.removeItem(CENTER_SESSION_USER_KEY);
    closeModal();
    applyCommentMode();
    renderBar();
    syncTwikooProfile();
    notify("已切换为匿名评论。");
  }

  function resetToGate(message = "已返回评论登录。") {
    clearSession();
    state.replyContext = null;
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
    const showLogin = mode === "login";
    const showEmail = mode !== "login" && step === "email";
    const showRegister = mode === "register" && step === "code";
    const showReset = mode === "reset" && step === "code";
    const title = mode === "register" ? "注册评论账号" : mode === "reset" ? "重置评论密码" : "登录";
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

        <form class="zca-login-form ${showLogin ? "" : "is-hidden"}" data-zca-login-form>
          <label>
            <span>邮箱、用户名或 UID</span>
            <input name="identifier" type="text" required autocomplete="username" placeholder="请按邮箱、用户名或 UID 登录" value="${escapeHtml(state.authIdentifier)}" />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" required autocomplete="current-password" placeholder="请输入密码" />
          </label>
          <label class="zca-remember-row">
            <input name="rememberMe" type="checkbox" ${state.rememberSession ? "checked" : ""} />
            <span>记住我，下次自动登录</span>
          </label>
          <button class="zca-primary-btn" type="submit">登录</button>
          <p class="zca-auth-links">
            <button type="button" data-zca-auth-options>其他方式</button>
          </p>
        </form>

        <form class="zca-login-form ${showEmail ? "" : "is-hidden"}" data-zca-login-email-form>
          <label>
            <span>邮箱</span>
            <input name="email" type="email" required autocomplete="email" placeholder="name@example.com" value="${escapeHtml(state.authEmail)}" />
          </label>
          <div class="zca-form-actions">
            <button class="zca-primary-btn" type="submit">发送验证码</button>
            <button class="zca-quiet-btn" type="button" data-zca-auth-mode="login">返回登录</button>
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
            <button class="zca-quiet-btn" type="button" data-zca-auth-mode="login">返回登录</button>
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
            <button class="zca-quiet-btn" type="button" data-zca-auth-mode="login">返回登录</button>
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
        <p>登录后评论，可以保护头像、昵称和评论记录，也方便之后管理自己的评论。</p>
        <button class="zca-warning-primary" type="button" data-zca-login>登录发表评论</button>
        <button class="zca-manual-continue" type="button" data-zca-confirm-manual>继续使用传统方式评论</button>
      </div>
    `;
    root.classList.remove("is-hidden");
    root.querySelector("[data-zca-login]")?.focus();
  }

  function renderAnonymousWarningModal() {
    const root = ensureModalRoot();
    root.innerHTML = `
      <div class="zca-modal-card zca-manual-warning zca-anonymous-warning" role="dialog" aria-modal="true" aria-labelledby="zcaAnonymousWarningTitle">
        <button class="zca-close" type="button" data-zca-close aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
        <div class="zca-warning-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 7.2v6" />
            <path d="M12 16.8h.01" />
          </svg>
        </div>
        <h2 id="zcaAnonymousWarningTitle">无法收到任何回复</h2>
        <p>使用匿名评论功能评论，任何人包括博主都无法针对你的评论进行回复，也无法把这条评论关联到你的账号。</p>
        <p>因为匿名性更高，匿名评论会进入更严格的内容审查流程。</p>
        <button class="zca-warning-primary" type="button" data-zca-login>登录发表评论</button>
        <button class="zca-manual-continue" type="button" data-zca-confirm-anonymous>继续使用匿名方式评论</button>
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
          url: String(item?.url || item?.href || item?.link || "").trim(),
          platform: String(item?.platform || "").trim()
        }))
        .filter((item) => item.label && item.url)
      : [];
  }

  function socialPresetForLabel(label, platform) {
    const normalized = String(label || "").trim().toLowerCase();
    const byPlatform = SOCIAL_PRESETS.find((preset) => preset.platform && platform && preset.platform === String(platform).toLowerCase());
    return byPlatform ||
      SOCIAL_PRESETS.find((preset) => preset.label.toLowerCase() === normalized) ||
      SOCIAL_PRESETS.find((preset) => preset.tone === normalized) ||
      SOCIAL_PRESETS.find((preset) => preset.tone === "website");
  }

  function socialEditorItemHtml(item, index, total) {
    const preset = socialPresetForLabel(item.label, item.platform);
    const label = item.label || preset.label || "链接";
    return `
      <article class="zca-social-item is-${escapeHtml(preset.tone || "website")}" data-zca-social-index="${index}">
        <div class="zca-social-item-head">
          <span class="zca-social-platform">
            <i aria-hidden="true"></i>
            <strong data-zca-social-name="${index}">${escapeHtml(label)}</strong>
          </span>
          <div class="zca-social-tools">
            <button type="button" data-zca-social-move="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="上移">↑</button>
            <button type="button" data-zca-social-move="${index}" data-direction="1" ${index === total - 1 ? "disabled" : ""} aria-label="下移">↓</button>
            <button type="button" data-zca-social-delete="${index}" aria-label="删除">⌫</button>
          </div>
        </div>
        <input class="zca-social-url" data-zca-social-url="${index}" value="${escapeHtml(item.url || "")}" placeholder="${escapeHtml(preset.url || "https://example.com")}" />
      </article>
    `;
  }

  function mountZcaSocialEditor(user) {
    const editor = document.querySelector("[data-zca-social-editor]");
    if (!editor) return;
    let links = socialLinks(user).slice(0, SOCIAL_LIMIT);
    const list = editor.querySelector("[data-zca-social-list]");
    const count = editor.querySelector("[data-zca-social-count]");
    const addButton = editor.querySelector("[data-zca-social-add-toggle]");

    const render = () => {
      list.innerHTML = links.length
        ? links.map((item, index) => socialEditorItemHtml(item, index, links.length)).join("")
        : `<p class="zca-empty">还没有社交链接。</p>`;
      count.textContent = `${links.length} / ${SOCIAL_LIMIT}`;
      addButton.disabled = links.length >= SOCIAL_LIMIT;
      editor.classList.toggle("is-full", links.length >= SOCIAL_LIMIT);
    };

    editor.collectLinks = () => links
      .map((item) => ({
        label: String(item.label || "").trim(),
        url: String(item.url || "").trim(),
        platform: String(item.platform || "").trim()
      }))
      .filter((item) => item.label && item.url);

    editor.addEventListener("input", (event) => {
      const urlIndex = event.target.dataset.zcaSocialUrl;
      if (urlIndex !== undefined) links[Number(urlIndex)].url = event.target.value;
    }, { signal });

    editor.addEventListener("click", (event) => {
      const add = event.target.closest("[data-zca-social-add]");
      const move = event.target.closest("[data-zca-social-move]");
      const remove = event.target.closest("[data-zca-social-delete]");

      if (add && links.length < SOCIAL_LIMIT) {
        const preset = SOCIAL_PRESETS.find((item) => item.label === add.dataset.zcaSocialAdd) || SOCIAL_PRESETS[0];
        links.push({ label: preset.label, url: "", platform: preset.platform || "" });
        render();
        list.querySelector(`[data-zca-social-url="${links.length - 1}"]`)?.focus();
        return;
      }

      if (move) {
        const from = Number(move.dataset.zcaSocialMove);
        const to = from + Number(move.dataset.direction);
        if (to >= 0 && to < links.length) {
          [links[from], links[to]] = [links[to], links[from]];
          render();
        }
        return;
      }

      if (remove) {
        links.splice(Number(remove.dataset.zcaSocialDelete), 1);
        render();
      }
    }, { signal });

    render();
  }

  function collectZcaSocialLinks(form) {
    return form.querySelector("[data-zca-social-editor]")?.collectLinks?.() || [];
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

  function pointsMeta(user, meta = levelMeta(user)) {
    const earned = Number.isFinite(Number(user?.commentPointsEarned))
      ? Math.max(0, Math.floor(Number(user.commentPointsEarned)))
      : Math.floor(meta.level / 10);
    const spent = Math.max(0, Math.floor(Number(user?.shopSpentPoints) || 0));
    const available = Number.isFinite(Number(user?.commentPoints))
      ? Math.max(0, Math.floor(Number(user.commentPoints)))
      : Math.max(0, earned - spent);
    return { earned, spent, available };
  }

  function shopItems(includeDisabled = false) {
    return (state.shopItems.length ? state.shopItems : DEFAULT_SHOP_ITEMS)
      .filter((item) => item && (includeDisabled || item.enabled !== false))
      .map((item) => ({
        key: String(item.key || "").trim(),
        name: String(item.name || item.label || "").trim(),
        description: String(item.description || item.content || "").trim(),
        price: Math.max(1, Math.floor(Number(item.price || item.cost || 100) || 100)),
        stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
        imageUrl: String(item.imageUrl || item.coverUrl || item.previewUrl || "").trim(),
        enabled: item.enabled !== false
      }))
      .filter((item) => item.key && item.name);
  }

  function shopImageHtml(item, className = "zca-shop-image", attrs = "") {
    const label = item?.name || "商品";
    if (item?.imageUrl) {
      return `<span class="${className}"${attrs}><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(label)} 预览图" loading="lazy" /></span>`;
    }
    return `<span class="${className} is-empty" aria-hidden="true"${attrs}>${escapeHtml(label.slice(0, 1))}</span>`;
  }

  function redemptionStatusLabel(status) {
    if (status === "processing") return "处理中";
    if (status === "completed") return "已完成";
    if (status === "cancelled") return "已取消";
    return "待处理";
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

  function renderShopPanel(user) {
    const points = pointsMeta(user);
    const items = shopItems();
    return `
      <div class="zca-shop-panel">
        <div class="zca-shop-balance">
          <span>可用积分</span>
          <strong>${escapeHtml(points.available)}</strong>
          <small>评论等级每升 10 级获得 1 积分。</small>
        </div>
        <div class="zca-shop-grid">
          ${items.map((item) => `
            <article class="zca-shop-item">
              ${shopImageHtml(item)}
              <strong>${escapeHtml(item.name)}</strong>
              ${item.description ? `<p class="zca-shop-desc">${escapeHtml(item.description)}</p>` : ""}
              <span>${escapeHtml(item.price)} 积分 · 剩余 ${escapeHtml(item.stock)}</span>
              <button class="zca-primary-btn" type="button" data-zca-redeem-start="${escapeHtml(item.key)}" ${points.available < item.price || item.stock <= 0 ? "disabled" : ""}>兑换</button>
            </article>
          `).join("")}
        </div>
        ${(user.shopRedemptions || []).length ? `
          <div class="zca-shop-history">
            <h3>兑换记录</h3>
            ${(user.shopRedemptions || []).slice().reverse().map((item) => `
              <p><span>${escapeHtml(item.itemLabel)}</span><small>${escapeHtml(redemptionStatusLabel(item.status))} · ${escapeHtml(formatDate(item.createdAt))}</small></p>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderRedeemConfirm(key) {
    const body = document.querySelector("[data-zca-account-body]");
    const points = pointsMeta(state.user);
    const item = shopItems().find((candidate) => candidate.key === key);
    if (!body || !item) {
      notify("这个商品暂时不可兑换。", true);
      return;
    }
    body.innerHTML = `
      <div class="zca-redeem-confirm">
        <div>
          <span>兑换商品</span>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          <small>${escapeHtml(item.price)} 积分 · 当前可用 ${escapeHtml(points.available)} 积分 · 剩余 ${escapeHtml(item.stock)}</small>
        </div>
        <p>确认后需要填写手机号，提交成功后预计 10 个工作日内到账。</p>
        <div class="zca-form-actions">
          <button class="zca-primary-btn" type="button" data-zca-redeem-phone="${escapeHtml(item.key)}">确认兑换</button>
          <button class="zca-quiet-btn" type="button" data-zca-shop-back>返回商城</button>
        </div>
      </div>
    `;
  }

  function renderRedeemPhone(key) {
    const body = document.querySelector("[data-zca-account-body]");
    const item = shopItems().find((candidate) => candidate.key === key);
    if (!body || !item) {
      notify("这个商品暂时不可兑换。", true);
      return;
    }
    body.innerHTML = `
      <form class="zca-account-form zca-redeem-form" data-zca-redeem-form="${escapeHtml(item.key)}">
        <div class="zca-redeem-summary">
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          <small>${escapeHtml(item.price)} 积分，预计 10 个工作日内到账。</small>
        </div>
        <label><span>手机号</span><input name="phone" inputmode="tel" autocomplete="tel" required placeholder="请输入接收权益的手机号" /></label>
        <label><span>备注（可选）</span><textarea name="note" maxlength="200" rows="2" placeholder="例如：希望补充给管理员的说明"></textarea></label>
        <div class="zca-form-actions">
          <button class="zca-primary-btn" type="submit">提交兑换</button>
          <button class="zca-quiet-btn" type="button" data-zca-redeem-start="${escapeHtml(item.key)}">上一步</button>
        </div>
      </form>
    `;
    body.querySelector("input[name='phone']")?.focus();
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
    const accountLevel = levelMeta(user);
    const tabs = user.role === "admin"
      ? [["profile", "资料"], ["shop", "商城"], ["admin", "管理"]]
      : [["profile", "资料"], ["shop", "商城"]];
    const tabNames = tabs.map(([name]) => name);
    const activePanel = panel.startsWith("profile") ? "profile" : tabNames.includes(panel) ? panel : "profile";
    const bodyPanel = panel === "profileSocial" ? "profileSocial" : activePanel;
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
              <span>${escapeHtml(accountLevel.label)}</span>
              <span>经验 ${escapeHtml(accountLevel.experience)}</span>
              <span>${escapeHtml(user.email || "")}</span>
            </div>
          </div>
        </header>
        <nav class="zca-account-tabs" aria-label="用户中心">
          ${tabs.map(([name, label]) => `<button type="button" data-zca-center-panel="${name}" class="${name === activePanel ? "is-active" : ""}">${label}</button>`).join("")}
        </nav>
        <section class="zca-account-body" data-zca-account-body></section>
        ${message ? `<p class="zca-message ${isError ? "is-error" : ""}">${escapeHtml(message)}</p>` : ""}
      </div>
    `;
    root.classList.remove("is-hidden");
    renderAccountPanel(bodyPanel);
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

    if (panel === "profileSocial") {
      body.innerHTML = `
        <form class="zca-account-form zca-social-panel" data-zca-social-form>
          <div class="zca-panel-head">
            <div>
              <strong>个人资料</strong>
              <small>编辑社交链接，最多 ${SOCIAL_LIMIT} 条</small>
            </div>
            <button class="zca-quiet-btn" type="button" data-zca-center-panel="profile">返回</button>
          </div>
          <div class="zca-social-editor" data-zca-social-editor>
            <div class="zca-social-list-editor" data-zca-social-list></div>
            <div class="zca-social-footer">
              <div class="zca-social-add">
                <button class="zca-quiet-btn zca-social-add-pill" type="button" data-zca-social-add-toggle><span>+</span> 新增</button>
                <div class="zca-social-menu">
                  ${SOCIAL_PRESETS.map((item) => `<button type="button" data-zca-social-add="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`).join("")}
                </div>
              </div>
              <span data-zca-social-count>0 / ${SOCIAL_LIMIT}</span>
            </div>
          </div>
          <button class="zca-primary-btn" type="submit">保存社交链接</button>
        </form>
      `;
      mountZcaSocialEditor(user);
      return;
    }

    if (panel === "profile") {
      body.innerHTML = `
        <form class="zca-account-form zca-profile-form" data-zca-profile-form>
          <div class="zca-panel-head zca-full-row">
            <div>
              <strong>个人资料</strong>
              <small>直接维护昵称、用户名、头像、主页和简介；社交链接在单独列表里管理</small>
            </div>
          </div>
          <label><span>注册邮箱</span><input value="${escapeHtml(user.email || "")}" disabled /></label>
          <label><span>昵称</span><input name="displayName" maxlength="64" required value="${escapeHtml(user.displayName || user.username || "")}" /></label>
          <label><span>用户名（@ 后面的字符）</span><input name="username" minlength="3" maxlength="32" value="${escapeHtml(user.username || "")}" placeholder="zeora" /></label>
          <label><span>头像外链</span><input name="avatarUrl" type="url" value="${escapeHtml(user.avatarUrl || "")}" placeholder="https://example.com/avatar.png" /></label>
          <label><span>主页背景图</span><input name="backgroundUrl" type="url" value="${escapeHtml(user.backgroundUrl || "")}" placeholder="https://example.com/cover.jpg" /></label>
          <label><span>个人主页 / 个人博客</span><input name="websiteUrl" value="${escapeHtml(user.websiteUrl || "")}" placeholder="https://example.com" /></label>
          <label class="zca-full-row"><span>个人简介</span><input name="bio" maxlength="120" value="${escapeHtml(user.bio || "")}" placeholder="一句话介绍自己" /></label>
          <button class="zca-quiet-btn zca-full-row" type="button" data-zca-center-panel="profileSocial">编辑社交链接</button>
          <div class="zca-profile-footer zca-full-row">
            <button class="zca-quiet-btn" type="button" data-zca-center-panel="password">更改密码</button>
            <button class="zca-primary-btn" type="submit">保存资料</button>
            <button class="zca-quiet-btn" type="button" data-zca-logout>退出登录</button>
          </div>
        </form>
      `;
      return;
    }

    if (panel === "level") {
      body.innerHTML = renderLevelCard(user);
      return;
    }

    if (panel === "shop") {
      body.innerHTML = renderShopPanel(user);
      loadShopCatalog().then(() => {
        if (document.querySelector("[data-zca-account-body]") === body) body.innerHTML = renderShopPanel(state.user);
      });
      return;
    }

    if (panel === "admin") {
      body.innerHTML = `
        <div class="zca-admin-panel">
          <div class="zca-panel-head">
            <div>
              <strong>管理</strong>
              <small>通知、用户、商城和兑换记录都在这里管理</small>
            </div>
          </div>
          <div class="zca-admin-tabs" aria-label="管理功能">
            ${[["notice", "通知"], ["users", "用户"], ["shop", "商城"], ["ai", "AI"], ["redemptions", "兑换"]].map(([name, label]) => `<button type="button" data-zca-admin-panel="${name}" class="${state.adminPanel === name ? "is-active" : ""}">${label}</button>`).join("")}
          </div>
          <div class="zca-admin-panel-body" data-zca-admin-panel-body></div>
        </div>
      `;
      renderAdminSubPanel();
      return;
    }
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

  async function loadAiConfig() {
    const wrap = document.querySelector("[data-zca-ai-config-wrap]");
    if (wrap) wrap.textContent = "正在加载 AI 配置...";
    try {
      const payload = await api("aiConfig", { method: "POST", body: {} });
      state.aiConfigs = payload.aiConfigs || [];
      state.aiConfig = payload.aiConfig || state.aiConfigs.find((item) => item.isDefault) || state.aiConfigs[0] || {};
      renderAiConfigPanel();
    } catch (error) {
      if (wrap) wrap.innerHTML = `<p class="zca-empty">${escapeHtml(error.message)}</p>`;
      notify(error.message, true);
    }
  }

  function renderAiConfigPanel() {
    const wrap = document.querySelector("[data-zca-ai-config-wrap]");
    if (!wrap) return;
    const configs = state.aiConfigs || [];
    const editing = state.aiEditConfig;
    const isNew = state.aiEditingNew;
    let html = `
      <div class="zca-panel-head">
        <div>
          <strong>AI 评论配置</strong>
          <small>AI 回复和 AI 润色使用这里的 OpenAI-compatible 配置，可维护多套并切换默认。</small>
        </div>
      </div>
    `;
    if (editing) {
      html += `
      <form class="zca-account-form zca-ai-config-form" data-zca-ai-config-form>
        <input type="hidden" name="id" value="${escapeHtml(editing.id || "")}" />
        <div class="zca-panel-head">
          <div>
            <strong>${isNew ? "新增 AI 配置" : "编辑 AI 配置"}</strong>
            <small>${isNew ? "创建一个新的 AI 服务配置。" : `正在编辑：${escapeHtml(editing.name || "未命名")}`}</small>
          </div>
          <button class="zca-quiet-btn" type="button" data-zca-ai-cancel>返回列表</button>
        </div>
        <label><span>配置名称</span><input name="name" maxlength="40" value="${escapeHtml(editing.name || "")}" placeholder="例如：DeepSeek 主用" /></label>
        <label class="zca-switch-mini"><input name="enabled" type="checkbox" ${editing.enabled !== false ? "checked" : ""} /> 启用 AI 评论</label>
        <label class="zca-switch-mini"><input name="requireLogin" type="checkbox" ${editing.requireLogin !== false ? "checked" : ""} /> 仅登录用户可用</label>
        <label><span>服务名称</span><input name="provider" maxlength="40" value="${escapeHtml(editing.provider || "DeepSeek")}" placeholder="DeepSeek" /></label>
        <label><span>接口地址</span><input name="apiBaseUrl" value="${escapeHtml(editing.apiBaseUrl || "")}" placeholder="https://api.deepseek.com/chat/completions" /></label>
        <label><span>模型</span><input name="model" maxlength="80" value="${escapeHtml(editing.model || "deepseek-mimo")}" placeholder="deepseek-mimo" /></label>
        <label><span>API Key</span><input name="apiKey" autocomplete="off" placeholder="${editing.hasApiKey ? escapeHtml(editing.apiKeyMasked || "已配置，留空不修改") : "粘贴新的 API Key"}" /></label>
        <label><span>温度</span><input name="temperature" type="number" min="0" max="2" step="0.1" value="${escapeHtml(editing.temperature ?? 0.72)}" /></label>
        <label><span>最大输出 tokens</span><input name="maxTokens" type="number" min="60" max="1000" step="10" value="${escapeHtml(editing.maxTokens || 220)}" /></label>
        <label><span>系统提示词</span><textarea name="systemPrompt" maxlength="1200" placeholder="控制评论风格、长度和语气">${escapeHtml(editing.systemPrompt || "")}</textarea></label>
        <label class="zca-switch-mini"><input name="isDefault" type="checkbox" ${editing.isDefault ? "checked" : ""} /> 设为默认配置</label>
        <label class="zca-switch-mini"><input name="clearApiKey" type="checkbox" /> 清除已保存的 API Key</label>
        <div class="zca-form-actions">
          <button class="zca-primary-btn" type="submit">保存 AI 配置</button>
          <button class="zca-quiet-btn" type="button" data-zca-ai-cancel>取消</button>
        </div>
      </form>
      `;
    } else {
      html += `
      <div class="zca-ai-config-list">
        ${configs.length ? configs.map((item) => `
          <article class="zca-ai-config-card${item.isDefault ? " is-default" : ""}">
            <div class="zca-ai-config-card-head">
              <strong>${escapeHtml(item.name || "未命名")}</strong>
              ${item.isDefault ? '<span class="zca-tag">默认</span>' : ""}
            </div>
            <div class="zca-ai-config-meta">${escapeHtml(item.provider || "-")} · ${escapeHtml(item.model || "-")}</div>
            <div class="zca-ai-config-meta">${item.hasApiKey ? "API Key 已配置" : "未配置 API Key"} · 调用 ${escapeHtml(item.usage?.calls || 0)} 次 · tokens ${escapeHtml(item.usage?.totalTokens || 0)}</div>
            <div class="zca-ai-config-tools">
              <button class="zca-quiet-btn" type="button" data-zca-ai-edit="${escapeHtml(item.id || "")}">编辑</button>
              ${item.isDefault ? "" : `<button class="zca-quiet-btn" type="button" data-zca-ai-default="${escapeHtml(item.id || "")}">设为默认</button>`}
              <button class="zca-quiet-btn" type="button" data-zca-ai-test="${escapeHtml(item.id || "")}">测试</button>
              <button class="zca-quiet-btn zca-danger" type="button" data-zca-ai-delete="${escapeHtml(item.id || "")}">删除</button>
            </div>
          </article>
        `).join("") : '<p class="zca-empty">还没有 AI 配置，点击下方按钮新增。</p>'}
      </div>
      <div class="zca-form-actions">
        <button class="zca-primary-btn" type="button" data-zca-ai-new>新增配置</button>
      </div>
      `;
    }
    wrap.innerHTML = html;
  }

  async function loadShopCatalog(admin = false) {
    try {
      const payload = await api(admin ? "adminShopCatalog" : "shopCatalog", { method: admin ? "POST" : "GET" });
      state.shopItems = payload.items || [];
      return state.shopItems;
    } catch (error) {
      if (!admin) state.shopItems = [];
      return state.shopItems;
    }
  }

  function renderAdminSubPanel() {
    const body = document.querySelector("[data-zca-admin-panel-body]");
    if (!body) return;
    document.querySelectorAll("[data-zca-admin-panel]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.zcaAdminPanel === state.adminPanel);
    });

    if (state.adminPanel === "notice") {
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
      `;
      return;
    }

    if (state.adminPanel === "shop") {
      body.innerHTML = `<div data-zca-shop-admin-wrap class="zca-shop-admin-wrap">正在加载商品...</div>`;
      loadShopCatalog(true).then(renderShopAdminPanel);
      return;
    }

    if (state.adminPanel === "ai") {
      body.innerHTML = `<div data-zca-ai-config-wrap class="zca-ai-config-wrap">正在加载 AI 配置...</div>`;
      loadAiConfig();
      return;
    }

    if (state.adminPanel === "redemptions") {
      body.innerHTML = `
        <div class="zca-admin-toolbar">
          <button class="zca-quiet-btn" type="button" data-zca-redemption-refresh>刷新记录</button>
        </div>
        <div class="zca-admin-table-wrap" data-zca-redemption-table>正在加载兑换记录...</div>
      `;
      loadRedemptions();
      return;
    }

    body.innerHTML = `
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
  }

  function renderShopAdminPanel() {
    const wrap = document.querySelector("[data-zca-shop-admin-wrap]");
    if (!wrap) return;
    const items = shopItems(true);
    wrap.innerHTML = `
      <div class="zca-shop-admin-grid">
        ${items.map((item) => `
          <form class="zca-shop-admin-card" data-zca-shop-item-form="${escapeHtml(item.key)}">
            <input name="key" type="hidden" value="${escapeHtml(item.key)}" />
            <div class="zca-shop-admin-section zca-shop-admin-section-icon">
              <strong>封面管理</strong>
              ${shopImageHtml(item, "zca-shop-admin-image", ` data-zca-shop-image-preview="${escapeHtml(item.key)}"`)}
              <label><span>商品封面</span><input name="imageUrl" value="${escapeHtml(item.imageUrl || "")}" placeholder="https://example.com/cover.jpg 或 /img/cover.jpg" data-zca-shop-image-input="${escapeHtml(item.key)}" /></label>
            </div>
            <div class="zca-shop-admin-section">
              <strong>内容管理</strong>
              <label><span>商品名称</span><input name="name" maxlength="40" value="${escapeHtml(item.name)}" /></label>
              <label><span>商品说明</span><textarea name="description" maxlength="120" placeholder="兑换后按填写手机号发放会员权益。">${escapeHtml(item.description || "")}</textarea></label>
              <label class="zca-switch-mini"><input name="enabled" type="checkbox" ${item.enabled ? "checked" : ""} /> 上架展示</label>
            </div>
            <div class="zca-shop-admin-section">
              <strong>积分与库存</strong>
              <label><span>所需积分</span><input name="price" type="number" min="1" step="1" value="${escapeHtml(item.price)}" /></label>
              <label><span>剩余库存</span><input name="stock" type="number" min="0" step="1" value="${escapeHtml(item.stock)}" /></label>
            </div>
            <button class="zca-primary-btn" type="submit">保存商品</button>
          </form>
        `).join("")}
        <form class="zca-shop-admin-card is-new" data-zca-shop-item-form="new">
          <div class="zca-shop-admin-section zca-shop-admin-section-icon">
            <strong>封面管理</strong>
            <span class="zca-shop-admin-image is-empty" aria-hidden="true" data-zca-shop-image-preview="new">+</span>
            <label><span>商品封面</span><input name="imageUrl" placeholder="https://example.com/cover.jpg 或 /img/cover.jpg" data-zca-shop-image-input="new" /></label>
          </div>
          <div class="zca-shop-admin-section">
            <strong>内容管理</strong>
            <label><span>商品标识</span><input name="key" maxlength="32" placeholder="youku" required /></label>
            <label><span>商品名称</span><input name="name" maxlength="40" placeholder="优酷会员" required /></label>
            <label><span>商品说明</span><textarea name="description" maxlength="120" placeholder="兑换后按填写手机号发放会员权益。"></textarea></label>
            <label class="zca-switch-mini"><input name="enabled" type="checkbox" checked /> 上架展示</label>
          </div>
          <div class="zca-shop-admin-section">
            <strong>积分与库存</strong>
            <label><span>所需积分</span><input name="price" type="number" min="1" step="1" value="100" /></label>
            <label><span>剩余库存</span><input name="stock" type="number" min="0" step="1" value="10" /></label>
          </div>
          <button class="zca-primary-btn" type="submit">新增商品</button>
        </form>
      </div>
    `;
  }

  async function loadRedemptions() {
    const table = document.querySelector("[data-zca-redemption-table]");
    if (table) table.textContent = "正在加载兑换记录...";
    try {
      const payload = await api("listRedemptions", { method: "POST", body: {} });
      state.redemptions = payload.redemptions || [];
      renderRedemptionTable();
    } catch (error) {
      if (table) table.innerHTML = `<p class="zca-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderRedemptionTable() {
    const table = document.querySelector("[data-zca-redemption-table]");
    if (!table) return;
    if (!state.redemptions.length) {
      table.innerHTML = `<p class="zca-empty">还没有兑换申请。</p>`;
      return;
    }
    table.innerHTML = `
      <table class="zca-user-table zca-redemption-table">
        <thead><tr><th>用户</th><th>商品</th><th>手机号</th><th>状态</th><th>备注</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          ${state.redemptions.map((item) => `
            <tr>
              <td>${escapeHtml(item.user?.displayName || item.user?.username || "")}<br />UID: ${escapeHtml(item.user?.uid || "")}</td>
              <td>${escapeHtml(item.itemLabel)}<br />${escapeHtml(item.cost)} 积分</td>
              <td>${escapeHtml(item.phone || "")}</td>
              <td><select data-zca-redemption-status="${escapeHtml(item.id)}">${[["pending", "待处理"], ["processing", "处理中"], ["completed", "已完成"], ["cancelled", "已取消"]].map(([value, label]) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
              <td><input data-zca-redemption-note="${escapeHtml(item.id)}" value="${escapeHtml(item.note || "")}" placeholder="可选" /></td>
              <td>${escapeHtml(formatDate(item.createdAt))}</td>
              <td><button type="button" data-zca-save-redemption="${escapeHtml(item.id)}">保存</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
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
        <thead><tr><th>用户</th><th>UID</th><th>邮箱</th><th>身份</th><th>等级</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${users.map((user) => {
            const level = levelMeta(user);
            const badgeColor = normalizeBadgeColor(user.badgeColor) || (user.role === "admin" ? "#ff5f63" : "#8a94a6");
            return `
              <tr>
                <td><div class="zca-admin-user">${avatarHtml(user)}<span><strong>${escapeHtml(user.displayName || user.username)}</strong><small>@${escapeHtml(user.username || "")}</small></span></div></td>
                <td>
                  <div class="zca-uid-editor">
                    <input data-zca-uid-input="${escapeHtml(user.id)}" maxlength="32" value="${escapeHtml(user.uid || "")}" placeholder="UID" />
                    <button type="button" data-zca-save-uid="${escapeHtml(user.id)}">保存UID</button>
                  </div>
                </td>
                <td>${escapeHtml(user.email || "")}</td>
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
    state.anonymousMode = false;
    state.anonymousName = "";
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
    const anonymous = state.anonymousMode && !state.user;
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
      return;
    }

    if (state.user) {
      if (!placeProfileBar(bar)) return;
      bar.querySelectorAll(".zca-comment-level, .zca-comment-role").forEach((pill) => pill.remove());
      const level = levelMeta(state.user);
      const badge = state.user.badgeLabel || (state.user.role === "admin" ? "博主" : "");
      const userKey = `user:${state.user.id}:${state.user.displayName}:${state.user.avatarUrl}:${state.user.role}:${level.label}:${badge}:${state.user.badgeColor || ""}`;
      bar.className = "zeora-comment-auth is-authorized";
      if (bar.dataset.zcaState === userKey) {
        syncTwikooProfile();
        hydrateCommentAvatars();
        return;
      }
      bar.dataset.zcaState = userKey;
      bar.innerHTML = renderAuthUserCluster(state.user);
      syncTwikooProfile();
      hydrateCommentAvatars();
      return;
    }

    if (anonymous) {
      if (!placeProfileBar(bar)) return;
      const name = state.anonymousName || pickAnonymousName();
      if (state.anonymousName !== name) state.anonymousName = name;
      const anonymousKey = `anonymous:${state.anonymousName}:${anonymousConfig().avatarUrl}`;
      bar.className = "zeora-comment-auth is-anonymous";
      if (bar.dataset.zcaState === anonymousKey) {
        syncTwikooProfile();
        return;
      }
      bar.dataset.zcaState = anonymousKey;
      bar.innerHTML = renderAnonymousCluster();
      syncTwikooProfile();
      return;
    }

    if (!placeProfileBar(bar)) return;
    bar.className = "zeora-comment-auth is-gated";
    if (bar.dataset.zcaState === "guest") return;
    bar.dataset.zcaState = "guest";
    bar.innerHTML = `
      <div class="zca-choice-panel" aria-label="评论登录方式">
        <div class="zca-choice-actions">
          <button class="zca-login-btn" type="button" data-zca-login>登录发表评论</button>
          <button class="zca-manual-btn" type="button" data-zca-manual>其他方式</button>
          <button class="zca-anonymous-btn" type="button" data-zca-anonymous>匿名</button>
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
      const captcha = await runCaptchaChallenge();
      await api("requestCode", { body: { email, purpose: "login", captcha } });
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

  function commentAuthorName(comment) {
    const main = directChildByClass(comment, "tk-main") || comment.querySelector(":scope > .tk-main");
    const header = directChildByClass(main, "tk-row") || main?.querySelector(":scope > .tk-row:first-child");
    const source = header || main || comment;
    const node = Array.from(source.querySelectorAll([
      ".tk-nick",
      ".tk-nickname",
      ".tk-author",
      ".tk-user",
      ".tk-meta a",
      ".tk-comment-author",
      ".tk-comment-nick",
      "a[href]"
    ].join(","))).find((item) => item.textContent.trim());
    return String(node?.textContent || "")
      .replace(/Lv\.?\s*\d+/gi, "")
      .replace(/博主|管理员|普通用户/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function commentDomId(comment) {
    const dataset = comment?.dataset || {};
    const candidates = [
      dataset.id,
      dataset.commentId,
      dataset.uid,
      dataset.objectId,
      comment?.getAttribute?.("data-id"),
      comment?.getAttribute?.("data-comment-id"),
      comment?.getAttribute?.("data-uid"),
      comment?.id
    ];
    return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function rootCommentFor(comment) {
    let root = comment;
    while (root?.parentElement) {
      const replyList = root.parentElement.closest(".tk-replies");
      const parentComment = replyList?.closest(".tk-comment");
      if (!replyList || !parentComment || parentComment === root) break;
      root = parentComment;
    }
    return root || comment;
  }

  function prepareReplyContext(targetComment) {
    const rootComment = rootCommentFor(targetComment);
    const replyToUser = rootComment && targetComment !== rootComment ? commentAuthorName(targetComment) : "";
    state.replyContext = {
      active: true,
      rootId: commentDomId(rootComment),
      targetId: commentDomId(targetComment),
      replyToUser,
      rootComment,
      targetComment
    };
    return state.replyContext;
  }

  function nativeParentId(payload) {
    return String(payload?.pid || payload?.rid || payload?.parent_id || payload?.parentId || payload?.root_parent_id || "").trim();
  }

  function hasOpenNativeReplyComposer() {
    return Boolean(document.querySelector("#twikoo .tk-comment .tk-submit textarea, #twikoo .tk-comment .tk-submit .el-textarea__inner, #twikoo .tk-replies .tk-submit textarea, #twikoo .tk-replies .tk-submit .el-textarea__inner"));
  }

  function replyContextPayload(payload) {
    const context = state.replyContext;
    const nativeParent = nativeParentId(payload);
    if (!context?.active && !nativeParent) return {};
    if (context?.active && !nativeParent && !hasOpenNativeReplyComposer()) return {};

    const rootId = context?.rootId || nativeParent;
    const fields = {
      reply_to_user: context?.replyToUser || "",
      replyToUser: context?.replyToUser || "",
      _zeoraReply: {
        rootId,
        targetId: context?.targetId || nativeParent,
        replyToUser: context?.replyToUser || ""
      }
    };
    if (rootId) {
      fields.parent_id = rootId;
      fields.parentId = rootId;
      fields.root_parent_id = rootId;
      fields.pid = rootId;
      fields.rid = rootId;
    }
    return fields;
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
      .filter((item) => item.handle && !item.anchor.closest("#zeora-comment-auth"));

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
    if (anchor.closest("#zeora-comment-auth")) return;
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

  function anonymousIdentityPayload() {
    if (!state.anonymousMode || state.user) return {};
    const name = state.anonymousName || pickAnonymousName();
    return {
      nick: name,
      mail: ANONYMOUS_EMAIL,
      link: "",
      zcaAnonymous: true,
      anonymousName: name,
      _zeoraAnonymous: {
        enabled: true,
        name,
        reviewLevel: "strict"
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isCommentSubmitPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (["COMMENT_SUBMIT", "COMMENT_CREATE"].includes(payload.event)) return true;
    return Boolean(payload.comment || payload.content || payload.message || payload.text);
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
    try {
      let payload = null;
      if (state.user && state.token) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          payload = await api("bindCommentAuthor", {
            method: "POST",
            body: {
              comment,
              response,
              path: window.location.pathname,
              pageUrl: window.location.href
            }
          });
          if (payload.updated || payload.user) break;
          await delay([360, 900, 1600, 2600][attempt] || 2600);
        }
        if (payload?.user) updateAuthorizedUser(payload.user);
        if (!payload?.updated) {
          const refreshed = await api("me").catch(() => null);
          if (refreshed?.user) updateAuthorizedUser(refreshed.user);
        }
      }
      setTimeout(() => {
        renderBar();
        syncTwikooProfile();
        enhanceCommentProfileLinks();
        hydrateCommentAvatars();
      }, 240);
    } catch (error) {
      console.warn("[comment-auth] Failed to sync submitted comment:", error);
    }
  }

  async function enrichFetchInput(input, init = {}) {
    const method = String(init.method || input?.method || "GET").toUpperCase();
    if (method !== "POST") return null;

    const url = typeof input === "string" || input instanceof URL ? input.toString() : input?.url;
    if (!url || shouldSkipFetchPatch(url)) return null;

    let bodyText = typeof init.body === "string" ? init.body : "";
    if (!bodyText && typeof Request !== "undefined" && input instanceof Request) {
      bodyText = await input.clone().text().catch(() => "");
    }
    const payload = parseJsonBody(bodyText);
    if (!isCommentSubmitPayload(payload)) return null;

    const hasUserSession = Boolean(state.user && state.token);
    const hasAnonymousSession = Boolean(state.anonymousMode && !state.user);
    const replyFields = replyContextPayload(payload);
    if (!hasUserSession && !hasAnonymousSession && !Object.keys(replyFields).length) return null;

    const enriched = {
      ...payload,
      ...(hasUserSession ? commentIdentityPayload() : {}),
      ...(hasAnonymousSession ? anonymousIdentityPayload() : {}),
      ...replyFields,
      ...(hasUserSession ? { sessionToken: state.token } : {})
    };
    const headers = new Headers(init.headers || input?.headers || {});
    headers.set("content-type", "application/json");
    if (hasUserSession) headers.set("x-session-token", state.token);

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
        const submittedBody = enriched.body;
        state.replyContext = null;
        response.clone().json()
          .then((payload) => syncSubmittedComment(submittedBody, payload))
          .catch(() => syncSubmittedComment(submittedBody, {}));
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

  function actionLabel(node) {
    return [
      node?.textContent,
      node?.getAttribute?.("aria-label"),
      node?.getAttribute?.("title"),
      node?.getAttribute?.("data-action"),
      node?.className
    ].join(" ");
  }

  function nativeReplyActionFromEvent(event) {
    const action = event.target.closest("#twikoo .tk-action-link, #twikoo .tk-action button, #twikoo .tk-action a, #twikoo [role='button']");
    if (!action || action.closest(".tk-submit")) return null;
    if (!action.classList?.contains("zca-reply-pill") && !/回复|reply/i.test(actionLabel(action))) return null;
    const comment = action.closest(".tk-comment");
    return comment ? { action, comment } : null;
  }

  function nativeCancelActionFromEvent(event) {
    const action = event.target.closest("#twikoo .tk-cancel, #twikoo .el-button--default, #twikoo button, #twikoo [role='button']");
    if (!action || !action.closest(".tk-submit")) return null;
    return /取消|关闭|cancel|close|×/i.test(actionLabel(action)) ? action : null;
  }

  function directReplyCount(comment) {
    const replies = directChildByClass(comment, "tk-replies") || comment.querySelector(":scope > .tk-replies");
    if (!replies) return 0;
    return Array.from(replies.children).filter((child) => child.classList?.contains("tk-comment")).length;
  }

  function enhanceReplyActionPills() {
    document.querySelectorAll("#twikoo .tk-comment").forEach((comment) => {
      const actions = Array.from(comment.querySelectorAll(":scope > .tk-main .tk-action-link, :scope > .tk-main .tk-action button, :scope > .tk-main .tk-action a"));
      const buttonActions = actions.filter((action) => action.matches("button, a, [role='button']"));
      if (buttonActions.length >= 3) {
        buttonActions[1].classList.add("is-zca-hidden");
        buttonActions[buttonActions.length - 1].classList.add("zca-reply-pill");
      }
      actions.forEach((action, index) => {
        const label = actionLabel(action);
        if (/点踩|踩|dislike|down/i.test(label)) {
          action.classList.add("is-zca-hidden");
          return;
        }
        if (!action.classList.contains("zca-reply-pill") && !/回复|reply|comment/i.test(label)) return;
        action.classList.add("zca-reply-pill");
        const count = directReplyCount(comment);
        if (count > 0) action.dataset.zcaReplyCount = String(count);
        else delete action.dataset.zcaReplyCount;
      });
    });
  }

  function insertMentionShortcut(textarea) {
    if (!textarea) return;
    const current = textarea.value || "";
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " @" : "@";
    const next = `${current.slice(0, start)}${prefix}${current.slice(end)}`;
    const cursor = start + prefix.length;
    textarea.value = next;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(cursor, cursor);
  }

  function enhanceComposerToolbar() {
    document.querySelectorAll("#twikoo .tk-submit .tk-row-actions-start").forEach((actionGroup) => {
      if (actionGroup.querySelector(".zca-at-action, .solitude-mention-action")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tk-submit-action-icon zca-at-action solitude-mention-action";
      button.setAttribute("aria-label", "插入 @");
      button.innerHTML = `<span aria-hidden="true"><i class="solitude fas fa-at"></i></span>`;
      button.addEventListener("click", () => {
        const submit = button.closest(".tk-submit");
        insertMentionShortcut(submit?.querySelector(".el-textarea__inner"));
      });
      const first = actionGroup.firstElementChild;
      if (first?.nextSibling) actionGroup.insertBefore(button, first.nextSibling);
      else actionGroup.appendChild(button);
    });
  }

  function renderAuthUserCluster(user) {
    if (!user) return "";
    return `
      <div class="zca-user-cluster">
        <a class="zca-user zca-user-link" href="${escapeHtml(publicProfileUrl(user))}">
          ${avatarHtml(user)}
          <span class="zca-name">${escapeHtml(user.displayName || user.username)}</span>
        </a>
        <button class="zca-link-btn" type="button" data-zca-open-user-center>用户中心</button>
        <button class="zca-link-btn" type="button" data-zca-logout>注销</button>
      </div>
    `;
  }

  function renderAnonymousCluster() {
    const anon = anonymousConfig();
    const name = state.anonymousName || pickAnonymousName();
    const avatar = anon.avatarUrl
      ? `<img src="${escapeHtml(anon.avatarUrl)}" alt="匿名头像" loading="lazy" />`
      : `<span>${escapeHtml(name.slice(0, 1))}</span>`;
    return `
      <div class="zca-user-cluster zca-anonymous-cluster">
        <span class="zca-user">
          <span class="zca-avatar">${avatar}</span>
          <span class="zca-name">${escapeHtml(name)}</span>
        </span>
        <button class="zca-link-btn zca-refresh-name" type="button" data-zca-random-anonymous>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 12a7.2 7.2 0 0 1 12-5.3L19 8.9" /><path d="M19.2 12a7.2 7.2 0 0 1-12 5.3L5 15.1" /><path d="M19 4.9v4h-4" /><path d="M5 19.1v-4h4" /></svg>
          换一个
        </button>
        <button class="zca-link-btn" type="button" data-zca-logout>注销</button>
      </div>
    `;
  }

  function updateCommentAuthUi() {
    state.mutationQueued = false;
    renderBar();
    syncTwikooProfile();
    ensureManualSwitchButton();
    enhanceComposerToolbar();
    if (window.SolitudeAIComment && !document.querySelector("#twikoo .solitude-ai-comment")) {
      window.SolitudeAIComment.mount?.();
    }
    enhanceCommentProfileLinks();
    hydrateCommentAvatars();
    enhanceReplyActionPills();
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

      const nativeReply = nativeReplyActionFromEvent(event);
      if (nativeReply) {
        prepareReplyContext(nativeReply.comment);
        if (!state.user && !isManualMode()) {
          event.preventDefault();
          event.stopPropagation();
          applyCommentMode();
          renderBar();
          renderEmbeddedLogin("请先登录账号，再回复评论。");
        }
        return;
      }

      if (nativeCancelActionFromEvent(event)) {
        state.replyContext = null;
        scheduleCommentAuthUiUpdate();
        return;
      }

      const primarySubmit = event.target.closest("#twikoo .tk-submit.zca-primary-submit");
      if (primarySubmit && !primarySubmit.closest(".tk-comment, .tk-replies")) {
        state.replyContext = null;
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
      if (event.target.closest("[data-zca-confirm-anonymous]")) {
        setAnonymousMode();
        return;
      }
      if (event.target.closest("[data-zca-random-anonymous]")) {
        state.anonymousName = pickAnonymousName(state.anonymousName);
        renderBar();
        syncTwikooProfile();
        return;
      }
      if (event.target.closest("[data-zca-login]")) {
        state.manualMode = false;
        state.anonymousMode = false;
        state.anonymousName = "";
        state.authMode = "login";
        state.authStep = "email";
        removeManualSwitchButton();
        applyCommentMode();
        renderBar();
        renderEmbeddedLogin();
        return;
      }
      if (event.target.closest("[data-zca-auth-options]")) {
        renderManualWarningModal();
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
      const panelButton = event.target.closest("[data-zca-center-panel]");
      if (panelButton) {
        renderUserCenterModal(panelButton.dataset.zcaCenterPanel || "profile");
        return;
      }
      const adminPanelButton = event.target.closest("[data-zca-admin-panel]");
      if (adminPanelButton) {
        state.adminPanel = adminPanelButton.dataset.zcaAdminPanel || "notice";
        renderAdminSubPanel();
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
      const redeemStart = event.target.closest("[data-zca-redeem-start]");
      if (redeemStart) {
        renderRedeemConfirm(redeemStart.dataset.zcaRedeemStart);
        return;
      }
      const redeemPhone = event.target.closest("[data-zca-redeem-phone]");
      if (redeemPhone) {
        renderRedeemPhone(redeemPhone.dataset.zcaRedeemPhone);
        return;
      }
      if (event.target.closest("[data-zca-shop-back]")) {
        const body = document.querySelector("[data-zca-account-body]");
        if (body) body.innerHTML = renderShopPanel(state.user);
        return;
      }
      if (event.target.closest("[data-zca-admin-refresh]")) {
        loadAdminUsers();
        return;
      }
      if (event.target.closest("[data-zca-redemption-refresh]")) {
        loadRedemptions();
        return;
      }
      const aiNewButton = event.target.closest("[data-zca-ai-new]");
      if (aiNewButton) {
        state.aiEditConfig = {};
        state.aiEditingNew = true;
        renderAiConfigPanel();
        return;
      }
      const aiEditButton = event.target.closest("[data-zca-ai-edit]");
      if (aiEditButton) {
        state.aiEditConfig = (state.aiConfigs || []).find((item) => item.id === aiEditButton.dataset.zcaAiEdit) || {};
        state.aiEditingNew = false;
        renderAiConfigPanel();
        return;
      }
      const aiCancelButton = event.target.closest("[data-zca-ai-cancel]");
      if (aiCancelButton) {
        state.aiEditConfig = null;
        state.aiEditingNew = false;
        renderAiConfigPanel();
        return;
      }
      const aiDefaultButton = event.target.closest("[data-zca-ai-default]");
      if (aiDefaultButton) {
        aiDefaultButton.disabled = true;
        (async () => {
          try {
            await api("setDefaultAiConfig", { method: "POST", body: { id: aiDefaultButton.dataset.zcaAiDefault } });
            await loadAiConfig();
            notify("已设为默认配置。");
          } catch (error) {
            aiDefaultButton.disabled = false;
            notify(error.message, true);
          }
        })();
        return;
      }
      const aiTestButton = event.target.closest("[data-zca-ai-test]");
      if (aiTestButton) {
        const original = aiTestButton.textContent;
        aiTestButton.disabled = true;
        aiTestButton.textContent = "测试中...";
        (async () => {
          try {
            const payload = await api("testAiConfig", { method: "POST", body: { id: aiTestButton.dataset.zcaAiTest } });
            notify(payload.ok ? `测试成功：${payload.message || ""}${payload.latencyMs ? `（${payload.latencyMs}ms）` : ""}` : `测试失败：${payload.message || ""}`, !payload.ok);
          } catch (error) {
            notify(error.message, true);
          } finally {
            aiTestButton.disabled = false;
            aiTestButton.textContent = original;
          }
        })();
        return;
      }
      const aiDeleteButton = event.target.closest("[data-zca-ai-delete]");
      if (aiDeleteButton) {
        if (!window.confirm("确定删除该 AI 配置？删除后不可恢复。")) return;
        aiDeleteButton.disabled = true;
        (async () => {
          try {
            await api("deleteAiConfig", { method: "POST", body: { id: aiDeleteButton.dataset.zcaAiDelete } });
            await loadAiConfig();
            notify("AI 配置已删除。");
          } catch (error) {
            aiDeleteButton.disabled = false;
            notify(error.message, true);
          }
        })();
        return;
      }
      const saveRedemption = event.target.closest("[data-zca-save-redemption]");
      if (saveRedemption) {
        const id = saveRedemption.dataset.zcaSaveRedemption;
        saveRedemption.disabled = true;
        (async () => {
          try {
            await api("updateRedemption", {
              method: "POST",
              body: {
                id,
                status: document.querySelector("[data-zca-redemption-status=\"" + CSS.escape(id) + "\"]")?.value,
                note: document.querySelector("[data-zca-redemption-note=\"" + CSS.escape(id) + "\"]")?.value
              }
            });
            await loadRedemptions();
            notify("兑换记录已更新。");
          } catch (error) {
            notify(error.message, true);
          } finally {
            saveRedemption.disabled = false;
          }
        })();
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
            const payload = await api("updateUser", {
              method: "POST",
              body: {
                id,
                badgeLabel: labelInput?.value.trim() || "",
                badgeColor: colorInput?.value || "",
              },
            });
            if (payload.user?.id === state.user?.id) updateAuthorizedUser(payload.user);
            await loadAdminUsers();
            notify("身份标签已保存。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
        return;
      }
      const uidButton = event.target.closest("[data-zca-save-uid]");
      if (uidButton) {
        const id = uidButton.dataset.zcaSaveUid;
        const input = document.querySelector("[data-zca-uid-input=\"" + CSS.escape(id) + "\"]");
        (async () => {
          try {
            const payload = await api("updateUser", {
              method: "POST",
              body: { id, uid: input?.value.trim() || "" },
            });
            if (payload.user?.id === state.user?.id) updateAuthorizedUser(payload.user);
            await loadAdminUsers();
            notify("UID 已保存。");
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
            let payload = null;
            if (roleButton) {
              payload = await api("updateUser", { method: "POST", body: { id, role: targetUser.role === "admin" ? "user" : "admin" } });
            }
            if (statusButton) {
              payload = await api("updateUser", { method: "POST", body: { id, status: targetUser.status === "blocked" ? "active" : "blocked" } });
            }
            if (deleteButton && window.confirm(`确认删除 ${targetUser.displayName || targetUser.username} 吗？`)) {
              await api("deleteUser", { method: "POST", body: { id } });
            }
            if (payload?.user?.id === state.user?.id) updateAuthorizedUser(payload.user);
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
      if (event.target.closest("[data-zca-anonymous]")) {
        renderAnonymousWarningModal();
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
      const loginForm = event.target.closest("[data-zca-login-form]");
      const loginEmailForm = event.target.closest("[data-zca-login-email-form]");
      const registerForm = event.target.closest("[data-zca-register-form]");
      const resetForm = event.target.closest("[data-zca-reset-form]");
      const profileForm = event.target.closest("[data-zca-profile-form]");
      const socialForm = event.target.closest("[data-zca-social-form]");
      const passwordForm = event.target.closest("[data-zca-password-form]");
      const noticeForm = event.target.closest("[data-zca-notice-form]");
      const adminNotificationForm = event.target.closest("[data-zca-admin-notification-form]");
      const redeemForm = event.target.closest("[data-zca-redeem-form]");
      const shopItemForm = event.target.closest("[data-zca-shop-item-form]");
      const aiConfigForm = event.target.closest("[data-zca-ai-config-form]");
      const emailForm = event.target.closest("[data-zca-email-form]");
      const codeForm = event.target.closest("[data-zca-code-form]");
      if (!emailForm && !codeForm && !loginForm && !loginEmailForm && !registerForm && !resetForm && !profileForm && !socialForm && !passwordForm && !noticeForm && !adminNotificationForm && !redeemForm && !shopItemForm && !aiConfigForm) return;

      event.preventDefault();
      const submitter = event.submitter || event.target.querySelector("button[type='submit']");
      if (emailForm) handleEmailSubmit(emailForm);
      if (codeForm) handleCodeSubmit(codeForm);

      if (loginForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(loginForm);
            state.authIdentifier = String(data.identifier || "").trim();
            state.rememberSession = data.rememberMe === "on";
            if (!state.authIdentifier) return;
            const captcha = await runCaptchaChallenge();
            const payload = await api("login", {
              method: "POST",
              body: { identifier: state.authIdentifier, password: data.password, captcha }
            });
            completeAuthorization(payload.user, payload.sessionToken);
          } catch (error) {
            renderEmbeddedLogin(`错误：${error.message}`);
          }
        })();
      }

      if (loginEmailForm) {
        const data = formData(loginEmailForm);
        state.authEmail = String(data.email || "").trim().toLowerCase();
        if (!state.authEmail) return;
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

      if (registerForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const captcha = await runCaptchaChallenge();
            const payload = await api("registerWithCode", {
              method: "POST",
              body: { ...formData(registerForm), email: state.authEmail, captcha }
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
                username: data.username,
                avatarUrl: data.avatarUrl,
                backgroundUrl: data.backgroundUrl,
                websiteUrl: data.websiteUrl,
                bio: data.bio
              }
            });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("profile", "资料已保存。");
          } catch (error) {
            renderUserCenterModal("profile", error.message, true);
          }
        })();
      }

      if (socialForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const payload = await api("updateProfile", {
              method: "POST",
              body: { socialLinks: collectZcaSocialLinks(socialForm) }
            });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("profile", "社交链接已保存。");
          } catch (error) {
            renderUserCenterModal("profileSocial", error.message, true);
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

      if (shopItemForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(shopItemForm);
            await api("updateShopItem", {
              method: "POST",
              body: {
                key: data.key,
                name: data.name,
                description: data.description,
                price: data.price,
                stock: data.stock,
                imageUrl: data.imageUrl,
                enabled: data.enabled === "on"
              }
            });
            await loadShopCatalog(true);
            renderShopAdminPanel();
            notify("商品已保存。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
      }

      if (aiConfigForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(aiConfigForm);
            const isNew = state.aiEditingNew;
            const payload = await api(isNew ? "createAiConfig" : "aiConfig", {
              method: "POST",
              body: {
                id: data.id || undefined,
                name: data.name,
                enabled: data.enabled === "on",
                requireLogin: data.requireLogin === "on",
                provider: data.provider,
                apiBaseUrl: data.apiBaseUrl,
                model: data.model,
                apiKey: data.apiKey,
                temperature: data.temperature,
                maxTokens: data.maxTokens,
                systemPrompt: data.systemPrompt,
                isDefault: data.isDefault === "on",
                clearApiKey: data.clearApiKey === "on"
              }
            });
            state.aiConfigs = payload.aiConfigs || [];
            state.aiEditConfig = null;
            state.aiEditingNew = false;
            renderAiConfigPanel();
            notify(isNew ? "AI 配置已创建。" : "AI 配置已保存。");
          } catch (error) {
            notify(error.message, true);
          }
        })();
      }

      if (redeemForm) {
        submitter.disabled = true;
        (async () => {
          try {
            const data = formData(redeemForm);
            const payload = await api("redeemReward", {
              method: "POST",
              body: {
                reward: redeemForm.dataset.zcaRedeemForm,
                phone: data.phone,
                note: data.note
              }
            });
            updateAuthorizedUser(payload.user);
            renderUserCenterModal("shop", `${payload.redemption?.itemLabel || "权益"}兑换申请已提交，预计 10 个工作日内到账。`);
          } catch (error) {
            renderUserCenterModal("shop", error.message, true);
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
      const shopImageInput = event.target.closest("[data-zca-shop-image-input]");
      if (shopImageInput) {
        const key = shopImageInput.dataset.zcaShopImageInput;
        const preview = document.querySelector("[data-zca-shop-image-preview=\"" + CSS.escape(key) + "\"]");
        if (!preview) return;
        const value = shopImageInput.value.trim();
        preview.classList.toggle("is-empty", !value);
        preview.innerHTML = value
          ? `<img src="${escapeHtml(value)}" alt="商品预览图" loading="lazy" />`
          : key === "new" ? "+" : "商";
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
    clearTimeout(state.retryTimer);
    state.retryTimer = null;

    if (!document.querySelector("#twikoo .tk-submit") && state.retryCount < 24) {
      state.retryCount += 1;
      state.retryTimer = setTimeout(mount, 250);
    } else {
      state.retryCount = 0;
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
  window.addEventListener("twikoo:loaded", () => {
    state.submitEl = null;
    scheduleCommentAuthUiUpdate();
  }, { signal });
  document.addEventListener("pjax:complete", () => {
    state.mounted = false;
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
    state.retryCount = 0;
    init();
  }, { signal });
  if (document.readyState !== "loading") init();
})();
