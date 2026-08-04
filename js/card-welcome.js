(function () {
  const CONFIG = {
    API_URL: 'https://v1.nsuuu.com/api/ip',
    IP_PROVIDERS: [
      'https://api64.ipify.org?format=json',
      'https://api.ipify.org?format=json',
    ],
    BLOG_LOCATION: { lng: 120.1540, lat: 30.2656 },
    CACHE_KEY: 'solitude_welcome_cache_v2',
    CACHE_DURATION: 1000 * 60 * 10,
    REQUEST_TIMEOUT: 6000,
  };

  const LEGACY_CACHE_KEYS = ['solitude_welcome_cache', 'ip_info_cache'];

  // 清除旧版本缓存，避免旧接口/旧地址结构继续显示同一地区。
  try {
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (e) {}

  const greetings = {
    "中国": {
      "北京": "北——京——欢迎你~~~",
      "天津": "讲段相声吧",
      "河北": "山势巍巍成壁垒，天下雄关铁马金戈由此向，无限江山",
      "山西": "展开坐具长三尺，已占山河五百余",
      "内蒙古": "天苍苍，野茫茫，风吹草低见牛羊",
      "辽宁": "我想吃烤鸡架！",
      "吉林": "状元阁就是东北烧烤之王",
      "黑龙江": "很喜欢哈尔滨大剧院",
      "上海": "众所周知，中国只有两个城市",
      "江苏": "散装是必须要散装的",
      "浙江": "望海楼明照曙霞，护江堤白蹋晴沙",
      "安徽": "蚌埠住了，芜湖起飞",
      "福建": "井邑白云间，岩城远带山",
      "江西": "落霞与孤鹜齐飞，秋水共长天一色",
      "山东": "遥望齐州九点烟，一泓海水杯中泻",
      "湖北": "来碗热干面~",
      "湖南": "74751，长沙斯塔克",
      "广东": "来两斤福建人~",
      "广西": "桂林山水甲天下",
      "海南": "朝观日出逐白浪，夕看云起收霞光",
      "四川": "康康川妹子",
      "贵州": "茅台，学生，再塞200",
      "云南": "玉龙飞舞云缠绕，万仞冰川直耸天",
      "西藏": "躺在茫茫草原上，仰望蓝天",
      "陕西": "来份臊子面加馍",
      "甘肃": "羌笛何须怨杨柳，春风不度玉门关",
      "青海": "牛肉干和老酸奶都好好吃",
      "宁夏": "大漠孤烟直，长河落日圆",
      "新疆": "驼铃古道丝绸路，胡马犹闻唐汉风",
      "台湾": "我在这头，大陆在那头",
      "香港": "永定贼有残留地鬼嚎，迎击光非岁玉",
      "澳门": "性感荷官，在线发牌"
    },
    "美国": "Let us live in peace!",
    "日本": "よろしく、一緒に桜を見ませんか",
    "俄罗斯": "干了这瓶伏特加！",
    "法国": "C'est La Vie",
    "德国": "Die Zeit verging im Fluge.",
    "澳大利亚": "一起去大堡礁吧！",
    "加拿大": "拾起一片枫叶赠予你"
  };

  function getContainers() {
    return Array.from(document.querySelectorAll('.welcome-info, #welcome-info'));
  }

  function getCached(ip) {
    if (!ip) return null;
    try {
      const raw = localStorage.getItem(CONFIG.CACHE_KEY);
      if (!raw) return null;
      const { data, ts, ip: cachedIp } = JSON.parse(raw);
      if (Date.now() - ts > CONFIG.CACHE_DURATION) {
        localStorage.removeItem(CONFIG.CACHE_KEY);
        return null;
      }
      if (ip && cachedIp !== ip) return null;
      return data;
    } catch { return null; }
  }

  function setCache(data, ip) {
    if (!ip) return;
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, ip, ts: Date.now() }));
    } catch (e) {}
  }

  function calculateDistance(lng, lat) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (lat - CONFIG.BLOG_LOCATION.lat) * rad;
    const dLng = (lng - CONFIG.BLOG_LOCATION.lng) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(CONFIG.BLOG_LOCATION.lat * rad) * Math.cos(lat * rad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function formatIpDisplay(ip) {
    if (!ip) return '未知';
    return ip.includes(":") ? "好复杂，咱看不懂~(ipv6)" : ip;
  }

  function formatLocation(address) {
    if (!address) return '神秘地区';
    return address.replace(/^中国/, '').trim() || '中国';
  }

  function getGreeting(address) {
    if (!address) return '带我去你的城市逛逛吧！';
    for (const [prov, msg] of Object.entries(greetings['中国'] || {})) {
      if (address.includes(prov)) return msg;
    }
    for (const [country, msg] of Object.entries(greetings)) {
      if (country !== '中国' && address.includes(country)) return msg;
    }
    return '带我去你的城市逛逛吧！';
  }

  function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 11) return "早上好🌤️ ，一日之计在于晨";
    if (hour < 13) return "中午好☀️ ，记得午休喔~";
    if (hour < 17) return "下午好🕞 ，饮茶先啦！";
    if (hour < 19) return "即将下班🚶‍♂️，记得按时吃饭~";
    return "晚上好🌙 ，夜生活嗨起来！";
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function withCacheBust(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_t=${Date.now()}`;
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    try {
      const resp = await fetch(withCacheBust(url), {
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error('网络响应不正常');
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveVisitorIp() {
    for (const provider of CONFIG.IP_PROVIDERS) {
      try {
        const data = await fetchJson(provider);
        const ip = data && (data.ip || data.query);
        if (ip) return String(ip);
      } catch (e) {}
    }
    return null;
  }

  function buildIpApiUrl(ip) {
    if (!ip) return CONFIG.API_URL;
    return `${CONFIG.API_URL}?ip=${encodeURIComponent(ip)}`;
  }

  function normalizeApiData(data, detectedIp) {
    if (!data || data.code !== 200 || !data.data) return null;
    const info = data.data;
    return {
      address: info.address || '',
      ip: info.ip || detectedIp || '',
      isp: info.isp || '',
      lat: Number.parseFloat(info.lat),
      lng: Number.parseFloat(info.lng),
    };
  }

  function showWelcome(data, container) {
    const info = normalizeApiData(data, data && data.detectedIp);
    if (!info) return showErrorMessage(container);

    const { address, ip, isp, lat, lng } = info;
    const dist = calculateDistance(lng, lat);
    const pos = formatLocation(address);
    const tip = getGreeting(address);
    const distText = dist == null ? '未知' : dist;
    const ipDisplay = formatIpDisplay(ip);
    const ispText = isp && isp !== '0' ? `（${escapeHtml(isp)}）` : '';

    container.classList.add('is-ready');
    container.innerHTML = `
      <div class="welcome-info-title">欢迎来自 <b>${escapeHtml(pos)}</b> 的小友💖</div>
      <div>你当前距博主约 <b>${escapeHtml(distText)}</b> 公里！</div>
      <div>你的IP地址：<b class="ip-address" tabindex="0" title="悬停或聚焦查看 IP">${escapeHtml(ipDisplay)}</b>${ispText}</div>
      <div>${escapeHtml(getTimeGreeting())}</div>
      <div class="welcome-tip">Tip：<b>${escapeHtml(tip)}🍂</b></div>
    `;
  }

  function showErrorMessage(container, message) {
    container.classList.remove('is-ready');
    container.innerHTML = `
      <div class="error-message">
        <div class="error-icon">😕</div>
        <p>${message || '抱歉，无法获取信息'}</p>
        <p>请<i class="retry-button fa-solid fa-arrows-rotate"></i>重试或检查网络连接</p>
      </div>`;
    const retryBtn = container.querySelector('.retry-button');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (e) {}
        container.classList.remove('is-ready');
        container.innerHTML = '<div class="loading-spinner"></div>';
        fetchIpInfo(container);
      });
    }
  }

  function showLoading(container) {
    container.classList.remove('is-ready');
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  async function fetchIpInfo(container) {
    container = container || getContainers()[0];
    if (!container) return;

    showLoading(container);
    const detectedIp = await resolveVisitorIp();
    const cached = getCached(detectedIp);
    if (cached) return showWelcome(cached, container);

    try {
      const data = await fetchJson(buildIpApiUrl(detectedIp));
      data.detectedIp = detectedIp;
      setCache(data, detectedIp);
      showWelcome(data, container);
    } catch (e) {
      console.warn('Welcome card error:', e);
      showErrorMessage(container);
    }
  }

  function init() {
    const containers = getContainers();
    if (!containers.length) return;
    containers.forEach((container) => fetchIpInfo(container));
  }

  window.__welcomeInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('pjax:complete', init);
})();
