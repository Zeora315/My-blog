(function () {
  const selectors = [
    "[gbtip]",
    "[data-gbtip]",
    "a[title]",
    "button[title]",
    "input[title]",
    "textarea[title]",
    "select[title]",
    "i[title]",
    "span[title]",
    "div[title]",
    "[aria-label]"
  ].join(",");
  let tooltip;
  let activeElement;

  function getTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.getElementById("gb-tooltip");
    return tooltip;
  }

  function getTipText(element) {
    if (!element) return "";

    return [
      element.getAttribute("gbtip"),
      element.getAttribute("data-gbtip"),
      element.dataset.gbtipTitle,
      element.getAttribute("aria-label")
    ].find(value => String(value || "").trim());
  }

  function getVisibleText(element) {
    return String(element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isIconOnly(element) {
    const text = getVisibleText(element);
    if (!text) return true;
    if (text.length <= 2 && element.querySelector("i,svg,img")) return true;
    return /^[\uE000-\uF8FF\s]+$/.test(text);
  }

  function shouldBindTooltip(element) {
    if (!element || element.closest("#rightside")) return false;
    if (element.tagName.toLowerCase() === "img") return false;
    if (element.hasAttribute("heotip")) return false;
    if (element.hasAttribute("gbtip") || element.hasAttribute("data-gbtip")) return true;
    if (!getTipText(element)) return false;

    const tag = element.tagName.toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return true;
    if (tag === "i") return true;

    return isIconOnly(element);
  }

  function isTopNavElement(element) {
    return Boolean(element && element.closest("#nav"));
  }

  function moveTooltip(event) {
    const tip = getTooltip();
    if (!tip || !activeElement) return;

    const targetRect = activeElement.getBoundingClientRect();
    const pointX = targetRect.left + targetRect.width / 2;
    const isTopNav = isTopNavElement(activeElement);
    const offset = isTopNav ? 14 : 12;
    const rect = tip.getBoundingClientRect();
    let left = pointX - rect.width / 2;
    let top = targetRect.top - rect.height - offset;

    if (isTopNav || top < 10) {
      top = targetRect.bottom + offset;
    }

    left = Math.min(Math.max(10, left), window.innerWidth - rect.width - 10);
    top = Math.min(Math.max(10, top), window.innerHeight - rect.height - 10);

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showTooltip(element, event) {
    const text = getTipText(element);
    const tip = getTooltip();
    if (!text || !tip) return;

    activeElement = element;
    tip.textContent = text;
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("show");
    moveTooltip(event);
  }

  function hideTooltip() {
    const tip = getTooltip();
    activeElement = null;
    if (!tip) return;

    tip.classList.remove("show");
    tip.setAttribute("aria-hidden", "true");
  }

  function bindTooltip() {
    document.querySelectorAll(selectors).forEach(element => {
      if (element.dataset.gbtipReady) return;

      const title = element.getAttribute("title");
      if (title) {
        element.dataset.gbtipTitle = title;
      }

      if (!shouldBindTooltip(element)) {
        if (title) delete element.dataset.gbtipTitle;
        return;
      }

      if (title) element.removeAttribute("title");
      element.dataset.gbtipReady = "true";

      element.addEventListener("mouseenter", event => showTooltip(element, event));
      element.addEventListener("mouseleave", hideTooltip);
      element.addEventListener("focus", event => showTooltip(element, event));
      element.addEventListener("blur", hideTooltip);
    });
  }

  document.addEventListener("DOMContentLoaded", bindTooltip);
  document.addEventListener("pjax:complete", bindTooltip);
  document.addEventListener("mouseover", event => {
    const element = event.target.closest(selectors);
    if (element && !element.dataset.gbtipReady) bindTooltip();
  });
  document.addEventListener("scroll", hideTooltip, true);
})();
