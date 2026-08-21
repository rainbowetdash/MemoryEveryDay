const interfaceSettingsStorageKey = "memory-everyday-interface-settings-v1";
const interfaceTabs = [
  {
    id: "calendar",
    screen: "calendar-screen",
    label: "日历",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"></rect><path d="M8 2v4M16 2v4M3 9h18M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2"></path></svg>',
  },
  {
    id: "day",
    screen: "day-screen",
    label: "日程",
    icon: '<svg viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12"></path><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"></circle></svg>',
  },
  {
    id: "memo",
    screen: "memo-screen",
    label: "备忘录",
    icon: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5zM16 3v4h3M8 11h8M8 15h8M8 19h5"></path></svg>',
  },
  {
    id: "anniversary",
    screen: "anniversary-screen",
    label: "纪念日",
    icon: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path></svg>',
  },
  {
    id: "settings",
    screen: "settings-screen",
    label: "设置",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.2-2.2.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1h-.2v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
  },
];
const interfaceThemes = [
  { id: "blue", label: "海雾蓝", color: "#1769aa" },
  { id: "mint", label: "薄荷绿", color: "#277f75" },
  { id: "violet", label: "晨雾紫", color: "#7253a6" },
  { id: "coral", label: "暖珊瑚", color: "#bf6465" },
  { id: "night", label: "暮夜蓝", color: "#1b2636" },
];

function defaultInterfaceSettings() {
  return {
    theme: "blue",
    order: interfaceTabs.map((item) => item.id),
    enabled: {
      calendar: true,
      day: true,
      memo: true,
      anniversary: true,
      settings: true,
    },
  };
}
function normalizeInterfaceSettings(value) {
  const fallback = defaultInterfaceSettings(),
    source = value && typeof value === "object" ? value : {};
  const order = [
    ...new Set(Array.isArray(source.order) ? source.order : fallback.order),
  ].filter((id) => interfaceTabs.some((item) => item.id === id));
  fallback.order.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  return {
    theme: interfaceThemes.some((item) => item.id === source.theme)
      ? source.theme
      : fallback.theme,
    order,
    enabled: { ...fallback.enabled, ...(source.enabled || {}), settings: true },
  };
}
function readInterfaceSettings() {
  try {
    return normalizeInterfaceSettings(
      JSON.parse(localStorage.getItem(interfaceSettingsStorageKey) || "null"),
    );
  } catch {
    return defaultInterfaceSettings();
  }
}
let interfaceSettings = readInterfaceSettings();
function saveInterfaceSettings() {
  localStorage.setItem(
    interfaceSettingsStorageKey,
    JSON.stringify(interfaceSettings),
  );
  document.body.dataset.appTheme = interfaceSettings.theme;
}
function tabById(id) {
  return interfaceTabs.find((item) => item.id === id);
}
function visibleInterfaceTabs() {
  return interfaceSettings.order
    .map(tabById)
    .filter(Boolean)
    .filter(
      (item) => item.id === "settings" || interfaceSettings.enabled[item.id],
    );
}
function activeScreenId() {
  return (
    [...document.querySelectorAll(".screen")].find(
      (screen) => !screen.classList.contains("is-hidden"),
    )?.id || "calendar-screen"
  );
}
function activateInterfaceScreen(screenId) {
  const target = document.getElementById(screenId);
  if (!target) return;
  document
    .querySelectorAll(".screen")
    .forEach((screen) =>
      screen.classList.toggle("is-hidden", screen !== target),
    );
  updateFloatingAction(screenId);
  updateSidebarAvailability(screenId);
  renderTabbar();
}
function renderTabbar() {
  const tabbar = document.querySelector(".tabbar");
  if (!tabbar) return;
  const visible = visibleInterfaceTabs();
  let active = activeScreenId();
  if (!visible.some((item) => item.screen === active))
    active = "settings-screen";
  tabbar.dataset.tabCount = String(visible.length);
  tabbar.innerHTML = visible
    .map(
      (item) =>
        `<button class="tab ${item.screen === active ? "is-active" : ""}" data-screen="${item.screen}"><span class="tab-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></button>`,
    )
    .join("");
  tabbar.querySelectorAll(".tab").forEach((button) => {
    button.onclick = () => activateInterfaceScreen(button.dataset.screen);
  });
  if (active !== activeScreenId()) activateInterfaceScreen(active);
}
function accountSettingsCopy() {
  return state.user
    ? {
        name: accountDisplayName(),
        status: state.user.email || "已登录，可在其他设备继续查看和编辑",
      }
    : {
        name: "登录并同步",
        status: "登录后可在手机和电脑之间同步日程与备忘录",
      };
}
function renderSettings() {
  document.body.dataset.appTheme = interfaceSettings.theme;
  const account = accountSettingsCopy(),
    themeList = document.getElementById("settings-theme-list"),
    orderList = document.getElementById("settings-order-list");
  document.getElementById("settings-account-name").textContent = account.name;
  document.getElementById("settings-account-status").textContent =
    account.status;
  themeList.innerHTML = interfaceThemes
    .map(
      (theme) =>
        `<button type="button" class="settings-theme-choice ${interfaceSettings.theme === theme.id ? "is-selected" : ""}" data-interface-theme="${theme.id}" role="option" aria-selected="${interfaceSettings.theme === theme.id}"><i style="--theme-color:${theme.color}"></i><span>${theme.label}</span></button>`,
    )
    .join("");
  orderList.innerHTML = interfaceSettings.order
    .map(tabById)
    .filter(Boolean)
    .map(
      (item) =>
        `<div class="settings-order-row" data-interface-order="${item.id}" draggable="false" role="listitem"><span class="settings-drag-handle" data-interface-drag-handle aria-hidden="true">⠿</span><span class="settings-order-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>${item.id === "settings" ? '<small class="settings-order-fixed">始终显示</small>' : `<button type="button" class="settings-order-toggle ${interfaceSettings.enabled[item.id] ? "is-on" : ""}" data-interface-feature="${item.id}" role="switch" aria-checked="${interfaceSettings.enabled[item.id]}" aria-label="${item.label}${interfaceSettings.enabled[item.id] ? "已显示" : "已隐藏"}"></button>`}</div>`,
    )
    .join("");
  document.getElementById("settings-account-button").onclick = () =>
    openAuthDialog(state.user ? "login" : "login");
  themeList.querySelectorAll("[data-interface-theme]").forEach((button) => {
    button.onclick = () => {
      interfaceSettings.theme = button.dataset.interfaceTheme;
      saveInterfaceSettings();
      renderSettings();
    };
  });
  orderList.querySelectorAll("[data-interface-feature]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.interfaceFeature;
      interfaceSettings.enabled[id] = !interfaceSettings.enabled[id];
      saveInterfaceSettings();
      if (
        activeScreenId() === tabById(id).screen &&
        !interfaceSettings.enabled[id]
      )
        activateInterfaceScreen("settings-screen");
      else renderTabbar();
      renderSettings();
    };
  });
  setupSettingsOrderDrag(orderList);
  if (typeof updateAccountUI === "function") updateAccountUI();
}
function saveSettingsOrder(orderList) {
  interfaceSettings.order = [
    ...orderList.querySelectorAll("[data-interface-order]"),
  ].map((row) => row.dataset.interfaceOrder);
  saveInterfaceSettings();
  renderTabbar();
  renderSettings();
}
function setupSettingsOrderDrag(orderList) {
  let dragging = null,
    pointerId = null,
    startY = 0,
    moved = false,
    lastPosition = -1,
    tracking = false;
  const feedback = document.getElementById("settings-order-feedback");
  const updateFeedback = (message) => {
    if (feedback) feedback.textContent = message;
  };
  const clearDropMarkers = () => {
    orderList
      .querySelectorAll(".is-drop-target, .is-drop-last")
      .forEach((row) => row.classList.remove("is-drop-target", "is-drop-last"));
  };
  const animateReflow = (before) => {
    orderList.querySelectorAll("[data-interface-order]").forEach((row) => {
      const previous = before.get(row);
      if (!previous) return;
      const offset = previous.top - row.getBoundingClientRect().top;
      if (!offset) return;
      row.style.transition = "none";
      row.style.transform = `translateY(${offset}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "";
        row.style.transform = "";
      });
    });
  };
  const applyOrderPreview = () => {
    interfaceSettings.order = [
      ...orderList.querySelectorAll("[data-interface-order]"),
    ].map((row) => row.dataset.interfaceOrder);
    renderTabbar();
  };
  const moveByPosition = (clientY) => {
    if (!dragging) return;
    const rows = [...orderList.querySelectorAll("[data-interface-order]")],
      before = new Map(rows.map((row) => [row, row.getBoundingClientRect()])),
      target = rows.find((row) => row !== dragging && clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    const previousPosition = rows.indexOf(dragging);
    orderList.insertBefore(dragging, target || null);
    const position = [...orderList.querySelectorAll("[data-interface-order]")].indexOf(dragging);
    if (position === previousPosition) return;
    animateReflow(before);
    clearDropMarkers();
    const next = dragging.nextElementSibling;
    if (next) next.classList.add("is-drop-target");
    else dragging.classList.add("is-drop-last");
    const displayPosition = position + 1;
    applyOrderPreview();
    if (displayPosition !== lastPosition) {
      lastPosition = displayPosition;
      updateFeedback(`正在将「${tabById(dragging.dataset.interfaceOrder)?.label || "功能"}」移动到第 ${displayPosition} 位`);
    }
  };
  const stopTracking = () => {
    if (!tracking) return;
    tracking = false;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", finish, true);
  };
  const start = (row, event) => {
    if (dragging) return;
    event.preventDefault?.();
    dragging = row;
    pointerId = event.pointerId ?? "mouse";
    startY = event.clientY;
    moved = false;
    lastPosition = [...orderList.querySelectorAll("[data-interface-order]")].indexOf(row) + 1;
    clearDropMarkers();
    updateFeedback(`已选中「${tabById(row.dataset.interfaceOrder)?.label || "功能"}」，向上或向下拖动即可调整`);
    document.body.classList.add("is-reordering-navigation");
    row.setPointerCapture?.(event.pointerId);
    tracking = true;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
  };
  const move = (event) => {
    if (
      !dragging ||
      (event.pointerId !== undefined && event.pointerId !== pointerId) ||
      Math.abs(event.clientY - startY) < 5
    )
      return;
    moved = true;
    event.preventDefault?.();
    dragging.classList.add("is-dragging");
    moveByPosition(event.clientY);
  };
  const finish = (event = {}) => {
    if (
      !dragging ||
      (event.pointerId !== undefined && event.pointerId !== pointerId)
    )
      return;
    const row = dragging;
    row.classList.remove("is-dragging");
    clearDropMarkers();
    stopTracking();
    document.body.classList.remove("is-reordering-navigation");
    dragging = null;
    pointerId = null;
    if (moved) {
      const position = [...orderList.querySelectorAll("[data-interface-order]")].indexOf(row) + 1,
        label = tabById(row.dataset.interfaceOrder)?.label || "功能";
      saveSettingsOrder(orderList);
      document.getElementById("settings-order-feedback").textContent = `已将「${label}」调整到第 ${position} 位`;
      const tabbar = document.querySelector(".tabbar");
      tabbar?.classList.remove("is-order-updated");
      requestAnimationFrame(() => tabbar?.classList.add("is-order-updated"));
    } else updateFeedback("按住左侧六个点即可调整顺序");
  };
  orderList.querySelectorAll("[data-interface-order]").forEach((row) => {
    const handle = row.querySelector("[data-interface-drag-handle]");
    row.draggable = false;
    handle?.addEventListener("pointerdown", (event) => start(row, event));
    handle?.addEventListener("mousedown", (event) => {
      if (!window.PointerEvent && event.button === 0) start(row, event);
    });
  });
  window.addEventListener("mousemove", (event) => {
    if (!window.PointerEvent) move(event);
  });
  window.addEventListener("mouseup", () => {
    if (!window.PointerEvent) finish();
  });
}

saveInterfaceSettings();
renderSettings();
renderTabbar();
