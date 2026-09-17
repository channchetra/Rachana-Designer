'use strict';

/**
 * Convert HTML (from rendered markdown) to core WordPress Gutenberg blocks.
 * Uses only core blocks: paragraph, heading, list, quote, code, table, image, separator, html.
 *
 * TypeScript port of the original extension's `src/wordpress/markdownToBlocks.js`;
 * the generated block markup is byte-identical to that file.
 */

/** One top-level node produced by `parseSimpleHtml()`. */
interface SimpleNode {
  tag: string;
  content?: string;
  innerHTML?: string;
  outerHtml?: string;
  openTag?: string;
  attrs?: Record<string, string>;
}

export function markdownHtmlToBlocks(html: string): string {
  // Parse into a simple DOM-like structure
  const blocks: string[] = [];
  // Use regex-based parsing for the body content
  // This handles the rendered markdown HTML output

  // Extract body if wrapped
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : html;

  // Split into top-level block elements
  // We need to parse this carefully
  const tempDoc = parseSimpleHtml(content.trim());

  for (let i = 0; i < tempDoc.length; i++) {
    const node = tempDoc[i];
    const block = convertNodeToBlock(node);
    if (block) blocks.push(block);
  }

  return blocks.join('\n\n');
}

/**
 * Simple HTML parser that splits content into top-level elements.
 */
function parseSimpleHtml(html: string): SimpleNode[] {
  const nodes: SimpleNode[] = [];
  let pos = 0;
  let textBuffer = '';

  while (pos < html.length) {
    // Skip whitespace between blocks
    if (/^\s*$/.test(html.slice(pos, pos + 1)) && !textBuffer) {
      pos++;
      continue;
    }

    if (html[pos] === '<') {
      // Flush text buffer
      if (textBuffer.trim()) {
        nodes.push({ tag: '#text', content: textBuffer.trim() });
        textBuffer = '';
      }

      // Check for comment
      if (html.slice(pos, pos + 4) === '<!--') {
        const endComment = html.indexOf('-->', pos);
        if (endComment !== -1) {
          pos = endComment + 3;
          continue;
        }
      }

      // Parse tag
      const tagMatch = html.slice(pos).match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
      if (!tagMatch) {
        textBuffer += html[pos];
        pos++;
        continue;
      }

      const tagName = tagMatch[1].toLowerCase();
      const isClosing = html[pos + 1] === '/';

      if (isClosing) {
        // Skip closing tags at top level
        const closeEnd = html.indexOf('>', pos);
        pos = closeEnd !== -1 ? closeEnd + 1 : pos + 1;
        continue;
      }

      // Void tags
      const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'wbr']);

      if (voidTags.has(tagName)) {
        const tagEnd = html.indexOf('>', pos);
        if (tagEnd === -1) break;
        const fullTag = html.slice(pos, tagEnd + 1);
        nodes.push({ tag: tagName, outerHtml: fullTag, attrs: parseAttrs(fullTag) });
        pos = tagEnd + 1;
        continue;
      }

      // Find matching close tag (handles nesting)
      const innerStart = html.indexOf('>', pos) + 1;
      if (innerStart === 0) break;
      const openTag = html.slice(pos, innerStart);
      const closeTag = '</' + tagName + '>';
      let depth = 1;
      let searchPos = innerStart;
      while (depth > 0 && searchPos < html.length) {
        const nextOpen = html.indexOf('<' + tagName, searchPos);
        const nextClose = html.indexOf(closeTag, searchPos);
        if (nextClose === -1) { searchPos = html.length; break; }
        if (nextOpen !== -1 && nextOpen < nextClose) {
          // Check it's an actual open tag, not just partial match
          const nextChar = html[nextOpen + tagName.length + 1];
          if (nextChar === '>' || nextChar === ' ' || nextChar === '/') {
            depth++;
          }
          searchPos = nextOpen + 1;
        } else {
          depth--;
          if (depth === 0) {
            const innerHTML = html.slice(innerStart, nextClose);
            const outerHtml = html.slice(pos, nextClose + closeTag.length);
            nodes.push({
              tag: tagName,
              innerHTML: innerHTML,
              outerHtml: outerHtml,
              openTag: openTag,
              attrs: parseAttrs(openTag),
            });
            pos = nextClose + closeTag.length;
            break;
          }
          searchPos = nextClose + 1;
        }
      }
      if (depth > 0) {
        // Unmatched tag — treat rest as content
        nodes.push({ tag: tagName, innerHTML: html.slice(innerStart), outerHtml: html.slice(pos), openTag: openTag, attrs: parseAttrs(openTag) });
        pos = html.length;
      }
    } else {
      textBuffer += html[pos];
      pos++;
    }
  }

  if (textBuffer.trim()) {
    nodes.push({ tag: '#text', content: textBuffer.trim() });
  }

  return nodes;
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /\b([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function escapeBlockContent(html: string): string {
  // Gutenberg blocks use HTML comments as delimiters, so we need the HTML content as-is
  return html;
}

function convertNodeToBlock(node: SimpleNode | null | undefined): string | null {
  if (!node) return null;
  const tag = node.tag;
  const innerHTML = node.innerHTML || node.content || '';

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const level = parseInt(tag[1], 10);
      return `<!-- wp:heading {"level":${level}} -->\n<${tag}>${innerHTML}</${tag}>\n<!-- /wp:heading -->`;
    }

    case 'p': {
      const trimmed = innerHTML.trim();
      if (!trimmed) return null;
      // Check if paragraph only contains an image
      if (/^\s*<img\b/.test(trimmed)) {
        return convertImageBlock(trimmed);
      }
      return `<!-- wp:paragraph -->\n<p>${trimmed}</p>\n<!-- /wp:paragraph -->`;
    }

    case '#text': {
      const trimmed = innerHTML.trim();
      if (!trimmed) return null;
      return `<!-- wp:paragraph -->\n<p>${trimmed}</p>\n<!-- /wp:paragraph -->`;
    }

    case 'ul': {
      return `<!-- wp:list -->\n<ul>${innerHTML}</ul>\n<!-- /wp:list -->`;
    }

    case 'ol': {
      return `<!-- wp:list {"ordered":true} -->\n<ol>${innerHTML}</ol>\n<!-- /wp:list -->`;
    }

    case 'blockquote': {
      return `<!-- wp:quote -->\n<blockquote>${innerHTML}</blockquote>\n<!-- /wp:quote -->`;
    }

    case 'pre': {
      // Extract code content, strip <code> wrapper
      let codeContent = innerHTML;
      const codeMatch = innerHTML.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      if (codeMatch) codeContent = codeMatch[1];
      // Unescape HTML entities in code
      codeContent = codeContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      return `<!-- wp:code -->\n<pre class="wp-block-code"><code>${codeContent}</code></pre>\n<!-- /wp:code -->`;
    }

    case 'table': {
      return `<!-- wp:table -->\n<figure class="wp-block-table"><table>${innerHTML}</table></figure>\n<!-- /wp:table -->`;
    }

    case 'hr': {
      return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`;
    }

    case 'img': {
      return convertImageBlock(node.outerHtml || '');
    }

    case 'a': {
      // Standalone link — wrap in paragraph
      return `<!-- wp:paragraph -->\n<p>${node.outerHtml}</p>\n<!-- /wp:paragraph -->`;
    }

    default: {
      // Wrap unknown elements in an HTML block
      if (node.outerHtml) {
        return `<!-- wp:html -->\n${node.outerHtml}\n<!-- /wp:html -->`;
      }
      if (innerHTML.trim()) {
        return `<!-- wp:html -->\n${innerHTML}\n<!-- /wp:html -->`;
      }
      return null;
    }
  }
}

function convertImageBlock(imgHtml: string): string {
  const srcMatch = imgHtml.match(/src\s*=\s*"([^"]*)"/i);
  const altMatch = imgHtml.match(/alt\s*=\s*"([^"]*)"/i);
  const src = srcMatch ? srcMatch[1] : '';
  const alt = altMatch ? altMatch[1] : '';

  const blockAttrs: Record<string, string> = {};
  if (alt) blockAttrs.alt = alt;
  const attrsJson = Object.keys(blockAttrs).length > 0 ? ' ' + JSON.stringify(blockAttrs) : '';

  return `<!-- wp:image${attrsJson} -->\n<figure class="wp-block-image"><img src="${src}" alt="${alt}"/></figure>\n<!-- /wp:image -->`;
}

export function extractMarkdownMediaUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const isExternal = (url: string) => /^(?:https?:|data:|blob:|\/\/)/i.test(url);

  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(html)) !== null) {
    if (!isExternal(m[1]) && !seen.has(m[1])) { seen.add(m[1]); urls.push(m[1]); }
  }
  return urls;
}

export function replaceMarkdownMediaUrls(content: string, urlMap: Map<string, string>): string {
  if (urlMap.size === 0) return content;
  const entries = Array.from(urlMap.entries()).sort((a, b) => b[0].length - a[0].length);
  const pattern = new RegExp(entries.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return content.replace(pattern, (match) => urlMap.get(match) ?? match);
}
