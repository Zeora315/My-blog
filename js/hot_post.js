(function () {
  const state = window.SolitudeHotPostState || {
    trackedPaths: new Set()
  };
  window.SolitudeHotPostState = state;

  function normalizePath(value) {
    if (!value) return "/";

    try {
      const url = new URL(value, window.location.origin);
      return decodeURIComponent(url.pathname).replace(/\/?$/, "/");
    } catch (error) {
      return String(value).replace(/\/?$/, "/");
    }
  }

  function readConfigs() {
    return Array.from(
      document.querySelectorAll(".solitude-hot-posts-data, #solitude-hot-posts-data")
    ).map((element) => {
      try {
        const config = JSON.parse(element.textContent || "{}");
        config.endpoint = String(config.endpoint || "").replace(/\/$/, "");
        config.limit = Number(config.limit) || 5;
        config.posts = Array.isArray(config.posts) ? config.posts : [];
        config.list =
          element.closest(".card-hot-post")?.querySelector(".hot-post-list") ||
          document.querySelector(".hot-post-page .hot-post-list");
        return config;
      } catch (error) {
        console.warn("Hot post config parse failed", error);
        return null;
      }
    }).filter(Boolean);
  }

  function getCurrentPost(posts) {
    const currentPath = normalizePath(window.location.pathname);
    return posts.find(post => normalizePath(post.path) === currentPath);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function render(list, items, fallbackPosts, limit) {
    if (!list) return;

    const normalizedItems = (items && items.length ? items : fallbackPosts || []).slice(0, limit || 5);
    if (!normalizedItems.length) {
      list.innerHTML = '<li class="hot-post-empty">暂无今日访问数据</li>';
      return;
    }

    list.innerHTML = normalizedItems.map((item, index) => {
      const path = item.path || item.href || "/";
      const title = item.title || "未命名文章";
      const count = Number(item.count || 0);
      const countText = count ? `${count} 次访问` : "";
      const countBadge = count ? `<span class="hot-post-count">${escapeHtml(countText)}</span>` : "";

      return [
        '<li class="hot-post-item">',
        `<a href="${escapeHtml(path)}" title="${escapeHtml(countText ? `${title} · ${countText}` : title)}">`,
        `<span class="hot-post-rank">${index + 1}</span>`,
        `<span class="hot-post-title">${escapeHtml(title)}</span>`,
        countBadge,
        "</a>",
        "</li>"
      ].join("");
    }).join("");
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Hot post request failed: ${response.status}`);
    return response.json();
  }

  async function trackCurrentPost(config) {
    const post = getCurrentPost(config.posts);
    if (!post || !config.endpoint) return;

    const path = normalizePath(post.path);
    if (state.trackedPaths.has(path)) return;
    state.trackedPaths.add(path);

    await postJson(`${config.endpoint}/track`, {
      title: post.title,
      path: post.path,
      href: new URL(post.path || window.location.pathname, window.location.origin).href
    });
  }

  async function loadRanking(config) {
    if (!config.endpoint) return;

    const data = await postJson(config.endpoint, {
      limit: config.limit,
      posts: config.posts.map(post => ({
        title: post.title,
        path: post.path,
        href: post.href
      }))
    });

    render(config.list, data.items || [], config.posts.slice(0, config.limit), config.limit);
  }

  async function init() {
    const configs = readConfigs();
    if (!configs.length) return;

    const primaryConfig = configs.find((config) => config.endpoint) || configs[0];
    try { await trackCurrentPost(primaryConfig); } catch (error) {
      console.warn("Hot post tracking failed", error);
    }

    await Promise.all(configs.map(async (config) => {
      try {
        await loadRanking(config);
      } catch (error) {
        console.warn("Hot post ranking failed", error);
      }
    }));
  }

  window.SolitudeHotPost = { init };

  if (!state.listenersBound) {
    document.addEventListener("DOMContentLoaded", init);
    document.addEventListener("pjax:complete", init);
    state.listenersBound = true;
  }
  init();
})();
