import { lifecycle } from "./core/lifecycle.js";

const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const parseJson = (element, fallback) => {
  try {
    return JSON.parse(element?.content?.textContent || element?.textContent || "");
  } catch (error) {
    console.error("Failed to parse archive JSON:", error);
    return fallback;
  }
};

const contribWallController = {
  monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  oneDay: 24 * 60 * 60 * 1000,
  contexts: new Set(),

  init() {
    document.querySelectorAll(".contrib-wall").forEach((wall) => {
      if (wall.dataset.contribInitialized === "true") return;

      const data = parseJson(wall.querySelector(".contrib-wall-data"), {});
      const context = {
        wall,
        data: data && typeof data === "object" ? data : {},
        title: wall.querySelector(".contrib-wall-title"),
        monthsRow: wall.querySelector(".contrib-months"),
        gridWrapper: wall.querySelector(".contrib-grid-wrapper"),
        yearTabs: wall.querySelector(".contrib-year-tabs"),
        usesArchiveYearButtons: Boolean(document.getElementById("archives-page")),
      };

      if (!context.title || !context.monthsRow || !context.gridWrapper) return;
      wall.dataset.contribInitialized = "true";

      context.years = this.getYears(context.data);
      context.activeYear = this.normalizeYear(this.getInitialYear(context), context);
      this.contexts.add(context);
      wall.classList.toggle("uses-archive-year-buttons", context.usesArchiveYearButtons);
      const syncViewportMode = () => this.syncViewportMode(wall);

      syncViewportMode();
      lifecycle.listen(window, "resize", syncViewportMode);
      if (window.visualViewport) lifecycle.listen(window.visualViewport, "resize", syncViewportMode);
      this.renderYear(context, context.activeYear);
    });
  },

  getYears(data) {
    const years = Object.keys(data)
      .map((date) => date.slice(0, 4))
      .filter((year, index, list) => list.indexOf(year) === index)
      .sort((a, b) => Number(b) - Number(a));
    return years.length ? years : [String(new Date().getFullYear())];
  },

  getInitialYear(context) {
    const activeArchiveButton = document.querySelector(".archive-year-button.is-active");
    return activeArchiveButton?.dataset.year || context.years[0];
  },

  normalizeYear(year, context) {
    if (!year || year === "all") return context.years[0];
    return context.years.includes(String(year)) ? String(year) : context.years[0];
  },

  pad(value) {
    return value < 10 ? `0${value}` : String(value);
  },

  formatDate(date) {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  },

  sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  },

  addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  },

  levelFor(count, maxCount) {
    if (!count) return 0;
    if (maxCount <= 1) return 2;
    return Math.max(1, Math.ceil((count / maxCount) * 4));
  },

  postsLabel(count) {
    return `${count}${count === 1 ? " post" : " posts"}`;
  },

  getViewportWidth() {
    const widths = [window.innerWidth, document.documentElement?.clientWidth || 0];
    if (window.visualViewport?.width) widths.push(window.visualViewport.width);
    const validWidths = widths.filter((width) => Number.isFinite(width) && width > 0);
    return validWidths.length ? Math.min(...validWidths) : window.innerWidth;
  },

  detectMobileViewport() {
    const width = this.getViewportWidth();
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
    const noHover = window.matchMedia?.("(hover: none)").matches;
    const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    return width <= 700 || (width <= 980 && (coarsePointer || noHover || touchCapable));
  },

  syncViewportMode(wall) {
    const isMobile = this.detectMobileViewport();
    wall.classList.toggle("is-mobile", isMobile);
    wall.classList.toggle("is-desktop", !isMobile);
    wall.dataset.viewportMode = isMobile ? "mobile" : "desktop";
  },

  renderTabs(context, activeYear) {
    if (!context.yearTabs || context.usesArchiveYearButtons) return;
    context.yearTabs.replaceChildren();
    context.years.forEach((year) => {
      const tab = createElement("button", "contrib-year-tab", year);
      tab.type = "button";
      tab.setAttribute("aria-pressed", String(year === activeYear));
      tab.classList.toggle("active", year === activeYear);
      lifecycle.listen(tab, "click", () => this.renderYear(context, year, years));
      context.yearTabs.appendChild(tab);
    });
  },

  renderYear(context, year) {
    year = this.normalizeYear(year, context);
    context.activeYear = year;
    const yearNumber = Number(year);
    context.gridWrapper.replaceChildren();
    context.monthsRow.replaceChildren();

    const startDate = new Date(yearNumber, 0, 1);
    const endDate = new Date(yearNumber, 11, 31);
    const gridStart = this.addDays(startDate, -startDate.getDay());
    const gridEnd = this.addDays(endDate, 6 - endDate.getDay());
    const totalDays = Math.round((gridEnd - gridStart) / this.oneDay) + 1;
    const numWeeks = Math.ceil(totalDays / 7);
    let yearTotal = 0;
    let maxCount = 0;

    Object.keys(context.data).forEach((date) => {
      if (date.slice(0, 4) !== year) return;
      yearTotal += context.data[date];
      maxCount = Math.max(maxCount, context.data[date]);
    });

    context.wall.style.setProperty("--contrib-weeks", numWeeks);
    context.title.textContent = `${yearTotal} contributions in ${year}`;

    this.monthNames.forEach((month, index) => {
      const firstOfMonth = new Date(yearNumber, index, 1);
      const weekIndex = Math.floor((firstOfMonth - gridStart) / this.oneDay / 7) + 1;
      const label = createElement("span", "", month);
      label.style.gridColumn = `${weekIndex} / span 4`;
      context.monthsRow.appendChild(label);
    });

    const today = new Date();
    let currentDate = new Date(gridStart);
    while (currentDate <= gridEnd) {
      const dateStr = this.formatDate(currentDate);
      const count = context.data[dateStr] || 0;
      const isOutsideYear = currentDate.getFullYear() !== yearNumber;
      const level = isOutsideYear ? 0 : this.levelFor(count, maxCount);
      const cell = createElement("div", `contrib-cell level-${level}`);

      if (isOutsideYear) {
        cell.classList.add("is-outside-year");
        cell.setAttribute("aria-hidden", "true");
      } else {
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", `${this.postsLabel(count)} on ${dateStr}`);
        cell.dataset.gbtip = `${this.postsLabel(count)} on ${dateStr}`;
        if (this.sameDay(currentDate, today)) cell.classList.add("is-today");
      }

      context.gridWrapper.appendChild(cell);
      currentDate = this.addDays(currentDate, 1);
    }

    this.renderTabs(context, year);
  },

  renderForYear(year) {
    this.contexts.forEach((context) => this.renderYear(context, year));
  },
};

export const archivePageController = (() => {
  const controller = {
    init() {
      const shell = document.getElementById('archives-page');
      const dataElement = document.getElementById('archive-page-data');
      if (!shell || !dataElement || shell.dataset.archiveInitialized === 'true') return;

      const posts = parseJson(dataElement, []);

      shell.dataset.archiveInitialized = 'true';
      this.shell = shell;
      this.list = shell.querySelector('#archives-page-list');
      this.yearList = shell.querySelector('#archives-year-filter-list');
      this.pagination = shell.querySelector('#pagination .pagination');
      this.paginationSection = shell.querySelector('.archive-page-section-pagination');
      this.posts = Array.isArray(posts) ? posts : [];
      this.perPage = Math.max(Number(shell.dataset.perPage) || 10, 1);
      this.years = [...new Set(this.posts.map(post => String(post.year)))].sort((a, b) => Number(b) - Number(a));
      this.activeYear = this.years.includes(shell.dataset.initialYear) ? shell.dataset.initialYear : 'all';
      this.currentPage = Math.max(Number(shell.dataset.initialPage) || 1, 1);

      this.renderYears();
      this.bindEvents();
      this.render();
    },

    bindEvents() {
      this.shell.addEventListener('click', event => {
        const yearButton = event.target.closest('.archive-year-button');
        if (yearButton) {
          this.activeYear = yearButton.dataset.year;
          this.currentPage = 1;
          this.render();
          contribWallController.renderForYear(this.activeYear);
          return;
        }

        const pageButton = event.target.closest('[data-archive-page]');
        if (!pageButton || pageButton.disabled) return;
        this.currentPage = Number(pageButton.dataset.archivePage);
        this.render();
        this.shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },

    renderYears() {
      this.yearList.replaceChildren();
      this.years.forEach(year => {
        const button = createElement('button', 'archive-year-button', year);
        button.type = 'button';
        button.dataset.year = year;
        button.setAttribute('aria-pressed', 'false');
        this.yearList.appendChild(button);
      });
    },

    render() {
      const filteredPosts = this.activeYear === 'all'
        ? this.posts
        : this.posts.filter(post => String(post.year) === this.activeYear);
      const totalPages = Math.max(Math.ceil(filteredPosts.length / this.perPage), 1);
      this.currentPage = Math.min(this.currentPage, totalPages);

      this.shell.querySelectorAll('.archive-year-button').forEach(button => {
        const active = button.dataset.year === this.activeYear;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      this.list.replaceChildren();
      if (!filteredPosts.length) {
        this.renderState(this.shell, '当前年份下暂无文章。');
      } else {
        const start = (this.currentPage - 1) * this.perPage;
        filteredPosts.slice(start, start + this.perPage).forEach(post => {
          this.list.appendChild(this.createPostItem(post));
        });
      }

      this.renderPagination(totalPages);
    },

    createPostItem(post) {
      const item = createElement('a', 'archive-page-item');
      item.href = post.url;

      const thumb = createElement('div', 'archive-page-thumb');
      const image = createElement('img');
      image.src = post.cover;
      image.alt = post.title;
      image.loading = 'lazy';
      image.addEventListener('error', () => thumb.classList.add('is-fallback'), { once: true });
      const fallback = createElement('span', 'archive-page-thumb-fallback', (post.title || '文').trim().charAt(0) || '文');
      thumb.append(image, fallback);

      const main = createElement('div', 'archive-page-item-main');
      const title = createElement('div', 'archive-page-item-title', post.title);
      const meta = createElement('div', 'archive-page-item-meta');
      meta.append(
        createElement('span', 'archive-page-item-category', post.primaryCategory || '未分类'),
        createElement('span', 'archive-page-item-divider', '/'),
        createElement('span', 'archive-page-item-date', post.dateLabel)
      );
      main.append(title, meta);

      const arrow = createElement('div', 'archive-page-item-arrow');
      const arrowIcon = createElement('i', 'solitude fas fa-chevron-right');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.appendChild(arrowIcon);
      item.append(thumb, main, arrow);
      return item;
    },

    renderPagination(totalPages) {
      this.pagination.replaceChildren();
      this.paginationSection.hidden = totalPages <= 1;
      if (totalPages <= 1) return;

      this.pagination.appendChild(this.createPageButton(this.currentPage - 1, '上一页', 'archive-page-extend prev', this.currentPage === 1, 'fa-chevron-left'));

      this.getPageRange(totalPages).forEach(page => {
        if (page === 'space') {
          this.pagination.appendChild(createElement('span', 'archive-page-space', '...'));
          return;
        }
        const button = this.createPageButton(page, String(page), 'archive-page-number', false);
        if (page === this.currentPage) {
          button.classList.add('is-current');
          button.setAttribute('aria-current', 'page');
        }
        this.pagination.appendChild(button);
      });

      this.pagination.appendChild(this.createPageButton(this.currentPage + 1, '下一页', 'archive-page-extend next', this.currentPage === totalPages, 'fa-chevron-right'));
    },

    createPageButton(page, label, className, disabled, iconName) {
      const button = createElement('button', className);
      button.type = 'button';
      button.disabled = disabled;
      button.dataset.archivePage = String(page);
      button.setAttribute('aria-label', label);
      if (iconName === 'fa-chevron-left') button.appendChild(createElement('i', `solitude fas ${iconName}`));
      button.appendChild(createElement('span', '', label));
      if (iconName === 'fa-chevron-right') button.appendChild(createElement('i', `solitude fas ${iconName}`));
      return button;
    },

    getPageRange(totalPages) {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      if (this.currentPage <= 4) return [1, 2, 3, 4, 5, 'space', totalPages];
      if (this.currentPage >= totalPages - 3) return [1, 'space', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      return [1, 'space', this.currentPage - 1, this.currentPage, this.currentPage + 1, 'space', totalPages];
    },

    renderState(shell, message) {
      const list = shell.querySelector('#archives-page-list');
      if (!list) return;
      list.replaceChildren(createElement('div', 'archive-page-state', message));
    },

    destroy() {
      this.shell = null;
      this.list = null;
      this.yearList = null;
      this.pagination = null;
      this.paginationSection = null;
      this.posts = [];
    }
  };

  return controller;
})();

export const initArchivePage = () => archivePageController.init();
export const initContribWall = () => contribWallController.init();
