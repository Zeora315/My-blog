(function () {
  const nativeSetTimeout = window.setTimeout.bind(window);

  window.setTimeout = function (callback, delay, ...args) {
    if (delay === 10000 && typeof callback === 'function' && callback.toString().includes('加载超时')) {
      return nativeSetTimeout(callback, 30000, ...args);
    }

    return nativeSetTimeout(callback, delay, ...args);
  };

  const root = document.getElementById('friend-circle-lite-root');
  if (!root) return;

  const icons = {
    dice: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"></rect><path d="M16 8h.01"></path><path d="M8 16h.01"></path><path d="M12 12h.01"></path><path d="M16 16h.01"></path><path d="M8 8h.01"></path></svg>',
    pen: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>',
    calendar: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>',
    refresh: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>',
    warning: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
    rss: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>',
    activity: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 8L9 4l-3 8H2"></path></svg>',
    file: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path></svg>',
    clock: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
    external: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
    x: '<svg class="fcircle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
  };

  const iconMap = new Map([
    ['\u{1F3B2}', icons.dice],
    ['\u270D\uFE0F', icons.pen],
    ['\u270D', icons.pen],
    ['\u{1F4C5}', icons.calendar],
    ['\u{1F5D3}\uFE0F', icons.calendar],
    ['\u{1F5D3}', icons.calendar],
    ['\u{1F504}', icons.refresh],
    ['\u26A0\uFE0F', icons.warning],
    ['\u26A0', icons.warning]
  ]);

  function replaceEmojisInTextNode(node) {
    const text = node.textContent;
    let changed = false;

    iconMap.forEach((icon, emoji) => {
      if (text.includes(emoji)) changed = true;
    });

    if (!changed) return;

    if (node.parentElement && node.parentElement.closest('.stat-item')) {
      const textWithoutEmoji = Array.from(iconMap.keys()).reduce((text, emoji) => {
        return text.split(emoji).join('');
      }, text).trim();

      if (!textWithoutEmoji) {
        node.parentNode.removeChild(node);
        return;
      }
    }

    const fragment = document.createDocumentFragment();
    let index = 0;

    while (index < text.length) {
      let nextEmoji = null;
      let nextIndex = -1;

      iconMap.forEach((icon, emoji) => {
        const foundIndex = text.indexOf(emoji, index);
        if (foundIndex !== -1 && (nextIndex === -1 || foundIndex < nextIndex)) {
          nextEmoji = emoji;
          nextIndex = foundIndex;
        }
      });

      if (!nextEmoji) {
        fragment.appendChild(document.createTextNode(text.slice(index)));
        break;
      }

      if (nextIndex > index) {
        fragment.appendChild(document.createTextNode(text.slice(index, nextIndex)));
      }

      const wrapper = document.createElement('span');
      wrapper.className = 'fcircle-inline-icon';
      wrapper.innerHTML = iconMap.get(nextEmoji);
      fragment.appendChild(wrapper);
      index = nextIndex + nextEmoji.length;
    }

    node.parentNode.replaceChild(fragment, node);
  }

  function replaceEmojis(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      replaceEmojisInTextNode(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE || node.closest('svg')) return;

    Array.from(node.childNodes).forEach(replaceEmojis);
  }

  function statIconFor(item, index) {
    const text = item.textContent || '';

    if (text.includes('订阅')) return icons.rss;
    if (text.includes('活跃')) return icons.activity;
    if (text.includes('文章')) return icons.file;
    if (text.includes('失败') || text.includes('异常')) return icons.warning;

    return [icons.rss, icons.activity, icons.file, icons.warning][index] || icons.file;
  }

  function enhanceStats() {
    root.querySelectorAll('.stat-item').forEach((item, index) => {
      if (item.querySelector(':scope > .fcircle-stat-icon')) return;

      const icon = document.createElement('span');
      icon.className = 'fcircle-stat-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = statIconFor(item, index);
      item.prepend(icon);
    });
  }

  function enhanceCards() {
    root.querySelectorAll('.card').forEach(card => {
      const author = card.querySelector('.card-author');
      const date = card.querySelector('.card-date');

      if (author && date && author.parentElement === date.parentElement) {
        author.parentElement.classList.add('fcircle-card-meta');
      }
    });
  }

  function getCircleData() {
    try {
      const cached = window.localStorage.getItem('friend-circle-lite-cache');
      if (!cached) return null;
      return JSON.parse(cached);
    } catch (error) {
      return null;
    }
  }

  function parseCreatedDate(value) {
    if (!value) return null;
    const normalized = value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysSince(value) {
    const date = parseCreatedDate(value);
    if (!date) return null;
    const diff = Date.now() - date.getTime();
    return Math.max(0, Math.floor(diff / 86400000));
  }

  function formatIdleDays(days) {
    if (days === null) return '暂无记录';
    if (days === 0) return '今天更新';
    if (days === 1) return '1 天未更新';
    return `${days} 天未更新`;
  }

  function enhanceModal() {
    const modal = document.getElementById('modal');
    const isOpen = Boolean(modal && modal.classList.contains('modal-open') && modal.style.display !== 'none');
    document.body.classList.toggle('fcircle-modal-active', isOpen);

    if (!modal) return;
    modal.classList.add('fcircle-user-modal');

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    if (!modal.dataset.fcircleCloseBound) {
      modal.dataset.fcircleCloseBound = 'true';
      modal.addEventListener('click', event => {
        if (event.target !== modal) return;
        modal.classList.remove('modal-open');
        modal.style.display = 'none';
        document.body.classList.remove('fcircle-modal-active');
      });
    }

    const content = modal.querySelector('.modal-content');
    const nameLink = modal.querySelector('#modal-author-name-link');
    const articlesContainer = modal.querySelector('#modal-articles-container');
    const authorName = nameLink ? nameLink.textContent.trim() : '';
    if (!content || !nameLink || !articlesContainer || !authorName) return;
    replaceEmojis(modal);

    if (!content.querySelector('.fcircle-modal-close')) {
      const closeButton = document.createElement('button');
      closeButton.className = 'fcircle-modal-close';
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', '关闭');
      closeButton.innerHTML = icons.x;
      closeButton.addEventListener('click', () => {
        modal.classList.remove('modal-open');
        modal.style.display = 'none';
        document.body.classList.remove('fcircle-modal-active');
      });
      content.prepend(closeButton);
    }

    if (content.dataset.enhancedAuthor === authorName && articlesContainer.dataset.fcircleRenderedAuthor === authorName) return;

    const circleData = getCircleData();
    const authorArticles = (circleData?.article_data || [])
      .filter(article => article.author === authorName)
      .sort((a, b) => (parseCreatedDate(b.created)?.getTime() || 0) - (parseCreatedDate(a.created)?.getTime() || 0));

    if (authorArticles.length) {
      articlesContainer.innerHTML = '';
      authorArticles.forEach(article => {
        const item = document.createElement('div');
        item.className = 'modal-article';

        const title = document.createElement('a');
        title.className = 'modal-article-title';
        title.textContent = article.title;
        title.href = article.link;
        title.target = '_blank';
        title.rel = 'noopener';
        item.appendChild(title);

        const date = document.createElement('div');
        date.className = 'modal-article-date';
        date.innerHTML = `${icons.calendar}<span>${article.created.substring(0, 10)}</span>`;
        item.appendChild(date);

        articlesContainer.appendChild(item);
      });
      articlesContainer.dataset.fcircleRenderedAuthor = authorName;
    }

    const latestArticle = authorArticles[0];
    const latestDate = latestArticle?.created ? latestArticle.created.substring(0, 10) : '';
    const idleDays = daysSince(latestArticle?.created);
    const siteHref = nameLink.href;
    const shownArticleCount = articlesContainer.children.length || authorArticles.length;

    let summary = content.querySelector('.fcircle-modal-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'fcircle-modal-summary';
      nameLink.insertAdjacentElement('afterend', summary);
    }

    summary.innerHTML = `
      <span class="fcircle-modal-pill">${icons.file}<strong>${shownArticleCount}</strong><em>篇文章</em></span>
      <span class="fcircle-modal-pill">${icons.calendar}<strong>${latestDate || '未知'}</strong><em>最近更新</em></span>
      <span class="fcircle-modal-pill is-primary">${icons.clock}<strong>${formatIdleDays(idleDays)}</strong><em>动态状态</em></span>
    `;

    let actions = content.querySelector('.fcircle-modal-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'fcircle-modal-actions';
      summary.insertAdjacentElement('afterend', actions);
    }

    actions.innerHTML = `<a class="fcircle-modal-action is-primary" href="${siteHref}" target="_blank" rel="noopener">${icons.external}<span>访问站点</span></a>`;
    content.dataset.enhancedAuthor = authorName;
  }

  function enhanceFriendCircle() {
    replaceEmojis(root);
    enhanceStats();
    enhanceCards();
    enhanceModal();
  }

  const observer = new MutationObserver(enhanceFriendCircle);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.addEventListener('load', () => {
    enhanceFriendCircle();
    let count = 0;
    const timer = window.setInterval(() => {
      enhanceFriendCircle();
      count += 1;
      if (count > 20) window.clearInterval(timer);
    }, 250);
  });

  document.addEventListener('pjax:complete', enhanceFriendCircle);
})();
