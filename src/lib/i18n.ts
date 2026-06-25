// Tiny built-in i18n for the widget UI. English + Turkish; `locale` init option
// overrides, otherwise we auto-detect from the browser. Embedder-set `title` /
// `placeholder` still win over these defaults.

export type Locale = "en" | "tr";

export type Strings = {
  // composer / header
  placeholder: string;
  empty: string;
  online: string;
  send: string;
  sending: string;
  // header buttons (aria/title)
  toggle: string;
  expand: string;
  collapse: string;
  close: string;
  newConversation: string;
  historyTitle: string;
  // history view
  conversations: string;
  newShort: string;
  noConversations: string;
  loadingConversations: string;
  untitled: string;
  // voice
  startVoice: string;
  stopVoice: string;
  endVoice: string;
  connecting: string;
  listening: string;
  speaking: string;
  thinking: string;
  voiceError: string;
  // errors
  errQuota: string;
  errRate: string;
  errLlmKey: string;
  errVoiceUnavailable: string;
  errVoiceDisabled: string;
  errVoiceNotConfigured: string;
  errSession: string;
  errServer: string;
  errNetwork: string;
  errSendGeneric: string;
  errVoiceGeneric: string;
};

const en: Strings = {
  placeholder: "Ask a question",
  empty: "Ask a question",
  online: "Online",
  send: "Send",
  sending: "Sending…",
  toggle: "Toggle assistant",
  expand: "Expand",
  collapse: "Collapse",
  close: "Close",
  newConversation: "New conversation",
  historyTitle: "History",
  conversations: "Conversations",
  newShort: "New",
  noConversations: "No conversations yet",
  loadingConversations: "Loading conversations…",
  untitled: "New conversation",
  startVoice: "Start voice",
  stopVoice: "Stop voice",
  endVoice: "End voice",
  connecting: "Connecting…",
  listening: "Listening — speak now",
  speaking: "Speaking…",
  thinking: "Thinking…",
  voiceError: "Voice error",
  errQuota: "You've reached your message limit for now. Please try again later.",
  errRate: "Too many requests right now — please wait a moment and try again.",
  errLlmKey:
    "This assistant isn't fully set up yet. Please contact the site owner.",
  errVoiceUnavailable: "Voice isn't available right now.",
  errVoiceDisabled: "Voice isn't enabled for this assistant.",
  errVoiceNotConfigured: "Voice isn't set up yet.",
  errSession: "Your session has expired — please refresh the page.",
  errServer: "Something went wrong on our side. Please try again.",
  errNetwork: "Couldn't reach the assistant. Check your connection and try again.",
  errSendGeneric: "Couldn't send your message. Please try again.",
  errVoiceGeneric: "Couldn't start voice. Please try again.",
};

const tr: Strings = {
  placeholder: "Bir şey sorun",
  empty: "Bir şey sorun",
  online: "Çevrimiçi",
  send: "Gönder",
  sending: "Gönderiliyor…",
  toggle: "Asistanı aç/kapat",
  expand: "Genişlet",
  collapse: "Daralt",
  close: "Kapat",
  newConversation: "Yeni sohbet",
  historyTitle: "Geçmiş",
  conversations: "Sohbetler",
  newShort: "Yeni",
  noConversations: "Henüz sohbet yok",
  loadingConversations: "Sohbetler yükleniyor…",
  untitled: "Yeni sohbet",
  startVoice: "Sesli sohbeti başlat",
  stopVoice: "Sesi durdur",
  endVoice: "Bitir",
  connecting: "Bağlanıyor…",
  listening: "Dinliyorum — konuşabilirsiniz",
  speaking: "Konuşuyor…",
  thinking: "Düşünüyor…",
  voiceError: "Ses hatası",
  errQuota:
    "Şimdilik mesaj limitinize ulaştınız. Lütfen daha sonra tekrar deneyin.",
  errRate: "Şu anda çok fazla istek var — lütfen biraz bekleyip tekrar deneyin.",
  errLlmKey:
    "Asistan henüz tam olarak kurulmamış. Lütfen site sahibiyle iletişime geçin.",
  errVoiceUnavailable: "Sesli görüşme şu anda kullanılamıyor.",
  errVoiceDisabled: "Bu asistan için ses etkin değil.",
  errVoiceNotConfigured: "Ses henüz ayarlanmamış.",
  errSession: "Oturumunuzun süresi doldu — lütfen sayfayı yenileyin.",
  errServer: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
  errNetwork:
    "Asistana ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
  errSendGeneric: "Mesajınız gönderilemedi. Lütfen tekrar deneyin.",
  errVoiceGeneric: "Sesli görüşme başlatılamadı. Lütfen tekrar deneyin.",
};

const TABLE: Record<Locale, Strings> = { en, tr };

/** Pick the locale: explicit option → otherwise the browser language → en. */
export function resolveLocale(opt?: string): Locale {
  if (opt === "tr" || opt === "en") return opt;
  const nav =
    typeof navigator !== "undefined" ? navigator.language?.toLowerCase() : "";
  return nav && nav.startsWith("tr") ? "tr" : "en";
}

export function getStrings(locale: Locale): Strings {
  return TABLE[locale];
}
