// GreenLight Live mode injector.
//
// Injected into runtime HTML (Astro dev server output) shown inside the
// editor's iframe. Reads `data-astro-source-file` and `data-astro-source-loc`
// (Astro's dev annotations) on hover/click and posts the source coordinates
// to the parent window so the desktop UI can drive AST-based source edits.
(function () {
  if (window.__GL_LIVE_EDIT_INSTALLED) return;
  window.__GL_LIVE_EDIT_INSTALLED = true;

  // --- Visual overlay (single fixed div re-positioned per hover) -----------
  const overlay = document.createElement("div");
  overlay.id = "__gl-live-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px solid #34d399",
    background: "rgba(52, 211, 153, 0.08)",
    zIndex: "2147483646",
    transition: "all 60ms linear",
    display: "none",
    boxSizing: "border-box",
  });

  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "absolute",
    top: "-20px",
    left: "0",
    background: "#34d399",
    color: "#052e1a",
    font: "11px/16px ui-sans-serif, system-ui, sans-serif",
    padding: "0 6px",
    borderRadius: "3px 3px 0 0",
    whiteSpace: "nowrap",
  });
  overlay.appendChild(label);

  function ensureMounted() {
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);
  }

  // --- Locator: walks up to the nearest element carrying source-loc --------
  function findAnnotated(el) {
    let cur = el;
    let fallback = null;
    while (cur && cur !== document.documentElement) {
      if (cur.nodeType === 1 && cur.hasAttribute("data-astro-source-loc")) {
        const file = cur.getAttribute("data-astro-source-file") || "";
        if (!fallback) fallback = cur;
        if (!file.includes("/node_modules/astro/")) return cur;
      }
      cur = cur.parentElement;
    }
    return fallback;
  }

  // When motion/Swiper/etc. layer an animation wrapper on top of the page, the
  // hover target is the wrapper (no source-loc). Look at every element under
  // the cursor and pick the first annotated one we can find by walking up.
  function findAnnotatedAt(e) {
    const direct = findAnnotated(e.target);
    if (direct) return direct;
    if (typeof document.elementsFromPoint !== "function") return null;
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    for (const node of stack) {
      if (node === overlay || overlay.contains(node)) continue;
      const found = findAnnotated(node);
      if (found) return found;
    }
    return null;
  }

  function describe(el) {
    const loc = el.getAttribute("data-astro-source-loc") || "";
    const file = el.getAttribute("data-astro-source-file") || "";
    const [lineStr, colStr] = loc.split(":");
    return {
      file,
      line: Number(lineStr) || 0,
      column: Number(colStr) || 0,
      tagName: el.tagName.toLowerCase(),
      classes: (el.getAttribute("class") || "").trim(),
      id: el.id || "",
      styles: collectMatchedStyles(el, { file, line: Number(lineStr) || 0, column: Number(colStr) || 0 }),
    };
  }

  function describeStyleSource(sheet) {
    const owner = sheet && sheet.ownerNode;
    let source = "";
    if (owner && owner.nodeType === 1) {
      source = owner.getAttribute("data-gl-live-inline")
        || owner.getAttribute("data-vite-dev-id")
        || owner.getAttribute("href")
        || (owner.id ? `#${owner.id}` : "Inline <style>");
    } else {
      source = (sheet && sheet.href) || "Inline <style>";
    }
    try {
      const parsed = JSON.parse(source);
      return typeof parsed === "string" ? parsed : source;
    } catch {
      return source;
    }
  }

  function sourceFileFromSource(source) {
    if (!source) return "";
    if (source.startsWith("/")) return source.split(/[?#]/)[0];
    if (source.startsWith("file://")) {
      try { return decodeURIComponent(new URL(source).pathname); } catch { return ""; }
    }
    try {
      const url = new URL(source, window.location.href);
      const path = decodeURIComponent(url.pathname || "");
      if (path.startsWith("/@fs/")) return path.slice(4);
      if (path.startsWith("/Users/") || path.startsWith("/Volumes/")) return path;
    } catch {}
    return "";
  }

  function isAstroVirtualStyleSource(source) {
    return /\.astro\?astro(?:&|$)/.test(source || "") || /[?&]astro(?:&|$).*?[?&]type=style(?:&|$)/.test(source || "");
  }

  function styleDedupeKey(style) {
    const declarations = (style.declarations || []).map((declaration) => `${declaration.property}:${declaration.value}`).join(";");
    return `${style.sourceFile || sourceFileFromSource(style.source) || style.source}\n${style.selector}\n${style.context || ""}\n${declarations}`;
  }

  function dedupeAstroVirtualStyles(styles) {
    const hasRealByKey = new Set();
    for (const style of styles) {
      if (!isAstroVirtualStyleSource(style.source)) hasRealByKey.add(styleDedupeKey(style));
    }
    return styles.filter((style) => !isAstroVirtualStyleSource(style.source) || !hasRealByKey.has(styleDedupeKey(style)));
  }

  function lineColumnAt(text, index) {
    const before = text.slice(0, Math.max(0, index));
    const lines = before.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  function findRuleLocation(sourceText, selectorText) {
    if (!sourceText || !selectorText) return null;
    const selectors = selectorText.split(",").map((part) => part.trim()).filter(Boolean);
    let index = sourceText.indexOf(selectorText);
    if (index < 0) {
      for (const selector of selectors) {
        index = sourceText.indexOf(selector);
        if (index >= 0) break;
      }
    }
    return index >= 0 ? lineColumnAt(sourceText, index) : null;
  }

  function findDeclarationLocation(sourceText, selectorText, property) {
    if (!sourceText || !selectorText || !property) return null;
    const selectors = selectorText.split(",").map((part) => part.trim()).filter(Boolean);
    const candidates = [selectorText, ...selectors];
    for (const selector of candidates) {
      let searchFrom = 0;
      while (searchFrom < sourceText.length) {
        const selectorIndex = sourceText.indexOf(selector, searchFrom);
        if (selectorIndex < 0) break;
        const open = sourceText.indexOf("{", selectorIndex);
        const close = sourceText.indexOf("}", open + 1);
        if (open < 0 || close < 0) break;
        const propIndex = sourceText.indexOf(property, open + 1);
        if (propIndex >= 0 && propIndex < close) return lineColumnAt(sourceText, propIndex);
        searchFrom = close + 1;
      }
    }
    return null;
  }

  function findRawDeclarationValue(sourceText, selectorText, property) {
    if (!sourceText || !selectorText || !property) return null;
    const selectors = selectorText.split(",").map((part) => part.trim()).filter(Boolean);
    const candidates = [selectorText, ...selectors];
    for (const selector of candidates) {
      let searchFrom = 0;
      while (searchFrom < sourceText.length) {
        const selectorIndex = sourceText.indexOf(selector, searchFrom);
        if (selectorIndex < 0) break;
        const open = sourceText.indexOf("{", selectorIndex);
        const close = sourceText.indexOf("}", open + 1);
        if (open < 0 || close < 0) break;
        const propIndex = sourceText.indexOf(property, open + 1);
        if (propIndex >= 0 && propIndex < close) {
          let colon = propIndex + property.length;
          while (colon < close && /\s/.test(sourceText[colon])) colon++;
          if (sourceText[colon] !== ":") { searchFrom = close + 1; continue; }
          let valueStart = colon + 1;
          while (valueStart < close && /\s/.test(sourceText[valueStart])) valueStart++;
          let valueEnd = valueStart;
          let quote = null;
          let parenDepth = 0;
          while (valueEnd < close) {
            const ch = sourceText[valueEnd];
            if (quote) {
              if (ch === "\\") { valueEnd += 2; continue; }
              if (ch === quote) quote = null;
              valueEnd++;
              continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; valueEnd++; continue; }
            if (ch === "(") { parenDepth++; valueEnd++; continue; }
            if (ch === ")" && parenDepth > 0) { parenDepth--; valueEnd++; continue; }
            if (parenDepth === 0 && ch === ";") break;
            valueEnd++;
          }
          let rawValue = sourceText.slice(valueStart, valueEnd).trim();
          rawValue = rawValue.replace(/\s*!important\s*$/i, "").trim();
          return rawValue || null;
        }
        searchFrom = close + 1;
      }
    }
    return null;
  }

  function selectorMatches(el, selectorText) {
    if (!selectorText || selectorText.includes("::")) return false;
    try { return el.matches(selectorText); } catch { return false; }
  }

  function addLineOffset(loc, lineOffset) {
    if (!loc || !loc.line) return loc || {};
    return { line: loc.line + lineOffset, column: loc.column || 0 };
  }

  function declarationsFromStyle(style, sourceText, selectorText, lineOffset) {
    return Array.from(style || []).map((property) => {
      const loc = addLineOffset(findDeclarationLocation(sourceText, selectorText, property), lineOffset || 0) || {};
      return {
        property,
        value: findRawDeclarationValue(sourceText, selectorText, property) || (style.getPropertyValue(property) || "").trim(),
        priority: style.getPropertyPriority(property) || "",
        line: loc.line || 0,
        column: loc.column || 0,
      };
    });
  }

  function walkCssRules(el, rules, source, sourceFile, sourceText, context, out, lineOffset) {
    for (const rule of Array.from(rules || [])) {
      if (out.length >= 16) return;
      if (rule.type === CSSRule.STYLE_RULE) {
        const selectorText = rule.selectorText || "";
        if (!selectorMatches(el, selectorText)) continue;
        const ruleLoc = addLineOffset(findRuleLocation(sourceText, selectorText), lineOffset || 0) || {};
        out.push({
          selector: selectorText,
          cssText: rule.style.cssText || "",
          declarations: declarationsFromStyle(rule.style, sourceText, selectorText, lineOffset || 0),
          source,
          sourceFile,
          line: ruleLoc.line || 0,
          column: ruleLoc.column || 0,
          context,
        });
        continue;
      }
      if (rule.cssRules) {
        const nextContext = rule.conditionText ? (context ? `${context} / ${rule.conditionText}` : rule.conditionText) : context;
        walkCssRules(el, rule.cssRules, source, sourceFile, sourceText, nextContext, out, lineOffset || 0);
      }
    }
  }

  function collectMatchedStyles(el, elementSource) {
    const styles = [];
    const inlineStyle = (el.getAttribute("style") || "").trim();
    if (inlineStyle) {
      styles.push({
        selector: "style attribute",
        cssText: inlineStyle,
        declarations: declarationsFromStyle(el.style, inlineStyle, "", 0),
        source: "Element style attribute",
        sourceFile: elementSource.file || "",
        line: elementSource.line || 0,
        column: elementSource.column || 0,
        context: "",
      });
    }
    for (const sheet of Array.from(document.styleSheets || [])) {
      if (styles.length >= 16) break;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const source = describeStyleSource(sheet);
      const owner = sheet.ownerNode && sheet.ownerNode.nodeType === 1 ? sheet.ownerNode : null;
      const sourceFile = (owner && owner.getAttribute("data-gl-live-source-file")) || sourceFileFromSource(source);
      const lineOffset = Number((owner && owner.getAttribute("data-gl-live-source-line-offset")) || "0") || 0;
      const sourceText = sheet.ownerNode && sheet.ownerNode.textContent ? sheet.ownerNode.textContent : "";
      walkCssRules(el, rules, source, sourceFile, sourceText, "", styles, lineOffset);
    }
    return dedupeAstroVirtualStyles(styles);
  }

  function applyStylePatch(msg) {
    const selector = msg.selector || "";
    const property = msg.property || "";
    const value = typeof msg.value === "string" ? msg.value : "";
    const priority = msg.priority || "";
    if (!selector || !property) return;

    const target = findPatchTarget(msg);

    if (selector === "style attribute") {
      if (target) target.style.setProperty(property, value, priority);
      return;
    }

    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const owner = sheet.ownerNode && sheet.ownerNode.nodeType === 1 ? sheet.ownerNode : null;
      const source = describeStyleSource(sheet);
      const sourceFile = (owner && owner.getAttribute("data-gl-live-source-file")) || sourceFileFromSource(source);
      if (msg.sourceFile && sourceFile && msg.sourceFile !== sourceFile) continue;
      applyStylePatchToRules(rules, selector, property, value, priority);
    }

    if (target) target.style.setProperty(property, value, priority);
    upsertLiveOverride(selector, property, value, priority);
  }

  function findPatchTarget(msg) {
    return Array.from(document.querySelectorAll("[data-astro-source-loc]")).find((node) => (
      node.getAttribute("data-astro-source-file") === (msg.elementFile || "")
      && node.getAttribute("data-astro-source-loc") === (msg.elementLoc || "")
    )) || null;
  }

  function upsertLiveOverride(selector, property, value, priority) {
    let override = document.getElementById("__gl-live-style-overrides");
    if (!override) {
      override = document.createElement("style");
      override.id = "__gl-live-style-overrides";
      document.head.appendChild(override);
    }
    const patches = window.__GL_LIVE_STYLE_PATCHES || new Map();
    window.__GL_LIVE_STYLE_PATCHES = patches;
    patches.set(`${selector}\n${property}`, { selector, property, value, priority });
    override.textContent = Array.from(patches.values()).map((patch) => (
      `${patch.selector}{${patch.property}:${patch.value}${patch.priority ? ` !${patch.priority}` : ""};}`
    )).join("\n");
  }

  function applyStylePatchToRules(rules, selector, property, value, priority) {
    for (const rule of Array.from(rules || [])) {
      if (rule.type === CSSRule.STYLE_RULE && rule.selectorText === selector) {
        rule.style.setProperty(property, value, priority);
        return true;
      }
      if (rule.cssRules && applyStylePatchToRules(rule.cssRules, selector, property, value, priority)) return true;
    }
    return false;
  }

  function paintOverlay(el) {
    ensureMounted();
    const r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = r.left + "px";
    overlay.style.top = r.top + "px";
    overlay.style.width = r.width + "px";
    overlay.style.height = r.height + "px";
    label.textContent = el.tagName.toLowerCase() + " · " + (el.getAttribute("data-astro-source-loc") || "");
  }

  function clearOverlay() {
    overlay.style.display = "none";
  }

  // --- Hover ----------------------------------------------------------------
  // Bind on window + document with capture so user scripts that attach their
  // own capture-phase listeners on document (motion, Swiper, etc.) can't
  // pre-empt us. Use stopImmediatePropagation to neutralise later capture
  // handlers on the same target.
  function onMouseOver(e) {
    const target = findAnnotatedAt(e);
    if (!target) { clearOverlay(); return; }
    paintOverlay(target);
  }
  function onMouseOut() { clearOverlay(); }
  function onClick(e) {
    const target = findAnnotatedAt(e);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const info = describe(target);
    try {
      window.parent.postMessage({ type: "GL_LIVE_SELECT", payload: info }, "*");
    } catch (err) {
      console.warn("[gl-live] postMessage failed", err);
    }
  }
  for (const target of [window, document]) {
    target.addEventListener("mouseover", onMouseOver, true);
    target.addEventListener("mouseout", onMouseOut, true);
    target.addEventListener("click", onClick, true);
  }

  // --- Parent → iframe: re-paint overlay after layout shifts ---------------
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "GL_LIVE_CLEAR") clearOverlay();
    if (msg.type === "GL_LIVE_STYLE_PATCH") applyStylePatch(msg);
  });

  // --- Bootstrap signal -----------------------------------------------------
  try {
    window.parent.postMessage({ type: "GL_LIVE_READY" }, "*");
  } catch {}
})();
