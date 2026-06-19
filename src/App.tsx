import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconMessageChatbot,
  IconSend2,
  IconX,
} from "@tabler/icons-react";

import type { ChatMessage, WidgetInitOptions } from "./types";
import { generateUuid } from "./lib/uuid";
import { Message } from "./components/Message";

const DEFAULT_TITLE = "CoreBase";
const DEFAULT_PLACEHOLDER = "Ask a question";
const DEFAULT_EMPTY_STATE = "Ask a question";
const DEFAULT_ERROR_PREFIX = "Error: ";
const DEFAULT_SENDING = "Sending…";
const DEFAULT_SEND = "Send";

const stripTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const getToken = async (options: WidgetInitOptions) => {
  if (options.getAuthToken) {
    return await options.getAuthToken();
  }
  return options.authToken;
};

export const App = ({ options }: { options: WidgetInitOptions }) => {
  const [open, setOpen] = useState(Boolean(options.initialOpen));
  const [expanded, setExpanded] = useState(false);
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
            msg.id === assistantMessage.id ? { ...msg, content: bodyText } : msg,
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
          : "Unknown error";
      // Attach the error to the assistant turn itself so it renders inside the
      // conversation (and the loading dots stop, since the bubble is no longer
      // "pending").
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
  const lastIndex = messages.length - 1;

  return (
    <div
      className={`cb-widget ${open ? "is-open" : ""} ${
        expanded ? "is-expanded" : ""
      }`}
    >
      <button
        type="button"
        className="cb-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Toggle assistant"
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
          <IconMessageChatbot size={22} stroke={2} />
        )}
      </button>

      <div className="cb-panel" role="dialog" aria-live="polite">
        <header className="cb-header">
          <div className="cb-brand">
            <div className="cb-avatar">
              {options.logoUrl ? (
                <img src={options.logoUrl} alt="" />
              ) : (
                <IconMessageChatbot size={18} stroke={1.9} />
              )}
            </div>
            <div className="cb-brand-text">
              <div className="cb-title">{options.title || DEFAULT_TITLE}</div>
              <div className="cb-status">
                <span className="cb-status-dot" />
                Online
              </div>
            </div>
          </div>
          <div className="cb-header-actions">
            <button
              type="button"
              className="cb-icon-btn cb-expand"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? "Collapse" : "Expand"}
              aria-pressed={expanded}
            >
              {expanded ? (
                <IconArrowsDiagonalMinimize2 size={17} stroke={2} />
              ) : (
                <IconArrowsDiagonal size={17} stroke={2} />
              )}
            </button>
            <button
              type="button"
              className="cb-icon-btn cb-close"
              onClick={() => {
                setOpen(false);
                setExpanded(false);
              }}
              aria-label="Close"
            >
              <IconX size={18} stroke={2.1} />
            </button>
          </div>
        </header>

        <div className="cb-messages">
          {!hasMessages && (
            <div className="cb-empty">
              <div className="cb-empty-icon">
                <IconMessageChatbot size={26} stroke={1.5} />
              </div>
              <div className="cb-empty-text">{DEFAULT_EMPTY_STATE}</div>
            </div>
          )}
          {messages.map((message, i) => (
            <Message
              key={message.id}
              message={message}
              streaming={sending && i === lastIndex && message.role === "assistant"}
            />
          ))}
          <div ref={endRef} />
        </div>

        <div className="cb-input">
          <div className="cb-composer">
            <textarea
              ref={inputRef}
              placeholder={options.placeholder || DEFAULT_PLACEHOLDER}
              value={input}
              onInput={(event) => setInput(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              type="button"
              className="cb-send"
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              aria-label={sending ? DEFAULT_SENDING : DEFAULT_SEND}
            >
              {sending ? (
                <span className="cb-spinner" />
              ) : (
                <IconSend2 size={17} stroke={2.1} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
