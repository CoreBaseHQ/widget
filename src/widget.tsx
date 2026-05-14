import { render } from "preact";
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IconMessageChatbot, IconSend2, IconX } from "@tabler/icons-react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const widgetStyleHref = new URL("./styles/widget.css", import.meta.url).href;

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  typographer: true,
  html: false,
});

const renderMarkdown = (text: string): string => {
  try {
    const dirty = md.render(text);
    const clean = DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [
        "b",
        "i",
        "em",
        "strong",
        "p",
        "br",
        "ul",
        "ol",
        "li",
        "code",
        "pre",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "a",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "title"],
      ALLOW_UNKNOWN_PROTOCOLS: false,
      KEEP_CONTENT: true,
    });
    return clean;
  } catch {
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }
};

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
};

type WidgetInitOptions = {
  apiBaseUrl: string;
  publicId?: string;
  authToken?: string;
  getAuthToken?: () => Promise<string> | string;
  title?: string;
  placeholder?: string;
  initialOpen?: boolean;
  containerId?: string;
  chatId?: string;
  primaryColor?: string;
  logoUrl?: string;
  zIndex?: number;
};

type WidgetApi = {
  init: (options: WidgetInitOptions) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    CorebaseWidget: WidgetApi;
  }
}

const DEFAULT_TITLE = "CoreBase";
const DEFAULT_PLACEHOLDER = "Ask a question";
const DEFAULT_EMPTY_STATE = "Ask a question";
const DEFAULT_ERROR_PREFIX = "Error: ";
const DEFAULT_SENDING = "Sending...";
const DEFAULT_SEND = "Send";

let activeRoot: HTMLElement | null = null;
let activeMount: HTMLElement | null = null;
let createdRoot = false;

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
};

const getToken = async (options: WidgetInitOptions) => {
  if (options.getAuthToken) {
    return await options.getAuthToken();
  }
  return options.authToken;
};

const ensureLeadingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  let uuid = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
      continue;
    }
    if (i === 14) {
      uuid += "4";
      continue;
    }
    const random = (Math.random() * 16) | 0;
    const value = i === 19 ? (random & 0x3) | 0x8 : random;
    uuid += value.toString(16);
  }
  return uuid;
};

const stripSources = (text: string) => {
  const marker = "<!--corebase-sources";
  const index = text.indexOf(marker);
  if (index === -1) {
    return text;
  }
  return text.slice(0, index).trimEnd();
};

const createShadowMount = (host: HTMLElement) => {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadowRoot.innerHTML = "";

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = widgetStyleHref;
  shadowRoot.appendChild(link);

  const mount = document.createElement("div");
  mount.className = "cb-widget-shell";
  shadowRoot.appendChild(mount);

  return mount;
};

const App = ({ options }: { options: WidgetInitOptions }) => {
  const [open, setOpen] = useState(Boolean(options.initialOpen));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatIdRef = useRef(options.chatId || generateUuid());

  const apiBaseUrl = useMemo(
    () => ensureLeadingSlash(options.apiBaseUrl),
    [options.apiBaseUrl],
  );

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) {
      return;
    }

    setError(null);
    setSending(true);
    setInput("");

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const token = await getToken(options);
      const response = await fetch(`${apiBaseUrl}/api/widget/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.publicId ? { "X-Public-Id": options.publicId } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: chatIdRef.current,
          messages: [...messages, userMessage].map((message) => ({
            role: message.role,
            parts: [{ type: "text", text: message.content }],
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const bodyText = await response.text();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: stripSources(bodyText) }
              : msg,
          ),
        );
        return;
      }

      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: stripSources(msg.content + chunk) }
                : msg,
            ),
          );
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? `${DEFAULT_ERROR_PREFIX}${err.message}`
          : "Bilinmeyen hata";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (
    event: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className={`cb-widget ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="cb-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Asistanı Aç/Kapat"
      >
        {open ? (
          <IconX size={22} stroke={2.1} />
        ) : options.logoUrl ? (
          <img
            src={options.logoUrl}
            alt="Logo"
            className="cb-toggle-icon"
            loading="eager"
            decoding="async"
          />
        ) : (
          <IconMessageChatbot size={20} stroke={2} />
        )}
      </button>

      <div className="cb-panel" role="dialog" aria-live="polite">
        <header className="cb-header">
          <div className="cb-title">{options.title || DEFAULT_TITLE}</div>
        </header>

        <div className="cb-messages">
          {!hasMessages && (
            <div className="cb-empty">{DEFAULT_EMPTY_STATE}</div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`cb-message cb-${message.role}`}>
              <div className="cb-bubble">
                {message.content ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(message.content),
                    }}
                  />
                ) : (
                  <div className="cb-loading">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="cb-input">
          <textarea
            ref={inputRef}
            placeholder={options.placeholder || DEFAULT_PLACEHOLDER}
            value={input}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            type="button"
            className="cb-send"
            onClick={sendMessage}
            disabled={sending || !input.trim()}
          >
            <span>{sending ? DEFAULT_SENDING : DEFAULT_SEND}</span>
            {!sending && <IconSend2 size={16} stroke={2.1} />}
          </button>
        </div>

        {error && <div className="cb-error">{error}</div>}
      </div>
    </div>
  );
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

  activeRoot = container;
  activeMount = createShadowMount(container);
  render(<App options={options} />, activeMount);
};

const api: WidgetApi = { init, destroy };

if (typeof window !== "undefined") {
  window.CorebaseWidget = api;
}

export default api;
