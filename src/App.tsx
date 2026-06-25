import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconMessageChatbot,
  IconMessages,
  IconMicrophone,
  IconPencilPlus,
  IconPlayerStopFilled,
  IconSend2,
  IconX,
} from "@tabler/icons-react";

import type { ChatMessage, WidgetInitOptions } from "./types";

type ChatSummary = { id: string; title: string | null; created_at: string };
import { generateUuid } from "./lib/uuid";
import {
  useVoiceSession,
  type VoicePhase,
  type VoiceStatus,
} from "./lib/voice";
import { friendlyError, networkErrorMessage, parseErrorBody } from "./lib/errors";
import {
  getStrings,
  resolveLocale,
  type Locale,
  type Strings,
} from "./lib/i18n";
import { Message } from "./components/Message";

const DEFAULT_TITLE = "CoreBase";

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
  // Chat history (this end-user's past conversations).
  const [view, setView] = useState<"chat" | "history">("chat");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatIdRef = useRef(options.chatId || generateUuid());

  const apiBaseUrl = useMemo(
    () => stripTrailingSlash(options.apiBaseUrl),
    [options.apiBaseUrl],
  );

  // UI language — explicit `locale` option, else auto-detected from the browser.
  const locale = useMemo(() => resolveLocale(options.locale), [options.locale]);
  const s = useMemo(() => getStrings(locale), [locale]);

  // Theme: "dark" (default) | "light" | "auto" (follow the visitor's OS).
  const theme = options.theme ?? "dark";
  const [systemLight, setSystemLight] = useState(false);
  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined" || !window.matchMedia)
      return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    setSystemLight(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  const isLight = theme === "light" || (theme === "auto" && systemLight);

  const voiceEnabled = Boolean(options.voiceEnabled);
  // Mirror the spoken conversation into the chat list as text. Each transcript
  // segment upserts a bubble by id (interim updates replace in place; the final
  // settles it), so voice turns read back exactly like typed ones.
  const onTranscript = useCallback(
    (seg: { id: string; role: "user" | "assistant"; text: string }) => {
      const msgId = `voice-${seg.role}-${seg.id}`;
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === msgId);
        if (i !== -1) {
          const next = prev.slice();
          next[i] = { ...next[i], content: seg.text };
          return next;
        }
        return [...prev, { id: msgId, role: seg.role, content: seg.text }];
      });
    },
    [],
  );
  const voice = useVoiceSession(
    options,
    () => getToken(options),
    s,
    onTranscript,
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
        const msg = friendlyError(
          response.status,
          await parseErrorBody(response),
          s,
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, error: msg } : m,
          ),
        );
        return;
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
      // Network / unexpected failures → friendly, localized message — never the
      // raw browser string ("NetworkError when attempting to fetch resource.").
      const message = networkErrorMessage(err, s);
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

  // History
  const authHeaders = useCallback(async () => {
    const token = await getToken(options);
    return {
      ...(options.publicId ? { "X-Public-Id": options.publicId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [options]);

  const openHistory = useCallback(async () => {
    setView("history");
    setHistoryLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/widget/chats`, {
        headers: await authHeaders(),
      });
      if (res.ok) setChats((await res.json()) as ChatSummary[]);
    } catch {
      /* leave the list empty on failure */
    } finally {
      setHistoryLoading(false);
    }
  }, [apiBaseUrl, authHeaders]);

  const openChat = useCallback(
    async (id: string) => {
      setView("chat");
      setSending(true);
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/widget/chats/${id}/messages`,
          { headers: await authHeaders() },
        );
        if (!res.ok) throw new Error();
        const rows = (await res.json()) as {
          id: string;
          role: string;
          content: string;
        }[];
        chatIdRef.current = id;
        setMessages(
          rows
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as ChatMessage["role"],
              content: m.content,
            })),
        );
      } catch {
        /* keep current view; the chat just won't load */
      } finally {
        setSending(false);
      }
    },
    [apiBaseUrl, authHeaders],
  );

  const newChat = useCallback(() => {
    chatIdRef.current = generateUuid();
    setMessages([]);
    setInput("");
    setView("chat");
  }, []);

  const hasMessages = messages.length > 0;
  const lastIndex = messages.length - 1;

  return (
    <div
      className={`cb-widget ${isLight ? "cb-theme-light" : ""} ${
        open ? "is-open" : ""
      } ${expanded ? "is-expanded" : ""}`}
    >
      <button
        type="button"
        className="cb-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={s.toggle}
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
                {s.online}
              </div>
            </div>
          </div>
          <div className="cb-header-actions">
            <button
              type="button"
              className="cb-icon-btn"
              onClick={newChat}
              aria-label={s.newConversation}
              title={s.newConversation}
            >
              <IconPencilPlus size={17} stroke={2} />
            </button>
            <button
              type="button"
              className={`cb-icon-btn ${view === "history" ? "is-active" : ""}`}
              onClick={() => (view === "history" ? setView("chat") : openHistory())}
              aria-label={s.historyTitle}
              aria-pressed={view === "history"}
              title={s.historyTitle}
            >
              <IconMessages size={17} stroke={2} />
            </button>
            <button
              type="button"
              className="cb-icon-btn cb-expand"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? s.collapse : s.expand}
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
              aria-label={s.close}
            >
              <IconX size={18} stroke={2.1} />
            </button>
          </div>
        </header>

        {view === "history" ? (
          <HistoryView
            chats={chats}
            loading={historyLoading}
            onOpen={openChat}
            onNew={newChat}
            strings={s}
            locale={locale}
          />
        ) : (
          <>
        <div className="cb-messages">
          {!hasMessages && (
            <div className="cb-empty">
              <div className="cb-empty-icon">
                <IconMessageChatbot size={26} stroke={1.5} />
              </div>
              <div className="cb-empty-text">{s.empty}</div>
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

        {voiceEnabled && (
          <VoiceOverlay
            status={voice.status}
            error={voice.error}
            level={voice.level}
            phase={voice.phase}
            onEnd={() => voice.stop()}
            strings={s}
          />
        )}

        <div className="cb-input">
          <div className="cb-composer">
            <textarea
              ref={inputRef}
              placeholder={options.placeholder || s.placeholder}
              value={input}
              onInput={(event) => setInput(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            {voiceEnabled && (
              <button
                type="button"
                className={`cb-mic ${voice.status === "live" ? "is-live" : ""}`}
                onClick={() => voice.toggle()}
                disabled={voice.status === "connecting"}
                aria-label={
                  voice.status === "live" ? s.stopVoice : s.startVoice
                }
                aria-pressed={voice.status === "live"}
              >
                {voice.status === "live" ? (
                  <IconPlayerStopFilled size={16} stroke={2.1} />
                ) : (
                  <IconMicrophone size={17} stroke={2} />
                )}
              </button>
            )}
            <button
              type="button"
              className="cb-send"
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              aria-label={sending ? s.sending : s.send}
            >
              {sending ? (
                <span className="cb-spinner" />
              ) : (
                <IconSend2 size={17} stroke={2.1} />
              )}
            </button>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

// History view

// Localized relative time ("2 hours ago" / "2 saat önce") via Intl.
function fmtRelative(iso: string, locale: Locale): string {
  const norm = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`; // server is UTC
  const ms = Date.parse(norm);
  if (Number.isNaN(ms)) return "";
  const diff = (ms - Date.now()) / 1000; // negative = past
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(ms).toLocaleDateString(locale);
}

function HistoryView({
  chats,
  loading,
  onOpen,
  onNew,
  strings,
  locale,
}: {
  chats: ChatSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  strings: Strings;
  locale: Locale;
}) {
  return (
    <div className="cb-history">
      <div className="cb-history-top">
        <span className="cb-history-heading">{strings.conversations}</span>
        <button type="button" className="cb-history-new" onClick={onNew}>
          <IconPencilPlus size={14} stroke={2} />
          {strings.newShort}
        </button>
      </div>
      <div className="cb-history-list">
        {loading ? (
          <div className="cb-history-loading">
            <span className="cb-history-spinner" />
            <span>{strings.loadingConversations}</span>
          </div>
        ) : chats.length === 0 ? (
          <div className="cb-history-empty">{strings.noConversations}</div>
        ) : (
          chats.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cb-history-item"
              onClick={() => onOpen(c.id)}
            >
              <span className="cb-history-item-title">
                {c.title || strings.untitled}
              </span>
              <span className="cb-history-item-date">
                {fmtRelative(c.created_at, locale)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

const VIZ_BAR_COUNT = 6;

/** Bouncy audio visualizer: a 60fps rAF loop gives each bar its own sine
 *  phase/frequency (so they move independently, not all-or-nothing), with the
 *  live audio `level` driving amplitude and a spring ease between frames. */
function VoiceViz({ level, live }: { level: number; live: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const levelRef = useRef(level);
  levelRef.current = level;
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const phases = Array.from({ length: VIZ_BAR_COUNT }, (_, i) => i * 1.1);
    const freqs = Array.from({ length: VIZ_BAR_COUNT }, (_, i) => 6 + i * 1.7);
    const cur = new Array(VIZ_BAR_COUNT).fill(0.16);
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const lvl = levelRef.current;
      // Idle shimmer even when quiet; amplitude grows a lot once there's sound.
      const amp = (liveRef.current ? 0.12 : 0.06) + lvl * 1.1;
      for (let i = 0; i < VIZ_BAR_COUNT; i++) {
        const wobble = 0.5 + 0.5 * Math.sin(t * freqs[i] + phases[i]);
        const target = Math.min(1, 0.12 + amp * wobble);
        cur[i] += (target - cur[i]) * 0.4; // springy ease
        const el = barsRef.current[i];
        if (el) el.style.height = `${(cur[i] * 100).toFixed(1)}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="cb-voice-viz" aria-hidden="true">
      {Array.from({ length: VIZ_BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="cb-voice-bar"
        />
      ))}
    </div>
  );
}

/** Floating, animated voice panel: appears with a scale/fade, shows a live
 *  audio visualizer (mic level while listening, agent level while speaking),
 *  the current state, and an End button. */
function VoiceOverlay({
  status,
  error,
  level,
  phase,
  onEnd,
  strings,
}: {
  status: VoiceStatus;
  error: string | null;
  level: number;
  phase: VoicePhase;
  onEnd: () => void;
  strings: Strings;
}) {
  if (status === "idle") return null;
  const live = status === "live";
  // "warming" (agent not ready / still greeting prep) reads as "Connecting…" so
  // we never show "speak now" before the agent has had its first turn.
  const title =
    status === "connecting" || (live && phase === "warming")
      ? strings.connecting
      : status === "error"
        ? error || strings.voiceError
        : phase === "speaking"
          ? strings.speaking
          : phase === "thinking"
            ? strings.thinking
            : strings.listening;
  return (
    <div
      className={`cb-voice-overlay cb-voice-${status} ${phase === "speaking" ? "is-speaking" : ""}`}
      role="status"
    >
      <VoiceViz level={level} live={live} />
      <span className="cb-voice-title">{title}</span>
      {status !== "error" && (
        <button
          type="button"
          className="cb-voice-end"
          onClick={onEnd}
          aria-label={strings.endVoice}
          title={strings.endVoice}
        >
          <IconPlayerStopFilled size={15} stroke={2.1} />
        </button>
      )}
    </div>
  );
}
