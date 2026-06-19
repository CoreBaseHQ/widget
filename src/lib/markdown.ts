import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

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

export const renderMarkdown = (text: string): string => {
  try {
    const dirty = md.render(text);
    return DOMPurify.sanitize(dirty, {
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
  } catch {
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }
};
