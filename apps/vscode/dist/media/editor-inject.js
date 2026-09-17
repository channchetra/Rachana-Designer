(function () {
  "use strict";

  var EDITOR_ORIGIN = "*";
  var selectedElement = null;
  var editingElement = null;
  var hoverOverlay = null;
  var selectionOverlay = null;
  var dropIndicator = null;
  var dragHandle = null;
  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 50;
  var lastClickTime = 0;
  var lastClickEl = null;
  var isDraggingElement = false;
  var draggedElement = null;
  var styleMode = "class";
  var deviceWidth = null; // null = desktop, 768 = tablet, 375 = mobile
  var isMarkdownMode = false;
  var savedMdSelection = null; // { anchorNode, anchorOffset, focusNode, focusOffset }
  var glClassCounter = 0;
  var glMdIdCounter = 0;
  var selectedClassName = null;
  var selectedSubSelector = null;

  // ─── Free-move mode state ──────────────────────────
  var freeMoveActive = false;
  var freeMovePreState = null; // { position, top, left, right, bottom, width, height, transform }
  var freeMoveHandlesContainer = null;
  var freeMoveBtn = null;
  var freeMoveBackBtn = null;
  var freeMoveIsMoving = false;
  var freeMoveIsResizing = false;
  var freeMoveIsRotating = false;
  var freeMoveStartX = 0;
  var freeMoveStartY = 0;
  var freeMoveStartTop = 0;
  var freeMoveStartLeft = 0;
  var freeMoveStartWidth = 0;
  var freeMoveStartHeight = 0;
  var freeMoveStartRotation = 0;
  var freeMoveResizeDir = null; // "nw", "ne", "sw", "se"
  var freeMoveRotateCenter = { x: 0, y: 0 };
  var overlayReloadWarningShown = false;

  // ─── Change tracking for patch-based save ───────────
  // elementChanges: path -> { classChanged, styleChanged, textChanged, tagChanged, attrsChanged: Set }
  var elementChanges = {};
  var structuralChanges = []; // [{type, ...}]
  var cssChanged = false;
  var classRenames = []; // [{oldName, newName}]
  var removedStyleBlockIds = [];
  var linkEdits = []; // [{href, newOuterHTML}] — "" removes the <link> from the file
  // originalStyleMap: path -> original style attribute value (null if no style was present at load time)
  var originalStyleMap = {};
  var userStyleSnapshots = []; // [{element, originalText}]

  function createEmptyElementChange() {
    return {
      classChanged: false,
      styleChanged: false,
      textChanged: false,
      tagChanged: null,
      attrsChanged: {},
      styleMutations: {}
    };
  }

  function getElementChangeRecord(path) {
    if (!elementChanges[path]) {
      elementChanges[path] = createEmptyElementChange();
    }
    return elementChanges[path];
  }

  function normalizeStyleText(styleText) {
    var probe = document.createElement("div").style;
    if (styleText) probe.cssText = styleText;
    return probe.cssText || "";
  }

  function getOriginalInlineStyleText(path) {
    if (!Object.prototype.hasOwnProperty.call(originalStyleMap, path)) return "";
    return normalizeStyleText(originalStyleMap[path]);
  }

  function getMutatedInlineStyleText(path, styleMutations) {
    var probe = document.createElement("div").style;
    var originalStyle = getOriginalInlineStyleText(path);
    if (originalStyle) probe.cssText = originalStyle;
    for (var prop in styleMutations) {
      if (!Object.prototype.hasOwnProperty.call(styleMutations, prop)) continue;
      var value = styleMutations[prop];
      if (value) probe.setProperty(prop, value);
      else probe.removeProperty(prop);
    }
    return probe.cssText || "";
  }

  function trackElementChange(el, changeType) {
    if (!el) return;
    var path = el.getAttribute("data-gl-path");
    if (!path) return;
    var change = getElementChangeRecord(path);
    if (changeType === "class") change.classChanged = true;
    if (changeType === "style") change.styleChanged = true;
    if (changeType === "text") change.textChanged = true;
  }

  function trackTagChange(el, newTag) {
    if (!el) return;
    var path = el.getAttribute("data-gl-path");
    if (!path) return;
    getElementChangeRecord(path).tagChanged = newTag;
  }

  function trackAttrChange(el, attrName) {
    if (!el) return;
    var path = el.getAttribute("data-gl-path");
    if (!path) return;
    getElementChangeRecord(path).attrsChanged[attrName] = true;
  }

  function trackStyleMutation(el, property, value) {
    if (!el) return;
    var path = el.getAttribute("data-gl-path");
    if (!path) return;
    var change = getElementChangeRecord(path);
    change.styleMutations[property] = value || "";
    change.styleChanged = getMutatedInlineStyleText(path, change.styleMutations) !== getOriginalInlineStyleText(path);
  }

  function getPersistedStyleValue(msg) {
    if (deviceWidth !== null || styleMode === "class") {
      return "";
    }
    return msg.value || "";
  }

  function hasAnyChanges() {
    if (Object.keys(elementChanges).length > 0 || structuralChanges.length > 0 || cssChanged || classRenames.length > 0 || removedStyleBlockIds.length > 0 || linkEdits.length > 0) return true;
    for (var ui = 0; ui < userStyleSnapshots.length; ui++) {
      if (userStyleSnapshots[ui].element._glDirty) return true;
    }
    return false;
  }

  function resetChangeTracking() {
    elementChanges = {};
    structuralChanges = [];
    cssChanged = false;
    classRenames = [];
    removedStyleBlockIds = [];
    linkEdits = [];
  }

  function postEditorWarning(code, message) {
    window.parent.postMessage({ type: "EDITOR_WARNING", code: code, message: message }, EDITOR_ORIGIN);
  }

  function validateOverlayControls() {
    if (!dragHandle || !freeMoveBtn) return;
    var dragIconEl = dragHandle.querySelector("[data-gl-overlay='dragicon']");
    var moveIcon = freeMoveBtn.querySelector("svg");
    var broken = !dragIconEl || !dragIconEl.textContent || !moveIcon;

    if (!broken) {
      var moveStyle = window.getComputedStyle(moveIcon);
      var moveRect = moveIcon.getBoundingClientRect();
      broken =
        moveStyle.display === "none" ||
        moveStyle.visibility === "hidden" ||
        parseFloat(moveStyle.opacity || "1") === 0 ||
        moveRect.width < 6 ||
        moveRect.height < 6;
    }

    if (broken && !overlayReloadWarningShown) {
      overlayReloadWarningShown = true;
      postEditorWarning("reload-required", "Page requires reload to apply new changes");
    }
  }

  function markStyleBlockRemoved(styleId) {
    if (!styleId) return;
    if (removedStyleBlockIds.indexOf(styleId) === -1) {
      removedStyleBlockIds.push(styleId);
    }
  }

  function markStyleBlockPresent(styleId) {
    if (!styleId) return;
    removedStyleBlockIds = removedStyleBlockIds.filter(function (id) { return id !== styleId; });
  }

  // ─── Initialization ───────────────────────────────
  // ─── Markdown format commands ─────────────────────
  function handleMarkdownFormat(action, value) {
    // Refocus the iframe (click on parent toolbar steals focus)
    window.focus();
    document.body.focus();

    // Restore saved selection
    if (savedMdSelection) {
      var sel = window.getSelection();
      if (sel) {
        try {
          var range = document.createRange();
          range.setStart(savedMdSelection.startContainer, savedMdSelection.startOffset);
          range.setEnd(savedMdSelection.endContainer, savedMdSelection.endOffset);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {
          // Nodes may have been removed — ignore
        }
      }
    }

    var sel = window.getSelection();
    if (!sel) return;

    // Helper: wrap selected text with an inline element
    function wrapSelection(tag) {
      if (sel.rangeCount === 0) return;
      var range = sel.getRangeAt(0);
      var wrapper = document.createElement(tag);
      try {
        range.surroundContents(wrapper);
      } catch (e) {
        // If surroundContents fails (partial selection across elements),
        // use execCommand as fallback
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
      }
      markDomMutated();
    }

    // Helper: insert HTML at cursor position
    function insertAtCursor(html) {
      if (sel.rangeCount === 0) return;
      var range = sel.getRangeAt(0);
      range.deleteContents();
      var temp = document.createElement("div");
      temp.innerHTML = html;
      var frag = document.createDocumentFragment();
      var lastNode;
      while (temp.firstChild) {
        lastNode = frag.appendChild(temp.firstChild);
      }
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      markDomMutated();
    }

    function insertCodeBlock(text) {
      if (sel.rangeCount === 0) return;
      var range = sel.getRangeAt(0);
      var pre = document.createElement("pre");
      var code = document.createElement("code");
      code.textContent = text || "code here";
      pre.appendChild(code);
      range.deleteContents();
      range.insertNode(pre);

      var cursorRange = document.createRange();
      cursorRange.selectNodeContents(code);
      cursorRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(cursorRange);
      markDomMutated();
    }

    function markDomMutated() {
      window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
    }

    pushUndoSnapshot();

    switch (action) {
      case "bold":
        document.execCommand("bold", false, null);
        markDomMutated();
        break;
      case "italic":
        document.execCommand("italic", false, null);
        markDomMutated();
        break;
      case "strikethrough":
        document.execCommand("strikeThrough", false, null);
        markDomMutated();
        break;
      case "heading": {
        // value is "h1"-"h6" or "p"
        var tag = (value || "h2").toLowerCase();
        if (sel.rangeCount > 0) {
          var node = sel.anchorNode;
          // Walk up to find the block-level parent
          var block = node;
          while (block && block !== document.body) {
            if (block.nodeType === 1) {
              var display = window.getComputedStyle(block).display;
              if (display === "block" || display === "list-item" || /^(p|h[1-6]|div|blockquote|li|section|article)$/i.test(block.tagName)) {
                break;
              }
            }
            block = block.parentNode;
          }
          if (block && block !== document.body && block.nodeType === 1) {
            var newEl = document.createElement(tag);
            newEl.innerHTML = block.innerHTML;
            // Copy attributes
            for (var ai = 0; ai < block.attributes.length; ai++) {
              var attr = block.attributes[ai];
              if (attr.name !== "style") newEl.setAttribute(attr.name, attr.value);
            }
            block.parentNode.replaceChild(newEl, block);
            // Set cursor inside new element
            var r = document.createRange();
            r.selectNodeContents(newEl);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
            markDomMutated();
          }
        }
        break;
      }
      case "unorderedList":
        document.execCommand("insertUnorderedList", false, null);
        markDomMutated();
        break;
      case "orderedList":
        document.execCommand("insertOrderedList", false, null);
        markDomMutated();
        break;
      case "table":
        insertAtCursor(
          '<table><thead><tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr></thead>' +
          '<tbody><tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>' +
          '<tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr></tbody></table>'
        );
        break;
      case "blockquote": {
        if (sel.rangeCount > 0) {
          var bNode = sel.anchorNode;
          var bBlock = bNode;
          while (bBlock && bBlock !== document.body) {
            if (bBlock.nodeType === 1 && /^(p|div|h[1-6])$/i.test(bBlock.tagName)) break;
            bBlock = bBlock.parentNode;
          }
          if (bBlock && bBlock !== document.body) {
            // Check if already in blockquote
            if (bBlock.parentNode && bBlock.parentNode.tagName === "BLOCKQUOTE") {
              // Unwrap
              var bq = bBlock.parentNode;
              while (bq.firstChild) bq.parentNode.insertBefore(bq.firstChild, bq);
              bq.parentNode.removeChild(bq);
            } else {
              var newBq = document.createElement("blockquote");
              bBlock.parentNode.insertBefore(newBq, bBlock);
              newBq.appendChild(bBlock);
            }
            markDomMutated();
          }
        }
        break;
      }
      case "pre":
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
          wrapSelection("code");
        } else {
          insertAtCursor("<code>inline code</code>");
        }
        break;
      case "code": {
        var selectedText = sel.rangeCount > 0 && !sel.isCollapsed ? sel.toString() : "";
        insertCodeBlock(selectedText);
        break;
      }
      case "link": {
        var linkText = (sel.rangeCount > 0 && !sel.isCollapsed) ? sel.toString() : "";
        window.parent.postMessage({ type: "REQUEST_LINK_URL", linkText: linkText }, EDITOR_ORIGIN);
        break;
      }
      case "image":
        insertAtCursor('<img src="https://placehold.co/600x300" alt="Image" style="max-width:100%;height:auto;" />');
        break;
    }
  }

  function init() {
    try {
      createOverlays();
      assignPaths();
      snapshotUserStyles();
      setupEventListeners();
    } catch (err) {
      console.error("[GL inject] init() error:", err);
    }
    // Always send READY so the parent app doesn't hang on a white screen
    window.parent.postMessage({ type: "READY" }, EDITOR_ORIGIN);
  }

  function snapshotUserStyles() {
    userStyleSnapshots = [];
    var glUidCounter = 0;
    var allStyles = document.querySelectorAll("style");
    for (var i = 0; i < allStyles.length; i++) {
      var st = allStyles[i];
      if (st.id && st.id.indexOf("gl-") === 0) continue;
      if (st.hasAttribute("data-gl-inlined")) continue;
      // Assign a stable UID so captureStyleState can find it by key
      if (!st.getAttribute("data-gl-uid")) {
        st.setAttribute("data-gl-uid", "user-style-" + (glUidCounter++));
      }
      userStyleSnapshots.push({ element: st, originalText: st.textContent });
    }
  }

  function buildOriginalStyleMapFromHtml(html) {
    var map = {};
    if (!html || typeof DOMParser === "undefined") return map;
    try {
      var parsed = new DOMParser().parseFromString(html, "text/html");
      function walk(node, prefix) {
        var children = Array.from(node.children).filter(isEditableElement);
        children.forEach(function (child, i) {
          var path = prefix ? prefix + "." + i : "" + i;
          map[path] = child.getAttribute("style");
          walk(child, path);
        });
      }
      if (parsed.body) {
        walk(parsed.body, "");
      }
    } catch (e) {
      // Fall back to the live DOM snapshot below.
    }
    return map;
  }

  // ─── Path Assignment ──────────────────────────────
  function assignPaths() {
    var sourceStyleMap = buildOriginalStyleMapFromHtml(window.__GL_ORIGINAL_HTML);
    function walk(node, prefix) {
      var children = Array.from(node.children).filter(isEditableElement);
      children.forEach(function (child, i) {
        var path = prefix ? prefix + "." + i : "" + i;
        child.setAttribute("data-gl-path", path);
        if (Object.prototype.hasOwnProperty.call(sourceStyleMap, path)) {
          originalStyleMap[path] = sourceStyleMap[path];
        } else {
          originalStyleMap[path] = child.getAttribute("style");
        }
        walk(child, path);
      });
    }
    walk(document.body, "");
  }

  function isEditableElement(el) {
    if (el.nodeType !== 1) return false;
    if (["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"].indexOf(el.tagName) !== -1)
      return false;
    if (el.hasAttribute("data-gl-overlay")) return false;
    return true;
  }

  function getElementByPath(path) {
    return document.querySelector('[data-gl-path="' + path + '"]');
  }

  // ─── Style Extraction ─────────────────────────────
  // ─── CSS Variables Extraction ────────────────────
  function extractCssVariables() {
    var variables = [];
    var seen = {};
    var computedRoot = getComputedStyle(document.documentElement);

    function addVar(propName, rule) {
      if (seen[propName]) return;
      seen[propName] = true;
      var rawValue = rule ? rule.style.getPropertyValue(propName).trim() : "";
      var computed = computedRoot.getPropertyValue(propName).trim();
      variables.push({ name: propName, value: rawValue || computed, computed: computed || rawValue });
    }

    function addVarFromText(propName, rawValue) {
      if (seen[propName]) return;
      seen[propName] = true;
      var computed = computedRoot.getPropertyValue(propName).trim();
      variables.push({ name: propName, value: rawValue, computed: computed || rawValue });
    }

    function extractVarsFromStyleRule(rule) {
      var sel = (rule.selectorText || "").trim().toLowerCase();
      var isRootLike = sel === ":root" || sel === "html" || sel === "body" ||
                       sel === ":root, :host" || sel.indexOf(":root") >= 0;

      if (isRootLike) {
        var cssText = rule.cssText || "";
        var varRegex = /(--[\w-]+)\s*:/g;
        var match;
        while ((match = varRegex.exec(cssText)) !== null) {
          addVar(match[1], rule);
        }
      }
      if (rule.style) {
        for (var p = 0; p < rule.style.length; p++) {
          var propName = rule.style[p];
          if (propName.indexOf("--") === 0) {
            addVar(propName, rule);
          }
        }
      }
    }

    // Primary: use CSSOM API
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        try {
          var rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (var r = 0; r < rules.length; r++) {
            var rule = rules[r];
            if (rule instanceof CSSStyleRule) {
              extractVarsFromStyleRule(rule);
            } else if (rule instanceof CSSMediaRule) {
              for (var mr = 0; mr < rule.cssRules.length; mr++) {
                var innerRule = rule.cssRules[mr];
                if (innerRule instanceof CSSStyleRule) {
                  extractVarsFromStyleRule(innerRule);
                }
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
    } catch (e) {
      // ignore
    }

    // Fallback: always also parse <style> tag text content directly
    var styleTags = document.querySelectorAll("style");
    for (var st = 0; st < styleTags.length; st++) {
      var text = styleTags[st].textContent || "";
      var varRegex2 = /(--[\w-]+)\s*:\s*([^;]+)/g;
      var m2;
      while ((m2 = varRegex2.exec(text)) !== null) {
        addVarFromText(m2[1], m2[2].trim());
      }
    }

    // Also extract from computedStyle on :root directly
    var rootStyles = computedRoot;
    for (var ci = 0; ci < rootStyles.length; ci++) {
      var cprop = rootStyles[ci];
      if (cprop.indexOf("--") === 0 && !seen[cprop]) {
        seen[cprop] = true;
        var cval = rootStyles.getPropertyValue(cprop).trim();
        variables.push({ name: cprop, value: cval, computed: cval });
      }
    }

    return variables;
  }

  // ─── Used Fonts Extraction ────────────────────
  var GENERIC_FONT_KEYWORDS = {
    "serif": 1, "sans-serif": 1, "monospace": 1, "cursive": 1, "fantasy": 1,
    "system-ui": 1, "emoji": 1, "math": 1, "fangsong": 1, "inherit": 1,
    "initial": 1, "unset": 1, "revert": 1, "revert-layer": 1,
    "-apple-system": 1, "blinkmacsystemfont": 1
  };

  function cleanFamilyToken(tok) {
    var t = String(tok || "").trim();
    var qm = t.match(/^(['"])([\s\S]*)\1$/);
    if (qm) return qm[2].trim();
    return t;
  }

  // Split a font-family value on commas, ignoring commas inside quotes and
  // parentheses. Quoted family names can legally contain commas — Google
  // variable-font files produce families like "Saira VariableFont Wdth,wght" —
  // and var(--x, serif) fallbacks must stay a single token.
  function splitFamilyList(value) {
    var raw = String(value == null ? "" : value);
    var parts = [];
    var start = 0;
    var quote = null;
    var depth = 0;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (quote) {
        if (ch === "\\") { i++; continue; }
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        if (depth > 0) depth--;
      } else if (ch === "," && depth === 0) {
        parts.push(raw.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(raw.slice(start));
    return parts;
  }

  function isGenericFamilyName(name) {
    var n = String(name || "").trim().toLowerCase();
    if (!n) return true;
    if (GENERIC_FONT_KEYWORDS[n]) return true;
    if (n.indexOf("ui-") === 0) return true;
    if (n.indexOf("var(") !== -1 || n.indexOf("(") !== -1) return true;
    return false;
  }

  // Parse family names out of a fonts.googleapis.com href (css and css2 APIs).
  function parseGoogleHrefFamilies(href) {
    var names = [];
    if (!href) return names;
    var famRe = /[?&]family=([^&]+)/g;
    var fm;
    while ((fm = famRe.exec(href)) !== null) {
      var spec;
      try { spec = decodeURIComponent(fm[1].replace(/\+/g, " ")); }
      catch (e) { spec = fm[1].replace(/\+/g, " "); }
      // css1 API separates families with |, both APIs use : for weight specs
      var parts = spec.split("|");
      for (var pi = 0; pi < parts.length; pi++) {
        var name = parts[pi].split(":")[0].trim();
        if (name) names.push(name);
      }
    }
    return names;
  }

  function addSuppressedFont(styleTag, family) {
    if (!styleTag || !family) return;
    var suppressed = [];
    try { suppressed = JSON.parse(styleTag.getAttribute("data-gl-suppressed-fonts") || "[]"); } catch (e) {}
    if (!Array.isArray(suppressed)) suppressed = [];
    var key = String(family).trim().toLowerCase();
    var exists = false;
    for (var si = 0; si < suppressed.length; si++) {
      if (String(suppressed[si]).toLowerCase() === key) { exists = true; break; }
    }
    if (!exists) suppressed.push(family);
    styleTag.setAttribute("data-gl-suppressed-fonts", JSON.stringify(suppressed));
  }

  // Preview-only style tags: the host inlines local linked stylesheets into
  // <style data-gl-inlined="..."> and Astro frontmatter CSS into
  // <style data-gl-fm-css="..."> tags. They hold real page CSS (so fonts in
  // them must be detected) but they do not exist in the raw file, so font
  // rewrites must go through managed overrides instead of direct edits.
  function isPreviewOnlyStyleTag(node) {
    if (!node || !node.hasAttribute) return false;
    return node.hasAttribute("data-gl-inlined") || node.hasAttribute("data-gl-fm-css");
  }

  // Detect the font families actually used by the document. Same CSSOM-first +
  // raw-text-fallback strategy as extractCssVariables. Returns
  // [{ family, count, sources: {css, inline, variable}, hasFontFace, googleLinkHrefs }].
  function extractUsedFonts() {
    var fontsByKey = {};
    var fontList = [];
    var fontFaceFamilies = {};
    var varsReferencedInFont = {}; // --var names used inside font declarations

    function record(family, source) {
      var name = cleanFamilyToken(family);
      if (!name || isGenericFamilyName(name)) return;
      var key = name.toLowerCase();
      var entry = fontsByKey[key];
      if (!entry) {
        entry = { family: name, count: 0, sources: { css: 0, inline: 0, variable: 0 }, hasFontFace: false, googleLinkHrefs: [] };
        fontsByKey[key] = entry;
        fontList.push(entry);
      }
      entry.count++;
      if (source && entry.sources[source] !== undefined) entry.sources[source]++;
    }

    function recordFamilyList(value, source) {
      if (!value) return;
      var parts = splitFamilyList(value);
      for (var i = 0; i < parts.length; i++) {
        var varMatch = parts[i].match(/var\(\s*(--[\w-]+)/);
        if (varMatch) { varsReferencedInFont[varMatch[1]] = true; continue; }
        record(parts[i], source);
      }
    }

    function isScannableOwner(node) {
      if (!node || !node.hasAttribute) return true;
      // Only skip editor-overlay styles. Unlike the moodboard editor,
      // data-gl-inlined / data-gl-fm-css tags hold real page CSS here.
      if (node.hasAttribute("data-gl-overlay")) return false;
      return true;
    }

    function scanRules(rules) {
      if (!rules) return;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        if (typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule) {
          var ffName = cleanFamilyToken(rule.style && rule.style.getPropertyValue("font-family"));
          if (ffName) fontFaceFamilies[ffName.toLowerCase()] = true;
        } else if (rule.style) {
          // font shorthand is expanded to the font-family longhand by CSSOM
          var fam = rule.style.getPropertyValue("font-family");
          if (fam) recordFamilyList(fam, "css");
        } else if (rule.cssRules) {
          scanRules(rule.cssRules); // @media / @supports
        }
      }
    }

    // Primary: CSSOM. Track which style tags were readable so the raw-text
    // fallback only covers the rest.
    var scannedOwners = [];
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        if (!isScannableOwner(sheet.ownerNode)) continue;
        try {
          var rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          scanRules(rules);
          if (sheet.ownerNode) scannedOwners.push(sheet.ownerNode);
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
    } catch (e) {}

    // Fallback: raw-text parse of <style> tags CSSOM couldn't read.
    var fontStyleTags = document.querySelectorAll("style");
    for (var st = 0; st < fontStyleTags.length; st++) {
      var sTag = fontStyleTags[st];
      if (!isScannableOwner(sTag)) continue;
      if (scannedOwners.indexOf(sTag) !== -1) continue;
      var text = sTag.textContent || "";
      var declRe = /(?:^|[;{])\s*(font-family|font)\s*:\s*([^;}]+)/gi;
      var dm;
      while ((dm = declRe.exec(text)) !== null) {
        var val = dm[2];
        if (dm[1].toLowerCase() === "font") {
          // shorthand: family list starts after the <size>[/<line-height>] token
          var shMatch = val.match(/\d[\w.%]*(?:\s*\/\s*[\d.\w%]+)?\s+(.+)$/);
          if (!shMatch) continue;
          val = shMatch[1];
        }
        recordFamilyList(val, "css");
      }
      var ffRe = /@font-face[^{}]*\{([^}]*)\}/gi;
      var ffm;
      while ((ffm = ffRe.exec(text)) !== null) {
        var ffFam = /font-family\s*:\s*([^;}]+)/i.exec(ffm[1]);
        if (ffFam) {
          var ffn = cleanFamilyToken(ffFam[1]);
          if (ffn) fontFaceFamilies[ffn.toLowerCase()] = true;
        }
      }
    }

    // Inline styles (skip editor overlay elements)
    var inlineStyled = document.querySelectorAll("[style]");
    for (var ie = 0; ie < inlineStyled.length; ie++) {
      var iEl = inlineStyled[ie];
      if (iEl.hasAttribute("data-gl-overlay")) continue;
      if (iEl.closest && iEl.closest("[data-gl-overlay]")) continue;
      var inlineFam = iEl.style && iEl.style.fontFamily;
      if (inlineFam) recordFamilyList(inlineFam, "inline");
      if (iEl.style) {
        for (var ipi = 0; ipi < iEl.style.length; ipi++) {
          var ipn = iEl.style[ipi];
          if (ipn.indexOf("--") === 0 && varsReferencedInFont[ipn]) {
            recordFamilyList(iEl.style.getPropertyValue(ipn), "variable");
          }
        }
      }
    }

    // CSS variables referenced from font declarations — resolve their values
    var fontVars = extractCssVariables();
    for (var fv = 0; fv < fontVars.length; fv++) {
      if (!varsReferencedInFont[fontVars[fv].name]) continue;
      recordFamilyList(fontVars[fv].value || fontVars[fv].computed, "variable");
    }

    // @font-face indicator
    for (var ffk in fontFaceFamilies) {
      if (fontsByKey[ffk]) fontsByKey[ffk].hasFontFace = true;
    }

    // Google Fonts links (managed or not) — record hrefs per family
    var gLinks = document.querySelectorAll('link[href*="fonts.googleapis"]');
    for (var gl = 0; gl < gLinks.length; gl++) {
      var gHref = gLinks[gl].getAttribute("href") || "";
      var gFams = parseGoogleHrefFamilies(gHref);
      for (var gf = 0; gf < gFams.length; gf++) {
        var gEntry = fontsByKey[gFams[gf].toLowerCase()];
        if (gEntry && gEntry.googleLinkHrefs.indexOf(gHref) === -1) {
          gEntry.googleLinkHrefs.push(gHref);
        }
      }
    }

    // Linked/inlined stylesheets remain readable after we override/remove one
    // of their families. Managed override tags persist a suppression marker so
    // the old family does not reappear in the Typography list after save/reload.
    var suppressedKeys = {};
    var suppressionTags = document.querySelectorAll("style[data-gl-suppressed-fonts]");
    for (var skt = 0; skt < suppressionTags.length; skt++) {
      try {
        var suppressedNames = JSON.parse(suppressionTags[skt].getAttribute("data-gl-suppressed-fonts") || "[]");
        for (var skn = 0; skn < suppressedNames.length; skn++) {
          suppressedKeys[String(suppressedNames[skn]).trim().toLowerCase()] = true;
        }
      } catch (suppressionErr) {}
    }
    fontList = fontList.filter(function (entry) { return !suppressedKeys[entry.family.toLowerCase()]; });
    fontList.sort(function (a, b) { return b.count - a.count; });
    // The webview contract reports sources as booleans
    for (var fb = 0; fb < fontList.length; fb++) {
      var fbSrc = fontList[fb].sources;
      fontList[fb].sources = { css: fbSrc.css > 0, inline: fbSrc.inline > 0, variable: fbSrc.variable > 0 };
    }
    return fontList;
  }

  // ─── CSS Classes Extraction ────────────────────
  function extractClassesFromStyleRule(rule, classes, seen) {
    var sel = rule.selectorText || "";
    var classMatches = sel.match(/\.([\w-]+)/g);
    if (classMatches) {
      for (var c = 0; c < classMatches.length; c++) {
        var className = classMatches[c].substring(1);
        if (!seen[className] && className.indexOf("gl-") !== 0) {
          seen[className] = true;
          var props = {};
          var importantProps = ["color", "background-color", "font-size", "display", "padding", "margin"];
          for (var ip = 0; ip < importantProps.length; ip++) {
            var val = rule.style.getPropertyValue(importantProps[ip]);
            if (val) props[importantProps[ip]] = val;
          }
          classes.push({ name: className, selector: sel, properties: props });
        }
      }
    }
  }

  function extractClassesFromText(text, classes, seen) {
    // Parse class selectors from raw CSS text
    var ruleRegex = /([^{}]+)\{([^}]*)\}/g;
    var m;
    while ((m = ruleRegex.exec(text)) !== null) {
      var selector = m[1].trim();
      var body = m[2];
      var classMatches = selector.match(/\.([\w-]+)/g);
      if (classMatches) {
        for (var c = 0; c < classMatches.length; c++) {
          var className = classMatches[c].substring(1);
          if (!seen[className] && className.indexOf("gl-") !== 0) {
            seen[className] = true;
            var props = {};
            var importantProps = ["color", "background-color", "font-size", "display", "padding", "margin"];
            for (var ip = 0; ip < importantProps.length; ip++) {
              var propRegex = new RegExp(importantProps[ip] + "\\s*:\\s*([^;]+)");
              var pm = body.match(propRegex);
              if (pm) props[importantProps[ip]] = pm[1].trim();
            }
            classes.push({ name: className, selector: selector, properties: props });
          }
        }
      }
    }
  }

  function extractAllCssClasses() {
    var classes = [];
    var seen = {};

    // Primary: use CSSOM API
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        try {
          var rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (var r = 0; r < rules.length; r++) {
            var rule = rules[r];
            if (rule instanceof CSSStyleRule) {
              extractClassesFromStyleRule(rule, classes, seen);
            } else if (rule instanceof CSSMediaRule) {
              for (var mr = 0; mr < rule.cssRules.length; mr++) {
                var innerRule = rule.cssRules[mr];
                if (innerRule instanceof CSSStyleRule) {
                  extractClassesFromStyleRule(innerRule, classes, seen);
                }
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
    } catch (e) {
      // ignore
    }

    // Also parse <style> tag text content directly (catches anything CSSOM missed)
    var styleTags = document.querySelectorAll("style");
    for (var st = 0; st < styleTags.length; st++) {
      var text = styleTags[st].textContent || "";
      if (text.trim()) {
        extractClassesFromText(text, classes, seen);
      }
    }

    return classes;
  }

  function getElementDepth(basePath, path) {
    if (!path) return 0;
    var pathDepth = path.split(".").filter(Boolean).length;
    var baseDepth = basePath ? basePath.split(".").filter(Boolean).length : 0;
    return Math.max(0, pathDepth - baseDepth);
  }

  function extractStyles(element, preferredClassName, preferredSelector, includeDescendants) {
    if (includeDescendants === undefined) includeDescendants = true;
    var inline = {};
    for (var i = 0; i < element.style.length; i++) {
      var prop = element.style[i];
      inline[prop] = element.style.getPropertyValue(prop);
    }

    var classRules = {};
    var idRules = {};

    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var sheet = document.styleSheets[s];
        var rules;
        try {
          rules = sheet.cssRules || sheet.rules;
        } catch (e) {
          continue;
        }
        if (!rules) continue;

        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (!(rule instanceof CSSStyleRule)) continue;

          var sel = rule.selectorText.trim();
          // Skip universal selector rules (*, *::before, *::after) — resets/defaults
          var selStripped = sel.replace(/\s+/g, "").replace(/\*(::[a-z-]+)?/g, "").replace(/,/g, "");
          if (selStripped === "") continue;
          var isId =
            sel.charAt(0) === "#" &&
            sel.indexOf(" ") === -1 &&
            sel.indexOf(":") === -1;

          if (isId) {
            try {
              if (!element.matches(rule.selectorText)) continue;
            } catch (e) {
              continue;
            }
          } else if (preferredSelector) {
            if (!selectorListContains(sel, preferredSelector)) continue;
          } else {
            try {
              if (!element.matches(rule.selectorText)) continue;
            } catch (e) {
              continue;
            }
            if (preferredClassName && !selectorContainsClass(sel, preferredClassName)) continue;
          }
          var target = isId ? idRules : classRules;

          for (var p = 0; p < rule.style.length; p++) {
            var rProp = rule.style[p];
            target[rProp] = rule.style.getPropertyValue(rProp);
          }
        }
      }
    } catch (e) {
      // stylesheet access error
    }

    // Also extract rules from inside @media blocks
    var responsiveRules = {};
    try {
      for (var s2 = 0; s2 < document.styleSheets.length; s2++) {
        var sheet2 = document.styleSheets[s2];
        var rules2;
        try { rules2 = sheet2.cssRules || sheet2.rules; } catch (e) { continue; }
        if (!rules2) continue;

        for (var r2 = 0; r2 < rules2.length; r2++) {
          var rule2 = rules2[r2];
          if (!(rule2 instanceof CSSMediaRule)) continue;

          var mediaText = rule2.conditionText || rule2.media.mediaText || "";
          var bpMatch = mediaText.match(/max-width:\s*(\d+)px/);
          if (!bpMatch) continue;
          var bp = bpMatch[1];

          for (var r3 = 0; r3 < rule2.cssRules.length; r3++) {
            var innerRule = rule2.cssRules[r3];
            if (!(innerRule instanceof CSSStyleRule)) continue;
            try {
              if (!element.matches(innerRule.selectorText)) continue;
            } catch (e) { continue; }
            // Skip universal selector rules
            var innerSel = innerRule.selectorText.trim();
            var innerSelStripped = innerSel.replace(/\s+/g, "").replace(/\*(::[a-z-]+)?/g, "").replace(/,/g, "");
            if (innerSelStripped === "") continue;

            if (!responsiveRules[bp]) responsiveRules[bp] = {};
            for (var p2 = 0; p2 < innerRule.style.length; p2++) {
              var rProp2 = innerRule.style[p2];
              responsiveRules[bp][rProp2] = innerRule.style.getPropertyValue(rProp2);
            }
          }
        }
      }
    } catch (e) {
      // stylesheet access error
    }

    var computed = {};
    var cs = getComputedStyle(element);
    var trackedProps = [
      "display", "position", "flex-direction", "justify-content", "align-items",
      "gap", "width", "height", "min-width", "min-height", "max-width", "max-height",
      "margin-top", "margin-right", "margin-bottom", "margin-left",
      "padding-top", "padding-right", "padding-bottom", "padding-left",
      "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
      "text-align", "text-decoration", "color", "background-color", "background-image",
      "background-size", "background-position", "background-repeat", "background-attachment",
      "background-blend-mode", "background-clip",
      "border-width", "border-style", "border-color", "border-radius",
      "opacity", "overflow", "z-index", "cursor",
    ];
    for (var t = 0; t < trackedProps.length; t++) {
      computed[trackedProps[t]] = cs.getPropertyValue(trackedProps[t]);
    }

    var attributes = {};
    var glSavePrefix = "data-gl-save-";
    var glSaveOverrides = {};
    // data-gl-original-src is the baseline clean path for load-time base64-encoded images.
    // Set it first so data-gl-save-* (upload flow) can override it with higher priority.
    if (element.hasAttribute("data-gl-original-src")) {
      glSaveOverrides["src"] = element.getAttribute("data-gl-original-src");
    }
    // data-gl-save-* takes priority over data-gl-original-src.
    for (var a = 0; a < element.attributes.length; a++) {
      var glAttr = element.attributes[a];
      if (glAttr.name.indexOf(glSavePrefix) === 0) {
        glSaveOverrides[glAttr.name.slice(glSavePrefix.length)] = glAttr.value;
      }
    }
    for (var a = 0; a < element.attributes.length; a++) {
      var attr = element.attributes[a];
      if (attr.name !== "data-gl-path" && attr.name !== "style" && attr.name !== "class" && attr.name !== "id"
          && attr.name.indexOf(glSavePrefix) !== 0 && attr.name !== "data-gl-original-src") {
        attributes[attr.name] = glSaveOverrides[attr.name] !== undefined ? glSaveOverrides[attr.name] : attr.value;
      }
    }

    var classList = Array.from(element.classList);
    var subSelectorsByClass = {};
    for (var ci = 0; ci < classList.length; ci++) {
      subSelectorsByClass[classList[ci]] = collectSubSelectorsForClass(classList[ci]);
    }

    var styleInfo = {
      inline: inline,
      classRules: classRules,
      idRules: idRules,
      computed: computed,
      responsiveRules: responsiveRules,
      attributes: attributes,
      tagName: element.tagName.toLowerCase(),
      id: element.id || "",
      classList: classList,
      selectedClass: preferredClassName || null,
      selectedSubSelector: selectedSubSelector || null,
      selectedSelector: preferredSelector || null,
      subSelectorsByClass: subSelectorsByClass,
      path: element.getAttribute("data-gl-path") || "",
    };

    if (includeDescendants) {
      var basePath = styleInfo.path;
      styleInfo.descendants = Array.from(element.querySelectorAll("[data-gl-path]")).map(function (descendant) {
        var descendantClassName = pickDefaultClassForElement(descendant);
        var descendantSelector = descendantClassName ? ("." + descendantClassName) : null;
        var descendantInfo = extractStyles(descendant, descendantClassName, descendantSelector, false);
        descendantInfo.depth = getElementDepth(basePath, descendantInfo.path);
        return descendantInfo;
      });
    }

    return styleInfo;
  }

  function classExistsInStyleRules(className) {
    var classSelector = "." + className;
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      try {
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (rule instanceof CSSStyleRule) {
            if (rule.selectorText && rule.selectorText.indexOf(classSelector) !== -1) return true;
          } else if (rule instanceof CSSMediaRule) {
            for (var mr = 0; mr < rule.cssRules.length; mr++) {
              var innerRule = rule.cssRules[mr];
              if (innerRule instanceof CSSStyleRule && innerRule.selectorText && innerRule.selectorText.indexOf(classSelector) !== -1) {
                return true;
              }
            }
          }
        }
      } catch (e) { continue; }
    }
    return false;
  }

  function classExistsAnywhere(className) {
    if (!className) return false;
    if (document.querySelector("." + className)) return true;
    return classExistsInStyleRules(className);
  }

  function generateUniqueGlClassName() {
    var candidate;
    do {
      candidate = "gl-" + (++glClassCounter);
    } while (classExistsAnywhere(candidate));
    return candidate;
  }

  function selectorContainsClass(selector, className) {
    if (!selector || !className) return false;
    var classPattern = new RegExp("(^|[^\\w-])\\." + className + "(?![\\w-])");
    return classPattern.test(selector);
  }

  function selectorListContains(selectorList, targetSelector) {
    if (!selectorList || !targetSelector) return false;
    var targets = selectorList.split(",");
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].trim() === targetSelector) return true;
    }
    return false;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getSelectedSelector() {
    if (!selectedClassName) return null;
    return "." + selectedClassName + (selectedSubSelector || "");
  }

  function collectSubSelectorsForClass(className) {
    var out = [];
    if (!className) return out;
    var seen = {};

    function addFromSelectorText(selectorText) {
      if (!selectorText) return;
      var parts = selectorText.split(",");
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (!part) continue;
        // Match only full class tokens, not prefixed/suffixed class names
        // (e.g. ".foo-wrap" must NOT match class "foo").
        var classToken = "." + className;
        var tokenRegex = new RegExp("\\." + escapeRegex(className) + "(?![\\w-])");
        var tokenMatch = part.match(tokenRegex);
        if (!tokenMatch || tokenMatch.index === undefined) continue;
        var idx = tokenMatch.index;
        var suffix = part.substring(idx + classToken.length);
        if (!suffix) continue;
        if (!seen[suffix]) {
          seen[suffix] = true;
          out.push(suffix);
        }
      }
    }

    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      try {
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (rule instanceof CSSStyleRule) {
            addFromSelectorText(rule.selectorText || "");
          } else if (rule instanceof CSSMediaRule) {
            for (var mr = 0; mr < rule.cssRules.length; mr++) {
              var inner = rule.cssRules[mr];
              if (inner instanceof CSSStyleRule) {
                addFromSelectorText(inner.selectorText || "");
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Also parse nested CSS syntax from raw <style> text:
    // .class { ... &:hover { ... } &.active { ... } }
    function addFromNestedStyleText(cssText) {
      if (!cssText) return;
      var blockRe = new RegExp("\\." + escapeRegex(className) + "(?![\\w-])\\s*\\{", "g");
      var blockMatch;
      while ((blockMatch = blockRe.exec(cssText)) !== null) {
        var openBraceIdx = cssText.indexOf("{", blockMatch.index);
        if (openBraceIdx === -1) continue;
        var depth = 0;
        var closeBraceIdx = -1;
        for (var i = openBraceIdx; i < cssText.length; i++) {
          var ch = cssText.charAt(i);
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) { closeBraceIdx = i; break; }
          }
        }
        if (closeBraceIdx === -1) continue;
        var body = cssText.substring(openBraceIdx + 1, closeBraceIdx);
        var nestedRe = /&([^{}]+)\{/g;
        var nestedMatch;
        while ((nestedMatch = nestedRe.exec(body)) !== null) {
          var suffix = (nestedMatch[1] || "").replace(/\s+$/, "");
          if (!suffix) continue;
          if (!seen[suffix]) {
            seen[suffix] = true;
            out.push(suffix);
          }
        }
        blockRe.lastIndex = closeBraceIdx + 1;
      }
    }

    var styleTags = document.querySelectorAll("style");
    for (var st = 0; st < styleTags.length; st++) {
      addFromNestedStyleText(styleTags[st].textContent || "");
    }

    return out;
  }

  function serializeRuleDeclarations(styleDecl) {
    if (!styleDecl) return "";
    var out = "";
    for (var i = 0; i < styleDecl.length; i++) {
      var prop = styleDecl[i];
      var val = styleDecl.getPropertyValue(prop);
      var priority = styleDecl.getPropertyPriority(prop);
      out += prop + ": " + val + (priority ? " !important" : "") + "; ";
    }
    return out.trim();
  }

  function serializeSheetWithNesting(styleTag) {
    if (!styleTag || !styleTag.sheet) return "";
    var sheet = styleTag.sheet;
    var groups = {};
    var order = [];

    function ensureGroup(className) {
      if (!groups[className]) {
        groups[className] = { base: "", subs: {}, idx: order.length };
        order.push({ type: "group", className: className });
      }
      return groups[className];
    }

    try {
      for (var i = 0; i < sheet.cssRules.length; i++) {
        var rule = sheet.cssRules[i];
        if (!(rule instanceof CSSStyleRule)) {
          order.push({ type: "raw", css: rule.cssText + "\n" });
          continue;
        }

        var selector = (rule.selectorText || "").trim();
        if (selector.indexOf(",") !== -1) {
          order.push({ type: "raw", css: rule.cssText + "\n" });
          continue;
        }

        var baseMatch = selector.match(/^\.([A-Za-z0-9_-]+)$/);
        if (baseMatch) {
          var gBase = ensureGroup(baseMatch[1]);
          gBase.base = serializeRuleDeclarations(rule.style);
          continue;
        }

        var subMatch = selector.match(/^\.([A-Za-z0-9_-]+)(.+)$/);
        if (subMatch) {
          var className = subMatch[1];
          var suffix = subMatch[2];
          var gSub = ensureGroup(className);
          gSub.subs[suffix] = serializeRuleDeclarations(rule.style); // last wins
          continue;
        }

        order.push({ type: "raw", css: rule.cssText + "\n" });
      }
    } catch (e) {
      return styleTag.textContent || "";
    }

    var css = "";
    for (var oi = 0; oi < order.length; oi++) {
      var item = order[oi];
      if (item.type === "raw") {
        css += item.css;
        continue;
      }
      var grp = groups[item.className];
      if (!grp) continue;
      css += "." + item.className + " {\n";
      if (grp.base) css += "  " + grp.base + "\n";
      for (var suffix in grp.subs) {
        if (!grp.subs[suffix]) continue;
        css += "  &" + suffix + " { " + grp.subs[suffix] + " }\n";
      }
      css += "}\n";
    }
    return css;
  }

  function findStyleRuleByExactSelectorAndDedupe(container, selector) {
    if (!container || !selector) return null;
    var chosen = null;
    try {
      for (var i = container.cssRules.length - 1; i >= 0; i--) {
        var rule = container.cssRules[i];
        if (!(rule instanceof CSSStyleRule)) continue;
        if (rule.selectorText !== selector) continue;
        if (!chosen) {
          chosen = rule; // keep the latest rule for this selector
        } else {
          container.deleteRule(i); // remove earlier duplicates
          cssChanged = true;
        }
      }
    } catch (e) {}
    return chosen;
  }

  function removeClassStyles(className) {
    if (!className) return;
    var removedAny = false;
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      try {
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (var r = rules.length - 1; r >= 0; r--) {
          var rule = rules[r];
          if (rule instanceof CSSStyleRule) {
            if (selectorContainsClass(rule.selectorText || "", className)) {
              sheet.deleteRule(r);
              removedAny = true;
            }
          } else if (rule instanceof CSSMediaRule) {
            for (var mr = rule.cssRules.length - 1; mr >= 0; mr--) {
              var innerRule = rule.cssRules[mr];
              if (innerRule instanceof CSSStyleRule && selectorContainsClass(innerRule.selectorText || "", className)) {
                rule.deleteRule(mr);
                removedAny = true;
              }
            }
            if (rule.cssRules.length === 0) {
              sheet.deleteRule(r);
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    var animStyleId = "gl-anim-" + className;
    var animStyleTag = document.getElementById(animStyleId);
    if (animStyleTag && animStyleTag.parentNode) {
      animStyleTag.parentNode.removeChild(animStyleTag);
      markStyleBlockRemoved(animStyleId);
      removedAny = true;
    }
    if (removedAny) cssChanged = true;
  }

  function pickDefaultClassForElement(el) {
    if (!el || !el.classList || el.classList.length === 0) return null;
    for (var i = 0; i < el.classList.length; i++) {
      if (el.classList[i].indexOf("gl-") === 0) return el.classList[i];
    }
    return el.classList[0] || null;
  }

  function parseAnimationNames(value) {
    if (!value) return [];
    return value
      .split(",")
      .map(function (part) { return part.trim(); })
      .filter(function (name) { return name && name !== "none"; });
  }

  function getAnimationNamesForElement(el) {
    if (!el) return [];
    var computed = getComputedStyle(el);
    return parseAnimationNames(computed.getPropertyValue("animation-name"));
  }

  function listRemovedAnimationNames(beforeNames, afterNames) {
    var afterSet = {};
    for (var i = 0; i < afterNames.length; i++) afterSet[afterNames[i]] = true;
    var removed = [];
    for (var j = 0; j < beforeNames.length; j++) {
      if (!afterSet[beforeNames[j]]) removed.push(beforeNames[j]);
    }
    return removed;
  }

  function getUsedAnimationNames() {
    var used = {};
    var editableNodes = document.querySelectorAll("[data-gl-path]");
    for (var i = 0; i < editableNodes.length; i++) {
      var names = getAnimationNamesForElement(editableNodes[i]);
      for (var j = 0; j < names.length; j++) {
        used[names[j]] = true;
      }
    }
    return used;
  }

  function removeUnusedKeyframes(candidateNames) {
    if (!candidateNames || candidateNames.length === 0) return;
    var styleTag = document.getElementById("gl-editor-styles");
    if (!styleTag || !styleTag.sheet) return;

    var usedNames = getUsedAnimationNames();
    try {
      var sheet = styleTag.sheet;
      for (var i = sheet.cssRules.length - 1; i >= 0; i--) {
        var rule = sheet.cssRules[i];
        if (!(rule instanceof CSSKeyframesRule)) continue;
        var shouldCheck = false;
        for (var c = 0; c < candidateNames.length; c++) {
          if (rule.name === candidateNames[c]) {
            shouldCheck = true;
            break;
          }
        }
        if (shouldCheck && !usedNames[rule.name]) {
          sheet.deleteRule(i);
        }
      }
    } catch (e) {
      // ignore stylesheet mutation failures
    }
  }

  // ─── Priority-aware setProperty helper ──────────────
  function setPropertyWithPriority(style, property, value, priority) {
    if (priority) {
      style.setProperty(property, value, priority);
    } else {
      style.setProperty(property, value);
    }
  }

  // ─── Class-based Style Application ─────────────────
  function applyStyleToClass(el, property, value, preferredClassName, preferredSelector, priority) {
    // Remove from inline so the class rule takes effect
    el.style.removeProperty(property);

    if (preferredClassName && !el.classList.contains(preferredClassName)) {
      el.classList.add(preferredClassName);
      trackElementChange(el, "class");
    }

    var editorTag = document.getElementById("gl-editor-styles");
    var editorSheet = editorTag ? editorTag.sheet : null;

    var targetSelector = preferredSelector || (preferredClassName ? ("." + preferredClassName) : null);

    if (targetSelector && editorSheet) {
      var existingEditorRule = findStyleRuleByExactSelectorAndDedupe(editorSheet, targetSelector);
      if (existingEditorRule) {
        if (value) setPropertyWithPriority(existingEditorRule.style, property, value, priority);
        else existingEditorRule.style.removeProperty(property);
        cssChanged = true;
        return;
      }
    }

    // Mobile-first pattern: if a currently-matching @media (min-width:X) rule
    // already defines this property for our selector, save there instead of base rule.
    for (var sw = 0; sw < document.styleSheets.length; sw++) {
      var sheetW = document.styleSheets[sw];
      var rulesW;
      try { rulesW = sheetW.cssRules || sheetW.rules; } catch (e) { continue; }
      if (!rulesW) continue;
      for (var rw = 0; rw < rulesW.length; rw++) {
        var mRuleW = rulesW[rw];
        if (!(mRuleW instanceof CSSMediaRule)) continue;
        var mediaTextW = mRuleW.conditionText || mRuleW.media.mediaText || "";
        if (mediaTextW.indexOf("min-width") === -1) continue;
        try { if (!window.matchMedia(mediaTextW).matches) continue; } catch (e) { continue; }
        for (var rw2 = 0; rw2 < mRuleW.cssRules.length; rw2++) {
          var innerRuleW = mRuleW.cssRules[rw2];
          if (!(innerRuleW instanceof CSSStyleRule)) continue;
          if (!innerRuleW.style.getPropertyValue(property)) continue;
          var innerSelW = innerRuleW.selectorText.trim();
          var matchesW = false;
          if (targetSelector) {
            matchesW = selectorListContains(innerSelW, targetSelector);
          } else if (preferredClassName) {
            try { matchesW = el.matches(innerSelW) && selectorContainsClass(innerSelW, preferredClassName); } catch (e) {}
          } else {
            try { matchesW = el.matches(innerSelW); } catch (e) {}
          }
          if (matchesW) {
            if (value) setPropertyWithPriority(innerRuleW.style, property, value, priority);
            else innerRuleW.style.removeProperty(property);
            var ownerNodeW = sheetW.ownerNode;
            if (ownerNodeW) ownerNodeW._glDirty = true;
            cssChanged = true;
            return;
          }
        }
      }
    }

    // Scan all sheets for a matching class/ID rule
    var bestRule = null;
    var bestIsEditorOwned = false;
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      try {
        var rules = sheet.cssRules;
        for (var r = 0; r < rules.length; r++) {
          if (!(rules[r] instanceof CSSStyleRule)) continue;
          var sel = rules[r].selectorText.trim();
          if (sel.charAt(0) !== "." && sel.charAt(0) !== "#") continue;
          if (targetSelector) {
            if (!selectorListContains(sel, targetSelector)) continue;
            bestRule = rules[r];
            bestIsEditorOwned = (sheet === editorSheet) ||
              (sheet.ownerNode && sheet.ownerNode.id && sheet.ownerNode.id.indexOf("gl-") === 0);
            continue;
          } else if (preferredClassName && !selectorContainsClass(sel, preferredClassName)) {
            continue;
          }
          try {
            if (el.matches(sel)) {
              bestRule = rules[r];
              bestIsEditorOwned = (sheet === editorSheet) ||
                (sheet.ownerNode && sheet.ownerNode.id && sheet.ownerNode.id.indexOf("gl-") === 0);
            }
          } catch (e) { continue; }
        }
      } catch (e) { continue; }
    }

    if (bestRule && bestIsEditorOwned) {
      // Rule is in an editor-owned sheet — modify directly
      if (value) setPropertyWithPriority(bestRule.style, property, value, priority);
      else bestRule.style.removeProperty(property);
      cssChanged = true;
      return;
    }

    if (bestRule && !bestIsEditorOwned) {
      // Rule is in a USER stylesheet — modify it directly
      if (value) setPropertyWithPriority(bestRule.style, property, value, priority);
      else bestRule.style.removeProperty(property);

      // Mark the owning style tag as dirty so getPatches() picks it up
      var ownerNode = bestRule.parentStyleSheet && bestRule.parentStyleSheet.ownerNode;
      if (ownerNode) ownerNode._glDirty = true;

      cssChanged = true;
      return;
    }

    if (!value) return;

    // No matching rule at all — create a new class in gl-editor-styles
    cssChanged = true;
    if (!editorTag) {
      editorTag = document.createElement("style");
      editorTag.id = "gl-editor-styles";
      document.head.appendChild(editorTag);
    }

    var className = preferredClassName || generateUniqueGlClassName();
    el.classList.add(className);
    selectedClassName = className;
    if (!preferredSelector) selectedSubSelector = null;
    trackElementChange(el, "class");

    var selectorForNewRule = targetSelector || ("." + className);

    var importantSuffix = priority ? " !important" : "";
    try {
      editorTag.sheet.insertRule(
        selectorForNewRule + " { " + property + ": " + value + importantSuffix + "; }",
        editorTag.sheet.cssRules.length
      );
    } catch (e) {
      editorTag.textContent += "\n" + selectorForNewRule + " { " + property + ": " + value + importantSuffix + "; }";
    }
  }

  // ─── Responsive Style Helpers ─────────────────────
  function getOrCreateStyleTag() {
    var styleTag = document.getElementById("gl-editor-styles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "gl-editor-styles";
      document.head.appendChild(styleTag);
    }
    return styleTag;
  }

  function getOrCreateMediaRule(breakpoint) {
    var styleTag = getOrCreateStyleTag();
    var sheet = styleTag.sheet;

    // Search for existing @media rule with this breakpoint
    var targetCondition = "(max-width: " + breakpoint + "px)";
    for (var i = 0; i < sheet.cssRules.length; i++) {
      var rule = sheet.cssRules[i];
      if (rule instanceof CSSMediaRule) {
        var mediaText = rule.conditionText || rule.media.mediaText || "";
        if (mediaText === targetCondition) {
          return rule;
        }
      }
    }

    // Create new media rule — insert larger breakpoints before smaller ones
    var insertIdx = sheet.cssRules.length;
    for (var j = 0; j < sheet.cssRules.length; j++) {
      var r = sheet.cssRules[j];
      if (r instanceof CSSMediaRule) {
        var mt = r.conditionText || r.media.mediaText || "";
        var existingBp = mt.match(/max-width:\s*(\d+)px/);
        if (existingBp && parseInt(existingBp[1]) < breakpoint) {
          insertIdx = j;
          break;
        }
      }
    }

    try {
      var idx = sheet.insertRule(
        "@media " + targetCondition + " { }",
        insertIdx
      );
      return sheet.cssRules[idx];
    } catch (e) {
      // Fallback: append to textContent
      styleTag.textContent += "\n@media " + targetCondition + " { }";
      // Re-read from sheet
      for (var k = 0; k < sheet.cssRules.length; k++) {
        if (sheet.cssRules[k] instanceof CSSMediaRule) {
          var mt2 = sheet.cssRules[k].conditionText || sheet.cssRules[k].media.mediaText || "";
          if (mt2 === targetCondition) return sheet.cssRules[k];
        }
      }
      return null;
    }
  }

  function findGlSelector(el) {
    // Check for an existing gl- class
    for (var i = 0; i < el.classList.length; i++) {
      if (el.classList[i].indexOf("gl-") === 0) {
        return "." + el.classList[i];
      }
    }
    // Check for an ID
    if (el.id) {
      return "#" + el.id;
    }
    return null;
  }

  function applyResponsiveStyle(el, property, value, breakpoint, preferredClassName, preferredSelector, priority) {
    var targetSelector = preferredSelector || (preferredClassName ? ("." + preferredClassName) : null);

    // Remove from inline so stylesheet rules take effect
    el.style.removeProperty(property);

    if (preferredClassName && !el.classList.contains(preferredClassName)) {
      el.classList.add(preferredClassName);
      trackElementChange(el, "class");
    }

    var mediaRule = getOrCreateMediaRule(breakpoint);
    if (!mediaRule) return;

    if (targetSelector) {
      var exactResponsiveRule = findStyleRuleByExactSelectorAndDedupe(mediaRule, targetSelector);
      if (exactResponsiveRule) {
        if (value) setPropertyWithPriority(exactResponsiveRule.style, property, value, priority);
        else exactResponsiveRule.style.removeProperty(property);
        cssChanged = true;
        return;
      }
    }

    // Find existing rule for this element inside the media rule
    var bestRule = null;
    for (var r = 0; r < mediaRule.cssRules.length; r++) {
      var rule = mediaRule.cssRules[r];
      if (!(rule instanceof CSSStyleRule)) continue;
      var sel = rule.selectorText.trim();
      if (sel.charAt(0) !== "." && sel.charAt(0) !== "#") continue;
      if (targetSelector) {
        if (!selectorListContains(sel, targetSelector)) continue;
        bestRule = rule;
        continue;
      } else if (preferredClassName && !selectorContainsClass(sel, preferredClassName)) continue;
      try {
        if (el.matches(sel)) {
          bestRule = rule;
        }
      } catch (e) { continue; }
    }

    if (bestRule) {
      if (value) setPropertyWithPriority(bestRule.style, property, value, priority);
      else bestRule.style.removeProperty(property);
      cssChanged = true;
      return;
    }

    if (!value) return;

    cssChanged = true;
    // No existing responsive rule — need a selector
    var selector = targetSelector || findGlSelector(el);

    if (!selector) {
      // Assign a new class
      var className = generateUniqueGlClassName();
      el.classList.add(className);
      selectedClassName = className;
      selector = "." + className;
    }

    // Insert rule inside the media rule
    var importantSuffix = priority ? " !important" : "";
    try {
      mediaRule.insertRule(
        selector + " { " + property + ": " + value + importantSuffix + "; }",
        mediaRule.cssRules.length
      );
    } catch (e) {
      // Fallback: unlikely but handle gracefully
    }
  }

  // ─── DOM Tree Generation ──────────────────────────
  function buildDomTree() {
    function walk(node) {
      var children = Array.from(node.children).filter(isEditableElement);
      var hasText = false;
      for (var c = 0; c < node.childNodes.length; c++) {
        if (
          node.childNodes[c].nodeType === 3 &&
          node.childNodes[c].textContent.trim()
        ) {
          hasText = true;
          break;
        }
      }
      return {
        path: node.getAttribute("data-gl-path") || "",
        tagName: node.tagName.toLowerCase(),
        id: node.id || "",
        classList: Array.from(node.classList),
        hasTextContent: hasText,
        children: children.map(walk),
      };
    }

    var bodyChildren = Array.from(document.body.children).filter(isEditableElement);
    return {
      path: "",
      tagName: "body",
      id: document.body.id || "",
      classList: Array.from(document.body.classList),
      hasTextContent: false,
      children: bodyChildren.map(walk),
    };
  }

  // ─── HTML Serialization ───────────────────────────
  // ─── Patch-based save ─────────────────────────────
  // Instead of serializing the entire DOM, collect only what changed
  // and return a structured patch set. The extension applies these
  // patches to the original HTML file, preserving everything else.
  function getPatches() {
    if (!hasAnyChanges()) return null;

    var patches = {
      styleBlocks: [],
      removedStyleBlockIds: removedStyleBlockIds.slice(),
      scriptBlocks: [],
      linkBlocks: [],
      elements: [],
      deletions: [],
      insertions: structuralChanges.filter(function (c) { return c.type === "insert"; }),
      moves: structuralChanges.filter(function (c) { return c.type === "move"; }),
      classRenames: classRenames
    };

    // 0. Collect gl-design-system-font-* link tags from <head>
    var dsLinks = document.querySelectorAll('link[id^="gl-design-system-font"]');
    for (var dli = 0; dli < dsLinks.length; dli++) {
      var dsLink = dsLinks[dli];
      patches.linkBlocks.push({ id: dsLink.id, outerHTML: dsLink.outerHTML });
    }

    // 0a. Link edits (e.g. stale Google Fonts links removed by REPLACE_FONT)
    if (linkEdits.length > 0) {
      patches.linkEdits = linkEdits.slice();
    }

    // 1. Collect deletions
    for (var di = 0; di < structuralChanges.length; di++) {
      if (structuralChanges[di].type === "delete") {
        patches.deletions.push(structuralChanges[di].path);
      }
    }

    // 2. Collect editor-created style blocks
    var editorStyleIds = ["gl-design-system-variables", "gl-editor-styles", "gl-button-styles", "gl-section-styles"];
    // Also collect gl-design-system-*, gl-layout-*, gl-anim-*, and gl-tpl-* style tags
    var dynamicTags = document.querySelectorAll('style[id^="gl-design-system-"], style[id^="gl-layout-"], style[id^="gl-anim-"], style[id^="gl-tpl-"]');
    for (var li = 0; li < dynamicTags.length; li++) {
      editorStyleIds.push(dynamicTags[li].id);
    }

    for (var si = 0; si < editorStyleIds.length; si++) {
      var tag = document.getElementById(editorStyleIds[si]);
      if (!tag || !tag.sheet) continue;
      var css = "";
      if (editorStyleIds[si] === "gl-editor-styles") {
        css = serializeSheetWithNesting(tag);
      } else {
        try {
          var rules = tag.sheet.cssRules;
          for (var ri = 0; ri < rules.length; ri++) {
            css += rules[ri].cssText + "\n";
          }
        } catch (e) {}
      }
      if (css.trim()) {
        patches.styleBlocks.push({ id: editorStyleIds[si], css: css });
      }
    }

    // 2a. Collect modified user style blocks
    var userStyleEdits = [];
    for (var ui = 0; ui < userStyleSnapshots.length; ui++) {
      var snap = userStyleSnapshots[ui];
      if (!snap.element._glDirty) continue;
      var currentCss = "";
      try {
        var uRules = snap.element.sheet.cssRules;
        for (var uri = 0; uri < uRules.length; uri++) {
          currentCss += uRules[uri].cssText + "\n";
        }
      } catch (e) { currentCss = snap.element.textContent; }
      userStyleEdits.push({ originalText: snap.originalText, newCss: currentCss });
      snap.originalText = currentCss; // update baseline for next save
      snap.element._glDirty = false;
    }
    if (userStyleEdits.length > 0) {
      patches.userStyleEdits = userStyleEdits;
    }

    // 2b. Collect editor-created script blocks (e.g. observer script, template scripts)
    var observerScript = document.getElementById("gl-observer-script");
    if (observerScript) {
      patches.scriptBlocks.push({ id: "gl-observer-script", content: observerScript.textContent || "" });
    } else {
      // Observer was removed — send empty content to remove it from file
      patches.scriptBlocks.push({ id: "gl-observer-script", content: "" });
    }

    // Collect gl-tpl-* and glmw-script-* script blocks
    var tplScriptTags = document.querySelectorAll('script[id^="gl-tpl-"], script[id^="glmw-script-"]');
    for (var tsi = 0; tsi < tplScriptTags.length; tsi++) {
      patches.scriptBlocks.push({ id: tplScriptTags[tsi].id, content: tplScriptTags[tsi].textContent || "" });
    }

    // 3. Collect element-level changes
    for (var path in elementChanges) {
      var changes = elementChanges[path];
      var el = getElementByPath(path);
      if (!el) continue;

      var patch = { path: path };
      var hasChange = false;

      if (changes.classChanged) {
        patch.setAttrs = patch.setAttrs || {};
        patch.setAttrs["class"] = el.className || "";
        hasChange = true;
      }
      if (changes.styleChanged) {
        var savedStyleText = getMutatedInlineStyleText(path, changes.styleMutations || {});
        if (savedStyleText !== getOriginalInlineStyleText(path)) {
          patch.setAttrs = patch.setAttrs || {};
          patch.setAttrs["style"] = savedStyleText;
          hasChange = true;
        }
      }
      if (changes.textChanged) {
        // Temporarily restore original attribute values on descendants before serializing,
        // so JS-animated styles and load-time base64 src don't bleed into saved HTML.
        var _descendants = el.querySelectorAll("[data-gl-path]");
        var _styleBackups = [];
        var _srcBackups = [];
        for (var _di = 0; _di < _descendants.length; _di++) {
          var _desc = _descendants[_di];
          var _descPath = _desc.getAttribute("data-gl-path");
          var _descChanges = elementChanges[_descPath];
          // Restore style
          if (!_descChanges || !_descChanges.styleChanged) {
            var _curStyle = _desc.getAttribute("style");
            var _origStyle = Object.prototype.hasOwnProperty.call(originalStyleMap, _descPath) ? originalStyleMap[_descPath] : undefined;
            if (_curStyle !== _origStyle) {
              _styleBackups.push({ el: _desc, style: _curStyle });
              if (_origStyle) {
                _desc.setAttribute("style", _origStyle);
              } else {
                _desc.removeAttribute("style");
              }
            }
          }
          // Restore src: if data-gl-original-src is present and src not user-changed, put back the real path
          if (_desc.hasAttribute("data-gl-original-src")) {
            var _srcChanged = _descChanges && _descChanges.attrsChanged && _descChanges.attrsChanged["src"];
            if (!_srcChanged) {
              _srcBackups.push({ el: _desc, src: _desc.getAttribute("src") });
              _desc.setAttribute("src", _desc.getAttribute("data-gl-original-src"));
            }
          }
        }
        patch.innerHTML = el.innerHTML
          .replace(/\s*data-gl-path="[^"]*"/g, "")
          .replace(/\s*data-gl-save-[\w-]+="[^"]*"/g, "")
          .replace(/\s*data-gl-original-src="[^"]*"/g, "");
        // Restore runtime styles and src after serialization
        for (var _si = 0; _si < _styleBackups.length; _si++) {
          if (_styleBackups[_si].style !== null) {
            _styleBackups[_si].el.setAttribute("style", _styleBackups[_si].style);
          } else {
            _styleBackups[_si].el.removeAttribute("style");
          }
        }
        for (var _sri = 0; _sri < _srcBackups.length; _sri++) {
          if (_srcBackups[_sri].src !== null) {
            _srcBackups[_sri].el.setAttribute("src", _srcBackups[_sri].src);
          } else {
            _srcBackups[_sri].el.removeAttribute("src");
          }
        }
        hasChange = true;
      }
      if (changes.tagChanged) {
        patch.newTag = changes.tagChanged;
        hasChange = true;
      }
      // Custom attributes
      for (var attrName in changes.attrsChanged) {
        patch.setAttrs = patch.setAttrs || {};
        var glSaveName = "data-gl-save-" + attrName;
        if (el.hasAttribute(glSaveName)) {
          // Use the real save value (not the display/webview URI).
          patch.setAttrs[attrName] = el.getAttribute(glSaveName);
          patch.removeAttrs = patch.removeAttrs || [];
          patch.removeAttrs.push(glSaveName);
        } else if (el.hasAttribute(attrName)) {
          patch.setAttrs[attrName] = el.getAttribute(attrName);
        } else {
          patch.removeAttrs = patch.removeAttrs || [];
          patch.removeAttrs.push(attrName);
        }
        hasChange = true;
      }

      if (hasChange) patches.elements.push(patch);
    }

    // Reset tracking after collecting patches
    resetChangeTracking();

    return patches;
  }

  // ─── Undo / Redo ──────────────────────────────────
  function listTrackedStyleTags() {
    var allStyles = document.querySelectorAll("style");
    var tracked = [];
    for (var i = 0; i < allStyles.length; i++) {
      var st = allStyles[i];
      if (st.hasAttribute("data-gl-inlined")) continue;
      if (!st.id && !st.getAttribute("data-gl-uid")) continue;
      tracked.push(st);
    }
    return tracked;
  }

  function serializeStyleTag(st) {
    // Serialize via CSSOM so we get the current in-memory rule state.
    var css = "";
    if (st.sheet) {
      try {
        var rules = st.sheet.cssRules;
        for (var r = 0; r < rules.length; r++) css += rules[r].cssText + "\n";
      } catch (e) {
        css = st.textContent;
      }
    } else {
      css = st.textContent;
    }
    return css;
  }

  function captureStyleState() {
    var tracked = listTrackedStyleTags();
    var captured = [];
    for (var i = 0; i < tracked.length; i++) {
      var st = tracked[i];
      captured.push({
        id: st.id || null,
        uid: st.getAttribute("data-gl-uid") || null,
        css: serializeStyleTag(st)
      });
    }
    return captured;
  }

  function restoreStyleState(captured) {
    // Legacy: old snapshots stored just a string for gl-editor-styles
    if (typeof captured === "string" || !captured) {
      var styleTag = document.getElementById("gl-editor-styles");
      if (!captured) {
        if (styleTag) styleTag.textContent = "";
        return;
      }
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "gl-editor-styles";
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = captured;
      return;
    }
    var descriptors = [];
    if (Array.isArray(captured)) {
      descriptors = captured;
    } else {
      // Legacy object format: key -> cssText
      for (var legacyKey in captured) {
        if (!Object.prototype.hasOwnProperty.call(captured, legacyKey)) continue;
        descriptors.push({
          id: document.getElementById(legacyKey) ? legacyKey : (legacyKey === "gl-editor-styles" || legacyKey.indexOf("gl-") === 0 ? legacyKey : null),
          uid: document.getElementById(legacyKey) ? null : (legacyKey === "gl-editor-styles" || legacyKey.indexOf("gl-") === 0 ? null : legacyKey),
          css: captured[legacyKey]
        });
      }
    }

    var expected = {};
    for (var di = 0; di < descriptors.length; di++) {
      var descriptor = descriptors[di];
      var descriptorKey = descriptor.id || descriptor.uid;
      if (!descriptorKey) continue;
      expected[descriptorKey] = true;
    }

    var existing = listTrackedStyleTags();
    for (var ei = 0; ei < existing.length; ei++) {
      var existingTag = existing[ei];
      var existingKey = existingTag.id || existingTag.getAttribute("data-gl-uid");
      if (!existingKey || expected[existingKey]) continue;
      if (existingTag.parentNode) existingTag.parentNode.removeChild(existingTag);
    }

    for (var i = 0; i < descriptors.length; i++) {
      var item = descriptors[i];
      var target = null;
      if (item.id) {
        target = document.getElementById(item.id);
      }
      if (!target && item.uid) {
        target = document.querySelector("[data-gl-uid='" + item.uid + "']");
      }
      if (!target) {
        target = document.createElement("style");
        if (item.id) target.id = item.id;
        if (item.uid) target.setAttribute("data-gl-uid", item.uid);
        document.head.appendChild(target);
      }
      target.textContent = item.css || "";
    }
  }

  function pushUndoSnapshot() {
    undoStack.push({ body: document.body.innerHTML, styles: captureStyleState() });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    if (freeMoveActive) { freeMoveActive = false; freeMovePreState = null; }
    redoStack.push({ body: document.body.innerHTML, styles: captureStyleState() });
    var snapshot = undoStack.pop();
    document.body.innerHTML = snapshot.body;
    restoreStyleState(snapshot.styles);
    createOverlays();
    assignPaths();
    selectedElement = null;
    if (isMarkdownMode) {
      document.body.setAttribute("contenteditable", "true");
    }
    window.parent.postMessage({ type: "ELEMENT_DESELECTED" }, EDITOR_ORIGIN);
    window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
  }

  function redo() {
    if (redoStack.length === 0) return;
    if (freeMoveActive) { freeMoveActive = false; freeMovePreState = null; }
    undoStack.push({ body: document.body.innerHTML, styles: captureStyleState() });
    var snapshot = redoStack.pop();
    document.body.innerHTML = snapshot.body;
    restoreStyleState(snapshot.styles);
    createOverlays();
    assignPaths();
    selectedElement = null;
    if (isMarkdownMode) {
      document.body.setAttribute("contenteditable", "true");
    }
    window.parent.postMessage({ type: "ELEMENT_DESELECTED" }, EDITOR_ORIGIN);
    window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
  }

  // ─── Overlays ─────────────────────────────────────
  function createOverlays() {
    overlayReloadWarningShown = false;
    var existing = document.querySelectorAll("[data-gl-overlay]");
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }

    hoverOverlay = document.createElement("div");
    hoverOverlay.setAttribute("data-gl-overlay", "hover");
    Object.assign(hoverOverlay.style, {
      all: "initial",
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #3b82f6",
      borderRadius: "2px",
      boxSizing: "border-box",
      zIndex: "99998",
      display: "none",
      transition: "all 0.08s ease",
    });
    document.body.appendChild(hoverOverlay);

    selectionOverlay = document.createElement("div");
    selectionOverlay.setAttribute("data-gl-overlay", "selection");
    Object.assign(selectionOverlay.style, {
      all: "initial",
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #10b981",
      borderRadius: "2px",
      backgroundColor: "rgba(16, 185, 129, 0.05)",
      boxSizing: "border-box",
      zIndex: "99999",
      display: "none",
    });
    document.body.appendChild(selectionOverlay);

    dropIndicator = document.createElement("div");
    dropIndicator.setAttribute("data-gl-overlay", "drop");
    Object.assign(dropIndicator.style, {
      all: "initial",
      position: "fixed",
      pointerEvents: "none",
      backgroundColor: "#3b82f6",
      height: "3px",
      borderRadius: "2px",
      boxSizing: "border-box",
      zIndex: "99999",
      display: "none",
    });
    document.body.appendChild(dropIndicator);

    dragHandle = document.createElement("div");
    dragHandle.setAttribute("data-gl-overlay", "draghandle");
    Object.assign(dragHandle.style, {
      all: "initial",
      position: "fixed",
      display: "flex",
      alignItems: "center",
      zIndex: "100000",
      height: "24px",
      lineHeight: "1",
      textAlign: "center",
      fontSize: "14px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#fff",
      backgroundColor: "#10b981",
      borderRadius: "6px",
      boxSizing: "border-box",
      userSelect: "none",
      pointerEvents: "auto",
      whiteSpace: "nowrap",
      overflow: "visible",
      padding: "0 2px",
      gap: "1px",
    });
    dragHandle.style.display = "none";
    document.body.appendChild(dragHandle);

    // Drag icon (move in DOM tree)
    var dragIcon = document.createElement("span");
    dragIcon.setAttribute("data-gl-overlay", "dragicon");
    dragIcon.innerHTML = "⠿";
    Object.assign(dragIcon.style, {
      all: "initial",
      display: "inline-block",
      width: "22px",
      minWidth: "22px",
      boxSizing: "border-box",
      height: "24px",
      lineHeight: "24px",
      textAlign: "center",
      fontSize: "14px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#fff",
      cursor: "grab",
      borderRadius: "4px",
    });
    dragHandle.appendChild(dragIcon);

    // Free-move button
    freeMoveBtn = document.createElement("span");
    freeMoveBtn.setAttribute("data-gl-overlay", "freemove-btn");
    freeMoveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:12px;height:12px;overflow:visible;flex:none"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
    Object.assign(freeMoveBtn.style, {
      all: "initial",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      minWidth: "22px",
      boxSizing: "border-box",
      height: "24px",
      cursor: "pointer",
      borderRadius: "4px",
      color: "#fff",
    });
    freeMoveBtn.title = "Free move mode";
    dragHandle.appendChild(freeMoveBtn);

    // Back/reset button (hidden by default)
    freeMoveBackBtn = document.createElement("span");
    freeMoveBackBtn.setAttribute("data-gl-overlay", "freemove-back");
    freeMoveBackBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:14px;height:14px;overflow:visible;flex:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    Object.assign(freeMoveBackBtn.style, {
      all: "initial",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      minWidth: "22px",
      boxSizing: "border-box",
      height: "24px",
      cursor: "pointer",
      borderRadius: "4px",
      color: "#fbbf24",
    });
    freeMoveBackBtn.title = "Reset to original position";
    dragHandle.appendChild(freeMoveBackBtn);

    dragIcon.addEventListener("mousedown", function (e) {
      if (!selectedElement) return;
      if (freeMoveActive) return; // don't do DOM drag in free-move mode
      e.preventDefault();
      e.stopPropagation();
      isDraggingElement = true;
      draggedElement = selectedElement;
      dragIcon.style.cursor = "grabbing";
      selectionOverlay.style.opacity = "0.3";
      document.addEventListener("mousemove", handleElementDrag, true);
      document.addEventListener("mouseup", handleElementDrop, true);
    });

    freeMoveBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedElement) return;
      if (freeMoveActive) {
        deactivateFreeMove();
      } else {
        activateFreeMove();
      }
    });

    freeMoveBackBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedElement || !freeMovePreState) return;
      resetFreeMove();
    });
  }

  function positionOverlay(overlay, element) {
    var rect = element.getBoundingClientRect();
    overlay.style.top = rect.top + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.display = "block";
  }

  function positionDragHandle(element) {
    if (!dragHandle) return;
    var rect = element.getBoundingClientRect();
    dragHandle.style.top = Math.max(4, rect.top - 28) + "px";
    dragHandle.style.left = Math.max(4, rect.left) + "px";
    dragHandle.style.display = "flex";
    requestAnimationFrame(validateOverlayControls);
  }

  function hideDragHandle() {
    if (dragHandle) dragHandle.style.display = "none";
    hideFreeMoveHandles();
  }

  function handleElementDrag(e) {
    if (!isDraggingElement || !draggedElement) return;
    e.preventDefault();
    var dt = findDropTarget(e.clientX, e.clientY);
    if (dt && dt.element !== draggedElement) {
      showDropIndicatorAt(dt.rect, dt.position);
      currentDropTarget = {
        path: dt.element.getAttribute("data-gl-path"),
        position: dt.position,
        element: dt.element,
      };
    } else {
      dropIndicator.style.display = "none";
      currentDropTarget = null;
    }
  }

  function handleElementDrop(e) {
    e.preventDefault();
    document.removeEventListener("mousemove", handleElementDrag, true);
    document.removeEventListener("mouseup", handleElementDrop, true);
    dropIndicator.style.display = "none";
    var di = dragHandle.querySelector("[data-gl-overlay='dragicon']");
    if (di) di.style.cursor = "grab";
    selectionOverlay.style.opacity = "1";

    if (isDraggingElement && draggedElement && currentDropTarget && currentDropTarget.element) {
      var target = currentDropTarget.element;
      if (target !== draggedElement && !draggedElement.contains(target)) {
        pushUndoSnapshot();
        // Track move for patch-based save using path-based move patch
        var sourcePath = draggedElement.getAttribute("data-gl-path") || "";
        var moveParentPath = target.parentNode.getAttribute ? (target.parentNode.getAttribute("data-gl-path") || "") : "";
        var moveSiblings = Array.from(target.parentNode.children).filter(isEditableElement);
        var sourceIdx = moveSiblings.indexOf(draggedElement);
        var targetIdx = moveSiblings.indexOf(target);
        var insertPos = currentDropTarget.position === "before" ? targetIdx : targetIdx + 1;
        // If moving within the same parent from an earlier index, adjust insert position
        // because deletion happens before insertion when applying patches.
        if (draggedElement.parentNode === target.parentNode && sourceIdx !== -1 && targetIdx !== -1 && sourceIdx < targetIdx) {
          insertPos = Math.max(0, insertPos - 1);
        }
        structuralChanges.push({
          type: "move",
          sourcePath: sourcePath,
          parentPath: moveParentPath,
          position: insertPos
        });
        if (currentDropTarget.position === "before") {
          target.parentNode.insertBefore(draggedElement, target);
        } else {
          target.parentNode.insertBefore(draggedElement, target.nextSibling);
        }
        assignPaths();
        selectElement(draggedElement);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
      }
    }

    isDraggingElement = false;
    draggedElement = null;
    currentDropTarget = null;
  }

  // ─── Find nearest drop target from coordinates ────
  function findDropTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var target = el.closest("[data-gl-path]");
    if (!target) return null;

    var rect = target.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    var position = y < midY ? "before" : "after";

    return { element: target, rect: rect, position: position };
  }

  function showDropIndicatorAt(rect, position) {
    if (position === "before") {
      dropIndicator.style.top = rect.top - 2 + "px";
    } else {
      dropIndicator.style.top = rect.bottom - 1 + "px";
    }
    dropIndicator.style.left = rect.left + "px";
    dropIndicator.style.width = rect.width + "px";
    dropIndicator.style.display = "block";
  }

  // ─── Free Move Mode ─────────────────────────────
  function getPositionedParent(el) {
    var parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      var pos = window.getComputedStyle(parent).position;
      if (pos === "relative" || pos === "absolute" || pos === "fixed" || pos === "sticky") return parent;
      parent = parent.parentElement;
    }
    return document.body;
  }

  function parseRotation(el) {
    var transform = window.getComputedStyle(el).transform;
    if (!transform || transform === "none") return 0;
    // matrix(a, b, c, d, tx, ty) → rotation = atan2(b, a)
    var match = transform.match(/^matrix\(([^,]+),\s*([^,]+)/);
    if (match) {
      return Math.atan2(parseFloat(match[2]), parseFloat(match[1])) * (180 / Math.PI);
    }
    var rotMatch = transform.match(/rotate\(([^)]+)deg\)/);
    if (rotMatch) return parseFloat(rotMatch[1]);
    return 0;
  }

  function activateFreeMove() {
    if (!selectedElement || freeMoveActive) return;
    pushUndoSnapshot();
    freeMoveActive = true;

    var cs = window.getComputedStyle(selectedElement);
    freeMovePreState = {
      position: selectedElement.style.position || "",
      top: selectedElement.style.top || "",
      left: selectedElement.style.left || "",
      right: selectedElement.style.right || "",
      bottom: selectedElement.style.bottom || "",
      width: selectedElement.style.width || "",
      height: selectedElement.style.height || "",
      transform: selectedElement.style.transform || "",
    };

    // Make element absolute if not already
    if (cs.position !== "absolute" && cs.position !== "fixed") {
      var rect = selectedElement.getBoundingClientRect();
      var parent = getPositionedParent(selectedElement);
      var parentRect = parent.getBoundingClientRect();
      selectedElement.style.position = "absolute";
      selectedElement.style.top = (rect.top - parentRect.top + parent.scrollTop) + "px";
      selectedElement.style.left = (rect.left - parentRect.left + parent.scrollLeft) + "px";
      selectedElement.style.width = rect.width + "px";
      selectedElement.style.height = rect.height + "px";
    }

    // Ensure parent has positioning context
    var posParent = getPositionedParent(selectedElement);
    if (posParent === document.body) {
      var parentEl = selectedElement.parentElement;
      if (parentEl && parentEl !== document.body && window.getComputedStyle(parentEl).position === "static") {
        parentEl.style.position = "relative";
      }
    }

    // Show UI
    freeMoveBtn.style.backgroundColor = "rgba(255,255,255,0.2)";
    freeMoveBackBtn.style.display = "inline-flex";
    showFreeMoveHandles();
    updateSmartPositioning();

    trackElementChange(selectedElement, "style");
    trackStyleMutation(selectedElement, "position", "absolute");
    trackStyleMutation(selectedElement, "top", selectedElement.style.top);
    trackStyleMutation(selectedElement, "left", selectedElement.style.left);
    trackStyleMutation(selectedElement, "width", selectedElement.style.width);
    trackStyleMutation(selectedElement, "height", selectedElement.style.height);
  }

  function deactivateFreeMove() {
    freeMoveActive = false;
    freeMovePreState = null;
    freeMoveBtn.style.backgroundColor = "";
    freeMoveBackBtn.style.display = "none";
    hideFreeMoveHandles();
  }

  function resetFreeMove() {
    if (!selectedElement || !freeMovePreState) return;
    pushUndoSnapshot();
    selectedElement.style.position = freeMovePreState.position;
    selectedElement.style.top = freeMovePreState.top;
    selectedElement.style.left = freeMovePreState.left;
    selectedElement.style.right = freeMovePreState.right;
    selectedElement.style.bottom = freeMovePreState.bottom;
    selectedElement.style.width = freeMovePreState.width;
    selectedElement.style.height = freeMovePreState.height;
    selectedElement.style.transform = freeMovePreState.transform;
    trackElementChange(selectedElement, "style");
    deactivateFreeMove();
    positionOverlay(selectionOverlay, selectedElement);
    positionDragHandle(selectedElement);
    var styles = extractStyles(selectedElement, selectedClassName, getSelectedSelector());
    window.parent.postMessage({ type: "STYLE_CHANGED", path: selectedElement.getAttribute("data-gl-path"), data: styles }, EDITOR_ORIGIN);
    window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
  }

  function showFreeMoveHandles() {
    hideFreeMoveHandles();
    if (!selectedElement) return;

    freeMoveHandlesContainer = document.createElement("div");
    freeMoveHandlesContainer.setAttribute("data-gl-overlay", "freemove-handles");
    Object.assign(freeMoveHandlesContainer.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "100001",
    });
    document.body.appendChild(freeMoveHandlesContainer);

    // Create resize handles (4 corners)
    var dirs = ["nw", "ne", "sw", "se"];
    var cursors = { nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize" };
    for (var i = 0; i < dirs.length; i++) {
      var handle = document.createElement("div");
      handle.setAttribute("data-gl-overlay", "freemove-resize");
      handle.setAttribute("data-resize-dir", dirs[i]);
      Object.assign(handle.style, {
        position: "fixed",
        width: "10px",
        height: "10px",
        backgroundColor: "#10b981",
        border: "2px solid #fff",
        borderRadius: "2px",
        cursor: cursors[dirs[i]],
        pointerEvents: "auto",
        zIndex: "100002",
      });
      handle.addEventListener("mousedown", handleResizeStart);
      freeMoveHandlesContainer.appendChild(handle);
    }

    // Rotation handle (bottom-right corner, offset outward)
    var rotHandle = document.createElement("div");
    rotHandle.setAttribute("data-gl-overlay", "freemove-rotate");
    Object.assign(rotHandle.style, {
      position: "fixed",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      backgroundColor: "#8b5cf6",
      border: "2px solid #fff",
      cursor: "crosshair",
      pointerEvents: "auto",
      zIndex: "100002",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    rotHandle.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    rotHandle.addEventListener("mousedown", handleRotateStart);
    freeMoveHandlesContainer.appendChild(rotHandle);

    positionFreeMoveHandles();

    // Enable click-and-drag to move
    selectedElement.addEventListener("mousedown", handleFreeMoveStart);
  }

  function hideFreeMoveHandles() {
    if (freeMoveHandlesContainer) {
      freeMoveHandlesContainer.parentNode.removeChild(freeMoveHandlesContainer);
      freeMoveHandlesContainer = null;
    }
    if (selectedElement) {
      selectedElement.removeEventListener("mousedown", handleFreeMoveStart);
    }
  }

  function positionFreeMoveHandles() {
    if (!freeMoveHandlesContainer || !selectedElement) return;
    var rect = selectedElement.getBoundingClientRect();
    var handles = freeMoveHandlesContainer.querySelectorAll("[data-resize-dir]");
    for (var i = 0; i < handles.length; i++) {
      var dir = handles[i].getAttribute("data-resize-dir");
      var hx = dir.indexOf("w") >= 0 ? rect.left - 5 : rect.right - 5;
      var hy = dir.indexOf("n") >= 0 ? rect.top - 5 : rect.bottom - 5;
      handles[i].style.left = hx + "px";
      handles[i].style.top = hy + "px";
    }
    // Rotation handle (bottom-right, offset outward)
    var rotHandle = freeMoveHandlesContainer.querySelector("[data-gl-overlay='freemove-rotate']");
    if (rotHandle) {
      rotHandle.style.left = (rect.right + 6) + "px";
      rotHandle.style.top = (rect.bottom + 6) + "px";
    }
  }

  // ─── Move interaction ──────────────────────────────
  function handleFreeMoveStart(e) {
    if (!freeMoveActive || !selectedElement) return;
    if (e.target.hasAttribute("data-gl-overlay")) return;
    e.preventDefault();
    e.stopPropagation();
    freeMoveIsMoving = true;
    hoverOverlay.style.display = "none";
    freeMoveStartX = e.clientX;
    freeMoveStartY = e.clientY;
    // Use offsetTop/offsetLeft — not affected by CSS transforms (rotation)
    var currentTop = selectedElement.offsetTop;
    var currentLeft = selectedElement.offsetLeft;
    // Switch to top/left for dragging
    selectedElement.style.top = Math.round(currentTop) + "px";
    selectedElement.style.left = Math.round(currentLeft) + "px";
    selectedElement.style.bottom = "";
    selectedElement.style.right = "";
    freeMoveStartTop = currentTop;
    freeMoveStartLeft = currentLeft;
    selectionOverlay.style.opacity = "0.3";
    document.addEventListener("mousemove", handleFreeMoveMove, true);
    document.addEventListener("mouseup", handleFreeMoveEnd, true);
  }

  function handleFreeMoveMove(e) {
    if (!freeMoveIsMoving || !selectedElement) return;
    e.preventDefault();
    var dx = e.clientX - freeMoveStartX;
    var dy = e.clientY - freeMoveStartY;
    selectedElement.style.top = (freeMoveStartTop + dy) + "px";
    selectedElement.style.left = (freeMoveStartLeft + dx) + "px";
    // Clear opposite sides while dragging
    selectedElement.style.right = "";
    selectedElement.style.bottom = "";
    positionOverlay(selectionOverlay, selectedElement);
    positionDragHandle(selectedElement);
    positionFreeMoveHandles();
  }

  function handleFreeMoveEnd(e) {
    if (!freeMoveIsMoving) return;
    freeMoveIsMoving = false;
    selectionOverlay.style.opacity = "1";
    document.removeEventListener("mousemove", handleFreeMoveMove, true);
    document.removeEventListener("mouseup", handleFreeMoveEnd, true);
    updateSmartPositioning();
    notifyFreeMoveStyleChange();
  }

  // ─── Smart positioning ─────────────────────────────
  function updateSmartPositioning() {
    if (!selectedElement || !freeMoveActive) return;
    var parent = getPositionedParent(selectedElement);
    // Use offsetTop/offsetLeft — not affected by CSS transforms (rotation)
    var elTop = selectedElement.offsetTop;
    var elLeft = selectedElement.offsetLeft;
    var elW = selectedElement.offsetWidth;
    var elH = selectedElement.offsetHeight;
    var parentW = parent.offsetWidth;
    var parentH = parent.offsetHeight;

    var fromTop = elTop;
    var fromBottom = parentH - (elTop + elH);
    var fromLeft = elLeft;
    var fromRight = parentW - (elLeft + elW);

    // Vertical: use whichever edge the element is closer to
    if (Math.abs(fromTop) <= Math.abs(fromBottom)) {
      selectedElement.style.top = Math.round(fromTop) + "px";
      selectedElement.style.bottom = "";
    } else {
      selectedElement.style.top = "";
      selectedElement.style.bottom = Math.round(fromBottom) + "px";
    }

    // Horizontal: use whichever edge the element is closer to
    if (Math.abs(fromLeft) <= Math.abs(fromRight)) {
      selectedElement.style.left = Math.round(fromLeft) + "px";
      selectedElement.style.right = "";
    } else {
      selectedElement.style.left = "";
      selectedElement.style.right = Math.round(fromRight) + "px";
    }
  }

  // ─── Resize interaction ────────────────────────────
  function handleResizeStart(e) {
    if (!selectedElement || !freeMoveActive) return;
    e.preventDefault();
    e.stopPropagation();
    freeMoveIsResizing = true;
    hoverOverlay.style.display = "none";
    freeMoveResizeDir = e.target.getAttribute("data-resize-dir");
    freeMoveStartX = e.clientX;
    freeMoveStartY = e.clientY;
    freeMoveStartWidth = selectedElement.offsetWidth;
    freeMoveStartHeight = selectedElement.offsetHeight;
    freeMoveStartTop = selectedElement.offsetTop;
    freeMoveStartLeft = selectedElement.offsetLeft;
    document.addEventListener("mousemove", handleResizeMove, true);
    document.addEventListener("mouseup", handleResizeEnd, true);
  }

  function handleResizeMove(e) {
    if (!freeMoveIsResizing || !selectedElement) return;
    e.preventDefault();
    var dx = e.clientX - freeMoveStartX;
    var dy = e.clientY - freeMoveStartY;
    var newW = freeMoveStartWidth;
    var newH = freeMoveStartHeight;
    var newTop = freeMoveStartTop;
    var newLeft = freeMoveStartLeft;

    if (freeMoveResizeDir.indexOf("e") >= 0) newW = Math.max(20, freeMoveStartWidth + dx);
    if (freeMoveResizeDir.indexOf("w") >= 0) { newW = Math.max(20, freeMoveStartWidth - dx); newLeft = freeMoveStartLeft + dx; }
    if (freeMoveResizeDir.indexOf("s") >= 0) newH = Math.max(20, freeMoveStartHeight + dy);
    if (freeMoveResizeDir.indexOf("n") >= 0) { newH = Math.max(20, freeMoveStartHeight - dy); newTop = freeMoveStartTop + dy; }

    selectedElement.style.width = Math.round(newW) + "px";
    selectedElement.style.height = Math.round(newH) + "px";
    if (freeMoveResizeDir.indexOf("n") >= 0 && selectedElement.style.top !== "") selectedElement.style.top = Math.round(newTop) + "px";
    if (freeMoveResizeDir.indexOf("w") >= 0 && selectedElement.style.left !== "") selectedElement.style.left = Math.round(newLeft) + "px";

    positionOverlay(selectionOverlay, selectedElement);
    positionDragHandle(selectedElement);
    positionFreeMoveHandles();
  }

  function handleResizeEnd(e) {
    if (!freeMoveIsResizing) return;
    freeMoveIsResizing = false;
    freeMoveResizeDir = null;
    document.removeEventListener("mousemove", handleResizeMove, true);
    document.removeEventListener("mouseup", handleResizeEnd, true);
    updateSmartPositioning();
    notifyFreeMoveStyleChange();
  }

  // ─── Rotation interaction ──────────────────────────
  function handleRotateStart(e) {
    if (!selectedElement || !freeMoveActive) return;
    e.preventDefault();
    e.stopPropagation();
    freeMoveIsRotating = true;
    hoverOverlay.style.display = "none";
    var rect = selectedElement.getBoundingClientRect();
    freeMoveRotateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    freeMoveStartRotation = parseRotation(selectedElement);
    freeMoveStartX = e.clientX;
    freeMoveStartY = e.clientY;
    document.addEventListener("mousemove", handleRotateMove, true);
    document.addEventListener("mouseup", handleRotateEnd, true);
  }

  function handleRotateMove(e) {
    if (!freeMoveIsRotating || !selectedElement) return;
    e.preventDefault();
    var startAngle = Math.atan2(freeMoveStartY - freeMoveRotateCenter.y, freeMoveStartX - freeMoveRotateCenter.x);
    var currentAngle = Math.atan2(e.clientY - freeMoveRotateCenter.y, e.clientX - freeMoveRotateCenter.x);
    var delta = (currentAngle - startAngle) * (180 / Math.PI);
    var newRotation = freeMoveStartRotation + delta;
    // Snap to 0, 45, 90, etc. if within 3 degrees
    var snapped = Math.round(newRotation / 45) * 45;
    if (Math.abs(newRotation - snapped) < 3) newRotation = snapped;
    newRotation = Math.round(newRotation * 10) / 10;
    selectedElement.style.transform = newRotation === 0 ? "" : "rotate(" + newRotation + "deg)";
    positionOverlay(selectionOverlay, selectedElement);
    positionFreeMoveHandles();
  }

  function handleRotateEnd(e) {
    if (!freeMoveIsRotating) return;
    freeMoveIsRotating = false;
    document.removeEventListener("mousemove", handleRotateMove, true);
    document.removeEventListener("mouseup", handleRotateEnd, true);
    notifyFreeMoveStyleChange();
  }

  function notifyFreeMoveStyleChange() {
    if (!selectedElement) return;
    trackElementChange(selectedElement, "style");
    // Track each changed property
    var props = ["position", "top", "left", "right", "bottom", "width", "height", "transform"];
    for (var i = 0; i < props.length; i++) {
      var val = selectedElement.style.getPropertyValue(props[i]);
      trackStyleMutation(selectedElement, props[i], val);
    }
    var styles = extractStyles(selectedElement, selectedClassName, getSelectedSelector());
    window.parent.postMessage({ type: "STYLE_CHANGED", path: selectedElement.getAttribute("data-gl-path"), data: styles }, EDITOR_ORIGIN);
    window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
    positionOverlay(selectionOverlay, selectedElement);
    positionDragHandle(selectedElement);
    positionFreeMoveHandles();
  }

  function dedupeStyleTagsInFragment(container) {
    var seenStyleIds = {};
    var existingStyleTags = document.querySelectorAll("style[id]");
    for (var i = 0; i < existingStyleTags.length; i++) {
      seenStyleIds[existingStyleTags[i].id] = existingStyleTags[i];
    }

    var fragmentStyleTags = container.querySelectorAll("style[id]");
    for (var j = 0; j < fragmentStyleTags.length; j++) {
      var styleTag = fragmentStyleTags[j];
      if (seenStyleIds[styleTag.id]) {
        // Overwrite design-system styles with new content instead of dropping
        if (styleTag.id.indexOf("gl-design-system") === 0) {
          seenStyleIds[styleTag.id].textContent = styleTag.textContent;
          cssChanged = true;
        }
        styleTag.parentNode.removeChild(styleTag);
      } else {
        seenStyleIds[styleTag.id] = styleTag;
      }
    }
  }

  function sanitizeFragmentHtml(html) {
    if (!html) return "";

    var temp = document.createElement("div");
    temp.innerHTML = html;
    temp.querySelectorAll("meta").forEach(function (meta) { meta.remove(); });

    if (temp.childNodes.length === 1) {
      var onlyChild = temp.firstChild;
      if (onlyChild && onlyChild.nodeType === 1 && /^(html|body)$/i.test(onlyChild.nodeName)) {
        temp.innerHTML = onlyChild.innerHTML;
        temp.querySelectorAll("meta").forEach(function (meta) { meta.remove(); });
      }
    }

    return temp.innerHTML;
  }

  // ─── Start / stop editing ─────────────────────────
  function startEditing(el) {
    if (editingElement) finishEditing();
    pushUndoSnapshot();
    editingElement = el;
    el.setAttribute("contenteditable", "true");
    el.style.outline = "2px solid #f59e0b";
    el.style.outlineOffset = "2px";
    selectionOverlay.style.display = "none";
    hoverOverlay.style.display = "none";
    hideDragHandle();
    el.focus();
    // Place cursor at end
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      // ignore
    }
  }

  function finishEditing() {
    if (!editingElement) return;
    var el = editingElement;
    editingElement = null;
    trackElementChange(el, "text");
    el.removeAttribute("contenteditable");
    el.style.outline = "";
    el.style.outlineOffset = "";
    selectedElement = el;
    positionOverlay(selectionOverlay, el);
    assignPaths();
    window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
  }

  // ─── Select element ───────────────────────────────
  function selectElement(el) {
    if (freeMoveActive && selectedElement !== el) deactivateFreeMove();
    selectedElement = el;
    if (!selectedClassName || !el.classList.contains(selectedClassName)) {
      selectedClassName = pickDefaultClassForElement(el);
      selectedSubSelector = null;
    }
    positionOverlay(selectionOverlay, el);
    positionDragHandle(el);
    hoverOverlay.style.display = "none";
    var styles = extractStyles(el, selectedClassName, getSelectedSelector());
    window.parent.postMessage(
      { type: "ELEMENT_SELECTED", data: styles },
      EDITOR_ORIGIN
    );
  }

  function deselectElement() {
    if (freeMoveActive) deactivateFreeMove();
    selectedElement = null;
    selectedClassName = null;
    selectedSubSelector = null;
    selectionOverlay.style.display = "none";
    hideDragHandle();
    window.parent.postMessage({ type: "ELEMENT_DESELECTED" }, EDITOR_ORIGIN);
  }

  // ─── Event Listeners ──────────────────────────────
  function setupEventListeners() {
    // Hover
    document.addEventListener("mouseover", function (e) {
      if (isMarkdownMode) return;
      if (editingElement) return;
      if (freeMoveIsMoving || freeMoveIsResizing || freeMoveIsRotating) return;
      var el = e.target.closest("[data-gl-path]");
      if (!el || el.hasAttribute("data-gl-overlay")) {
        hoverOverlay.style.display = "none";
        return;
      }
      if (el === selectedElement) {
        hoverOverlay.style.display = "none";
        return;
      }
      positionOverlay(hoverOverlay, el);
    });

    document.addEventListener("mouseout", function (e) {
      if (
        !e.relatedTarget ||
        !e.relatedTarget.closest ||
        !e.relatedTarget.closest("[data-gl-path]")
      ) {
        hoverOverlay.style.display = "none";
      }
    });

    // ── Click handling: select on single click, edit on double click ──
    // We implement our own double-click detection to avoid issues with
    // preventDefault blocking the native dblclick event.
    document.addEventListener(
      "click",
      function (e) {
        // In markdown mode, let clicks work normally for text cursor placement
        if (isMarkdownMode) {
          // Only prevent default on links to stop navigation
          if (e.target.closest("a")) {
            e.preventDefault();
          }
          return;
        }

        // If currently editing, and click is inside the editing element, let it through
        if (editingElement) {
          if (editingElement.contains(e.target)) {
            return; // Allow normal cursor placement inside contenteditable
          }
          // Click outside editing element — finish editing
          finishEditing();
          e.preventDefault();
          return;
        }

        // Suppress selection while a free-move interaction is in progress
        if (freeMoveIsMoving || freeMoveIsResizing || freeMoveIsRotating) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Clicks on the toolbar buttons (drag handle, free-move, back) — let them bubble
        if (e.target.closest && e.target.closest("[data-gl-overlay='draghandle']")) {
          return;
        }

        // Always prevent default to stop link navigation, form submissions, etc.
        e.preventDefault();
        e.stopPropagation();

        var el = e.target.closest("[data-gl-path]");
        if (!el || el.hasAttribute("data-gl-overlay")) {
          deselectElement();
          lastClickEl = null;
          return;
        }

        // In free-move mode, clicking the selected element is handled by mousedown for drag
        if (freeMoveActive && el === selectedElement) {
          return;
        }

        var now = Date.now();
        var isDoubleClick = lastClickEl === el && now - lastClickTime < 400;
        lastClickTime = now;
        lastClickEl = el;

        if (isDoubleClick) {
          // Double click — start editing
          startEditing(el);
        } else {
          // Single click — select
          selectElement(el);
        }
      },
      true
    );

    // Keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      // In markdown mode, let all typing work normally
      if (isMarkdownMode) {
        var mod = e.metaKey || e.ctrlKey;
        // Undo / Redo
        if (mod && e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if (mod && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
          e.preventDefault();
          redo();
          return;
        }
        // Clipboard & selection — execute and stop propagation so VSCode doesn't intercept
        if (mod && (e.key === "c" || e.key === "C") && !e.shiftKey) {
          // Copy — use execCommand to ensure it works in webview context
          document.execCommand("copy");
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (mod && (e.key === "x" || e.key === "X") && !e.shiftKey) {
          document.execCommand("cut");
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
          return;
        }
        if (mod && (e.key === "v" || e.key === "V") && !e.shiftKey) {
          // Paste — let the browser handle it, but stop propagation
          // For webview, we need to use the clipboard API
          e.preventDefault();
          e.stopPropagation();
          if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function (text) {
              document.execCommand("insertText", false, text);
              window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
            }).catch(function () {
              // Fallback: try execCommand paste
              document.execCommand("paste");
              window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
            });
          } else {
            document.execCommand("paste");
            window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
          }
          return;
        }
        if (mod && (e.key === "a" || e.key === "A") && !e.shiftKey) {
          // Select all — select body content only
          e.preventDefault();
          e.stopPropagation();
          var selectRange = document.createRange();
          selectRange.selectNodeContents(document.body);
          var selectSel = window.getSelection();
          selectSel.removeAllRanges();
          selectSel.addRange(selectRange);
          return;
        }
        // Bold / Italic / Underline shortcuts
        if (mod && (e.key === "b" || e.key === "B") && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          pushUndoSnapshot();
          document.execCommand("bold", false, null);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
          return;
        }
        if (mod && (e.key === "i" || e.key === "I") && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          pushUndoSnapshot();
          document.execCommand("italic", false, null);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
          return;
        }
        return;
      }

      if (e.key === "Escape") {
        if (editingElement) {
          finishEditing();
        } else if (selectedElement) {
          deselectElement();
        }
      }

      // Delete selected element with Delete or Backspace key
      if ((e.key === "Delete" || e.key === "Backspace") && selectedElement && !editingElement) {
        e.preventDefault();
        var delPath = selectedElement.getAttribute("data-gl-path");
        if (delPath) {
          pushUndoSnapshot();
          var delAnimNames = getAnimationNamesForElement(selectedElement);
          structuralChanges.push({ type: "delete", path: delPath });
          selectedElement.parentNode.removeChild(selectedElement);
          removeUnusedKeyframes(delAnimNames);
          deselectElement();
          assignPaths();
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "Z" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    });

    // Update selection overlay on scroll/resize
    var updateSelectionOverlay = function () {
      if (selectedElement && document.contains(selectedElement)) {
        positionOverlay(selectionOverlay, selectedElement);
        positionDragHandle(selectedElement);
        if (freeMoveActive) positionFreeMoveHandles();
      }
    };
    window.addEventListener("scroll", updateSelectionOverlay, true);
    window.addEventListener("resize", updateSelectionOverlay);

    // Finish text editing when the iframe loses focus (e.g. user clicks the properties panel)
    window.addEventListener("blur", function () {
      if (isMarkdownMode) return; // Don't finish editing on blur in markdown mode
      if (editingElement) {
        finishEditing();
      }
    });
  }

  // ─── Drag state (controlled by parent via postMessage) ──
  var currentDropTarget = null;

  // ─── Message Handler ──────────────────────────────
  window.addEventListener("message", function (event) {
    // Origin check removed for VS Code webview (srcdoc iframes have null origin)
    var msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "SELECT_ELEMENT": {
        if (editingElement) finishEditing();
        var el = getElementByPath(msg.path);
        if (!el) break;
        selectElement(el);
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      }

      case "HIGHLIGHT_ELEMENT": {
        if (msg.path) {
          var hlEl = getElementByPath(msg.path);
          if (hlEl && hlEl !== selectedElement) {
            positionOverlay(hoverOverlay, hlEl);
          }
        } else {
          hoverOverlay.style.display = "none";
        }
        break;
      }

      case "CONFIG": {
        if (msg.styleMode) styleMode = msg.styleMode;
        if (msg.deviceWidth !== undefined) deviceWidth = msg.deviceWidth;
        if (msg.markdownMode && !isMarkdownMode) {
          isMarkdownMode = true;
          // Make body contenteditable for text editing
          document.body.setAttribute("contenteditable", "true");
          document.body.style.cursor = "text";
          // Hide all overlays
          selectionOverlay.style.display = "none";
          hoverOverlay.style.display = "none";
          hideDragHandle();

          // Save selection on every change so toolbar buttons can restore it
          document.addEventListener("selectionchange", function () {
            if (!isMarkdownMode) return;
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              var range = sel.getRangeAt(0);
              savedMdSelection = {
                startContainer: range.startContainer,
                startOffset: range.startOffset,
                endContainer: range.endContainer,
                endOffset: range.endOffset,
              };
            }
          });

          // Watch for content changes via input event on body
          var mdSaveTimer = null;
          document.body.addEventListener("input", function () {
            if (mdSaveTimer) clearTimeout(mdSaveTimer);
            mdSaveTimer = setTimeout(function () {
              window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
            }, 300);
          });

          // Paste: if clipboard has image, upload it and insert at cursor
          document.addEventListener("paste", function (e) {
            if (!isMarkdownMode) return;
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (var i = 0; i < items.length; i++) {
              if (items[i].type.indexOf("image/") === 0) {
                e.preventDefault();
                e.stopPropagation();
                var file = items[i].getAsFile();
                if (!file) return;
                var mimeType = file.type || "image/png";
                var reader = new FileReader();
                reader.onload = function () {
                  var dataUrl = reader.result;
                  if (typeof dataUrl !== "string" || dataUrl.indexOf("base64,") === -1) return;
                  var base64 = dataUrl.substring(dataUrl.indexOf("base64,") + 7);
                  window.parent.postMessage({
                    type: "PASTE_IMAGE",
                    dataBase64: base64,
                    mimeType: mimeType,
                  }, EDITOR_ORIGIN);
                };
                reader.readAsDataURL(file);
                return;
              }
            }
          });

          // Ensure existing images and links have ids for "change image/link" flow
          function ensureMarkdownElementIds() {
            document.querySelectorAll("body img:not([data-gl-img-id])").forEach(function (el) {
              el.setAttribute("data-gl-img-id", "gl-img-" + (++glMdIdCounter));
            });
            document.querySelectorAll("body a:not([data-gl-link-id])").forEach(function (el) {
              el.setAttribute("data-gl-link-id", "gl-link-" + (++glMdIdCounter));
            });
          }
          ensureMarkdownElementIds();

          // Click on image or link in markdown: show options (capture phase so we run first)
          document.addEventListener("click", function (e) {
            if (!isMarkdownMode) return;
            var img = e.target.closest && e.target.closest("img");
            if (img) {
              e.preventDefault();
              e.stopPropagation();
              if (!img.getAttribute("data-gl-img-id")) img.setAttribute("data-gl-img-id", "gl-img-" + (++glMdIdCounter));
              window.parent.postMessage({
                type: "IMAGE_CLICKED",
                imgId: img.getAttribute("data-gl-img-id"),
                currentSrc: img.getAttribute("src") || img.getAttribute("data-gl-src") || "",
              }, EDITOR_ORIGIN);
              return;
            }
            var a = e.target.closest && e.target.closest("a");
            if (a) {
              e.preventDefault();
              e.stopPropagation();
              if (!a.getAttribute("data-gl-link-id")) a.setAttribute("data-gl-link-id", "gl-link-" + (++glMdIdCounter));
              window.parent.postMessage({
                type: "LINK_CLICKED",
                linkId: a.getAttribute("data-gl-link-id"),
                currentHref: a.getAttribute("href") || "#",
                linkText: a.textContent || "",
              }, EDITOR_ORIGIN);
              return;
            }
          }, true);
        }
        break;
      }

      case "UPDATE_STYLE": {
        var el2 = getElementByPath(msg.path);
        if (!el2) break;
        // Parse !important from value so setProperty gets it as priority arg
        var importantFlag = "";
        if (msg.value && /\s*!important\s*$/.test(msg.value)) {
          msg.value = msg.value.replace(/\s*!important\s*$/, "").trim();
          importantFlag = "important";
        }
        var useInlineOnly = !!msg.forceInline;
        var preserveSelectionContext = !!selectedElement && selectedElement !== el2;
        var targetClassName = selectedClassName;
        var targetSelector = getSelectedSelector();

        if (!useInlineOnly && preserveSelectionContext) {
          if (msg.className !== undefined) {
            targetClassName = msg.className;
          } else if (!targetClassName || !el2.classList.contains(targetClassName)) {
            targetClassName = pickDefaultClassForElement(el2);
          }

          if (msg.selector !== undefined && msg.selector !== null && targetClassName) {
            var descendantBaseSelector = "." + targetClassName;
            var descendantSubSelector = msg.selector.indexOf(descendantBaseSelector) === 0
              ? msg.selector.substring(descendantBaseSelector.length)
              : null;
            targetSelector = descendantBaseSelector + (descendantSubSelector || "");
          } else {
            targetSelector = targetClassName ? ("." + targetClassName) : null;
          }
        } else if (!useInlineOnly && msg.className !== undefined) {
          selectedClassName = msg.className;
          if (!selectedClassName) selectedSubSelector = null;
          targetClassName = selectedClassName;
          targetSelector = getSelectedSelector();
        }
        if (!useInlineOnly && !preserveSelectionContext && msg.selector !== undefined && msg.selector !== null && selectedClassName) {
          var baseSelector = "." + selectedClassName;
          selectedSubSelector = msg.selector.indexOf(baseSelector) === 0 ? msg.selector.substring(baseSelector.length) : null;
          targetClassName = selectedClassName;
          targetSelector = getSelectedSelector();
        } else if (!useInlineOnly && !preserveSelectionContext && (!selectedClassName || !el2.classList.contains(selectedClassName))) {
          selectedClassName = pickDefaultClassForElement(el2);
          selectedSubSelector = null;
          targetClassName = selectedClassName;
          targetSelector = getSelectedSelector();
        }
        pushUndoSnapshot();
        trackElementChange(el2, "class");
        trackStyleMutation(el2, msg.property, getPersistedStyleValue(msg));
        var beforeAnimationNames = getAnimationNamesForElement(el2);
        if (useInlineOnly) {
          if (msg.value) setPropertyWithPriority(el2.style, msg.property, msg.value, importantFlag);
          else el2.style.removeProperty(msg.property);
        } else if (deviceWidth !== null) {
          // Tablet/Mobile: always use stylesheet with media query
          applyResponsiveStyle(el2, msg.property, msg.value, deviceWidth, targetClassName, targetSelector, importantFlag);
        } else if (styleMode === "class") {
          applyStyleToClass(el2, msg.property, msg.value, targetClassName, targetSelector, importantFlag);
        } else {
          if (msg.value) setPropertyWithPriority(el2.style, msg.property, msg.value, importantFlag);
          else el2.style.removeProperty(msg.property);
        }
        var afterAnimationNames = getAnimationNamesForElement(el2);
        removeUnusedKeyframes(listRemovedAnimationNames(beforeAnimationNames, afterAnimationNames));
        if (!useInlineOnly && !preserveSelectionContext && selectedClassName && !el2.classList.contains(selectedClassName)) {
          selectedClassName = pickDefaultClassForElement(el2);
          selectedSubSelector = null;
        }
        var stylePayloadEl = selectedElement && selectedElement !== el2 ? selectedElement : el2;
        var updatedStyles = extractStyles(stylePayloadEl, selectedClassName, getSelectedSelector());
        window.parent.postMessage(
          {
            type: "STYLE_CHANGED",
            path: stylePayloadEl.getAttribute("data-gl-path") || msg.path,
            data: updatedStyles
          },
          EDITOR_ORIGIN
        );
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        if (selectedElement === el2) {
          positionOverlay(selectionOverlay, el2);
        }
        break;
      }

      case "INJECT_KEYFRAMES": {
        pushUndoSnapshot();
        cssChanged = true;
        var kfStyleTag = getOrCreateStyleTag();
        var kfName = msg.name;
        var kfCss = msg.css;
        // Remove existing @keyframes with the same name
        try {
          var kfSheet = kfStyleTag.sheet;
          for (var ki = kfSheet.cssRules.length - 1; ki >= 0; ki--) {
            var kfRule = kfSheet.cssRules[ki];
            if (kfRule instanceof CSSKeyframesRule && kfRule.name === kfName) {
              kfSheet.deleteRule(ki);
            }
          }
          kfSheet.insertRule("@keyframes " + kfName + " { " + kfCss + " }", kfSheet.cssRules.length);
        } catch (e) {
          // Fallback: append as text
          kfStyleTag.textContent += "\n@keyframes " + kfName + " { " + kfCss + " }";
        }
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "INJECT_LAYOUT_CSS": {
        var layoutEl = getElementByPath(msg.path);
        if (!layoutEl) break;
        pushUndoSnapshot();
        cssChanged = true;
        trackElementChange(layoutEl, "class");
        var layoutStyleId = "gl-layout-" + msg.path.replace(/\./g, "-");
        var layoutStyleTag = document.getElementById(layoutStyleId);

        if (!msg.css) {
          // Clear: remove the style tag entirely
          if (layoutStyleTag) {
            layoutStyleTag.parentNode.removeChild(layoutStyleTag);
          }
        } else {
          // Ensure the element has a gl- class for selectors
          var layoutSelector = findGlSelector(layoutEl);
          if (!layoutSelector) {
            var layoutClass = generateUniqueGlClassName();
            layoutEl.classList.add(layoutClass);
            layoutSelector = "." + layoutClass;
          }
          // Find or create the layout style tag
          if (!layoutStyleTag) {
            layoutStyleTag = document.createElement("style");
            layoutStyleTag.id = layoutStyleId;
            document.head.appendChild(layoutStyleTag);
          }
          // Replace the CSS, substituting {SELECTOR} with the actual selector
          layoutStyleTag.textContent = msg.css.replace(/\{SELECTOR\}/g, layoutSelector);
        }
        // Re-extract styles for the selected element
        if (selectedElement === layoutEl) {
          var layoutUpdatedStyles = extractStyles(layoutEl, selectedClassName, getSelectedSelector());
          window.parent.postMessage(
            { type: "STYLE_CHANGED", path: msg.path, data: layoutUpdatedStyles },
            EDITOR_ORIGIN
          );
        }
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "UPDATE_ATTRIBUTE": {
        var attrEl = getElementByPath(msg.path);
        if (!attrEl) break;
        pushUndoSnapshot();
        trackAttrChange(attrEl, msg.name);
        if (msg.displayValue !== undefined && msg.displayValue !== msg.value) {
          // Store the real save value separately, use displayValue for DOM rendering.
          attrEl.setAttribute("data-gl-save-" + msg.name, msg.value);
          attrEl.setAttribute(msg.name, msg.displayValue);
        } else {
          // If overwriting a load-time transformed attribute, clear the original-src marker
          // so extractStyles reports the new value, not the stale original.
          if (msg.name === "src") attrEl.removeAttribute("data-gl-original-src");
          attrEl.setAttribute(msg.name, msg.value);
        }
        var attrUpdatedStyles = extractStyles(attrEl, selectedClassName, getSelectedSelector());
        window.parent.postMessage(
          { type: "STYLE_CHANGED", path: msg.path, data: attrUpdatedStyles },
          EDITOR_ORIGIN
        );
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "REMOVE_ATTRIBUTE": {
        var rmAttrEl = getElementByPath(msg.path);
        if (!rmAttrEl) break;
        pushUndoSnapshot();
        trackAttrChange(rmAttrEl, msg.name);
        rmAttrEl.removeAttribute(msg.name);
        var rmAttrUpdatedStyles = extractStyles(rmAttrEl, selectedClassName, getSelectedSelector());
        window.parent.postMessage(
          { type: "STYLE_CHANGED", path: msg.path, data: rmAttrUpdatedStyles },
          EDITOR_ORIGIN
        );
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "UPDATE_CLASS_STYLE": {
        pushUndoSnapshot();
        cssChanged = true;
        var found = false;
        for (var s = 0; s < document.styleSheets.length; s++) {
          var sheet = document.styleSheets[s];
          try {
            var rules = sheet.cssRules;
            for (var r = 0; r < rules.length; r++) {
              if (
                rules[r] instanceof CSSStyleRule &&
                rules[r].selectorText === msg.selector
              ) {
                rules[r].style.setProperty(msg.property, msg.value);
                found = true;
                break;
              }
            }
          } catch (e) {
            continue;
          }
          if (found) break;
        }
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "DELETE_ELEMENT": {
        var el3 = getElementByPath(msg.path);
        if (!el3) break;
        pushUndoSnapshot();
        structuralChanges.push({ type: "delete", path: msg.path });
        var deletedAnimationNames = getAnimationNamesForElement(el3);
        el3.parentNode.removeChild(el3);
        removeUnusedKeyframes(deletedAnimationNames);
        deselectElement();
        assignPaths();
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "CHANGE_TAG": {
        var elTag = getElementByPath(msg.path);
        if (!elTag) break;
        var newTag = msg.newTag.toLowerCase();
        // Validate: only allow standard HTML tag names
        var testEl = document.createElement(newTag);
        if (testEl instanceof HTMLUnknownElement && newTag !== "unknown") break;
        pushUndoSnapshot();
        trackTagChange(elTag, newTag);
        var newEl = document.createElement(newTag);
        // Copy all attributes
        for (var ai = 0; ai < elTag.attributes.length; ai++) {
          var attr = elTag.attributes[ai];
          if (attr.name !== "data-gl-path") {
            newEl.setAttribute(attr.name, attr.value);
          }
        }
        // Move all children
        while (elTag.firstChild) {
          newEl.appendChild(elTag.firstChild);
        }
        elTag.parentNode.replaceChild(newEl, elTag);
        assignPaths();
        selectElement(newEl);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "INSERT_BLOCK": {
        var parent = msg.parentPath
          ? getElementByPath(msg.parentPath)
          : document.body;
        if (!parent) break;
        var cleanedInsertHtml = sanitizeFragmentHtml(msg.html);
        if (!cleanedInsertHtml.trim()) break;
        pushUndoSnapshot();
        structuralChanges.push({
          type: "insert",
          parentPath: msg.parentPath || "",
          position: msg.position,
          html: cleanedInsertHtml
        });
        var temp = document.createElement("div");
        temp.innerHTML = cleanedInsertHtml;
        dedupeStyleTagsInFragment(temp);
        var children = Array.from(parent.children).filter(isEditableElement);
        var pos = Math.min(msg.position, children.length);
        if (pos >= children.length) {
          while (temp.firstChild) {
            parent.appendChild(temp.firstChild);
          }
        } else {
          while (temp.firstChild) {
            parent.insertBefore(temp.firstChild, children[pos]);
          }
        }
        assignPaths();
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "IMPORT_TEMPLATE": {
        if (!msg.html || !msg.templateId) break;
        pushUndoSnapshot();

        var tplId = msg.templateId;
        var tplStyleId = tplId + "-styles";
        var tplScriptId = tplId + "-script";

        // Parse the incoming HTML in a temporary container
        var tplTemp = document.createElement("div");
        tplTemp.innerHTML = msg.html;
        tplTemp.querySelectorAll("meta").forEach(function(m) { m.remove(); });

        // Extract <link> tags with gl-design-system-font-* IDs — move to <head>,
        // replacing existing ones with the same ID. Remove from body HTML.
        var tplLinks = tplTemp.querySelectorAll("link");
        for (var lki = tplLinks.length - 1; lki >= 0; lki--) {
          var link = tplLinks[lki];
          var linkId = link.id || "";
          if (linkId.indexOf("gl-design-system-font") === 0) {
            var existingLink = document.getElementById(linkId);
            if (existingLink) {
              existingLink.parentNode.removeChild(existingLink);
            }
            // Insert in <head> before first <style>
            var firstStyle = document.head.querySelector("style");
            if (firstStyle) {
              document.head.insertBefore(link.cloneNode(true), firstStyle);
            } else {
              document.head.appendChild(link.cloneNode(true));
            }
            link.parentNode.removeChild(link);
          }
        }
        cssChanged = true;

        // Extract <style> tags — design-system styles overwrite existing,
        // remaining styles combine into a template-specific style block.
        var tplStyles = tplTemp.querySelectorAll("style");
        var combinedCss = "";
        for (var si = 0; si < tplStyles.length; si++) {
          var incomingStyle = tplStyles[si];
          var incomingId = incomingStyle.id || "";
          if (incomingId.indexOf("gl-design-system") === 0) {
            // Overwrite existing design-system style or create new one
            var existingDs = document.getElementById(incomingId);
            if (existingDs) {
              existingDs.textContent = incomingStyle.textContent;
            } else {
              var dsEl = document.createElement("style");
              dsEl.id = incomingId;
              dsEl.textContent = incomingStyle.textContent;
              // Insert before first style in head for proper cascade
              var firstHeadStyle = document.head.querySelector("style");
              if (firstHeadStyle) {
                document.head.insertBefore(dsEl, firstHeadStyle);
              } else {
                (document.head || document.documentElement).appendChild(dsEl);
              }
            }
          } else {
            combinedCss += incomingStyle.textContent + "\n";
          }
          incomingStyle.parentNode.removeChild(incomingStyle);
        }
        if (combinedCss) {
          var existingStyle = document.getElementById(tplStyleId);
          if (existingStyle) {
            existingStyle.textContent = combinedCss;
          } else {
            var styleEl = document.createElement("style");
            styleEl.id = tplStyleId;
            styleEl.textContent = combinedCss;
            (document.head || document.documentElement).appendChild(styleEl);
          }
        }
        cssChanged = true;

        // Extract <script> tags — glmw-script-* scripts replace existing by ID,
        // remaining scripts combine into a template-specific script block.
        var tplScripts = tplTemp.querySelectorAll("script");
        var combinedJs = "";
        for (var sci = 0; sci < tplScripts.length; sci++) {
          var incomingScript = tplScripts[sci];
          var scriptId = incomingScript.id || "";
          if (scriptId.indexOf("glmw-script-") === 0) {
            // Replace existing glmw-script-* or create new one
            var existingSc = document.getElementById(scriptId);
            if (existingSc) {
              existingSc.parentNode.removeChild(existingSc);
            }
            var scEl = document.createElement("script");
            scEl.id = scriptId;
            scEl.textContent = incomingScript.textContent;
            document.body.appendChild(scEl);
          } else {
            combinedJs += incomingScript.textContent + "\n";
          }
          incomingScript.parentNode.removeChild(incomingScript);
        }
        if (combinedJs) {
          var existingScript = document.getElementById(tplScriptId);
          if (existingScript) {
            existingScript.parentNode.removeChild(existingScript);
          }
          var scriptEl = document.createElement("script");
          scriptEl.id = tplScriptId;
          scriptEl.textContent = combinedJs;
          document.body.appendChild(scriptEl);
        }

        // Get the cleaned body HTML (no styles/scripts)
        var bodyOnlyHtml = tplTemp.innerHTML;

        // Insert remaining body content at end of body
        var firstInserted = null;
        var tplBodyChildren = Array.from(tplTemp.childNodes);
        for (var bi = 0; bi < tplBodyChildren.length; bi++) {
          var inserted = document.body.appendChild(tplBodyChildren[bi]);
          if (!firstInserted && inserted.nodeType === 1) firstInserted = inserted;
        }

        // Track as insertion with body-only HTML (styles/scripts handled by patch system)
        if (bodyOnlyHtml.trim()) {
          structuralChanges.push({
            type: "insert",
            parentPath: "",
            position: 9999,
            html: bodyOnlyHtml
          });
        }

        // Mark css as changed so getPatches picks up the new style/script blocks
        cssChanged = true;

        assignPaths();

        // Scroll to the imported element
        if (firstInserted && firstInserted.scrollIntoView) {
          firstInserted.scrollIntoView({ behavior: "smooth", block: "center" });
          // Also select it
          selectElement(firstInserted);
        }

        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "MOVE_ELEMENT": {
        var source = getElementByPath(msg.sourcePath);
        var target2 = getElementByPath(msg.targetPath);
        if (!source || !target2) break;
        pushUndoSnapshot();
        var moveParentPath2 = target2.parentNode.getAttribute ? (target2.parentNode.getAttribute("data-gl-path") || "") : "";
        var moveSiblings2 = Array.from(target2.parentNode.children).filter(isEditableElement);
        var sourceIdx2 = moveSiblings2.indexOf(source);
        var targetIdx2 = moveSiblings2.indexOf(target2);
        var insertPos2 = msg.position === 0 ? targetIdx2 : targetIdx2 + 1;
        if (source.parentNode === target2.parentNode && sourceIdx2 !== -1 && targetIdx2 !== -1 && sourceIdx2 < targetIdx2) {
          insertPos2 = Math.max(0, insertPos2 - 1);
        }
        structuralChanges.push({
          type: "move",
          sourcePath: msg.sourcePath,
          parentPath: moveParentPath2,
          position: insertPos2
        });
        if (msg.position === 0) {
          target2.parentNode.insertBefore(source, target2);
        } else {
          target2.parentNode.insertBefore(source, target2.nextSibling);
        }
        assignPaths();
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "GET_DOM_TREE": {
        var tree = buildDomTree();
        window.parent.postMessage(
          { type: "DOM_TREE", tree: tree },
          EDITOR_ORIGIN
        );
        break;
      }

      case "GET_CSS_VARIABLES": {
        var cssVars = extractCssVariables();
        window.parent.postMessage(
          { type: "CSS_VARIABLES", variables: cssVars },
          EDITOR_ORIGIN
        );
        break;
      }

      case "GET_CSS_CLASSES": {
        var cssClasses = extractAllCssClasses();
        window.parent.postMessage(
          { type: "CSS_CLASSES", classes: cssClasses },
          EDITOR_ORIGIN
        );
        break;
      }

      case "GET_USED_FONTS": {
        var usedFonts = extractUsedFonts();
        window.parent.postMessage(
          { type: "USED_FONTS", fonts: usedFonts },
          EDITOR_ORIGIN
        );
        break;
      }

      case "ADD_CLASS": {
        var el6 = getElementByPath(msg.path);
        if (el6 && msg.className) {
          pushUndoSnapshot();
          trackElementChange(el6, "class");
          el6.classList.add(msg.className);
          selectedClassName = msg.className;
          selectElement(el6);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "REMOVE_CLASS": {
        var el7 = getElementByPath(msg.path);
        if (el7 && msg.className) {
          pushUndoSnapshot();
          trackElementChange(el7, "class");
          el7.classList.remove(msg.className);
          if (selectedClassName === msg.className) {
            selectedClassName = pickDefaultClassForElement(el7);
            selectedSubSelector = null;
          }
          selectElement(el7);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "REMOVE_CLASS_WITH_STYLES": {
        var el7s = getElementByPath(msg.path);
        if (el7s && msg.className) {
          pushUndoSnapshot();
          trackElementChange(el7s, "class");
          el7s.classList.remove(msg.className);
          removeClassStyles(msg.className);
          if (selectedClassName === msg.className) {
            selectedClassName = pickDefaultClassForElement(el7s);
            selectedSubSelector = null;
          }
          selectElement(el7s);
          window.parent.postMessage({ type: "CSS_CLASSES", classes: extractAllCssClasses() }, EDITOR_ORIGIN);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "RENAME_CLASS": {
        var el8 = getElementByPath(msg.path);
        if (!el8 || !msg.oldClassName || !msg.newClassName) break;
        if (msg.oldClassName === msg.newClassName) break;
        pushUndoSnapshot();
        trackElementChange(el8, "class");
        cssChanged = true;
        classRenames.push({ oldName: msg.oldClassName, newName: msg.newClassName });

        // Rename class on the element
        el8.classList.remove(msg.oldClassName);
        el8.classList.add(msg.newClassName);
        if (selectedClassName === msg.oldClassName) {
          selectedClassName = msg.newClassName;
        }

        // Also rename all other elements with the old class
        var allWithOld = document.querySelectorAll("." + msg.oldClassName);
        for (var rc = 0; rc < allWithOld.length; rc++) {
          allWithOld[rc].classList.remove(msg.oldClassName);
          allWithOld[rc].classList.add(msg.newClassName);
        }

        // Rename the selector in stylesheets
        var oldSel = "." + msg.oldClassName;
        var newSel = "." + msg.newClassName;
        for (var rs = 0; rs < document.styleSheets.length; rs++) {
          var rSheet = document.styleSheets[rs];
          try {
            var rRules = rSheet.cssRules;
            var rSheetModified = false;
            for (var rr = 0; rr < rRules.length; rr++) {
              if (rRules[rr] instanceof CSSStyleRule) {
                var rSelText = rRules[rr].selectorText;
                if (rSelText.indexOf(oldSel) !== -1) {
                  rRules[rr].selectorText = rSelText.split(oldSel).join(newSel);
                  rSheetModified = true;
                }
              } else if (rRules[rr] instanceof CSSMediaRule) {
                for (var rm = 0; rm < rRules[rr].cssRules.length; rm++) {
                  var mRule = rRules[rr].cssRules[rm];
                  if (mRule instanceof CSSStyleRule && mRule.selectorText.indexOf(oldSel) !== -1) {
                    mRule.selectorText = mRule.selectorText.split(oldSel).join(newSel);
                    rSheetModified = true;
                  }
                }
              }
            }
          } catch (e) { continue; }
        }

        selectElement(el8);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "SET_ACTIVE_CLASS": {
        var classEl = getElementByPath(msg.path);
        if (!classEl) break;
        if (msg.className && !classEl.classList.contains(msg.className)) break;
        selectedClassName = msg.className || null;
        selectedSubSelector = selectedClassName ? (msg.subSelector || null) : null;
        var classUpdatedStyles = extractStyles(classEl, selectedClassName, getSelectedSelector());
        window.parent.postMessage(
          { type: "STYLE_CHANGED", path: msg.path, data: classUpdatedStyles },
          EDITOR_ORIGIN
        );
        break;
      }

      case "CONVERT_TAILWIND_CSS": {
        pushUndoSnapshot();
        cssChanged = true;

        // 1. Collect all CSS text from Tailwind-generated stylesheets
        var twCssChunks = [];
        var twStyleElements = [];
        try {
          for (var si = 0; si < document.styleSheets.length; si++) {
            var sheet = document.styleSheets[si];
            var owner = sheet.ownerNode;
            // Only look at inline <style> elements (not <link> stylesheets)
            if (!owner || owner.tagName !== "STYLE") continue;
            // Skip GreenLight-managed style tags
            if (owner.id && owner.id.indexOf("gl-") === 0) continue;
            // Skip user-authored style tags (those that existed in original HTML with content)
            if (owner.hasAttribute("data-gl-user-style")) continue;

            // Check if this stylesheet contains Tailwind markers (--tw- variables)
            var isTailwindSheet = false;
            try {
              var rules = sheet.cssRules || sheet.rules;
              if (rules) {
                for (var ri = 0; ri < rules.length && !isTailwindSheet; ri++) {
                  var ruleText = rules[ri].cssText || "";
                  if (ruleText.indexOf("--tw-") >= 0) {
                    isTailwindSheet = true;
                  }
                }
              }
            } catch (e) {}

            if (isTailwindSheet) {
              twStyleElements.push(owner);
              try {
                var twRules = sheet.cssRules || sheet.rules;
                for (var tri = 0; tri < twRules.length; tri++) {
                  twCssChunks.push(twRules[tri].cssText);
                }
              } catch (e) {}
            }
          }
        } catch (e) {}

        if (twCssChunks.length === 0) {
          window.parent.postMessage({ type: "TAILWIND_CONVERT_RESULT", success: false, error: "No Tailwind CSS rules found" }, EDITOR_ORIGIN);
          break;
        }

        // 2. Create consolidated <style> tag with all Tailwind CSS
        var twConvertedTag = document.getElementById("gl-tailwind-converted");
        if (!twConvertedTag) {
          twConvertedTag = document.createElement("style");
          twConvertedTag.id = "gl-tailwind-converted";
          // Insert before the first existing <style> in head
          var firstStyle = document.head.querySelector("style");
          if (firstStyle) {
            document.head.insertBefore(twConvertedTag, firstStyle);
          } else {
            document.head.appendChild(twConvertedTag);
          }
        }
        twConvertedTag.textContent = twCssChunks.join("\n");

        // 3. Remove Tailwind CDN <script> tags
        var allScripts = document.querySelectorAll("script");
        for (var sci = 0; sci < allScripts.length; sci++) {
          var scr = allScripts[sci];
          // Remove CDN script (src contains tailwindcss)
          var scrSrc = scr.getAttribute("src") || "";
          if (scrSrc.indexOf("tailwindcss") >= 0 || scrSrc.indexOf("tailwind") >= 0 && scrSrc.indexOf("cdn") >= 0) {
            scr.parentNode.removeChild(scr);
            continue;
          }
          // Remove tailwind.config script
          var scrText = scr.textContent || "";
          if (scrText.indexOf("tailwind.config") >= 0 || scr.id === "tailwind-config") {
            scr.parentNode.removeChild(scr);
            continue;
          }
        }

        // 4. Remove original Tailwind-generated <style> elements
        for (var sti = 0; sti < twStyleElements.length; sti++) {
          if (twStyleElements[sti].parentNode) {
            twStyleElements[sti].parentNode.removeChild(twStyleElements[sti]);
          }
        }

        // 5. Notify parent of success and trigger full save
        var convertedVars = extractCssVariables();
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: convertedVars }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "TAILWIND_CONVERT_RESULT", success: true, rulesCount: twCssChunks.length }, EDITOR_ORIGIN);

        // Force a full HTML save since we modified <head> scripts/styles
        var twConvertedHtml = isMarkdownMode ? window.__glGetBodyHtml() : window.__glGetFullHtml();
        window.parent.postMessage({ type: "FULL_HTML", html: twConvertedHtml }, EDITOR_ORIGIN);
        break;
      }

      case "GET_FULL_HTML": {
        var html = isMarkdownMode ? window.__glGetBodyHtml() : window.__glGetFullHtml();
        window.parent.postMessage(
          { type: "FULL_HTML", html: html },
          EDITOR_ORIGIN
        );
        break;
      }

      case "ENABLE_CONTENTEDITABLE": {
        var el4 = getElementByPath(msg.path);
        if (!el4) break;
        startEditing(el4);
        break;
      }

      case "DISABLE_CONTENTEDITABLE": {
        finishEditing();
        break;
      }

      // ── Drag & drop via postMessage proxy from parent ──
      case "DRAG_OVER": {
        var dt = findDropTarget(msg.x, msg.y);
        if (dt) {
          showDropIndicatorAt(dt.rect, dt.position);
          currentDropTarget = {
            path: dt.element.getAttribute("data-gl-path"),
            position: dt.position,
          };
        } else {
          dropIndicator.style.display = "none";
          currentDropTarget = null;
        }
        break;
      }

      case "DRAG_END": {
        dropIndicator.style.display = "none";
        currentDropTarget = null;
        break;
      }

      case "DROP": {
        dropIndicator.style.display = "none";
        if (!currentDropTarget || !msg.html) break;

        var dropEl = getElementByPath(currentDropTarget.path);
        if (!dropEl) break;
        var cleanedDropHtml = sanitizeFragmentHtml(msg.html);
        if (!cleanedDropHtml.trim()) break;

        pushUndoSnapshot();
        // Determine insertion position: the drop target element's index among siblings
        var dropParentPath = dropEl.parentNode.getAttribute ? (dropEl.parentNode.getAttribute("data-gl-path") || "") : "";
        var dropSiblings = Array.from(dropEl.parentNode.children).filter(isEditableElement);
        var dropIdx = dropSiblings.indexOf(dropEl);
        var dropInsertPos = currentDropTarget.position === "before" ? dropIdx : dropIdx + 1;
        structuralChanges.push({
          type: "insert",
          parentPath: dropParentPath,
          position: dropInsertPos,
          html: cleanedDropHtml
        });

        var dropTemp = document.createElement("div");
        dropTemp.innerHTML = cleanedDropHtml;
        dedupeStyleTagsInFragment(dropTemp);

        if (currentDropTarget.position === "before") {
          while (dropTemp.firstChild) {
            dropEl.parentNode.insertBefore(dropTemp.firstChild, dropEl);
          }
        } else {
          while (dropTemp.firstChild) {
            dropEl.parentNode.insertBefore(dropTemp.firstChild, dropEl.nextSibling);
          }
        }

        currentDropTarget = null;
        assignPaths();
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "REPLACE_DOCUMENT": {
        if (!msg.html) break;
        try {
          var parser = new DOMParser();
          var newDoc = parser.parseFromString(msg.html, "text/html");

          // Replace <head> non-script elements exactly from incoming document.
          // This is required for snapshots: style blocks (including gl-editor-styles)
          // must reflect the loaded snapshot, not stale current-session styles.
          var oldHeadEls = Array.from(document.head.children);
          for (var rhi = oldHeadEls.length - 1; rhi >= 0; rhi--) {
            var hel = oldHeadEls[rhi];
            var tag = hel.tagName;
            if (tag === "SCRIPT") continue;
            hel.remove();
          }
          var newHeadEls = Array.from(newDoc.head.children);
          for (var nhi = 0; nhi < newHeadEls.length; nhi++) {
            var nhel = newHeadEls[nhi];
            if (nhel.tagName === "SCRIPT") continue;
            document.head.appendChild(document.importNode(nhel, true));
          }

          // Replace body innerHTML while keeping editor overlays
          var overlays = [];
          var overlayEls = document.body.querySelectorAll("[data-gl-overlay]");
          for (var oi = 0; oi < overlayEls.length; oi++) {
            overlays.push(overlayEls[oi]);
            overlayEls[oi].remove();
          }

          document.body.innerHTML = newDoc.body.innerHTML;

          for (var oi2 = 0; oi2 < overlays.length; oi2++) {
            document.body.appendChild(overlays[oi2]);
          }

          // Re-initialize editor state
          window.__GL_ORIGINAL_HTML = msg.rawHtml || msg.html;
          elementChanges = {};
          structuralChanges = [];
          cssChanged = false;
          classRenames = [];
          removedStyleBlockIds = [];
          originalStyleMap = {};
          undoStack = [];
          redoStack = [];

          if (selectedElement) {
            selectedElement = null;
            selectionOverlay.style.display = "none";
            hideDragHandle();
          }
          hoverOverlay.style.display = "none";

          assignPaths();
          snapshotUserStyles();

          // Notify parent of updated state
          var rdTree = buildDomTree();
          window.parent.postMessage({ type: "DOM_TREE", tree: rdTree }, EDITOR_ORIGIN);
          var rdVars = extractCssVariables();
          window.parent.postMessage({ type: "CSS_VARIABLES", variables: rdVars }, EDITOR_ORIGIN);
          var rdClasses = extractAllCssClasses();
          window.parent.postMessage({ type: "CSS_CLASSES", classes: rdClasses }, EDITOR_ORIGIN);
        } catch (err) {
          console.error("[GL inject] REPLACE_DOCUMENT error:", err);
        }
        break;
      }

      case "UNDO":
        undo();
        break;

      case "REDO":
        redo();
        break;

      case "CREATE_VARIABLE": {
        if (!msg.name || !msg.value) break;
        pushUndoSnapshot();
        cssChanged = true;
        var varTag = getOrCreateStyleTag();
        // Find or create :root rule in gl-editor-styles
        var rootRule = null;
        try {
          for (var vi = 0; vi < varTag.sheet.cssRules.length; vi++) {
            if (varTag.sheet.cssRules[vi] instanceof CSSStyleRule &&
                varTag.sheet.cssRules[vi].selectorText === ":root") {
              rootRule = varTag.sheet.cssRules[vi];
              break;
            }
          }
        } catch (e) {}
        if (rootRule) {
          rootRule.style.setProperty(msg.name, msg.value);
        } else {
          try {
            varTag.sheet.insertRule(":root { " + msg.name + ": " + msg.value + "; }", 0);
          } catch (e) {
            varTag.textContent = ":root { " + msg.name + ": " + msg.value + "; }\n" + varTag.textContent;
          }
        }
        // Re-extract and notify parent of updated variables
        var updatedVars = extractCssVariables();
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: updatedVars }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "MIGRATE_DESIGN_VARIABLES": {
        pushUndoSnapshot();
        cssChanged = true;

        // 1. Collect all :root variables from every style tag (except gl-design-system-variables)
        var dsVars = {};
        var dsVarOrder = [];

        // First, collect from existing gl-design-system-variables if it exists
        var dsTagExisting = document.getElementById("gl-design-system-variables");
        if (dsTagExisting) {
          var dsExText = dsTagExisting.textContent || "";
          var dsExRegex = /(--[\w-]+)\s*:\s*([^;]+)/g;
          var dsExM;
          while ((dsExM = dsExRegex.exec(dsExText)) !== null) {
            dsVars[dsExM[1]] = dsExM[2].trim();
            dsVarOrder.push(dsExM[1]);
          }
        }

        // 2. Scan all other style tags and extract + remove :root variable blocks
        var styleTags2 = document.querySelectorAll("style");
        for (var ds = 0; ds < styleTags2.length; ds++) {
          var stag = styleTags2[ds];
          if (stag.id === "gl-design-system-variables") continue;
          var stext = stag.textContent || "";

          // Find :root { ... } blocks, extract variables, then remove the blocks
          var rootBlockRegex = /:root\s*\{([^}]*)}/g;
          var rbMatch;
          var hasRootVars = false;
          while ((rbMatch = rootBlockRegex.exec(stext)) !== null) {
            var blockContent = rbMatch[1];
            var varExtract = /(--[\w-]+)\s*:\s*([^;]+)/g;
            var veM;
            while ((veM = varExtract.exec(blockContent)) !== null) {
              hasRootVars = true;
              if (!dsVars[veM[1]]) {
                dsVars[veM[1]] = veM[2].trim();
                dsVarOrder.push(veM[1]);
              }
            }
          }

          // Remove :root { ... } blocks from source style tags
          if (hasRootVars) {
            var cleaned = stext.replace(/:root\s*\{[^}]*}/g, "").trim();
            stag.textContent = cleaned;
            stag._glDirty = true;
          }
        }

        // 3. Create or move gl-design-system-variables before the first <style> in <head>
        var dsTag = document.getElementById("gl-design-system-variables");
        if (!dsTag) {
          dsTag = document.createElement("style");
          dsTag.id = "gl-design-system-variables";
        }
        // Place before first <style> that isn't itself (after all <link>/<meta>)
        var firstStyle = null;
        var headChildren = document.head.children;
        for (var hci = 0; hci < headChildren.length; hci++) {
          if (headChildren[hci].tagName === "STYLE" && headChildren[hci] !== dsTag) {
            firstStyle = headChildren[hci];
            break;
          }
        }
        if (firstStyle) {
          document.head.insertBefore(dsTag, firstStyle);
        } else {
          document.head.appendChild(dsTag);
        }

        // 4. Rebuild the design system style tag content
        if (dsVarOrder.length > 0) {
          var dsText = ":root {\n";
          for (var dk = 0; dk < dsVarOrder.length; dk++) {
            dsText += "  " + dsVarOrder[dk] + ": " + dsVars[dsVarOrder[dk]] + ";\n";
          }
          dsText += "}";
          dsTag.textContent = dsText;
        }

        // Notify parent
        var migratedVars = extractCssVariables();
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: migratedVars }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "UPDATE_DESIGN_VARIABLE": {
        if (!msg.name || !msg.value) break;
        pushUndoSnapshot();
        cssChanged = true;
        var dsUpdateTag = document.getElementById("gl-design-system-variables");
        if (!dsUpdateTag) {
          dsUpdateTag = document.createElement("style");
          dsUpdateTag.id = "gl-design-system-variables";
          var fsU = null; var hcU = document.head.children;
          for (var hi = 0; hi < hcU.length; hi++) { if (hcU[hi].tagName === "STYLE") { fsU = hcU[hi]; break; } }
          if (fsU) { document.head.insertBefore(dsUpdateTag, fsU); } else { document.head.appendChild(dsUpdateTag); }
          dsUpdateTag.textContent = ":root {\n  " + msg.name + ": " + msg.value + ";\n}";
        } else {
          // Update the variable in the style tag text
          var dsUText = dsUpdateTag.textContent || "";
          var varPattern = new RegExp("(" + msg.name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&") + "\\s*:\\s*)([^;]+)");
          if (varPattern.test(dsUText)) {
            dsUpdateTag.textContent = dsUText.replace(varPattern, "$1" + msg.value);
          } else {
            // Variable not found, add it before the closing }
            dsUpdateTag.textContent = dsUText.replace(/}(\s*)$/, "  " + msg.name + ": " + msg.value + ";\n}$1");
          }
        }
        // Also update via CSSOM for immediate effect
        document.documentElement.style.setProperty(msg.name, msg.value);
        var dsUpdatedVars = extractCssVariables();
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: dsUpdatedVars }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "DELETE_DESIGN_VARIABLE": {
        if (!msg.name) break;
        pushUndoSnapshot();
        cssChanged = true;
        // Remove from gl-design-system-variables style tag
        var dsDelTag = document.getElementById("gl-design-system-variables");
        if (dsDelTag) {
          var dsDelText = dsDelTag.textContent || "";
          var delPattern = new RegExp("\\s*" + msg.name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&") + "\\s*:[^;]*;", "g");
          dsDelTag.textContent = dsDelText.replace(delPattern, "");
        }
        // Also remove from other style tags that may have :root rules with this variable
        var allStyles = document.querySelectorAll("style");
        for (var dsi = 0; dsi < allStyles.length; dsi++) {
          var dsStyle = allStyles[dsi];
          if (dsStyle.id === "gl-design-system-variables") continue;
          var dsContent = dsStyle.textContent || "";
          if (dsContent.indexOf(msg.name) >= 0) {
            var delPattern2 = new RegExp("\\s*" + msg.name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&") + "\\s*:[^;]*;", "g");
            dsStyle.textContent = dsContent.replace(delPattern2, "");
          }
        }
        // Remove inline root override
        document.documentElement.style.removeProperty(msg.name);
        var dsDelVars = extractCssVariables();
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: dsDelVars }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "INJECT_ANIMATION_CSS": {
        if (!msg.className) break;
        cssChanged = true;
        var animStyleId = "gl-anim-" + msg.className;
        var animTag = document.getElementById(animStyleId);
        if (!msg.css) {
          if (animTag && animTag.parentNode) {
            animTag.parentNode.removeChild(animTag);
          }
          markStyleBlockRemoved(animStyleId);
          var classesAfterDelete = extractAllCssClasses();
          window.parent.postMessage({ type: "CSS_CLASSES", classes: classesAfterDelete }, EDITOR_ORIGIN);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
          break;
        }
        if (!animTag) {
          animTag = document.createElement("style");
          animTag.id = animStyleId;
          document.head.appendChild(animTag);
        }
        markStyleBlockPresent(animStyleId);
        animTag.textContent = msg.css;
        // Re-extract CSS classes so new animation classes appear in the class selector immediately
        var updatedClasses = extractAllCssClasses();
        window.parent.postMessage({ type: "CSS_CLASSES", classes: updatedClasses }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "INJECT_OBSERVER_SCRIPT": {
        var existingObs = document.getElementById("gl-observer-script");
        if (msg.enable && !existingObs) {
          var obsScript = document.createElement("script");
          obsScript.id = "gl-observer-script";
          obsScript.textContent = '(function(){' +
            'var obs=new IntersectionObserver(function(entries){' +
            'entries.forEach(function(e){' +
            'if(e.isIntersecting)e.target.classList.add("gl-in-view");' +
            '});' +
            '},{threshold:0.1});' +
            'document.querySelectorAll("[class]").forEach(function(el){' +
            'if(el.className.indexOf&&el.className.indexOf("gl-in-view")===-1)obs.observe(el);' +
            '});' +
            'new MutationObserver(function(muts){' +
            'muts.forEach(function(m){' +
            'm.addedNodes.forEach(function(n){if(n.nodeType===1)obs.observe(n);});' +
            '});' +
            '}).observe(document.body,{childList:true,subtree:true});' +
            '})();';
          document.body.appendChild(obsScript);
        } else if (!msg.enable && existingObs) {
          existingObs.parentNode.removeChild(existingObs);
        }
        break;
      }

      case "GET_ANIMATION_STYLES": {
        var animStyles = [];
        var animTags = document.querySelectorAll('style[id^="gl-anim-"]');
        for (var ai = 0; ai < animTags.length; ai++) {
          var aTag = animTags[ai];
          var aClassName = aTag.id.replace("gl-anim-", "");
          animStyles.push({ className: aClassName, css: aTag.textContent || "" });
        }
        window.parent.postMessage({ type: "ANIMATION_STYLES", styles: animStyles }, EDITOR_ORIGIN);
        break;
      }

      case "MD_FORMAT": {
        handleMarkdownFormat(msg.action, msg.value);
        break;
      }

      case "MD_INSERT_IMAGE": {
        var relativePath = msg.relativePath;
        var webviewUri = msg.webviewUri;
        if (!relativePath || !webviewUri) break;
        window.focus();
        document.body.focus();
        var img = document.createElement("img");
        img.setAttribute("data-gl-img-id", "gl-img-" + (++glMdIdCounter));
        img.setAttribute("src", webviewUri);
        img.setAttribute("data-gl-src", relativePath);
        img.setAttribute("alt", "");
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        var sel = window.getSelection();
        var inserted = false;
        if (sel && sel.rangeCount > 0) {
          if (savedMdSelection) {
            try {
              var range = document.createRange();
              range.setStart(savedMdSelection.startContainer, savedMdSelection.startOffset);
              range.setEnd(savedMdSelection.endContainer, savedMdSelection.endOffset);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (err) { /* ignore */ }
          }
          var range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          inserted = true;
        }
        if (!inserted) {
          document.body.appendChild(img);
          var endRange = document.createRange();
          endRange.selectNodeContents(document.body);
          endRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(endRange);
        }
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "MD_INSERT_LINK": {
        var url = msg.url || "#";
        var linkText = msg.linkText || "link text";
        window.focus();
        document.body.focus();
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          if (savedMdSelection) {
            try {
              var range = document.createRange();
              range.setStart(savedMdSelection.startContainer, savedMdSelection.startOffset);
              range.setEnd(savedMdSelection.endContainer, savedMdSelection.endOffset);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (err) { /* ignore */ }
          }
          var range = sel.getRangeAt(0);
          var a = document.createElement("a");
          a.setAttribute("data-gl-link-id", "gl-link-" + (++glMdIdCounter));
          a.setAttribute("href", url);
          a.textContent = linkText;
          range.deleteContents();
          range.insertNode(a);
          range.setStartAfter(a);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "MD_UPDATE_IMAGE": {
        var imgId = msg.imgId;
        var src = msg.src;
        var displayValue = msg.displayValue;
        if (!imgId) break;
        var imgEl = document.querySelector("img[data-gl-img-id=\"" + imgId + "\"]");
        if (imgEl) {
          imgEl.setAttribute("src", displayValue !== undefined ? displayValue : src);
          if (/^[^:]+\.(png|jpg|jpeg|gif|webp|avif|svg|ico)$/i.test(src) || src.indexOf("/") !== -1 && src.indexOf(":") === -1) {
            imgEl.setAttribute("data-gl-src", src);
          } else {
            imgEl.removeAttribute("data-gl-src");
          }
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "MD_UPDATE_LINK": {
        var linkId = msg.linkId;
        var href = msg.href;
        if (!linkId || href === undefined) break;
        var linkEl = document.querySelector("a[data-gl-link-id=\"" + linkId + "\"]");
        if (linkEl) {
          linkEl.setAttribute("href", href);
          window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        }
        break;
      }

      case "REPLACE_FONT": {
        if (!msg.oldFamily || !msg.newFamily) break;
        pushUndoSnapshot();
        cssChanged = true;

        var oldFamLower = String(msg.oldFamily).trim().toLowerCase();
        var quotedNewFamily = "'" + String(msg.newFamily).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
        var replacementStack = msg.newStack || quotedNewFamily + ", sans-serif";

        // Replace old-family tokens inside one declaration value. Token-wise
        // (split on commas) — never builds a regex from user content, so `$&`
        // and regex metacharacters in family names are inert. Returns the new
        // value, or null when the old family doesn't appear.
        function replaceFamilyInValue(value) {
          // `!important` belongs to the declaration, not to the family token.
          // Keeping it in the value made common declarations such as
          // `font-family: Inter !important` impossible to replace even though
          // detection (via CSSOM) correctly reported `Inter`.
          var rawValue = String(value);
          var importantMatch = rawValue.match(/\s*!important\s*$/i);
          var importantSuffix = importantMatch ? " !important" : "";
          var valueWithoutImportant = importantMatch
            ? rawValue.slice(0, importantMatch.index)
            : rawValue;
          var whole = cleanFamilyToken(valueWithoutImportant.trim());
          if (whole.toLowerCase() === oldFamLower) return replacementStack + importantSuffix;
          var parts = splitFamilyList(valueWithoutImportant);
          var matched = false;
          for (var i = 0; i < parts.length; i++) {
            var trimmed = parts[i].trim();
            var lead = i === 0 ? "" : " ";
            if (cleanFamilyToken(trimmed).toLowerCase() === oldFamLower) {
              parts[i] = lead + quotedNewFamily;
              matched = true;
              continue;
            }
            // font shorthand first segment: "bold 16px/1.5 'Old Family'"
            var shQuoted = trimmed.match(/^([\s\S]*\s)(['"])([\s\S]*?)\2$/);
            if (shQuoted && shQuoted[3].trim().toLowerCase() === oldFamLower) {
              parts[i] = lead + shQuoted[1] + quotedNewFamily;
              matched = true;
              continue;
            }
            // Unquoted tail: "...16px Old Family" — family name at the end
            var oldLen = oldFamLower.length;
            if (trimmed.length > oldLen &&
                trimmed.slice(-oldLen).toLowerCase() === oldFamLower &&
                /\s/.test(trimmed.charAt(trimmed.length - oldLen - 1))) {
              parts[i] = lead + trimmed.slice(0, trimmed.length - oldLen) + quotedNewFamily;
              matched = true;
            }
          }
          return matched ? parts.join(",") + importantSuffix : null;
        }

        // Rewrite font-family / font / custom-property declaration values in a
        // CSS text block. Function-form replace keeps `$` sequences literal.
        // @font-face blocks are masked out first: their font-family declares a
        // face name tied to its src and must never be rewritten to the new family.
        function replaceFamilyInCssText(text) {
          var ffMasks = [];
          var maskedText = text.replace(/@font-face[^{}]*\{[^}]*\}/gi, function (block) {
            ffMasks.push(block);
            return "__GLFF" + (ffMasks.length - 1) + "__";
          });
          var changed = false;
          var out = maskedText.replace(/((?:font-family|font|--[\w-]+)\s*:\s*)([^;{}]+)/gi, function (full, declPrefix, declValue) {
            var nv = replaceFamilyInValue(declValue);
            if (nv === null) return full;
            changed = true;
            return declPrefix + nv;
          });
          if (!changed) return null;
          return out.replace(/__GLFF(\d+)__/g, function (m, mi) { return ffMasks[+mi]; });
        }

        // Remote linked stylesheets and preview-only inlined tags
        // (data-gl-inlined / data-gl-fm-css) can be read by CSSOM, so their
        // fonts appear in the Typography list, but their source is outside the
        // HTML patch stream. Persist equivalent rules in a managed style block
        // instead.
        var linkedFontOverrides = [];
        function collectLinkedFontOverrides(rules, wrappers) {
          if (!rules) return;
          for (var lri = 0; lri < rules.length; lri++) {
            var lr = rules[lri];
            if (lr.style && lr.selectorText) {
              var overrideDecls = [];
              var familyValue = lr.style.getPropertyValue("font-family");
              var replacedFamily = familyValue ? replaceFamilyInValue(familyValue) : null;
              if (replacedFamily !== null) {
                var familyPriority = lr.style.getPropertyPriority("font-family");
                overrideDecls.push("font-family: " + replacedFamily + (familyPriority ? " !important" : "") + ";");
              }
              for (var lpi = 0; lpi < lr.style.length; lpi++) {
                var linkedProp = lr.style[lpi];
                if (linkedProp.indexOf("--") !== 0) continue;
                var linkedValue = lr.style.getPropertyValue(linkedProp);
                var replacedLinkedValue = replaceFamilyInValue(linkedValue);
                if (replacedLinkedValue !== null) {
                  var linkedPriority = lr.style.getPropertyPriority(linkedProp);
                  overrideDecls.push(linkedProp + ": " + replacedLinkedValue + (linkedPriority ? " !important" : "") + ";");
                }
              }
              if (overrideDecls.length) {
                var overrideRule = lr.selectorText + " { " + overrideDecls.join(" ") + " }";
                for (var lwi = wrappers.length - 1; lwi >= 0; lwi--) {
                  overrideRule = wrappers[lwi] + " { " + overrideRule + " }";
                }
                linkedFontOverrides.push(overrideRule);
              }
            } else if (lr.cssRules) {
              var wrapper = "";
              if (typeof CSSMediaRule !== "undefined" && lr instanceof CSSMediaRule) {
                wrapper = "@media " + lr.conditionText;
              } else if (typeof CSSSupportsRule !== "undefined" && lr instanceof CSSSupportsRule) {
                wrapper = "@supports " + lr.conditionText;
              }
              collectLinkedFontOverrides(lr.cssRules, wrapper ? wrappers.concat([wrapper]) : wrappers);
            }
          }
        }
        try {
          for (var lsi = 0; lsi < document.styleSheets.length; lsi++) {
            var linkedSheet = document.styleSheets[lsi];
            var linkedOwner = linkedSheet.ownerNode;
            if (!linkedOwner) continue;
            var linkedIsPatchable = linkedOwner.tagName === "LINK" ||
              (linkedOwner.tagName === "STYLE" && isPreviewOnlyStyleTag(linkedOwner));
            if (!linkedIsPatchable) continue;
            try { collectLinkedFontOverrides(linkedSheet.cssRules || linkedSheet.rules, []); } catch (linkedReadErr) {}
          }
        } catch (linkedScanErr) {}
        if (linkedFontOverrides.length) {
          var linkedOverrideTag = document.getElementById("gl-design-system-font-overrides");
          if (!linkedOverrideTag) {
            linkedOverrideTag = document.createElement("style");
            linkedOverrideTag.id = "gl-design-system-font-overrides";
            document.head.appendChild(linkedOverrideTag);
          }
          var linkedOverrideText = linkedOverrideTag.textContent || "";
          linkedOverrideTag.textContent = linkedOverrideText + (linkedOverrideText.trim() ? "\n" : "") + linkedFontOverrides.join("\n");
          addSuppressedFont(linkedOverrideTag, msg.oldFamily);
          markStyleBlockPresent("gl-design-system-font-overrides");
        }

        // 1. Style tags: user styles persist via userStyleEdits (_glDirty),
        //    gl-* editor tags are auto-collected by getPatches (cssChanged set).
        //    gl-design-system-fonts holds only managed @font-face rules — skipped
        //    here, cleaned below. Preview-only inlined tags are never edited
        //    directly (handled above via managed overrides).
        var repStyleTags = document.querySelectorAll("style");
        for (var rfi = 0; rfi < repStyleTags.length; rfi++) {
          var rfTag = repStyleTags[rfi];
          if (rfTag.id === "gl-design-system-fonts") continue;
          if (rfTag.hasAttribute("data-gl-overlay") || isPreviewOnlyStyleTag(rfTag)) continue;
          var rfNew = replaceFamilyInCssText(rfTag.textContent || "");
          if (rfNew !== null) {
            rfTag.textContent = rfNew;
            if (!rfTag.id || rfTag.id.indexOf("gl-") !== 0) rfTag._glDirty = true;
          }
        }

        // 1a. Drop the replaced family's managed @font-face — it is unused after
        //     a replace-everywhere. Remove the tag entirely when it empties out.
        var glffCleanupTag = document.getElementById("gl-design-system-fonts");
        if (glffCleanupTag) {
          var glffText = glffCleanupTag.textContent || "";
          var glffCleaned = glffText.replace(/@font-face[^{}]*\{[^}]*\}\s*/gi, function (block) {
            var famM = /font-family\s*:\s*(['"]?)([^'";}]+)\1/i.exec(block);
            if (famM && famM[2].trim().toLowerCase() === oldFamLower) return "";
            return block;
          });
          if (glffCleaned !== glffText) glffCleanupTag.textContent = glffCleaned;
          if (!(glffCleanupTag.textContent || "").trim()) {
            glffCleanupTag.parentNode.removeChild(glffCleanupTag);
            markStyleBlockRemoved("gl-design-system-fonts");
          }
        }

        // 2. Inline styles (font-family and inline custom properties)
        var repInlineEls = document.querySelectorAll("[style]");
        for (var rii = 0; rii < repInlineEls.length; rii++) {
          var riEl = repInlineEls[rii];
          if (riEl.hasAttribute("data-gl-overlay")) continue;
          if (riEl.closest && riEl.closest("[data-gl-overlay]")) continue;
          if (!riEl.style) continue;
          var riFam = riEl.style.fontFamily;
          if (riFam) {
            var riNew = replaceFamilyInValue(riFam);
            if (riNew !== null) {
              riEl.style.fontFamily = riNew;
              trackStyleMutation(riEl, "font-family", riNew);
            }
          }
          var riProps = [];
          for (var rpi = 0; rpi < riEl.style.length; rpi++) riProps.push(riEl.style[rpi]);
          for (var rpn = 0; rpn < riProps.length; rpn++) {
            if (riProps[rpn].indexOf("--") !== 0) continue;
            var rpVal = riEl.style.getPropertyValue(riProps[rpn]);
            var rpNew = rpVal ? replaceFamilyInValue(rpVal) : null;
            if (rpNew !== null) {
              riEl.style.setProperty(riProps[rpn], rpNew);
              trackStyleMutation(riEl, riProps[rpn], rpNew);
            }
          }
        }

        // 3. @font-face for uploaded fonts → <style id="gl-design-system-fonts">
        //    (auto-collected by getPatches via the gl-design-system- prefix)
        if (msg.fontFaceCss) {
          var ffTag = document.getElementById("gl-design-system-fonts");
          if (!ffTag) {
            ffTag = document.createElement("style");
            ffTag.id = "gl-design-system-fonts";
            var ffFirstStyle = document.head.querySelector("style");
            if (ffFirstStyle) document.head.insertBefore(ffTag, ffFirstStyle);
            else document.head.appendChild(ffTag);
          }
          markStyleBlockPresent("gl-design-system-fonts");
          var ffText = ffTag.textContent || "";
          var ffReplaced = false;
          ffText = ffText.replace(/@font-face[^{}]*\{[^}]*\}/gi, function (block) {
            var famM = /font-family\s*:\s*(['"]?)([^'";}]+)\1/i.exec(block);
            if (!ffReplaced && famM && famM[2].trim().toLowerCase() === String(msg.newFamily).toLowerCase()) {
              ffReplaced = true;
              return msg.fontFaceCss;
            }
            return block;
          });
          ffTag.textContent = ffReplaced ? ffText : (ffText.trim() ? ffText + "\n" : "") + msg.fontFaceCss;
        }

        // 4. Google Fonts <link> → head, before first <style>
        //    (auto-collected into linkBlocks by getPatches)
        if (msg.googleFontUrl) {
          var slug = String(msg.newFamily).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          var newLinkId = "gl-design-system-font-" + slug;
          var gfLink = document.getElementById(newLinkId);
          if (!gfLink) {
            gfLink = document.createElement("link");
            gfLink.id = newLinkId;
            gfLink.rel = "stylesheet";
            var gfFirstStyle = document.head.querySelector("style");
            if (gfFirstStyle) document.head.insertBefore(gfLink, gfFirstStyle);
            else document.head.appendChild(gfLink);
          }
          gfLink.setAttribute("href", msg.googleFontUrl);
        }

        // 5. Stale Google link cleanup: any fonts.googleapis link whose families
        //    are all unused now gets removed (from the DOM and, via linkEdits,
        //    from the saved file).
        var fontsAfter = extractUsedFonts();
        var usedKeys = {};
        for (var ua = 0; ua < fontsAfter.length; ua++) usedKeys[fontsAfter[ua].family.toLowerCase()] = true;
        var staleCandidates = document.querySelectorAll('link[href*="fonts.googleapis"]');
        var removedAny = false;
        for (var sc = 0; sc < staleCandidates.length; sc++) {
          var scLink = staleCandidates[sc];
          var scHref = scLink.getAttribute("href") || "";
          var scFams = parseGoogleHrefFamilies(scHref);
          if (scFams.length === 0) continue;
          var scStillUsed = false;
          for (var sf = 0; sf < scFams.length; sf++) {
            if (usedKeys[scFams[sf].toLowerCase()]) { scStillUsed = true; break; }
          }
          if (!scStillUsed && scLink.parentNode) {
            scLink.parentNode.removeChild(scLink);
            linkEdits.push({ href: scHref, newOuterHTML: "" });
            removedAny = true;
          }
        }
        if (removedAny) fontsAfter = extractUsedFonts();

        window.parent.postMessage({ type: "USED_FONTS", fonts: fontsAfter }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: extractCssVariables() }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }

      case "REMOVE_FONT": {
        if (!msg.family) break;
        pushUndoSnapshot();
        cssChanged = true;
        var removeFamLower = String(msg.family).trim().toLowerCase();

        function removeValueHasFamily(value) {
          var raw = String(value || "").replace(/\s*!important\s*$/i, "").trim();
          var tokens = splitFamilyList(raw);
          for (var rvt = 0; rvt < tokens.length; rvt++) {
            var cleaned = cleanFamilyToken(tokens[rvt]).trim().toLowerCase();
            if (cleaned === removeFamLower) return true;
            // Font shorthand: family follows the size[/line-height] segment.
            var shorthandFamily = cleaned.match(/(?:^|\s)\d[\w.%]*(?:\s*\/\s*[\d.\w%]+)?\s+(.+)$/);
            if (shorthandFamily && cleanFamilyToken(shorthandFamily[1]).toLowerCase() === removeFamLower) return true;
          }
          return false;
        }

        function removeFamilyDeclarations(cssText) {
          var changed = false;
          var output = String(cssText || "").replace(/((?:font-family|font|--[\w-]+)\s*:\s*)([^;{}]+)(;?)/gi, function (full, prefix, value) {
            if (!removeValueHasFamily(value)) return full;
            changed = true;
            return "";
          });
          return changed ? output : null;
        }

        // Remove declarations from editable style blocks. Preview-only inlined
        // tags (data-gl-inlined / data-gl-fm-css) are never edited directly —
        // they are neutralized below via managed overrides.
        var removeStyleTags = document.querySelectorAll("style");
        for (var rst = 0; rst < removeStyleTags.length; rst++) {
          var removeStyleTag = removeStyleTags[rst];
          if (removeStyleTag.id === "gl-design-system-fonts") continue;
          if (removeStyleTag.hasAttribute("data-gl-overlay") || isPreviewOnlyStyleTag(removeStyleTag)) continue;
          var removedCssText = removeFamilyDeclarations(removeStyleTag.textContent || "");
          if (removedCssText !== null) {
            removeStyleTag.textContent = removedCssText;
            if (!removeStyleTag.id || removeStyleTag.id.indexOf("gl-") !== 0) removeStyleTag._glDirty = true;
          }
        }

        // Inline declarations and custom properties.
        var removeInlineEls = document.querySelectorAll("[style]");
        for (var rie = 0; rie < removeInlineEls.length; rie++) {
          var removeInlineEl = removeInlineEls[rie];
          if (removeInlineEl.hasAttribute("data-gl-overlay")) continue;
          if (removeInlineEl.closest && removeInlineEl.closest("[data-gl-overlay]")) continue;
          if (!removeInlineEl.style) continue;
          if (removeValueHasFamily(removeInlineEl.style.fontFamily)) {
            removeInlineEl.style.removeProperty("font-family");
            trackStyleMutation(removeInlineEl, "font-family", "");
          }
          var removeInlineProps = [];
          for (var rip = 0; rip < removeInlineEl.style.length; rip++) removeInlineProps.push(removeInlineEl.style[rip]);
          for (var ripi = 0; ripi < removeInlineProps.length; ripi++) {
            var removeProp = removeInlineProps[ripi];
            if (removeProp.indexOf("--") !== 0) continue;
            if (!removeValueHasFamily(removeInlineEl.style.getPropertyValue(removeProp))) continue;
            removeInlineEl.style.removeProperty(removeProp);
            trackStyleMutation(removeInlineEl, removeProp, "");
          }
        }

        // Remote linked stylesheets and preview-only inlined tags cannot be
        // edited through HTML patches. Neutralize matching declarations with
        // persistent managed overrides.
        var removalOverrides = [];
        function collectRemovalOverrides(rules, wrappers) {
          if (!rules) return;
          for (var rro = 0; rro < rules.length; rro++) {
            var removalRule = rules[rro];
            if (removalRule.style && removalRule.selectorText) {
              var removalDecls = [];
              if (removeValueHasFamily(removalRule.style.getPropertyValue("font-family"))) {
                removalDecls.push("font-family: inherit !important;");
              }
              for (var rrp = 0; rrp < removalRule.style.length; rrp++) {
                var removalProp = removalRule.style[rrp];
                if (removalProp.indexOf("--") === 0 && removeValueHasFamily(removalRule.style.getPropertyValue(removalProp))) {
                  removalDecls.push(removalProp + ": initial !important;");
                }
              }
              if (removalDecls.length) {
                var removalRuleText = removalRule.selectorText + " { " + removalDecls.join(" ") + " }";
                for (var rrw = wrappers.length - 1; rrw >= 0; rrw--) removalRuleText = wrappers[rrw] + " { " + removalRuleText + " }";
                removalOverrides.push(removalRuleText);
              }
            } else if (removalRule.cssRules) {
              var removalWrapper = "";
              if (typeof CSSMediaRule !== "undefined" && removalRule instanceof CSSMediaRule) removalWrapper = "@media " + removalRule.conditionText;
              else if (typeof CSSSupportsRule !== "undefined" && removalRule instanceof CSSSupportsRule) removalWrapper = "@supports " + removalRule.conditionText;
              collectRemovalOverrides(removalRule.cssRules, removalWrapper ? wrappers.concat([removalWrapper]) : wrappers);
            }
          }
        }
        try {
          for (var rsi = 0; rsi < document.styleSheets.length; rsi++) {
            var removalSheet = document.styleSheets[rsi];
            var removalOwner = removalSheet.ownerNode;
            if (!removalOwner) continue;
            var removalIsPatchable = removalOwner.tagName === "LINK" ||
              (removalOwner.tagName === "STYLE" && isPreviewOnlyStyleTag(removalOwner));
            if (!removalIsPatchable) continue;
            try { collectRemovalOverrides(removalSheet.cssRules || removalSheet.rules, []); } catch (removalReadErr) {}
          }
        } catch (removalScanErr) {}
        var removalOverrideTag = document.getElementById("gl-design-system-font-overrides");
        if (!removalOverrideTag) {
          removalOverrideTag = document.createElement("style");
          removalOverrideTag.id = "gl-design-system-font-overrides";
          document.head.appendChild(removalOverrideTag);
        }
        if (removalOverrides.length) {
          var existingRemovalOverrides = removalOverrideTag.textContent || "";
          removalOverrideTag.textContent = existingRemovalOverrides + (existingRemovalOverrides.trim() ? "\n" : "") + removalOverrides.join("\n");
        }
        addSuppressedFont(removalOverrideTag, msg.family);
        markStyleBlockPresent("gl-design-system-font-overrides");

        // Remove a matching managed @font-face rule.
        var removeFaceTag = document.getElementById("gl-design-system-fonts");
        if (removeFaceTag) {
          removeFaceTag.textContent = (removeFaceTag.textContent || "").replace(/@font-face[^{}]*\{[^}]*\}\s*/gi, function (block) {
            var faceFamily = /font-family\s*:\s*(['"]?)([^'";}]+)\1/i.exec(block);
            return faceFamily && faceFamily[2].trim().toLowerCase() === removeFamLower ? "" : block;
          });
          if (!(removeFaceTag.textContent || "").trim()) {
            removeFaceTag.remove();
            markStyleBlockRemoved("gl-design-system-fonts");
          }
        }

        // Remove Google Fonts links that load this family.
        var removeFontLinks = document.querySelectorAll('link[href*="fonts.googleapis"]');
        for (var rgl = 0; rgl < removeFontLinks.length; rgl++) {
          var removeFontLink = removeFontLinks[rgl];
          var removeHref = removeFontLink.getAttribute("href") || "";
          var removeHrefFamilies = parseGoogleHrefFamilies(removeHref);
          var removeThisLink = false;
          for (var rhf = 0; rhf < removeHrefFamilies.length; rhf++) {
            if (removeHrefFamilies[rhf].toLowerCase() === removeFamLower) { removeThisLink = true; break; }
          }
          if (removeThisLink) {
            removeFontLink.remove();
            linkEdits.push({ href: removeHref, newOuterHTML: "" });
          }
        }

        window.parent.postMessage({ type: "USED_FONTS", fonts: extractUsedFonts() }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "CSS_VARIABLES", variables: extractCssVariables() }, EDITOR_ORIGIN);
        window.parent.postMessage({ type: "DOM_MUTATED" }, EDITOR_ORIGIN);
        break;
      }
    }
  });

  function stripBrowserExtensionArtifacts(root) {
    // Leftovers from browser extensions frozen into pages captured via
    // Chrome "Save Page As" (Plasmo-based extensions, ColorZilla, Grammarly...).
    var junkSelectors = [
      "#plasmo-shadow-container",
      ".plasmo-csui-container",
      "plasmo-csui",
      "grammarly-desktop-integration",
      "grammarly-extension",
      "#loom-companion-mv3"
    ];
    for (var js = 0; js < junkSelectors.length; js++) {
      var junkEls;
      try { junkEls = root.querySelectorAll(junkSelectors[js]); } catch (err) { continue; }
      for (var je = 0; je < junkEls.length; je++) {
        if (junkEls[je].parentNode) junkEls[je].parentNode.removeChild(junkEls[je]);
      }
    }
    // Style blocks injected by those extensions have no stable id; detect them
    // by selectors that only exist in extension UI. Never touch gl-* blocks.
    var styleTags = root.querySelectorAll("style");
    for (var st = 0; st < styleTags.length; st++) {
      var styleId = styleTags[st].id || "";
      if (styleId.indexOf("gl-") === 0) continue;
      var cssText = (styleTags[st].textContent || "").toLowerCase();
      if (cssText.indexOf("plasmo-shadow-container") !== -1 || cssText.indexOf("plasmo-csui") !== -1) {
        if (styleTags[st].parentNode) styleTags[st].parentNode.removeChild(styleTags[st]);
      }
    }
    var junkAttrs = ["cz-shortcut-listen", "data-new-gr-c-s-check-loaded", "data-gr-ext-installed", "monica-id", "monica-version"];
    var attrEls = [root].concat(Array.from(root.querySelectorAll("html, body")));
    for (var ae = 0; ae < attrEls.length; ae++) {
      for (var ja = 0; ja < junkAttrs.length; ja++) {
        attrEls[ae].removeAttribute(junkAttrs[ja]);
      }
    }
  }

  function sanitizeCloneTree(root) {
    if (!root) return root;
    stripBrowserExtensionArtifacts(root);
    var overlays = root.querySelectorAll("[data-gl-overlay]");
    for (var i = 0; i < overlays.length; i++) overlays[i].parentNode.removeChild(overlays[i]);
    var handles = root.querySelectorAll("[data-gl-drag-handle]");
    for (var h = 0; h < handles.length; h++) handles[h].parentNode.removeChild(handles[h]);
    var scripts = root.querySelectorAll("script[data-gl-inject]");
    for (var s = 0; s < scripts.length; s++) scripts[s].parentNode.removeChild(scripts[s]);
    var autoMeta = root.querySelectorAll('meta[http-equiv="Content-Type"], meta[charset]');
    for (var m = 0; m < autoMeta.length; m++) autoMeta[m].parentNode.removeChild(autoMeta[m]);
    var allEls = [root].concat(Array.from(root.querySelectorAll("*")));
    for (var e = 0; e < allEls.length; e++) {
      var attrs = Array.from(allEls[e].attributes || []);
      for (var ai = 0; ai < attrs.length; ai++) {
        var attrName = attrs[ai].name;
        if (attrName.indexOf("data-gl-save-") === 0) {
          var realName = attrName.substring("data-gl-save-".length);
          allEls[e].setAttribute(realName, attrs[ai].value);
          allEls[e].removeAttribute(attrName);
        }
      }
      allEls[e].removeAttribute("data-gl-path");
      allEls[e].removeAttribute("data-gl-original-src");
      allEls[e].removeAttribute("data-gl-img-id");
      allEls[e].removeAttribute("data-gl-link-id");
      allEls[e].removeAttribute("contenteditable");
      if (allEls[e].tagName === "IMG" && allEls[e].getAttribute("data-gl-src")) {
        allEls[e].setAttribute("src", allEls[e].getAttribute("data-gl-src"));
        allEls[e].removeAttribute("data-gl-src");
      }
    }
    return root;
  }

  function syncLiveStyleRulesIntoClone(clonedHtmlRoot) {
    if (!clonedHtmlRoot) return;
    var sourceStyles = Array.from(document.querySelectorAll("style"));
    var clonedStyles = Array.from(clonedHtmlRoot.querySelectorAll("style"));
    var styleCount = Math.min(sourceStyles.length, clonedStyles.length);
    for (var i = 0; i < styleCount; i++) {
      var srcStyle = sourceStyles[i];
      var clonedStyle = clonedStyles[i];
      try {
        var sheet = srcStyle.sheet;
        if (!sheet || !sheet.cssRules) continue;
        var cssText = "";
        for (var ri = 0; ri < sheet.cssRules.length; ri++) {
          cssText += sheet.cssRules[ri].cssText + "\n";
        }
        // CSSOM edits (insertRule/deleteRule) are not always reflected in textContent.
        // Force style tag content to match live runtime rules before serialization.
        clonedStyle.textContent = cssText;
      } catch (err) {
        // Ignore stylesheets that are not readable via cssRules.
      }
    }
  }

  // Expose getPatches so parent frame can call it directly
  window.__glGetPatches = getPatches;
  window.__glIsMarkdownMode = function () { return isMarkdownMode; };
  window.__glGetBodyHtml = function () {
    // Return body innerHTML cleaned of editor-injected attributes/elements
    var clone = sanitizeCloneTree(document.body.cloneNode(true));
    return clone.innerHTML;
  };
  window.__glGetFullHtml = function () {
    var originalHtml = window.__GL_ORIGINAL_HTML || "";
    var looksLikeFullDocument = /<!doctype|<html\b|<body\b/i.test(originalHtml);
    if (!looksLikeFullDocument) {
      return window.__glGetBodyHtml();
    }
    var htmlClone = sanitizeCloneTree(document.documentElement.cloneNode(true));
    syncLiveStyleRulesIntoClone(htmlClone);
    var doctype = /<!doctype/i.test(originalHtml) ? "<!DOCTYPE html>\n" : "";
    return doctype + htmlClone.outerHTML;
  };

  // ─── Start ────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-extract CSS variables, classes, and animation styles after all resources have loaded
  window.addEventListener("load", function () {
    var cssVars = extractCssVariables();
    window.parent.postMessage({ type: "CSS_VARIABLES", variables: cssVars }, EDITOR_ORIGIN);
    var cssClasses = extractAllCssClasses();
    window.parent.postMessage({ type: "CSS_CLASSES", classes: cssClasses }, EDITOR_ORIGIN);
    var animStyles = [];
    var animTags = document.querySelectorAll('style[id^="gl-anim-"]');
    for (var ai = 0; ai < animTags.length; ai++) {
      var aTag = animTags[ai];
      animStyles.push({ className: aTag.id.replace("gl-anim-", ""), css: aTag.textContent || "" });
    }
    window.parent.postMessage({ type: "ANIMATION_STYLES", styles: animStyles }, EDITOR_ORIGIN);

    // Detect Tailwind CDN script presence
    var hasTwCdn = false;
    var allScripts = document.querySelectorAll("script");
    for (var si = 0; si < allScripts.length; si++) {
      var scrSrc = allScripts[si].getAttribute("src") || "";
      var scrText = allScripts[si].textContent || "";
      if (scrSrc.indexOf("tailwindcss") >= 0 || scrSrc.indexOf("tailwind") >= 0) {
        hasTwCdn = true;
        break;
      }
      if (scrText.indexOf("tailwind.config") >= 0 && allScripts[si].id === "tailwind-config") {
        hasTwCdn = true;
        break;
      }
    }
    window.parent.postMessage({ type: "HAS_TAILWIND_CDN", hasTailwindCdn: hasTwCdn }, EDITOR_ORIGIN);
  });
})();
