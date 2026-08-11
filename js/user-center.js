(() => {
  const root = document.querySelector('#user-center-root');
  if (!root) return;

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

  const state = {
    currentUser: null,
    publicUser: null,
    credentials: null,
    users: [],
    authMode: 'login',
    authEmail: '',
    adminProtected: false,
    adminToken: localStorage.getItem('twikooDemoAdminToken') || '',
    filter: { query: '', role: 'all', status: 'all' },
  };

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));

  const els = {
    authView: $('#authView'),
    centerView: $('#centerView'),
    publicView: $('#publicView'),
    authSwitchText: $('#authSwitchText'),
    authSwitchBtn: $('#authSwitchBtn'),
    authEmailForm: $('#authEmailForm'),
    authPasswordForm: $('#authPasswordForm'),
    authRegisterForm: $('#authRegisterForm'),
    authEmailInput: $('#authEmailInput'),
    authPasswordInput: $('#authPasswordForm input[name="password"]'),
    profileAvatar: $('#profileAvatar'),
    profileName: $('#profileName'),
    profileUid: $('#profileUid'),
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

  function socialLinks(user) {
    return Array.isArray(user?.socialLinks)
      ? user.socialLinks
        .map((item) => ({
          label: String(item?.label || item?.name || '').trim(),
          url: String(item?.url || item?.href || item?.link || '').trim(),
        }))
        .filter((item) => item.label && item.url)
      : [];
  }

  function socialLinksToText(user) {
    return socialLinks(user).map((item) => `${item.label} ${item.url}`).join('\n');
  }

  function parseSocialLinksText(value) {
    return String(value || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const url = parts.pop() || '';
        return { label: parts.join(' ').trim(), url };
      })
      .filter((item) => item.label && item.url);
  }

  function renderLevelCard(user) {
    const meta = levelMeta(user);
    const percent = Math.max(0, Math.min(100, (meta.progress / Math.max(1, meta.nextRequired)) * 100));
    return `
      <div class="uc-level-summary">
        <strong>${escapeHtml(meta.label)}</strong>
        <span>经验 ${escapeHtml(meta.experience)}</span>
      </div>
      <div class="uc-level-progress"><i style="width:${percent}%"></i></div>
      <p>距离 Lv.${escapeHtml(meta.nextLevel)} 还需 ${escapeHtml(meta.toNext)} 点经验。</p>
    `;
  }

  function renderSocialLinks(user) {
    const links = socialLinks(user);
    const website = user?.websiteUrl ? [{ label: '个人网站', url: user.websiteUrl }] : [];
    const allLinks = [...website, ...links];
    if (!allLinks.length) return '<p class="uc-empty">这个用户还没有公开主页链接。</p>';
    return allLinks.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`).join('');
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
    state.authEmail = '';
    els.authEmailForm.classList.remove('is-hidden');
    els.authPasswordForm.classList.add('is-hidden');
    els.authRegisterForm.classList.add('is-hidden');
    els.authSwitchText.childNodes[0].nodeValue = mode === 'login' ? '没有账号？' : '已有账号？';
    els.authSwitchBtn.textContent = mode === 'login' ? '注册' : '登录';
    els.authSwitchBtn.dataset.authMode = mode === 'login' ? 'register' : 'login';
    requestAnimationFrame(() => els.authEmailInput.focus());
  }

  function makeUsernameFromEmail(email) {
    const localPart = email.split('@')[0] || 'user';
    return localPart.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32).padEnd(3, '0');
  }

  function showPasswordStep() {
    state.authEmail = els.authEmailInput.value.trim().toLowerCase();
    els.authEmailForm.classList.add('is-hidden');
    if (state.authMode === 'login') {
      els.authPasswordForm.classList.remove('is-hidden');
      els.authRegisterForm.classList.add('is-hidden');
      els.authPasswordInput.focus();
      return;
    }

    const username = makeUsernameFromEmail(state.authEmail);
    els.authPasswordForm.classList.add('is-hidden');
    els.authRegisterForm.classList.remove('is-hidden');
    els.authRegisterForm.elements.username.value = username;
    els.authRegisterForm.elements.displayName.value = els.authRegisterForm.elements.displayName.value || username;
    els.authRegisterForm.elements.password.focus();
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
    if (options.body) {
      headers['content-type'] = 'application/json';
      fetchOptions.body = JSON.stringify(options.body);
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
    els.publicJoined.textContent = `加入于 ${formatDate(user.createdAt)}`;
    els.publicBio.textContent = user.bio || '这个用户还没有写简介。';
    els.publicLevelCard.innerHTML = renderLevelCard(user);
    els.publicLinks.innerHTML = renderSocialLinks(user);
  }

  async function refreshHealth() {
    try {
      const health = await api('health');
      state.adminProtected = Boolean(health.adminProtected);
    } catch (error) {
      state.adminProtected = false;
    }
  }

  async function login(credentials, silent = false) {
    const result = await api('login', { method: 'POST', body: credentials });
    state.currentUser = result.user;
    state.credentials = credentials;
    updateShell();
    if (!silent) showToast('已进入用户中心。');
  }

  function openModal(title, body, options = {}) {
    els.modalRoot.innerHTML = `
      <div class="uc-modal-card ${options.wide ? 'uc-modal-card-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="uc-modal-head">
          <h2 id="modalTitle">${escapeHtml(title)}</h2>
          <button class="uc-modal-close" type="button" data-close-modal aria-label="关闭弹窗">×</button>
        </div>
        ${body}
      </div>
    `;
    els.modalRoot.classList.remove('is-hidden');
  }

  function closeModal() {
    els.modalRoot.classList.add('is-hidden');
    els.modalRoot.innerHTML = '';
  }

  function openPanel(name) {
    if (!state.currentUser) return;
    const renderers = {
      edit: renderEditModal,
      password: renderPasswordModal,
      notice: renderNoticeModal,
      level: renderLevelModal,
      admin: renderAdminModal,
    };
    renderers[name]?.();
  }

  function renderEditModal() {
    const user = state.currentUser;
    openModal('编辑资料', `
      <form id="editProfileForm" class="uc-avatar-editor">
        <div id="editAvatarPreview" class="uc-profile-avatar">${escapeHtml(initials(user))}</div>
        <div class="uc-form">
          <label class="uc-field">
            <span>显示名称</span>
            <input name="displayName" maxlength="64" value="${escapeHtml(user.displayName)}" />
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
            <span>个人网站</span>
            <input name="websiteUrl" value="${escapeHtml(user.websiteUrl || '')}" placeholder="https://example.com" />
          </label>
          <label class="uc-field">
            <span>个人简介</span>
            <input name="bio" maxlength="120" value="${escapeHtml(user.bio || '')}" placeholder="一句话介绍自己" />
          </label>
          <label class="uc-field uc-field-wide">
            <span>社交链接</span>
            <textarea name="socialLinksText" rows="4" placeholder="B站 https://space.bilibili.com/...\nTwitter https://x.com/...\n抖音 https://www.douyin.com/...">${escapeHtml(socialLinksToText(user))}</textarea>
          </label>
          <label class="uc-field">
            <span>邮箱</span>
            <input value="${escapeHtml(user.email)}" disabled />
          </label>
          <div class="uc-form-actions">
            <button class="uc-primary-btn" type="submit">保存资料</button>
            <button class="uc-ghost-btn" type="button" data-close-modal>取消</button>
          </div>
        </div>
      </form>
    `);

    const preview = root.querySelector('#editAvatarPreview');
    const input = root.querySelector('#avatarUrlInput');
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

  function renderPasswordModal() {
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
    `);
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

  async function renderAdminModal() {
    openModal('管理员面板', `
      <div class="uc-admin-toolbar">
        <input id="adminSearch" type="search" placeholder="搜索用户、邮箱、UID" />
        <select id="adminRoleFilter">
          <option value="all">全部身份</option>
          <option value="admin">管理员</option>
          <option value="user">无标签用户</option>
        </select>
        <select id="adminStatusFilter">
          <option value="all">全部状态</option>
          <option value="active">可用</option>
          <option value="blocked">停用</option>
        </select>
        <button id="adminRefresh" class="uc-ghost-btn" type="button">刷新列表</button>
      </div>
      <div id="adminTableWrap" class="uc-table-wrap">正在加载用户...</div>
    `, { wide: true });

    await loadAdminUsers();
    root.querySelector('#adminRefresh')?.addEventListener('click', loadAdminUsers, { signal });
    root.querySelector('#adminSearch')?.addEventListener('input', (event) => {
      state.filter.query = event.target.value.trim().toLowerCase();
      renderAdminTable();
    }, { signal });
    root.querySelector('#adminRoleFilter')?.addEventListener('change', (event) => {
      state.filter.role = event.target.value;
      renderAdminTable();
    }, { signal });
    root.querySelector('#adminStatusFilter')?.addEventListener('change', (event) => {
      state.filter.status = event.target.value;
      renderAdminTable();
    }, { signal });
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
            <th>UID / 邮箱</th>
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
              <td>UID: ${escapeHtml(user.uid)}<br />${escapeHtml(user.email)}</td>
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

  async function updateAdminUser(user, updates) {
    const payload = await api('updateUser', { method: 'POST', body: { id: user.id, ...updates }, admin: true });
    if (state.currentUser.id === payload.user.id) state.currentUser = payload.user;
    await loadAdminUsers();
    updateShell();
  }

  els.authSwitchBtn.addEventListener('click', () => {
    setAuthMode(els.authSwitchBtn.dataset.authMode);
  }, { signal });

  els.authEmailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    showPasswordStep();
  }, { signal });

  $$('[data-back-email]').forEach((button) => {
    button.addEventListener('click', () => {
      els.authEmailForm.classList.remove('is-hidden');
      els.authPasswordForm.classList.add('is-hidden');
      els.authRegisterForm.classList.add('is-hidden');
      els.authEmailInput.focus();
    }, { signal });
  });

  els.authPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    submitter.disabled = true;
    try {
      await login({ email: state.authEmail, password: formData(els.authPasswordForm).password });
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
      const body = { ...formData(els.authRegisterForm), email: state.authEmail };
      await api('register', { method: 'POST', body });
      await login({ email: body.email, password: body.password });
      showToast('注册成功，已进入用户中心。');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submitter.disabled = false;
    }
  }, { signal });

  els.actionGrid.addEventListener('click', (event) => {
    const action = event.target.closest('[data-panel]');
    if (action) openPanel(action.dataset.panel);
  }, { signal });

  els.logoutBtn.addEventListener('click', () => {
    state.currentUser = null;
    state.credentials = null;
    state.users = [];
    updateShell();
    showToast('已退出登录。');
  }, { signal });

  els.modalRoot.addEventListener('click', async (event) => {
    if (event.target === els.modalRoot || event.target.closest('[data-close-modal]')) {
      closeModal();
      return;
    }

    const roleButton = event.target.closest('[data-toggle-role]');
    const statusButton = event.target.closest('[data-toggle-status]');
    const deleteButton = event.target.closest('[data-delete]');
    const badgeButton = event.target.closest('[data-save-badge]');
    const userId = roleButton?.dataset.toggleRole || statusButton?.dataset.toggleStatus || deleteButton?.dataset.delete || badgeButton?.dataset.saveBadge;
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
    const submitter = event.submitter;
    submitter.disabled = true;
    try {
      if (event.target.id === 'editProfileForm') {
        const data = formData(event.target);
        const body = {
          ...state.credentials,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          backgroundUrl: data.backgroundUrl,
          websiteUrl: data.websiteUrl,
          bio: data.bio,
          socialLinks: parseSocialLinksText(data.socialLinksText),
        };
        const payload = await api('updateProfile', { method: 'POST', body });
        state.currentUser = payload.user;
        updateShell();
        closeModal();
        showToast('资料已更新。');
      }
      if (event.target.id === 'passwordForm') {
        const body = { email: state.credentials.email, ...formData(event.target) };
        const payload = await api('changePassword', { method: 'POST', body });
        state.currentUser = payload.user;
        state.credentials.password = body.newPassword;
        updateShell();
        closeModal();
        showToast('密码已更新。');
      }
      if (event.target.id === 'noticeForm') {
        const data = formData(event.target);
        const body = {
          ...state.credentials,
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
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submitter.disabled = false;
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
    els.authEmailInput.value = detectTwikooEmail();
    setAuthMode('login');
    updateShell();
  })();
})();
