(() => {
  const root = document.querySelector('#user-center-root');
  if (!root) return;

  const SESSION_TOKEN_KEY = 'twikooUserCenterSessionToken';
  const SESSION_USER_KEY = 'twikooUserCenterSessionUser';
  const COMMENT_SESSION_KEY = 'zeoraTwikooUserSession';

  window.__zeoraUserCenterCleanup?.();

  const controller = new AbortController();
  const { signal } = controller;
  window.__zeoraUserCenterCleanup = () => controller.abort();
  document.addEventListener('solitude:beforeNavigate', window.__zeoraUserCenterCleanup, { once: true, signal });

  const configNode = root.querySelector('#zeora-user-center-config');
  const config = (() => {
    try {
      return JSON.parse(configNode?.textContent || '{}');
    } catch (error) {
      return {};
    }
  })();

  function readCommentSession() {
    try {
      return JSON.parse(localStorage.getItem(COMMENT_SESSION_KEY) || sessionStorage.getItem(COMMENT_SESSION_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  const commentSession = readCommentSession();

  const state = {
    currentUser: null,
    publicUser: null,
    sessionToken: localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY) || commentSession?.sessionToken || '',
    rememberSession: true,
    users: [],
    shopItems: [],
    redemptions: [],
    authMode: 'login',
    authEmail: '',
    captcha: { enabled: false, provider: '' },
    adminProtected: false,
    adminToken: localStorage.getItem('twikooDemoAdminToken') || '',
    filter: { query: '', role: 'all', status: 'all' },
    adminPanel: 'notice',
    aiConfig: null,
    aiConfigs: [],
    aiEditConfig: null,
    aiEditingNew: false,
    deleteTimer: null,
    modalBackPanel: '',
  };

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));
  const SOCIAL_LIMIT = 5;
  const DEFAULT_SHOP_ITEMS = [
    { key: 'quark', name: '夸克网盘会员', description: '兑换后按填写手机号发放会员权益。', price: 100, stock: 10, enabled: true },
    { key: 'bilibili', name: 'B站大会员', description: '兑换后按填写手机号发放会员权益。', price: 100, stock: 10, enabled: true },
    { key: 'tencent', name: '腾讯视频会员', description: '兑换后按填写手机号发放会员权益。', price: 100, stock: 10, enabled: true },
    { key: 'netease', name: '网易云音乐会员', description: '兑换后按填写手机号发放会员权益。', price: 100, stock: 10, enabled: true },
  ];
  const SOCIAL_PRESETS = [
    { label: '个人主页', url: 'https://', tone: 'website', platform: '' },
    { label: '个人博客', url: 'https://', tone: 'website', platform: '' },
    { label: 'Bilibili', url: 'https://space.bilibili.com/', tone: 'bilibili', platform: 'bilibili' },
    { label: 'GitHub', url: 'https://github.com/', tone: 'github', platform: 'github' },
    { label: '抖音', url: 'https://www.douyin.com/user/', tone: 'douyin', platform: 'douyin' },
    { label: 'Twitter', url: 'https://x.com/', tone: 'twitter', platform: 'twitter' },
  ];

  const els = {
    authView: $('#authView'),
    centerView: $('#centerView'),
    publicView: $('#publicView'),
    authEmailForm: $('#authEmailForm'),
    authRegisterForm: $('#authRegisterForm'),
    authResetForm: $('#authResetForm'),
    authIdentifierInput: $('#authIdentifierInput'),
    authLoginPasswordInput: $('#authLoginPasswordInput'),
    profileAvatar: $('#profileAvatar'),
    profileName: $('#profileName'),
    profileUid: $('#profileUid'),
    profileUsername: $('#profileUsername'),
    profileLevel: $('#profileLevel'),
    profileExperience: $('#profileExperience'),
    profileJoined: $('#profileJoined'),
    profileEmail: $('#profileEmail'),
    roleBadge: $('#roleBadge'),
    actionGrid: $('.uc-action-grid'),
    adminCard: $('#adminCard'),
    logoutBtn: $('#logoutBtn'),
    publicHero: $('#publicHero'),
    publicAvatar: $('#publicAvatar'),
    publicName: $('#publicName'),
    publicRole: $('#publicRole'),
    publicUid: $('#publicUid'),
    publicUsername: $('#publicUsername'),
    publicJoined: $('#publicJoined'),
    publicBio: $('#publicBio'),
    publicLevelCard: $('#publicLevelCard'),
    publicLinks: $('#publicLinks'),
    modalRoot: $('#modalRoot'),
    toast: $('#toast'),
  };

  if (!els.authView || !els.centerView || !els.authEmailForm) return;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function iconSvg(name) {
    const icons = {
      close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
      back: '<path d="M15 18l-6-6 6-6"/>',
      up: '<path d="m18 15-6-6-6 6"/>',
      down: '<path d="m6 9 6 6 6-6"/>',
      plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
      delete: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.close}</svg>`;
  }

  function normalizeBadgeColor(value) {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : '';
  }

  function applyRoleBadge(element, user) {
    if (!element) return;
    const badge = user?.badgeLabel || (user?.role === 'admin' ? '博主' : '');
    const color = normalizeBadgeColor(user?.badgeColor);
    element.textContent = badge;
    element.classList.toggle('is-hidden', !badge);
    if (color) {
      element.style.setProperty('--uc-badge-color', color);
    } else {
      element.style.removeProperty('--uc-badge-color');
    }
  }

  function initials(user) {
    const source = user?.displayName || user?.username || '?';
    return source.trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(user, className = 'uc-mini-avatar') {
    if (user?.avatarUrl) {
      return `<span class="${className}"><img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.displayName)} 的头像" /></span>`;
    }
    return `<span class="${className}" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
  }

  function setAvatar(element, user) {
    if (!element) return;
    if (user?.avatarUrl) {
      element.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.displayName)} 的头像" />`;
    } else {
      element.textContent = initials(user);
    }
  }

  function showToast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('is-error', isError);
    els.toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 3000);
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function storedUser() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_USER_KEY) || sessionStorage.getItem(SESSION_USER_KEY) || 'null') || commentSession?.user || null;
    } catch (error) {
      return commentSession?.user || null;
    }
  }

  function persistSession(user, token) {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(COMMENT_SESSION_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(COMMENT_SESSION_KEY);
    const storage = state.rememberSession ? localStorage : sessionStorage;
    if (token) storage.setItem(SESSION_TOKEN_KEY, token);
    if (user) storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    if (token && user) storage.setItem(COMMENT_SESSION_KEY, JSON.stringify({ sessionToken: token, user, savedAt: Date.now() }));
  }

  function clearStoredSession() {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(COMMENT_SESSION_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(COMMENT_SESSION_KEY);
    state.sessionToken = '';
  }

  function profileHandleFromLocation() {
    const url = new URL(window.location.href);
    const query = url.searchParams.get('user') || url.searchParams.get('u') || url.searchParams.get('handle');
    if (query) return query.replace(/^@/, '').trim();
    const match = url.pathname.match(/\/user-center\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]).replace(/^@/, '').trim() : '';
  }

  function levelFromExperience(experienceValue) {
    const experience = Math.max(0, Math.floor(Number(experienceValue) || 0));
    let level = 1;
    let spent = 0;
    while (experience >= spent + level && level < 99) {
      spent += level;
      level += 1;
    }
    const progress = Math.max(0, experience - spent);
    return {
      experience,
      level,
      label: `Lv.${level}`,
      nextLevel: level + 1,
      progress,
      nextRequired: level,
      toNext: Math.max(0, level - progress),
    };
  }

  function levelMeta(user) {
    const computed = levelFromExperience(user?.commentExperience || user?.commentCount || 0);
    return {
      ...computed,
      level: Number(user?.commentLevel || computed.level),
      label: user?.commentLevelLabel || computed.label,
      nextLevel: Number(user?.commentNextLevel || computed.nextLevel),
      progress: Number(user?.commentProgress ?? computed.progress),
      nextRequired: Number(user?.commentNextRequired || computed.nextRequired),
      toNext: Number(user?.commentToNext ?? computed.toNext),
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
      .filter((item) => includeDisabled || item.enabled !== false)
      .map((item) => ({
        key: String(item.key || '').trim(),
        name: String(item.name || item.label || '').trim(),
        description: String(item.description || item.content || '').trim(),
        price: Math.max(1, Math.floor(Number(item.price || item.cost || 100) || 100)),
        stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
        imageUrl: String(item.imageUrl || item.coverUrl || item.previewUrl || '').trim(),
        enabled: item.enabled !== false,
      }))
      .filter((item) => item.key && item.name);
  }

  function shopImageHtml(item, className = 'uc-shop-image', attrs = '') {
    const label = item?.name || '商品';
    if (item?.imageUrl) {
      return `<span class="${className}"${attrs}><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(label)} 预览图" loading="lazy" /></span>`;
    }
    return `<span class="${className} is-empty" aria-hidden="true"${attrs}>${escapeHtml(label.slice(0, 1))}</span>`;
  }

  function redemptionStatusLabel(status) {
    if (status === 'processing') return '处理中';
    if (status === 'completed') return '已完成';
    if (status === 'cancelled') return '已取消';
    return '待处理';
  }

  function socialLinks(user) {
    return Array.isArray(user?.socialLinks)
      ? user.socialLinks
        .map((item) => ({
          label: String(item?.label || item?.name || '').trim(),
          url: String(item?.url || item?.href || item?.link || '').trim(),
          platform: String(item?.platform || '').trim(),
        }))
        .filter((item) => item.label && item.url)
      : [];
  }

  function renderLevelCard(user) {
    const meta = levelMeta(user);
    const points = pointsMeta(user, meta);
    const percent = Math.max(0, Math.min(100, (meta.progress / Math.max(1, meta.nextRequired)) * 100));
    return `
      <div class="uc-level-summary">
        <strong>${escapeHtml(meta.label)}</strong>
        <span>经验 ${escapeHtml(meta.experience)}</span>
      </div>
      <div class="uc-level-progress"><i style="width:${percent}%"></i></div>
      <p>距离 Lv.${escapeHtml(meta.nextLevel)} 还需 ${escapeHtml(meta.toNext)} 点经验。</p>
      <div class="uc-point-row">
        <span>可用积分 <strong>${escapeHtml(points.available)}</strong></span>
        <small>每 10 级 +1，兑换消耗积分</small>
      </div>
    `;
  }

  function renderSocialLinks(user) {
    const links = socialLinks(user);
    const website = user?.websiteUrl ? [{ label: '个人网站', url: user.websiteUrl }] : [];
    const allLinks = [...website, ...links];
    if (!allLinks.length) return '<p class="uc-empty">这个用户还没有公开主页链接。</p>';
    return allLinks.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`).join('');
  }

  function socialPresetForLabel(label, platform) {
    const normalized = String(label || '').trim().toLowerCase();
    const byPlatform = SOCIAL_PRESETS.find((preset) => preset.platform && platform && preset.platform === String(platform).toLowerCase());
    return byPlatform || SOCIAL_PRESETS.find((preset) => preset.label.toLowerCase() === normalized) || SOCIAL_PRESETS.find((preset) => normalized === preset.tone) || SOCIAL_PRESETS.find((preset) => preset.tone === 'website');
  }

  function socialEditorItemHtml(item, index, total) {
    const preset = socialPresetForLabel(item.label, item.platform);
    const label = item.label || preset.label || '链接';
    return `
      <article class="uc-social-item is-${escapeHtml(preset.tone || 'website')}" data-social-index="${index}">
        <div class="uc-social-item-head">
          <span class="uc-social-platform">
            <i aria-hidden="true"></i>
            <strong data-social-name="${index}">${escapeHtml(label)}</strong>
          </span>
          <div class="uc-social-tools">
            <button type="button" data-social-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="上移">${iconSvg('up')}</button>
            <button type="button" data-social-move="${index}" data-direction="1" ${index === total - 1 ? 'disabled' : ''} aria-label="下移">${iconSvg('down')}</button>
            <button type="button" data-social-delete="${index}" aria-label="删除">${iconSvg('delete')}</button>
          </div>
        </div>
        <input class="uc-social-url" data-social-url="${index}" value="${escapeHtml(item.url || '')}" placeholder="${escapeHtml(preset?.url || 'https://example.com')}" />
      </article>
    `;
  }

  function mountSocialEditor(user) {
    const editor = root.querySelector('[data-social-editor]');
    if (!editor) return;
    let links = socialLinks(user).slice(0, SOCIAL_LIMIT);
    const list = editor.querySelector('[data-social-list]');
    const count = editor.querySelector('[data-social-count]');
    const addButton = editor.querySelector('[data-social-add-toggle]');

    const render = () => {
      list.innerHTML = links.length
        ? links.map((item, index) => socialEditorItemHtml(item, index, links.length)).join('')
        : '<p class="uc-empty">还没有社交链接。</p>';
      count.textContent = `${links.length} / ${SOCIAL_LIMIT}`;
      addButton.disabled = links.length >= SOCIAL_LIMIT;
      editor.classList.toggle('is-full', links.length >= SOCIAL_LIMIT);
    };

    editor.collectLinks = () => links
      .map((item) => ({
        label: String(item.label || '').trim(),
        url: String(item.url || '').trim(),
        platform: String(item.platform || '').trim(),
      }))
      .filter((item) => item.label && item.url);

    editor.addEventListener('input', (event) => {
      const urlIndex = event.target.dataset.socialUrl;
      if (urlIndex !== undefined) {
        links[Number(urlIndex)].url = event.target.value;
      }
    }, { signal });

    editor.addEventListener('click', (event) => {
      const add = event.target.closest('[data-social-add]');
      const move = event.target.closest('[data-social-move]');
      const remove = event.target.closest('[data-social-delete]');

      if (add && links.length < SOCIAL_LIMIT) {
        const preset = SOCIAL_PRESETS.find((item) => item.label === add.dataset.socialAdd) || SOCIAL_PRESETS[0];
        links.push({ label: preset.label, url: '', platform: preset.platform || '' });
        render();
        list.querySelector(`[data-social-url="${links.length - 1}"]`)?.focus();
        return;
      }

      if (move) {
        const from = Number(move.dataset.socialMove);
        const to = from + Number(move.dataset.direction);
        if (to >= 0 && to < links.length) {
          [links[from], links[to]] = [links[to], links[from]];
          render();
        }
        return;
      }

      if (remove) {
        links.splice(Number(remove.dataset.socialDelete), 1);
        render();
      }
    }, { signal });

    render();
  }

  function collectSocialLinksFromEditor(form) {
    return form.querySelector('[data-social-editor]')?.collectLinks?.() || [];
  }

  function cssImageUrl(value) {
    return `url("${String(value || '').replace(/["\\\n\r]/g, (char) => encodeURIComponent(char))}")`;
  }

  function findEmailInValue(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match?.[0] || '';
    }
    if (typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (/mail|email/i.test(key) && typeof value[key] === 'string') {
          const found = findEmailInValue(value[key]);
          if (found) return found;
        }
      }
      for (const nested of Object.values(value)) {
        const found = findEmailInValue(nested);
        if (found) return found;
      }
    }
    return '';
  }

  function detectTwikooEmail() {
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || '';
        const raw = localStorage.getItem(key) || '';
        if (!/twikoo|comment|mail|email/i.test(`${key} ${raw}`)) continue;
        const direct = findEmailInValue(raw);
        if (direct) return direct;
        try {
          const parsed = JSON.parse(raw);
          const nested = findEmailInValue(parsed);
          if (nested) return nested;
        } catch (error) {
          // Non-JSON storage values are expected here.
        }
      }
    } catch (error) {
      return '';
    }
    return '';
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    els.authEmailForm.classList.toggle('is-hidden', mode !== 'login');
    els.authRegisterForm.classList.toggle('is-hidden', mode !== 'register');
    els.authResetForm?.classList.toggle('is-hidden', mode !== 'reset');
    const email = detectTwikooEmail();
    if (mode === 'login') {
      if (!els.authIdentifierInput.value && email) els.authIdentifierInput.value = email;
      requestAnimationFrame(() => els.authIdentifierInput.focus());
      return;
    }

    const targetForm = mode === 'reset' ? els.authResetForm : els.authRegisterForm;
    if (targetForm?.elements.email && !targetForm.elements.email.value && email) {
      targetForm.elements.email.value = email;
    }
    if (mode === 'register' && targetForm?.elements.username && !targetForm.elements.username.value) {
      const username = makeUsernameFromEmail(targetForm.elements.email.value || email || 'user@example.com');
      targetForm.elements.username.value = username;
      targetForm.elements.displayName.value = targetForm.elements.displayName.value || username;
    }
    requestAnimationFrame(() => targetForm?.querySelector('input')?.focus());
  }

  function makeUsernameFromEmail(email) {
    const localPart = email.split('@')[0] || 'user';
    return localPart.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32).padEnd(3, '0');
  }

  const captchaLoaderPromises = new Map();
  let geetestLoaderPromise = null;

  function loadScriptOnce(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    if (captchaLoaderPromises.has(src)) return captchaLoaderPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('人机验证脚本加载失败，请检查网络后重试。'));
      document.head.appendChild(script);
    });
    captchaLoaderPromises.set(src, promise);
    return promise;
  }

  function ensureCaptchaMount(provider) {
    let mount = document.querySelector('#ucCaptchaMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'ucCaptchaMount';
      mount.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:rgba(24,28,39,.38);backdrop-filter:blur(8px);';
      document.body.appendChild(mount);
    }
    mount.innerHTML = `
      <div style="display:grid;gap:14px;width:min(360px,calc(100vw - 32px));padding:18px;border-radius:16px;background:var(--efu-card-bg,#fff);box-shadow:0 18px 48px rgba(0,0,0,.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <strong style="color:var(--efu-fontcolor,#202124);font-size:16px;">${escapeHtml(provider)} 人机验证</strong>
          <button type="button" data-uc-captcha-close aria-label="关闭验证" style="width:32px;height:32px;border:0;border-radius:50%;background:var(--efu-secondbg,#f4f6f8);color:var(--efu-fontcolor,#202124);cursor:pointer;display:grid;place-items:center;">${iconSvg('close')}</button>
        </div>
        <div id="ucCaptchaSlot" style="display:grid;place-items:center;min-height:78px;"></div>
      </div>
    `;
    return { mount, slot: mount.querySelector('#ucCaptchaSlot') };
  }

  function closeCaptchaMount() {
    document.querySelector('#ucCaptchaMount')?.remove();
  }

  async function runSiteTokenCaptcha(provider) {
    const siteKey = state.captcha?.siteKey;
    if (!siteKey) throw new Error(`${provider} Site Key 未配置，请检查 Twikoo 评论管理后台。`);
    const scripts = {
      Turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      hCaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
      reCAPTCHA: 'https://www.google.com/recaptcha/api.js?render=explicit',
    };
    await loadScriptOnce(scripts[provider]);
    return new Promise((resolve, reject) => {
      const { mount, slot } = ensureCaptchaMount(provider);
      const finish = (token) => { closeCaptchaMount(); resolve(token); };
      const fail = () => { closeCaptchaMount(); reject(new Error('人机验证失败，请重新验证。')); };
      mount.querySelector('[data-uc-captcha-close]')?.addEventListener('click', () => {
        closeCaptchaMount();
        reject(new Error('请先完成人机验证。'));
      }, { once: true });
      if (provider === 'Turnstile' && window.turnstile) return window.turnstile.render(slot, { sitekey: siteKey, callback: finish, 'error-callback': fail, 'expired-callback': fail });
      if (provider === 'hCaptcha' && window.hcaptcha) return window.hcaptcha.render(slot, { sitekey: siteKey, callback: finish, 'error-callback': fail, 'expired-callback': fail });
      if (provider === 'reCAPTCHA' && window.grecaptcha) return window.grecaptcha.render(slot, { sitekey: siteKey, callback: finish, 'error-callback': fail, 'expired-callback': fail });
      return fail();
    });
  }

  async function runGeetestCaptcha() {
    const captchaId = state.captcha?.geetestCaptchaId;
    if (!captchaId) throw new Error('极验 Captcha ID 未配置，请检查 Twikoo 评论管理后台。');
    geetestLoaderPromise = geetestLoaderPromise || loadScriptOnce('https://static.geetest.com/v4/gt4.js');
    await geetestLoaderPromise;
    if (typeof window.initGeetest4 !== 'function') throw new Error('极验脚本未就绪，请刷新后重试。');
    return new Promise((resolve, reject) => {
      window.initGeetest4({ captchaId, product: 'bind', language: 'zho' }, (captcha) => {
        captcha.onReady(() => captcha.showCaptcha());
        captcha.onSuccess(() => resolve(captcha.getValidate()));
        captcha.onError(() => reject(new Error('人机验证失败，请重新验证。')));
        captcha.onClose?.(() => reject(new Error('请先完成人机验证。')));
      });
    });
  }

  async function runCaptchaChallenge() {
    if (!state.captcha?.enabled) return null;
    if (state.captcha.provider === 'Geetest') return runGeetestCaptcha();
    if (['Turnstile', 'hCaptcha', 'reCAPTCHA'].includes(state.captcha.provider)) return runSiteTokenCaptcha(state.captcha.provider);
    throw new Error(`暂不支持 ${state.captcha.provider || '当前'} 人机验证前端。`);
  }

  async function requestVerificationCode(form, purpose, submitter) {
    const isOldEmail = purpose === 'changeEmailOld';
    const email = isOldEmail
      ? (state.currentUser?.email || form?.elements.oldEmail?.value || '').trim().toLowerCase()
      : form?.elements.email?.value.trim().toLowerCase();
    if (!email) throw new Error('请先填写邮箱。');
    submitter.disabled = true;
    try {
      const captcha = await runCaptchaChallenge();
      await api('requestCode', { method: 'POST', body: { email, purpose, captcha } });
      showToast('验证码已发送，请检查邮箱。');
      form.elements.code?.focus();
    } finally {
      submitter.disabled = false;
    }
  }

  function buildApiUrl(action, params = {}) {
    const base = config.apiUrl || '/api/demo';
    const url = new URL(base, window.location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    return url.toString();
  }

  function requestAdminToken() {
    const token = window.prompt('请输入管理员令牌');
    if (!token) return false;
    state.adminToken = token.trim();
    localStorage.setItem('twikooDemoAdminToken', state.adminToken);
    return true;
  }

  async function api(action, options = {}) {
    const headers = {};
    const fetchOptions = { method: options.method || 'GET', headers };

    if (state.adminToken) headers['x-admin-token'] = state.adminToken;
    if (state.sessionToken) headers['x-session-token'] = state.sessionToken;
    if (options.body) {
      headers['content-type'] = 'application/json';
      fetchOptions.body = JSON.stringify({
        ...options.body,
        ...(state.sessionToken ? { sessionToken: state.sessionToken } : {}),
      });
    }

    let response;
    try {
      response = await fetch(buildApiUrl(action, options.params), fetchOptions);
    } catch (error) {
      throw new Error('无法连接用户中心后端，请检查 Twikoo 部署或跨域配置。');
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if ((!response.ok || !payload.ok) && options.admin && !options.retried && response.status === 401 && state.adminProtected && requestAdminToken()) {
      return api(action, { ...options, retried: true });
    }
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.message || '请求失败。');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return '未知';
    const date = new Date(value);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function updateShell() {
    const user = state.currentUser;
    if (!user) {
      els.authView.classList.remove('is-hidden');
      els.centerView.classList.add('is-hidden');
      els.publicView?.classList.add('is-hidden');
      closeModal();
      return;
    }

    els.authView.classList.add('is-hidden');
    els.centerView.classList.remove('is-hidden');
    els.publicView?.classList.add('is-hidden');
    setAvatar(els.profileAvatar, user);
    if (els.centerView) {
      if (user.backgroundUrl) {
        els.centerView.style.setProperty('--uc-profile-cover', cssImageUrl(user.backgroundUrl));
        els.centerView.classList.add('has-profile-cover');
      } else {
        els.centerView.style.removeProperty('--uc-profile-cover');
        els.centerView.classList.remove('has-profile-cover');
      }
    }
    els.profileName.textContent = user.displayName;
    els.profileUid.textContent = `UID: ${user.uid || user.id.slice(0, 5)}`;
    els.profileUsername.textContent = `@${user.username || user.uid || user.id.slice(0, 5)}`;
    const shellLevel = levelMeta(user);
    if (els.profileLevel) els.profileLevel.textContent = `评论等级 ${shellLevel.label}`;
    if (els.profileExperience) els.profileExperience.textContent = `经验 ${shellLevel.experience}`;
    els.profileJoined.textContent = `加入于 ${formatDate(user.createdAt)}`;
    els.profileEmail.textContent = user.email;
    applyRoleBadge(els.roleBadge, user);
    els.adminCard.classList.toggle('is-hidden', user.role !== 'admin');
  }

  function updatePublicProfile(user) {
    state.publicUser = user;
    els.authView.classList.add('is-hidden');
    els.centerView.classList.add('is-hidden');
    els.publicView.classList.remove('is-hidden');
    setAvatar(els.publicAvatar, user);
    if (user.backgroundUrl) {
      els.publicHero.style.setProperty('--uc-profile-cover', cssImageUrl(user.backgroundUrl));
      els.publicHero.classList.add('has-profile-cover');
    } else {
      els.publicHero.style.removeProperty('--uc-profile-cover');
      els.publicHero.classList.remove('has-profile-cover');
    }
    els.publicName.textContent = user.displayName || user.username || '用户资料';
    applyRoleBadge(els.publicRole, user);
    els.publicUid.textContent = `UID: ${user.uid || String(user.id || '').slice(0, 5)}`;
    els.publicUsername.textContent = `@${user.username || user.uid || String(user.id || '').slice(0, 5)}`;
    els.publicJoined.textContent = `加入于 ${formatDate(user.createdAt)}`;
    els.publicBio.textContent = user.bio || '这个用户还没有写简介。';
    els.publicLevelCard.innerHTML = renderLevelCard(user);
    els.publicLinks.innerHTML = renderSocialLinks(user);
  }

  async function refreshHealth() {
    try {
      const health = await api('health');
      state.adminProtected = Boolean(health.adminProtected);
      state.captcha = health.captcha || { enabled: false, provider: '' };
    } catch (error) {
      state.adminProtected = false;
      state.captcha = { enabled: false, provider: '' };
    }
  }

  async function login(credentials, silent = false) {
    const result = await api('login', { method: 'POST', body: credentials });
    state.currentUser = result.user;
    state.sessionToken = result.sessionToken || '';
    persistSession(state.currentUser, state.sessionToken);
    updateShell();
    if (!silent) showToast('已进入用户中心。');
  }

  function openModal(title, body, options = {}) {
    const backAttrs = options.backPanel
      ? ` data-panel="${escapeHtml(options.backPanel)}"`
      : options.backAuthMode
        ? ` data-auth-mode="${escapeHtml(options.backAuthMode)}"`
        : options.backShop
          ? ' data-shop-back'
          : options.backRedeem
            ? ` data-redeem-start="${escapeHtml(options.backRedeem)}"`
            : '';
    els.modalRoot.innerHTML = `
      <div class="uc-modal-card ${options.wide ? 'uc-modal-card-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        ${backAttrs ? `<button class="uc-modal-back" type="button"${backAttrs} aria-label="返回">${iconSvg('back')}</button>` : ''}
        <button class="uc-modal-close" type="button" data-close-modal aria-label="关闭弹窗">${iconSvg('close')}</button>
        <div class="uc-modal-head">
          <h2 id="modalTitle">${escapeHtml(title)}</h2>
        </div>
        ${body}
      </div>
    `;
    els.modalRoot.classList.remove('is-hidden');
  }

  function closeModal() {
    if (state.deleteTimer) {
      clearInterval(state.deleteTimer);
      state.deleteTimer = null;
    }
    els.modalRoot.classList.add('is-hidden');
    els.modalRoot.innerHTML = '';
  }

  function renderAuthOptionsModal() {
    openModal('登录 / 注册', `
      <div class="uc-auth-options">
        <button class="uc-auth-option-card" type="button" data-auth-mode="register">
          <strong>注册账号</strong>
          <small>使用邮箱验证码创建评论身份</small>
        </button>
        <button class="uc-auth-option-card" type="button" data-auth-mode="reset">
          <strong>忘记密码</strong>
          <small>通过邮箱验证码重置密码</small>
        </button>
      </div>
    `, { backAuthMode: 'login' });
  }

  function openPanel(name) {
    if (!state.currentUser) return;
    const renderers = {
      profile: renderProfileModal,
      edit: renderEditModal,
      social: renderSocialModal,
      password: renderPasswordModal,
      security: renderSecurityModal,
      changeEmail: renderChangeEmailModal,
      forgotPassword: renderForgotPasswordModal,
      deleteAccount: renderDeleteAccountModal,
      notice: renderNoticeModal,
      level: renderLevelModal,
      shop: renderShopModal,
      admin: renderAdminModal,
    };
    renderers[name]?.();
  }

  function renderProfileModal() {
    const user = state.currentUser;
    openModal('个人资料', `
      <form id="editProfileForm" class="uc-avatar-editor">
        <div class="uc-panel-head uc-field-wide">
          <div>
            <strong>个人资料</strong>
            <small>直接维护昵称、用户名、头像、主页和简介；社交链接在单独列表里管理。</small>
          </div>
        </div>
        <div id="editAvatarPreview" class="uc-profile-avatar">${escapeHtml(initials(user))}</div>
        <div class="uc-form">
          <label class="uc-field">
            <span>注册邮箱</span>
            <input value="${escapeHtml(user.email)}" disabled />
            <small>注册邮箱用于账号识别，默认固定展示在资料顶部。</small>
          </label>
          <label class="uc-field">
            <span>昵称</span>
            <input name="displayName" maxlength="64" value="${escapeHtml(user.displayName)}" />
            <small>昵称用于展示，可以和其他用户相同。</small>
          </label>
          <label class="uc-field">
            <span>用户名（@ 后面的字符）</span>
            <input name="username" minlength="3" maxlength="32" value="${escapeHtml(user.username || '')}" placeholder="zeora" />
            <small>仅支持英文、数字、下划线、点和短横线；全站唯一，30 天内只能修改一次。</small>
          </label>
          <label class="uc-field">
            <span>头像外链</span>
            <input id="avatarUrlInput" name="avatarUrl" value="${escapeHtml(user.avatarUrl || '')}" placeholder="https://example.com/avatar.png" />
          </label>
          <label class="uc-field">
            <span>主页背景图</span>
            <input name="backgroundUrl" value="${escapeHtml(user.backgroundUrl || '')}" placeholder="https://example.com/cover.jpg" />
          </label>
          <label class="uc-field">
            <span>个人主页 / 个人博客</span>
            <input name="websiteUrl" value="${escapeHtml(user.websiteUrl || '')}" placeholder="https://example.com" />
          </label>
          <label class="uc-field">
            <span>个人简介</span>
            <input name="bio" maxlength="120" value="${escapeHtml(user.bio || '')}" placeholder="一句话介绍自己" />
          </label>
          <button class="uc-ghost-btn uc-profile-add-link" type="button" data-panel="social"><span>${iconSvg('plus')}</span> 管理社交链接</button>
          <div class="uc-profile-footer">
            <button class="uc-ghost-btn" type="button" data-panel="password" data-back-panel="profile">更改密码</button>
            <button class="uc-primary-btn" type="submit">保存资料</button>
            <button class="uc-ghost-btn" type="button" data-modal-logout>退出登录</button>
          </div>
        </div>
      </form>
    `);
    wireProfileAvatarPreview(user);
  }

  function renderSocialModal() {
    const user = state.currentUser;
    openModal('个人资料', `
      <form id="socialLinksForm" class="uc-form uc-social-panel">
        <div class="uc-panel-head">
          <div>
            <strong>个人资料</strong>
            <small>编辑社交链接，填写主页网址并调整展示顺序。</small>
          </div>
          <button class="uc-ghost-btn" type="button" data-panel="profile">返回</button>
        </div>
        <div class="uc-social-editor" data-social-editor>
          <div class="uc-social-list-editor" data-social-list></div>
          <div class="uc-social-footer">
            <div class="uc-social-add">
              <button class="uc-ghost-btn uc-social-add-pill" type="button" data-social-add-toggle><span>${iconSvg('plus')}</span> 新增</button>
              <div class="uc-social-menu">
                ${SOCIAL_PRESETS.map((item) => `<button type="button" data-social-add="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`).join('')}
              </div>
            </div>
            <span data-social-count>0 / ${SOCIAL_LIMIT}</span>
          </div>
        </div>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">保存社交链接</button>
        </div>
      </form>
    `, { backPanel: 'profile' });
    mountSocialEditor(user);
  }

  function renderEditModal() {
    renderProfileModal();
  }

  function wireProfileAvatarPreview(user) {
    const preview = root.querySelector('#editAvatarPreview');
    const input = root.querySelector('#avatarUrlInput');
    if (!preview || !input) return;
    setAvatar(preview, user);
    input.addEventListener('input', () => {
      setAvatar(preview, { ...user, avatarUrl: input.value.trim() });
    }, { signal });
  }

  function renderLevelModal() {
    openModal('等级详情', `
      <div class="uc-level-modal">
        ${renderLevelCard(state.currentUser)}
      </div>
    `);
  }

  function renderShopModal(refreshCatalog = !state.shopItems.length) {
    const points = pointsMeta(state.currentUser);
    const items = shopItems();
    openModal('积分商城', `
      <div class="uc-shop-panel">
        <div class="uc-shop-balance">
          <span>可用积分</span>
          <strong>${escapeHtml(points.available)}</strong>
          <small>评论等级每升 10 级获得 1 积分。</small>
        </div>
        <div class="uc-shop-grid">
          ${items.map((item) => `
            <article class="uc-shop-item">
              ${shopImageHtml(item)}
              <strong>${escapeHtml(item.name)}</strong>
              ${item.description ? `<p class="uc-shop-desc">${escapeHtml(item.description)}</p>` : ''}
              <span>${escapeHtml(item.price)} 积分 · 剩余 ${escapeHtml(item.stock)}</span>
              <button class="uc-primary-btn" type="button" data-redeem-start="${escapeHtml(item.key)}" ${points.available < item.price || item.stock <= 0 ? 'disabled' : ''}>兑换</button>
            </article>
          `).join('')}
        </div>
        ${(state.currentUser.shopRedemptions || []).length ? `
          <div class="uc-shop-history">
            <h3>兑换记录</h3>
            ${(state.currentUser.shopRedemptions || []).slice().reverse().map((item) => `
              <p><span>${escapeHtml(item.itemLabel)}</span><small>${escapeHtml(redemptionStatusLabel(item.status))} · ${escapeHtml(formatDate(item.createdAt))}</small></p>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `);
    if (refreshCatalog) {
      loadShopCatalog().then(() => {
        if (!els.modalRoot.classList.contains('is-hidden') && root.querySelector('[data-redeem-start]')) renderShopModal(false);
      });
    }
  }

  function renderRedeemConfirm(key) {
    const points = pointsMeta(state.currentUser);
    const item = shopItems().find((candidate) => candidate.key === key);
    if (!item) {
      showToast('这个商品暂时不可兑换。', true);
      return;
    }
    openModal('确认兑换', `
      <div class="uc-redeem-confirm">
        <div>
          <span>兑换商品</span>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <small>${escapeHtml(item.price)} 积分 · 当前可用 ${escapeHtml(points.available)} 积分 · 剩余 ${escapeHtml(item.stock)}</small>
        </div>
        <p>确认后需要填写手机号，提交成功后预计 10 个工作日内到账。</p>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="button" data-redeem-phone="${escapeHtml(item.key)}">确认兑换</button>
          <button class="uc-ghost-btn" type="button" data-shop-back>返回商城</button>
        </div>
      </div>
    `, { backShop: true });
  }

  function renderRedeemPhone(key) {
    const item = shopItems().find((candidate) => candidate.key === key);
    if (!item) {
      showToast('这个商品暂时不可兑换。', true);
      return;
    }
    openModal('填写手机号', `
      <form id="redeemRewardForm" class="uc-form uc-redeem-form" data-redeem-form="${escapeHtml(item.key)}">
        <div class="uc-redeem-summary">
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <small>${escapeHtml(item.price)} 积分，预计 10 个工作日内到账。</small>
        </div>
        <label class="uc-field">
          <span>手机号</span>
          <input name="phone" inputmode="tel" autocomplete="tel" required placeholder="请输入接收权益的手机号" />
        </label>
        <label class="uc-field">
          <span>备注（可选）</span>
          <textarea name="note" maxlength="200" rows="2" placeholder="例如：希望补充给管理员的说明"></textarea>
        </label>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">提交兑换</button>
          <button class="uc-ghost-btn" type="button" data-redeem-start="${escapeHtml(item.key)}">上一步</button>
        </div>
      </form>
    `, { backRedeem: item.key });
    root.querySelector('input[name="phone"]')?.focus();
  }

  function renderPasswordModal() {
    const backPanel = state.modalBackPanel || 'security';
    state.modalBackPanel = '';
    openModal('修改密码', `
      <form id="passwordForm" class="uc-form">
        <label class="uc-field">
          <span>当前密码</span>
          <input name="currentPassword" type="password" required autocomplete="current-password" />
        </label>
        <label class="uc-field">
          <span>新密码</span>
          <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" />
        </label>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">保存新密码</button>
          <button class="uc-ghost-btn" type="button" data-close-modal>取消</button>
        </div>
      </form>
    `, { backPanel });
  }

  function renderSecurityModal() {
    const user = state.currentUser || {};
    openModal('安全', `
      <div class="uc-security-panel">
        <div class="uc-panel-head">
          <div>
            <strong>账号安全</strong>
            <small>当前邮箱：${escapeHtml(user.email || '')}</small>
          </div>
        </div>
        <div class="uc-security-grid">
          <button class="uc-security-card" type="button" data-panel="changeEmail">
            <strong>修改邮箱</strong>
            <small>通过新邮箱验证码完成绑定</small>
          </button>
          <button class="uc-security-card" type="button" data-panel="forgotPassword">
            <strong>忘记密码</strong>
            <small>通过邮箱验证码重置密码</small>
          </button>
          <button class="uc-security-card" type="button" data-panel="password">
            <strong>修改密码</strong>
            <small>需要输入当前密码，修改后发送邮件通知</small>
          </button>
          <button class="uc-security-card is-danger" type="button" data-panel="deleteAccount">
            <strong>注销账号</strong>
            <small>注销后所有积分将全部作废</small>
          </button>
        </div>
        <div class="uc-form-actions">
          <button id="logoutBtn" class="uc-ghost-btn" type="button">退出当前账号</button>
        </div>
      </div>
    `, { backPanel: 'security' });
  }

  function renderChangeEmailModal() {
    const currentEmail = state.currentUser?.email || '';
    openModal('修改邮箱', `
      <form id="changeEmailForm" class="uc-form">
        <p class="uc-tip">修改邮箱需同时验证旧邮箱与新邮箱，请先完成两步验证。</p>
        <label class="uc-field">
          <span>当前邮箱</span>
          <input name="oldEmail" type="email" value="${escapeHtml(currentEmail)}" readonly />
        </label>
        <button class="uc-ghost-btn" type="button" data-modal-send-code="changeEmailOld">发送旧邮箱验证码</button>
        <label class="uc-field">
          <span>旧邮箱验证码</span>
          <input name="oldCode" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
        </label>
        <label class="uc-field">
          <span>新邮箱</span>
          <input name="email" type="email" required autocomplete="email" placeholder="name@example.com" />
        </label>
        <button class="uc-ghost-btn" type="button" data-modal-send-code="changeEmail">发送新邮箱验证码</button>
        <label class="uc-field">
          <span>新邮箱验证码</span>
          <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
        </label>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">保存新邮箱</button>
          <button class="uc-ghost-btn" type="button" data-panel="security">返回安全页</button>
        </div>
      </form>
    `, { backPanel: 'security' });
  }

  function renderForgotPasswordModal() {
    const email = state.currentUser?.email || '';
    openModal('忘记密码', `
      <form id="forgotPasswordForm" class="uc-form">
        <label class="uc-field">
          <span>账号邮箱</span>
          <input name="email" type="email" required autocomplete="email" value="${escapeHtml(email)}" />
        </label>
        <button class="uc-ghost-btn" type="button" data-modal-send-code="reset">发送验证码</button>
        <label class="uc-field">
          <span>邮箱验证码</span>
          <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 位验证码" />
        </label>
        <label class="uc-field">
          <span>新密码</span>
          <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" />
        </label>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">重置密码</button>
          <button class="uc-ghost-btn" type="button" data-panel="security">返回安全页</button>
        </div>
      </form>
    `);
  }

  function renderDeleteAccountModal() {
    openModal('注销账号', `
      <div class="uc-delete-panel">
        <strong>注销后所有积分将全部作废。</strong>
        <p>账号注销后，用户中心资料、商城积分和兑换资格都会失效。请确认你已经不再需要这个账号。</p>
        <div class="uc-delete-countdown" data-delete-countdown>请等待 10 秒后再确认注销</div>
        <div class="uc-form-actions">
          <button class="uc-danger-btn" type="button" data-delete-account-confirm disabled>确认注销</button>
          <button class="uc-ghost-btn" type="button" data-panel="security">返回安全页</button>
        </div>
      </div>
    `, { backPanel: 'security' });
    const button = root.querySelector('[data-delete-account-confirm]');
    const label = root.querySelector('[data-delete-countdown]');
    let remaining = 10;
    state.deleteTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        if (label) label.textContent = `请等待 ${remaining} 秒后再确认注销`;
        return;
      }
      clearInterval(state.deleteTimer);
      state.deleteTimer = null;
      if (label) label.textContent = '现在可以确认注销。';
      if (button) button.disabled = false;
    }, 1000);
  }

  function renderNoticeModal() {
    const notifications = state.currentUser.notifications || {};
    openModal('通知设置', `
      <form id="noticeForm" class="uc-form">
        <div class="uc-switch-list">
          <label class="uc-switch-row">
            <span><strong>邮件回复提醒</strong><small>有人回复评论时发送邮件</small></span>
            <input name="emailReplies" type="checkbox" ${notifications.emailReplies ? 'checked' : ''} />
          </label>
          <label class="uc-switch-row">
            <span><strong>系统通知</strong><small>账号状态或站点消息提醒</small></span>
            <input name="emailSystem" type="checkbox" ${notifications.emailSystem ? 'checked' : ''} />
          </label>
          <label class="uc-switch-row">
            <span><strong>浏览器推送</strong><small>预留给 Web Push 集成</small></span>
            <input name="browserPush" type="checkbox" ${notifications.browserPush ? 'checked' : ''} />
          </label>
        </div>
        <div class="uc-form-actions">
          <button class="uc-primary-btn" type="submit">保存通知设置</button>
          <button class="uc-ghost-btn" type="button" data-close-modal>取消</button>
        </div>
      </form>
    `);
  }

  async function renderAdminModal(panel = state.adminPanel || 'notice') {
    state.adminPanel = panel;
    openModal('管理', `
      <div class="uc-admin-tabs" aria-label="管理功能">
        ${[
          ['notice', '通知'],
          ['users', '用户'],
          ['shop', '商城'],
          ['ai', 'AI'],
          ['redemptions', '兑换'],
        ].map(([name, label]) => `<button type="button" data-admin-panel="${name}" class="${state.adminPanel === name ? 'is-active' : ''}">${label}</button>`).join('')}
      </div>
      <div id="adminPanelBody" class="uc-admin-panel-body"></div>
    `, { wide: true });

    renderAdminPanel();
  }

  function renderAdminPanel() {
    const body = root.querySelector('#adminPanelBody');
    if (!body) return;

    if (state.adminPanel === 'notice') {
      body.innerHTML = `
        <form id="adminNoticeForm" class="uc-form uc-admin-notice-form">
          <label class="uc-field">
            <span>类型</span>
            <select name="type"><option value="friend">友链通知</option><option value="comment">评论通知</option><option value="system">系统通知</option></select>
          </label>
          <label class="uc-field">
            <span>对象</span>
            <select name="target"><option value="all">全部用户</option><option value="user">指定用户</option></select>
          </label>
          <label class="uc-field">
            <span>指定用户</span>
            <input name="userId" placeholder="UID / 邮箱 / 用户名 / ID" />
          </label>
          <label class="uc-field">
            <span>链接</span>
            <input name="link" placeholder="/links/ 或 https://example.com" />
          </label>
          <label class="uc-field uc-field-wide">
            <span>标题</span>
            <input name="title" maxlength="80" placeholder="站点通知" />
          </label>
          <label class="uc-field uc-field-wide">
            <span>内容</span>
            <textarea name="body" maxlength="500" required placeholder="写给用户看的通知内容"></textarea>
          </label>
          <div class="uc-form-actions">
            <button class="uc-primary-btn" type="submit">发送通知</button>
          </div>
        </form>
      `;
      return;
    }

    if (state.adminPanel === 'shop') {
      body.innerHTML = `
        <div id="shopAdminWrap" class="uc-shop-admin-wrap">正在加载商品...</div>
      `;
      loadShopCatalog(true).then(renderShopAdminPanel);
      return;
    }

    if (state.adminPanel === 'ai') {
      body.innerHTML = '<div id="aiConfigWrap" class="uc-ai-config-wrap">正在加载 AI 配置...</div>';
      loadAiConfig();
      return;
    }

    if (state.adminPanel === 'redemptions') {
      body.innerHTML = `
        <div class="uc-admin-toolbar">
          <button class="uc-ghost-btn" type="button" data-redemption-refresh>刷新记录</button>
        </div>
        <div id="redemptionTableWrap" class="uc-table-wrap">正在加载兑换记录...</div>
      `;
      loadRedemptions();
      return;
    }

    body.innerHTML = `
      <div class="uc-admin-toolbar">
        <input id="adminSearch" type="search" placeholder="搜索用户、邮箱、UID" />
        <select id="adminRoleFilter">
          <option value="all">全部身份</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
        <select id="adminStatusFilter">
          <option value="all">全部状态</option>
          <option value="active">可用</option>
          <option value="blocked">停用</option>
        </select>
        <button id="adminRefresh" class="uc-ghost-btn" type="button">刷新列表</button>
      </div>
      <div id="adminTableWrap" class="uc-table-wrap">正在加载用户...</div>
    `;
    loadAdminUsers();
  }

  async function loadAdminUsers() {
    try {
      const payload = await api('listUsers', { admin: true });
      state.users = payload.users;
      renderAdminTable();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function filteredUsers() {
    return state.users.filter((user) => {
      const queryTarget = `${user.displayName} ${user.username} ${user.email} ${user.uid}`.toLowerCase();
      const matchesQuery = !state.filter.query || queryTarget.includes(state.filter.query);
      const matchesRole = state.filter.role === 'all' || user.role === state.filter.role;
      const matchesStatus = state.filter.status === 'all' || user.status === state.filter.status;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }

  function renderAdminTable() {
    const wrap = root.querySelector('#adminTableWrap');
    if (!wrap) return;
    const users = filteredUsers();
    if (!users.length) {
      wrap.innerHTML = '<p class="uc-empty">没有符合条件的用户。</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="uc-user-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>UID</th>
            <th>邮箱</th>
            <th>身份</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => `
            <tr data-user-id="${escapeHtml(user.id)}">
              <td>
                <div class="uc-user-line">
                  ${avatarHtml(user)}
                  <span><strong>${escapeHtml(user.displayName)}</strong><br />@${escapeHtml(user.username)}</span>
                </div>
              </td>
              <td>
                <div class="uc-uid-editor">
                  <input data-uid-input="${escapeHtml(user.id)}" maxlength="32" value="${escapeHtml(user.uid || '')}" placeholder="UID" />
                  <button type="button" data-save-uid="${escapeHtml(user.id)}">保存UID</button>
                </div>
              </td>
              <td>${escapeHtml(user.email)}</td>
              <td>
                <div class="uc-tag-editor">
                  <input data-badge-input="${escapeHtml(user.id)}" maxlength="20" value="${escapeHtml(user.badgeLabel || "")}" placeholder="例如：博主" />
                  <input data-badge-color="${escapeHtml(user.id)}" type="color" value="${escapeHtml(normalizeBadgeColor(user.badgeColor) || "#ff5f63")}" />
                  <button type="button" data-save-badge="${escapeHtml(user.id)}">保存</button>
                </div>
              </td>
              <td><span class="uc-status-pill ${user.status === 'blocked' ? 'is-blocked' : 'is-active'}">${user.status === 'blocked' ? '停用' : '可用'}</span></td>
              <td>
                <div class="uc-row-actions">
                  <button type="button" data-toggle-role="${escapeHtml(user.id)}">${user.role === 'admin' ? '移除管理员' : '设为管理员'}</button>
                  <button type="button" data-toggle-status="${escapeHtml(user.id)}">${user.status === 'blocked' ? '启用' : '停用'}</button>
                  <button class="uc-delete-user" type="button" data-delete="${escapeHtml(user.id)}">删除</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadAiConfig() {
    const wrap = root.querySelector('#aiConfigWrap');
    if (wrap) wrap.textContent = '正在加载 AI 配置...';
    try {
      const payload = await api('aiConfig', { method: 'POST', body: {}, admin: true });
      state.aiConfigs = payload.aiConfigs || [];
      state.aiConfig = payload.aiConfig || state.aiConfigs.find((item) => item.isDefault) || state.aiConfigs[0] || {};
      renderAiConfigPanel();
    } catch (error) {
      if (wrap) wrap.innerHTML = `<p class="uc-empty">${escapeHtml(error.message)}</p>`;
      showToast(error.message, true);
    }
  }

  function renderAiConfigPanel() {
    const wrap = root.querySelector('#aiConfigWrap');
    if (!wrap) return;
    const configs = state.aiConfigs || [];
    const editing = state.aiEditConfig;
    const isNew = state.aiEditingNew;
    let html = `
      <div class="uc-panel-head uc-field-wide">
        <div>
          <strong>AI 评论配置</strong>
          <small>评论区的 AI 回复和 AI 润色使用这里的 OpenAI-compatible 配置，可维护多套并切换默认。</small>
        </div>
      </div>
    `;
    if (editing) {
      html += `
      <form id="aiConfigForm" class="uc-form uc-ai-config-form">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        <div class="uc-panel-head uc-field-wide">
          <div>
            <strong>${isNew ? '新增 AI 配置' : '编辑 AI 配置'}</strong>
            <small>${isNew ? '创建一个新的 AI 服务配置。' : `正在编辑：${escapeHtml(editing.name || '未命名')}`}</small>
          </div>
          <button class="uc-ghost-btn" type="button" data-ai-cancel>返回列表</button>
        </div>
        <label class="uc-field">
          <span>配置名称</span>
          <input name="name" maxlength="40" value="${escapeHtml(editing.name || '')}" placeholder="例如：DeepSeek 主用" />
        </label>
        <label class="uc-switch-row">
          <span><strong>启用 AI 评论</strong><small>关闭后评论框不再生成或润色评论</small></span>
          <input name="enabled" type="checkbox" ${editing.enabled !== false ? 'checked' : ''} />
        </label>
        <label class="uc-switch-row">
          <span><strong>仅登录用户可用</strong><small>建议开启，避免访客消耗接口额度</small></span>
          <input name="requireLogin" type="checkbox" ${editing.requireLogin !== false ? 'checked' : ''} />
        </label>
        <label class="uc-field">
          <span>服务名称</span>
          <input name="provider" maxlength="40" value="${escapeHtml(editing.provider || 'DeepSeek')}" placeholder="DeepSeek" />
        </label>
        <label class="uc-field">
          <span>接口地址</span>
          <input name="apiBaseUrl" value="${escapeHtml(editing.apiBaseUrl || '')}" placeholder="https://api.deepseek.com/chat/completions" />
        </label>
        <label class="uc-field">
          <span>模型</span>
          <input name="model" maxlength="80" value="${escapeHtml(editing.model || 'deepseek-mimo')}" placeholder="deepseek-mimo" />
        </label>
        <label class="uc-field">
          <span>API Key</span>
          <input name="apiKey" autocomplete="off" placeholder="${editing.hasApiKey ? escapeHtml(editing.apiKeyMasked || '已配置，留空不修改') : '粘贴新的 API Key'}" />
          <small>${editing.hasApiKey ? `当前已配置：${escapeHtml(editing.apiKeyMasked || '已隐藏')}` : '尚未配置 API Key。'}</small>
        </label>
        <label class="uc-field">
          <span>温度</span>
          <input name="temperature" type="number" min="0" max="2" step="0.1" value="${escapeHtml(editing.temperature ?? 0.72)}" />
        </label>
        <label class="uc-field">
          <span>最大输出 tokens</span>
          <input name="maxTokens" type="number" min="60" max="1000" step="10" value="${escapeHtml(editing.maxTokens || 220)}" />
        </label>
        <label class="uc-field uc-field-wide">
          <span>系统提示词</span>
          <textarea name="systemPrompt" maxlength="1200" placeholder="控制评论风格、长度和语气">${escapeHtml(editing.systemPrompt || '')}</textarea>
        </label>
        <label class="uc-switch-mini uc-field-wide">
          <input name="isDefault" type="checkbox" ${editing.isDefault ? 'checked' : ''} /> 设为默认配置
        </label>
        <label class="uc-switch-mini uc-field-wide">
          <input name="clearApiKey" type="checkbox" /> 清除已保存的 API Key
        </label>
        <div class="uc-form-actions uc-field-wide">
          <button class="uc-primary-btn" type="submit">保存 AI 配置</button>
          <button class="uc-ghost-btn" type="button" data-ai-cancel>取消</button>
        </div>
      </form>
      `;
    } else {
      html += `
      <div class="uc-field-wide uc-ai-config-list">
        ${configs.length ? configs.map((item) => `
          <article class="uc-ai-config-card${item.isDefault ? ' is-default' : ''}">
            <div class="uc-ai-config-card-head">
              <strong>${escapeHtml(item.name || '未命名')}</strong>
              ${item.isDefault ? '<span class="uc-tag">默认</span>' : ''}
            </div>
            <div class="uc-ai-config-meta">${escapeHtml(item.provider || '-')} · ${escapeHtml(item.model || '-')}</div>
            <div class="uc-ai-config-meta">${item.hasApiKey ? 'API Key 已配置' : '未配置 API Key'} · 调用 ${escapeHtml(item.usage?.calls || 0)} 次 · tokens ${escapeHtml(item.usage?.totalTokens || 0)}</div>
            <div class="uc-ai-config-tools">
              <button class="uc-ghost-btn" type="button" data-ai-edit="${escapeHtml(item.id || '')}">编辑</button>
              ${item.isDefault ? '' : `<button class="uc-ghost-btn" type="button" data-ai-default="${escapeHtml(item.id || '')}">设为默认</button>`}
              <button class="uc-ghost-btn" type="button" data-ai-test="${escapeHtml(item.id || '')}">测试</button>
              <button class="uc-ghost-btn uc-danger-text" type="button" data-ai-delete="${escapeHtml(item.id || '')}">删除</button>
            </div>
          </article>
        `).join('') : '<p class="uc-empty">还没有 AI 配置，点击下方按钮新增。</p>'}
      </div>
      <div class="uc-form-actions uc-field-wide">
        <button class="uc-primary-btn" type="button" data-ai-new>新增配置</button>
      </div>
      `;
    }
    wrap.innerHTML = html;
  }

  async function loadShopCatalog(admin = false) {
    try {
      const payload = await api(admin ? 'adminShopCatalog' : 'shopCatalog', { method: admin ? 'POST' : 'GET', admin });
      state.shopItems = payload.items || [];
      return state.shopItems;
    } catch (error) {
      if (admin) showToast(error.message, true);
      return state.shopItems;
    }
  }

  function renderShopAdminPanel() {
    const wrap = root.querySelector('#shopAdminWrap');
    if (!wrap) return;
    const items = shopItems(true);
    wrap.innerHTML = `
      <div class="uc-shop-admin-grid">
        ${items.map((item) => `
          <form class="uc-shop-admin-card" data-shop-item-form="${escapeHtml(item.key)}">
            <input name="key" type="hidden" value="${escapeHtml(item.key)}" />
            <div class="uc-shop-admin-section uc-shop-admin-section-icon">
              <strong>封面管理</strong>
              ${shopImageHtml(item, 'uc-shop-admin-image', ` data-shop-image-preview="${escapeHtml(item.key)}"`)}
              <label class="uc-field"><span>商品封面</span><input name="imageUrl" value="${escapeHtml(item.imageUrl || '')}" placeholder="https://example.com/cover.jpg 或 /img/cover.jpg" data-shop-image-input="${escapeHtml(item.key)}" /></label>
            </div>
            <div class="uc-shop-admin-section">
              <strong>内容管理</strong>
              <label class="uc-field"><span>商品名称</span><input name="name" maxlength="40" value="${escapeHtml(item.name)}" /></label>
              <label class="uc-field"><span>商品说明</span><textarea name="description" maxlength="120" placeholder="兑换后按填写手机号发放会员权益。">${escapeHtml(item.description || '')}</textarea></label>
              <label class="uc-switch-mini"><input name="enabled" type="checkbox" ${item.enabled ? 'checked' : ''} /> 上架展示</label>
            </div>
            <div class="uc-shop-admin-section">
              <strong>积分与库存</strong>
              <label class="uc-field"><span>所需积分</span><input name="price" type="number" min="1" step="1" value="${escapeHtml(item.price)}" /></label>
              <label class="uc-field"><span>剩余库存</span><input name="stock" type="number" min="0" step="1" value="${escapeHtml(item.stock)}" /></label>
            </div>
            <button class="uc-primary-btn" type="submit">保存商品</button>
          </form>
        `).join('')}
        <form class="uc-shop-admin-card is-new" data-shop-item-form="new">
          <div class="uc-shop-admin-section uc-shop-admin-section-icon">
            <strong>封面管理</strong>
            <span class="uc-shop-admin-image is-empty" aria-hidden="true" data-shop-image-preview="new">+</span>
            <label class="uc-field"><span>商品封面</span><input name="imageUrl" placeholder="https://example.com/cover.jpg 或 /img/cover.jpg" data-shop-image-input="new" /></label>
          </div>
          <div class="uc-shop-admin-section">
            <strong>内容管理</strong>
            <label class="uc-field"><span>商品标识</span><input name="key" maxlength="32" placeholder="youku" required /></label>
            <label class="uc-field"><span>商品名称</span><input name="name" maxlength="40" placeholder="优酷会员" required /></label>
            <label class="uc-field"><span>商品说明</span><textarea name="description" maxlength="120" placeholder="兑换后按填写手机号发放会员权益。"></textarea></label>
            <label class="uc-switch-mini"><input name="enabled" type="checkbox" checked /> 上架展示</label>
          </div>
          <div class="uc-shop-admin-section">
            <strong>积分与库存</strong>
            <label class="uc-field"><span>所需积分</span><input name="price" type="number" min="1" step="1" value="100" /></label>
            <label class="uc-field"><span>剩余库存</span><input name="stock" type="number" min="0" step="1" value="10" /></label>
          </div>
          <button class="uc-primary-btn" type="submit">新增商品</button>
        </form>
      </div>
    `;
  }

  async function loadRedemptions() {
    const wrap = root.querySelector('#redemptionTableWrap');
    if (wrap) wrap.textContent = '正在加载兑换记录...';
    try {
      const payload = await api('listRedemptions', { method: 'POST', body: {}, admin: true });
      state.redemptions = payload.redemptions || [];
      renderRedemptionTable();
    } catch (error) {
      if (wrap) wrap.innerHTML = `<p class="uc-empty">${escapeHtml(error.message)}</p>`;
      showToast(error.message, true);
    }
  }

  function renderRedemptionTable() {
    const wrap = root.querySelector('#redemptionTableWrap');
    if (!wrap) return;
    if (!state.redemptions.length) {
      wrap.innerHTML = '<p class="uc-empty">还没有兑换申请。</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="uc-user-table uc-redemption-table">
        <thead><tr><th>用户</th><th>商品</th><th>手机号</th><th>状态</th><th>处理备注</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          ${state.redemptions.map((item) => `
            <tr>
              <td>${escapeHtml(item.user?.displayName || item.user?.username || '')}<br />UID: ${escapeHtml(item.user?.uid || '')}</td>
              <td>${escapeHtml(item.itemLabel)}<br />${escapeHtml(item.cost)} 积分</td>
              <td>${escapeHtml(item.phone || '')}</td>
              <td>
                <select data-redemption-status="${escapeHtml(item.id)}">
                  ${[
                    ['pending', '待处理'],
                    ['processing', '处理中'],
                    ['completed', '已完成'],
                    ['cancelled', '已取消'],
                  ].map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
              </td>
              <td><input data-redemption-note="${escapeHtml(item.id)}" value="${escapeHtml(item.note || '')}" placeholder="可选" /></td>
              <td>${escapeHtml(formatDate(item.createdAt))}</td>
              <td><button type="button" data-save-redemption="${escapeHtml(item.id)}">保存</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function updateAdminUser(user, updates) {
    const payload = await api('updateUser', { method: 'POST', body: { id: user.id, ...updates }, admin: true });
    if (state.currentUser.id === payload.user.id) {
      state.currentUser = payload.user;
      persistSession(state.currentUser, state.sessionToken);
    }
    await loadAdminUsers();
    updateShell();
  }

  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-auth-options]')) {
      renderAuthOptionsModal();
      return;
    }

    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton) {
      setAuthMode(modeButton.dataset.authMode || 'login');
      if (modeButton.closest('#modalRoot')) closeModal();
      return;
    }

    const codeButton = event.target.closest('[data-send-code]');
    if (!codeButton) return;
    const purpose = codeButton.dataset.sendCode;
    const form = purpose === 'reset' ? els.authResetForm : els.authRegisterForm;
    try {
      await requestVerificationCode(form, purpose, codeButton);
    } catch (error) {
      showToast(error.message, true);
    }
  }, { signal });

  els.authEmailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    submitter.disabled = true;
    try {
      const captcha = await runCaptchaChallenge();
      const data = formData(els.authEmailForm);
      await login({ identifier: data.identifier, password: data.password, captcha });
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submitter.disabled = false;
    }
  }, { signal });

  els.authRegisterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    submitter.disabled = true;
    try {
      const body = formData(els.authRegisterForm);
      const captcha = await runCaptchaChallenge();
      body.captcha = captcha;
      const result = await api('registerWithCode', { method: 'POST', body });
      state.currentUser = result.user;
      state.sessionToken = result.sessionToken || '';
      persistSession(state.currentUser, state.sessionToken);
      updateShell();
      showToast('注册成功，已进入用户中心。');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submitter.disabled = false;
    }
  }, { signal });

  els.authResetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    submitter.disabled = true;
    try {
      const body = formData(els.authResetForm);
      await api('resetPassword', { method: 'POST', body });
      setAuthMode('login');
      els.authIdentifierInput.value = body.email || '';
      showToast('密码已重置，请重新登录。');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submitter.disabled = false;
    }
  }, { signal });

  els.actionGrid.addEventListener('click', (event) => {
    const action = event.target.closest('[data-panel]');
    if (action) {
      state.modalBackPanel = action.dataset.backPanel || '';
      openPanel(action.dataset.panel);
    }
  }, { signal });

  els.logoutBtn?.addEventListener('click', () => {
    state.currentUser = null;
    state.users = [];
    clearStoredSession();
    updateShell();
    showToast('已退出登录。');
  }, { signal });

  els.modalRoot.addEventListener('click', async (event) => {
    if (event.target === els.modalRoot || event.target.closest('[data-close-modal]')) {
      closeModal();
      return;
    }

    const modalPanelButton = event.target.closest('[data-panel]');
    if (modalPanelButton) {
      state.modalBackPanel = modalPanelButton.dataset.backPanel || '';
      openPanel(modalPanelButton.dataset.panel);
      return;
    }

    if (event.target.closest('[data-modal-logout], #logoutBtn')) {
      state.currentUser = null;
      state.users = [];
      clearStoredSession();
      updateShell();
      showToast('已退出登录。');
      return;
    }

    const modalCodeButton = event.target.closest('[data-modal-send-code]');
    if (modalCodeButton) {
      const form = modalCodeButton.closest('form');
      try {
        await requestVerificationCode(form, modalCodeButton.dataset.modalSendCode, modalCodeButton);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    const deleteAccountButton = event.target.closest('[data-delete-account-confirm]');
    if (deleteAccountButton) {
      deleteAccountButton.disabled = true;
      try {
        await api('deleteAccount', { method: 'POST', body: { confirm: 'DELETE' } });
        state.currentUser = null;
        state.users = [];
        clearStoredSession();
        updateShell();
        showToast('账号已注销。');
      } catch (error) {
        deleteAccountButton.disabled = false;
        showToast(error.message, true);
      }
      return;
    }

    const adminPanelButton = event.target.closest('[data-admin-panel]');
    if (adminPanelButton) {
      state.adminPanel = adminPanelButton.dataset.adminPanel || 'notice';
      renderAdminModal(state.adminPanel);
      return;
    }

    if (event.target.closest('#adminRefresh')) {
      await loadAdminUsers();
      return;
    }

    const aiNewButton = event.target.closest('[data-ai-new]');
    if (aiNewButton) {
      state.aiEditConfig = {};
      state.aiEditingNew = true;
      renderAiConfigPanel();
      return;
    }

    const aiEditButton = event.target.closest('[data-ai-edit]');
    if (aiEditButton) {
      state.aiEditConfig = (state.aiConfigs || []).find((item) => item.id === aiEditButton.dataset.aiEdit) || {};
      state.aiEditingNew = false;
      renderAiConfigPanel();
      return;
    }

    const aiCancelButton = event.target.closest('[data-ai-cancel]');
    if (aiCancelButton) {
      state.aiEditConfig = null;
      state.aiEditingNew = false;
      renderAiConfigPanel();
      return;
    }

    const aiDefaultButton = event.target.closest('[data-ai-default]');
    if (aiDefaultButton) {
      aiDefaultButton.disabled = true;
      try {
        await api('setDefaultAiConfig', { method: 'POST', body: { id: aiDefaultButton.dataset.aiDefault }, admin: true });
        await loadAiConfig();
        showToast('已设为默认配置。');
      } catch (error) {
        aiDefaultButton.disabled = false;
        showToast(error.message, true);
      }
      return;
    }

    const aiTestButton = event.target.closest('[data-ai-test]');
    if (aiTestButton) {
      const original = aiTestButton.textContent;
      aiTestButton.disabled = true;
      aiTestButton.textContent = '测试中...';
      try {
        const payload = await api('testAiConfig', { method: 'POST', body: { id: aiTestButton.dataset.aiTest }, admin: true });
        showToast(payload.ok ? `测试成功：${payload.message || ''}${payload.latencyMs ? `（${payload.latencyMs}ms）` : ''}` : `测试失败：${payload.message || ''}`);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        aiTestButton.disabled = false;
        aiTestButton.textContent = original;
      }
      return;
    }

    const aiDeleteButton = event.target.closest('[data-ai-delete]');
    if (aiDeleteButton) {
      if (!window.confirm('确定删除该 AI 配置？删除后不可恢复。')) return;
      aiDeleteButton.disabled = true;
      try {
        await api('deleteAiConfig', { method: 'POST', body: { id: aiDeleteButton.dataset.aiDelete }, admin: true });
        await loadAiConfig();
        showToast('AI 配置已删除。');
      } catch (error) {
        aiDeleteButton.disabled = false;
        showToast(error.message, true);
      }
      return;
    }

    if (event.target.closest('[data-redemption-refresh]')) {
      await loadRedemptions();
      return;
    }

    const redeemStart = event.target.closest('[data-redeem-start]');
    if (redeemStart) {
      renderRedeemConfirm(redeemStart.dataset.redeemStart);
      return;
    }

    const redeemPhone = event.target.closest('[data-redeem-phone]');
    if (redeemPhone) {
      renderRedeemPhone(redeemPhone.dataset.redeemPhone);
      return;
    }

    if (event.target.closest('[data-shop-back]')) {
      renderShopModal(false);
      return;
    }

    const saveRedemption = event.target.closest('[data-save-redemption]');
    if (saveRedemption) {
      const id = saveRedemption.dataset.saveRedemption;
      saveRedemption.disabled = true;
      try {
        await api('updateRedemption', {
          method: 'POST',
          body: {
            id,
            status: root.querySelector('[data-redemption-status="' + CSS.escape(id) + '"]')?.value,
            note: root.querySelector('[data-redemption-note="' + CSS.escape(id) + '"]')?.value,
          },
          admin: true,
        });
        await loadRedemptions();
        showToast('兑换记录已更新。');
      } catch (error) {
        showToast(error.message, true);
      } finally {
        saveRedemption.disabled = false;
      }
      return;
    }

    const roleButton = event.target.closest('[data-toggle-role]');
    const statusButton = event.target.closest('[data-toggle-status]');
    const deleteButton = event.target.closest('[data-delete]');
    const badgeButton = event.target.closest('[data-save-badge]');
    const uidButton = event.target.closest('[data-save-uid]');
    const userId = roleButton?.dataset.toggleRole || statusButton?.dataset.toggleStatus || deleteButton?.dataset.delete || badgeButton?.dataset.saveBadge || uidButton?.dataset.saveUid;
    if (!userId) return;

    const user = state.users.find((item) => item.id === userId);
    if (!user) return;

    try {
      if (roleButton) {
        await updateAdminUser(user, { role: user.role === 'admin' ? 'user' : 'admin' });
        showToast('用户身份已更新。');
      }
      if (badgeButton) {
        const labelInput = root.querySelector('[data-badge-input="' + CSS.escape(user.id) + '"]');
        const colorInput = root.querySelector('[data-badge-color="' + CSS.escape(user.id) + '"]');
        await updateAdminUser(user, { badgeLabel: labelInput?.value.trim() || '', badgeColor: colorInput?.value || '' });
        showToast('身份标签已保存。');
      }
      if (uidButton) {
        const uidInput = root.querySelector('[data-uid-input="' + CSS.escape(user.id) + '"]');
        await updateAdminUser(user, { uid: uidInput?.value.trim() || '' });
        showToast('UID 已保存。');
      }
      if (statusButton) {
        await updateAdminUser(user, { status: user.status === 'blocked' ? 'active' : 'blocked' });
        showToast('用户状态已更新。');
      }
      if (deleteButton && window.confirm(`确认删除 ${user.displayName} 吗？`)) {
        await api('deleteUser', { method: 'POST', body: { id: user.id }, admin: true });
        await loadAdminUsers();
        showToast('用户已删除。');
      }
    } catch (error) {
      showToast(error.message, true);
    }
  }, { signal });

  els.modalRoot.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitter) submitter.disabled = true;
    try {
      if (event.target.id === 'editProfileForm') {
        const data = formData(event.target);
        const body = {
          displayName: data.displayName,
          username: data.username,
          avatarUrl: data.avatarUrl,
          backgroundUrl: data.backgroundUrl,
          websiteUrl: data.websiteUrl,
          bio: data.bio,
        };
        const payload = await api('updateProfile', { method: 'POST', body });
        state.currentUser = payload.user;
        updateShell();
        renderProfileModal();
        showToast('资料已更新。');
      }
      if (event.target.id === 'socialLinksForm') {
        const payload = await api('updateProfile', {
          method: 'POST',
          body: { socialLinks: collectSocialLinksFromEditor(event.target) },
        });
        state.currentUser = payload.user;
        updateShell();
        renderProfileModal();
        showToast('社交链接已保存。');
      }
      if (event.target.id === 'passwordForm') {
        const body = formData(event.target);
        const payload = await api('changePassword', { method: 'POST', body });
        state.currentUser = payload.user;
        updateShell();
        renderSecurityModal();
        showToast('密码已更新。');
      }
      if (event.target.id === 'changeEmailForm') {
        const body = formData(event.target);
        const payload = await api('changeEmail', { method: 'POST', body });
        state.currentUser = payload.user;
        state.sessionToken = payload.sessionToken || state.sessionToken;
        persistSession(state.currentUser, state.sessionToken);
        updateShell();
        renderSecurityModal();
        showToast('邮箱已更新。');
      }
      if (event.target.id === 'forgotPasswordForm') {
        const body = formData(event.target);
        const payload = await api('resetPassword', { method: 'POST', body });
        if (payload.user) state.currentUser = payload.user;
        if (payload.sessionToken) state.sessionToken = payload.sessionToken;
        persistSession(state.currentUser, state.sessionToken);
        updateShell();
        renderSecurityModal();
        showToast('密码已重置。');
      }
      if (event.target.id === 'noticeForm') {
        const data = formData(event.target);
        const body = {
          notifications: {
            emailReplies: data.emailReplies === 'on',
            emailSystem: data.emailSystem === 'on',
            browserPush: data.browserPush === 'on',
          },
        };
        const payload = await api('updateProfile', { method: 'POST', body });
        state.currentUser = payload.user;
        updateShell();
        closeModal();
        showToast('通知设置已保存。');
      }
      if (event.target.id === 'aiConfigForm') {
        const data = formData(event.target);
        const isNew = state.aiEditingNew;
        const payload = await api(isNew ? 'createAiConfig' : 'aiConfig', {
          method: 'POST',
          body: {
            id: data.id || undefined,
            name: data.name,
            enabled: data.enabled === 'on',
            requireLogin: data.requireLogin === 'on',
            provider: data.provider,
            apiBaseUrl: data.apiBaseUrl,
            model: data.model,
            apiKey: data.apiKey,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            systemPrompt: data.systemPrompt,
            isDefault: data.isDefault === 'on',
            clearApiKey: data.clearApiKey === 'on',
          },
          admin: true,
        });
        state.aiConfigs = payload.aiConfigs || [];
        state.aiEditConfig = null;
        state.aiEditingNew = false;
        renderAiConfigPanel();
        showToast(isNew ? 'AI 配置已创建。' : 'AI 配置已保存。');
      }
      if (event.target.matches('[data-redeem-form]')) {
        const data = formData(event.target);
        const payload = await api('redeemReward', {
          method: 'POST',
          body: { reward: event.target.dataset.redeemForm, phone: data.phone, note: data.note },
        });
        state.currentUser = payload.user;
        updateShell();
        renderShopModal(false);
        showToast('兑换申请已提交，预计 10 个工作日内到账。');
      }
      if (event.target.matches('[data-shop-item-form]')) {
        const data = formData(event.target);
        await api('updateShopItem', {
          method: 'POST',
          body: {
            key: data.key,
            name: data.name,
            description: data.description,
            price: data.price,
            stock: data.stock,
            imageUrl: data.imageUrl,
            enabled: data.enabled === 'on',
          },
          admin: true,
        });
        await loadShopCatalog(true);
        renderShopAdminPanel();
        showToast('商品已保存。');
      }
      if (event.target.id === 'adminNoticeForm') {
        const data = formData(event.target);
        const payload = await api('createNotification', {
          method: 'POST',
          body: {
            type: data.type,
            target: data.target,
            userId: data.userId,
            title: data.title,
            body: data.body,
            link: data.link,
          },
          admin: true,
        });
        event.target.reset();
        showToast(`通知已发送给 ${payload.created || 0} 个用户。`);
      }
    } catch (error) {
      showToast(error.message, true);
    } finally {
      if (submitter) submitter.disabled = false;
    }
  }, { signal });

  els.modalRoot.addEventListener('input', (event) => {
    if (event.target.matches('#adminSearch')) {
      state.filter.query = event.target.value.trim().toLowerCase();
      renderAdminTable();
    }
    const imageInput = event.target.closest('[data-shop-image-input]');
    if (imageInput) {
      const key = imageInput.dataset.shopImageInput;
      const preview = root.querySelector('[data-shop-image-preview="' + CSS.escape(key) + '"]');
      if (!preview) return;
      const value = imageInput.value.trim();
      preview.classList.toggle('is-empty', !value);
      preview.innerHTML = value
        ? `<img src="${escapeHtml(value)}" alt="商品预览图" loading="lazy" />`
        : key === 'new' ? '+' : '商';
    }
  }, { signal });

  els.modalRoot.addEventListener('change', (event) => {
    if (event.target.matches('#adminRoleFilter')) {
      state.filter.role = event.target.value;
      renderAdminTable();
    }
    if (event.target.matches('#adminStatusFilter')) {
      state.filter.status = event.target.value;
      renderAdminTable();
    }
  }, { signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  }, { signal });

  (async function boot() {
    await refreshHealth();
    const publicHandle = profileHandleFromLocation();
    if (publicHandle) {
      try {
        const payload = await api('profile', { params: { handle: publicHandle } });
        updatePublicProfile(payload.user);
      } catch (error) {
        els.authView.classList.add('is-hidden');
        els.centerView.classList.add('is-hidden');
        els.publicView.classList.remove('is-hidden');
        els.publicView.innerHTML = `<section class="uc-auth-card"><h1 class="uc-site-name">找不到这个用户</h1><p class="uc-empty">${escapeHtml(error.message)}</p></section>`;
      }
      return;
    }
    els.authIdentifierInput.value = detectTwikooEmail();
    const cachedUser = storedUser();
    if (state.sessionToken && cachedUser) {
      state.currentUser = cachedUser;
      updateShell();
      try {
        const payload = await api('me');
        state.currentUser = payload.user;
        persistSession(state.currentUser, state.sessionToken);
      } catch (error) {
        clearStoredSession();
        state.currentUser = null;
      }
    }
    setAuthMode('login');
    updateShell();
  })();
})();
