// Token-aware cleanup for browser-extension UI frozen into saved HTML pages.
// It preserves the original bytes outside specifically targeted artifacts.

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "source", "area", "base", "col", "embed", "param", "track", "wbr", "link", "meta"]);
const EXTENSION_ELEMENT_IDS = ["plasmo-shadow-container", "loom-companion-mv3"];
const EXTENSION_TAG_NAMES = ["plasmo-csui", "grammarly-desktop-integration", "grammarly-extension"];
const EXTENSION_CLASS_NAMES = ["plasmo-csui-container"];
const EXTENSION_ATTRS = ["cz-shortcut-listen", "data-new-gr-c-s-check-loaded", "data-gr-ext-installed", "monica-id", "monica-version"];
const EXTENSION_STYLE_MARKERS = ["plasmo-shadow-container", "plasmo-csui"];
const PROTECTED_ELEMENTS = new Set(["script", "template", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextToken(html, from) {
  let start = html.indexOf("<", from);
  while (start >= 0) {
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      if (commentEnd < 0) return null;
      start = html.indexOf("<", commentEnd + 3);
      continue;
    }
    const lead = html.slice(start).match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/);
    if (!lead) {
      start = html.indexOf("<", start + 1);
      continue;
    }
    let quote = "";
    for (let end = start + lead[0].length; end < html.length; end++) {
      const ch = html[end];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        end += 1;
        const text = html.slice(start, end);
        return { start, end, text, tagName: lead[2].toLowerCase(), closing: lead[1] === "/", selfClosing: /\/\s*>$/.test(text) };
      }
    }
    return null;
  }
  return null;
}

function readAttribute(tag, attr) {
  const match = tag.match(new RegExp(`\\s${escapeRegex(attr)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function findElementEnd(html, open) {
  if (open.selfClosing || VOID_ELEMENTS.has(open.tagName)) return open.end;
  let depth = 1;
  let pos = open.end;
  while (true) {
    const token = nextToken(html, pos);
    if (!token) return null;
    if (!token.closing && PROTECTED_ELEMENTS.has(token.tagName)) {
      const protectedEnd = findElementEnd(html, token);
      if (protectedEnd === null) return null;
      pos = protectedEnd;
      continue;
    }
    if (token.tagName === open.tagName) {
      if (token.closing) depth--;
      else if (!token.selfClosing && !VOID_ELEMENTS.has(token.tagName)) depth++;
      if (depth === 0) return token.end;
    }
    pos = token.end;
  }
}

function isExtensionElement(token) {
  if (EXTENSION_TAG_NAMES.includes(token.tagName)) return true;
  const id = readAttribute(token.text, "id");
  if (id && EXTENSION_ELEMENT_IDS.includes(id.toLowerCase())) return true;
  const classes = (readAttribute(token.text, "class") || "").split(/\s+/).map((name) => name.toLowerCase());
  return EXTENSION_CLASS_NAMES.some((name) => classes.includes(name));
}

export function stripBrowserExtensionArtifacts(html) {
  let result = "";
  let copiedThrough = 0;
  let pos = 0;
  while (true) {
    const token = nextToken(html, pos);
    if (!token) break;

    // Marker-looking strings inside executable/example content are not DOM.
    if (!token.closing && PROTECTED_ELEMENTS.has(token.tagName)) {
      const protectedEnd = findElementEnd(html, token);
      if (protectedEnd === null) break;
      pos = protectedEnd;
      continue;
    }

    let removalEnd = null;
    if (!token.closing && isExtensionElement(token)) {
      removalEnd = findElementEnd(html, token);
    } else if (!token.closing && token.tagName === "style") {
      const styleEnd = findElementEnd(html, token);
      if (styleEnd !== null) {
        const id = readAttribute(token.text, "id") || "";
        const css = html.slice(token.end, styleEnd).toLowerCase();
        if (!id.toLowerCase().startsWith("gl-") && EXTENSION_STYLE_MARKERS.some((marker) => css.includes(marker))) removalEnd = styleEnd;
      }
    }

    if (removalEnd !== null) {
      result += html.slice(copiedThrough, token.start);
      copiedThrough = removalEnd;
      pos = removalEnd;
      continue;
    }

    if (!token.closing && (token.tagName === "html" || token.tagName === "body")) {
      let cleaned = token.text;
      for (const attr of EXTENSION_ATTRS) {
        cleaned = cleaned.replace(new RegExp(`\\s+${escapeRegex(attr)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "gi"), "");
      }
      if (cleaned !== token.text) {
        result += html.slice(copiedThrough, token.start) + cleaned;
        copiedThrough = token.end;
      }
    }
    pos = token.end;
  }
  return result + html.slice(copiedThrough);
}
