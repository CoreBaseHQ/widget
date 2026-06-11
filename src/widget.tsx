import { render } from "preact";
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IconMessageChatbot, IconSend2, IconX } from "@tabler/icons-react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

import widgetStyle from "./styles/widget.css?inline";

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  typographer: true,
  html: false,
});

// Force every rendered link to open safely: no referrer leak, no reverse
// tabnabbing. DOMPurify already strips event handlers and unknown protocols;
// this hardens the links it does keep.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
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
  error?: string;
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

const stripTrailingSlash = (value: string) =>
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

// The server suppresses tool-call fences for widget requests, but strip them
// here too as defense-in-depth: tool calls carry internal tool names and
// arguments (e.g. SQL) that must never surface to an end user. Removes both
// completed ```tool_call ... ``` blocks and a trailing partial fence still
// streaming in, so nothing flashes mid-stream.
const stripToolCalls = (text: string) => {
  let out = text.replace(/```tool_call\b[\s\S]*?```/g, "");
  const partial = out.indexOf("```tool_call");
  if (partial !== -1) {
    out = out.slice(0, partial);
  }
  return out.trimEnd();
};

const sanitizeStream = (text: string) => stripToolCalls(stripSources(text));

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

const App = ({ options }: { options: WidgetInitOptions }) => {
  const [open, setOpen] = useState(Boolean(options.initialOpen));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatIdRef = useRef(options.chatId || generateUuid());

  const apiBaseUrl = useMemo(
    () => stripTrailingSlash(options.apiBaseUrl),
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
              ? { ...msg, content: bodyText }
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
                ? { ...msg, content: msg.content + chunk }
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
      // Attach the error to the assistant turn itself so it renders inside
      // the conversation (and the loading dots stop, since the bubble is no
      // longer "pending").
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, error: message } : msg,
        ),
      );
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
          {messages.map((message) => {
            // Sanitize at render time so the stored stream stays raw (a
            // tool fence split across chunks reassembles correctly before
            // being stripped). Keeps internal tool calls / source markers
            // out of what the end user sees.
            const display = sanitizeStream(message.content);
            return (
            <div key={message.id} className={`cb-message cb-${message.role}`}>
              <div className="cb-bubble">
                {display && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(display),
                    }}
                  />
                )}
                {message.error ? (
                  <div className="cb-bubble-error">{message.error}</div>
                ) : (
                  // No content yet and no error → the turn is still pending.
                  !display && (
                    <div className="cb-loading">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )
                )}
              </div>
            </div>
            );
          })}
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
