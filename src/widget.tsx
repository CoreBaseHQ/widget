import { render } from "preact";

import widgetStyle from "./styles/widget.css?inline";
import type { WidgetApi, WidgetInitOptions } from "./types";
import { App } from "./App";

let activeRoot: HTMLElement | null = null;
let activeMount: HTMLElement | null = null;
let createdRoot = false;
let fontLink: HTMLLinkElement | null = null;

// Load a custom font stylesheet into the document head so its @font-face
// registers globally and resolves inside the widget's shadow DOM. Idempotent —
// replaces any previously loaded one; cleared on destroy.
const loadFont = (url?: string) => {
  if (fontLink) {
    fontLink.remove();
    fontLink = null;
  }
  if (!url || typeof document === "undefined") {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.setAttribute("data-corebase-widget-font", "");
  document.head.appendChild(link);
  fontLink = link;
};

const createContainer = (containerId?: string) => {
  if (containerId) {
    const existing = document.getElementById(containerId);
    if (existing) {
      existing.classList.add("cb-root");
      createdRoot = false;
      return existing;
    }
  }

  const container = document.createElement("div");
  container.id = containerId || "corebase-widget";
  container.className = "cb-root";
  document.body.appendChild(container);
  createdRoot = true;
  return container;
};

const createShadowMount = (host: HTMLElement) => {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadowRoot.innerHTML = "";

  const styleLink = document.createElement("style");
  styleLink.textContent = widgetStyle;
  shadowRoot.appendChild(styleLink);

  const mount = document.createElement("div");
  mount.className = "cb-widget-shell";
  shadowRoot.appendChild(mount);

  return mount;
};

const destroy = () => {
  if (activeMount) {
    render(null, activeMount);
    activeMount = null;
  }

  if (activeRoot) {
    if (createdRoot) {
      activeRoot.remove();
    } else if (activeRoot.shadowRoot) {
      activeRoot.shadowRoot.innerHTML = "";
    }
    activeRoot = null;
    createdRoot = false;
  }

  if (fontLink) {
    fontLink.remove();
    fontLink = null;
  }
};

export const init = (options: WidgetInitOptions) => {
  destroy();

  const container = createContainer(options.containerId);
  container.style.position = "fixed";
  container.style.right = "24px";
  container.style.bottom = "24px";
  container.style.display = "block";
  container.style.width = "auto";
  container.style.height = "auto";
  container.style.overflow = "visible";
  container.style.setProperty("--cb-accent", options.primaryColor || "#0b5fff");
  container.style.setProperty("--cb-z", String(options.zIndex ?? 2147483000));
  if (options.fontFamily) {
    container.style.setProperty("--cb-font", options.fontFamily);
  }
  loadFont(options.fontUrl);

  activeRoot = container;
  activeMount = createShadowMount(container);
  render(<App options={options} />, activeMount);
};

const api: WidgetApi = { init, destroy };

if (typeof window !== "undefined") {
  window.CorebaseWidget = api;
}

export default api;
