export type Role = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  error?: string;
};

export type WidgetInitOptions = {
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
  /** CSS font-family applied to the whole widget (e.g. `"Inter", sans-serif`).
   *  Defaults to a native system stack. */
  fontFamily?: string;
  /** Optional stylesheet URL that defines the font (e.g. a Google Fonts link).
   *  Loaded into the page so `fontFamily` resolves. */
  fontUrl?: string;
};

export type WidgetApi = {
  init: (options: WidgetInitOptions) => void;
  destroy: () => void;
};

// Visual blocks (chart / table) the assistant can stream as fenced JSON

export type ChartData = {
  type?: "bar" | "line" | "area" | "pie";
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  series?: { key: string; label?: string }[];
  colors?: string[];
};

export type TableData = {
  title?: string;
  columns: { key: string; label?: string }[];
  rows: Record<string, unknown>[];
};

declare global {
  interface Window {
    CorebaseWidget: WidgetApi;
  }
}
