import type { SavePatchesPayload } from "./hostMessages";

export interface DomNode {
  path: string;
  tagName: string;
  id: string;
  classList: string[];
  children: DomNode[];
  hasTextContent: boolean;
}

export interface StyleSnapshot {
  path: string;
  tagName: string;
  id: string;
  classList: string[];
  selectedClass: string | null;
  selectedSubSelector: string | null;
  selectedSelector: string | null;
  inline: Record<string, string>;
  classRules: Record<string, string>;
  idRules: Record<string, string>;
  computed: Record<string, string>;
}

export interface DescendantStyleInfo extends StyleSnapshot {
  depth: number;
}

export interface StyleInfo {
  path: string;
  tagName: string;
  id: string;
  classList: string[];
  selectedClass: string | null;
  selectedSubSelector: string | null;
  selectedSelector: string | null;
  subSelectorsByClass: Record<string, string[]>;
  attributes: Record<string, string>;
  inline: Record<string, string>;
  classRules: Record<string, string>;
  idRules: Record<string, string>;
  computed: Record<string, string>;
  responsiveRules?: Record<string, Record<string, string>>;
  descendants?: DescendantStyleInfo[];
}

export interface BlockTemplate {
  id: string;
  label: string;
  icon: string;
  html: string;
  category: "structure" | "content" | "media";
}

export interface TemplateItem {
  id: number;
  name: string;
  category: string;
  tag: "pro" | "free";
  video_minimal: string;
  video_full: string;
  html?: string;
}

export interface TemplatesResponse {
  templates: TemplateItem[];
  total: number;
  page: number;
  pages: number;
  categories: string[];
  error?: string;
}

export interface FileInfo {
  slug: string;
  filename: string;
  modifiedAt: string;
  sizeBytes: number;
}

export type SaveStatus = "saved" | "saving" | "unsaved";

export interface DevicePreset {
  label: string;
  width: number | null;
  icon: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { label: "Desktop", width: null, icon: "Monitor" },
  { label: "Tablet", width: 768, icon: "Tablet" },
  { label: "Mobile", width: 375, icon: "Smartphone" },
];

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    id: "heading",
    label: "Heading",
    icon: "Heading",
    html: "<h2>New Heading</h2>",
    category: "content",
  },
  {
    id: "paragraph",
    label: "Paragraph",
    icon: "AlignLeft",
    html: "<p>New paragraph text...</p>",
    category: "content",
  },
  {
    id: "button",
    label: "Button",
    icon: "MousePointerClick",
    html: '<style id="gl-button-styles">.gl-button{display:inline-block;padding:12px 24px;background:#3498db;color:white;text-decoration:none;border-radius:4px;}</style><a href="#" class="gl-button">Button</a>',
    category: "content",
  },
  {
    id: "image",
    label: "Image",
    icon: "Image",
    html: '<img src="https://placehold.co/600x300" alt="Placeholder" style="max-width:100%;height:auto;" />',
    category: "media",
  },
  {
    id: "section",
    label: "Section",
    icon: "LayoutTemplate",
    html: '<style id="gl-section-styles">.gl-section{display:flex;justify-content:center;flex-direction:column;align-items:center;padding-right:var(--gl--spacing--side, min(3vw, 20px));padding-left:var(--gl--spacing--side, min(3vw, 20px));padding-top:var(--gl--spacing--top, 0px);padding-bottom:var(--gl--spacing--bottom, 0px);margin-top:0px;margin-bottom:0px;position:relative;}.gl-content-wrap{max-width:100%;width:var(--gl--style--global--wide-size, 1200px);}</style><section class="gl-section alignfull" data-type="section-component"><div class="gl-content-wrap" data-type="content-area-component">Some text</div></section>',
    category: "structure",
  },
  {
    id: "container",
    label: "Container",
    icon: "Square",
    html: '<div class="gl-container">Container</div>',
    category: "structure",
  },
];

// Message protocol types for postMessage communication
export interface CssVariable {
  name: string;
  value: string;
  computed: string;
}

export interface CssClassInfo {
  name: string;
  selector: string;
  properties: Record<string, string>;
}

export interface UsedFont {
  family: string;
  count: number;
  sources: { css: boolean; inline: boolean; variable: boolean };
  hasFontFace: boolean;
  googleLinkHrefs: string[];
}

export type ParentToIframeMessage =
  | { type: "SELECT_ELEMENT"; path: string }
  | { type: "UPDATE_STYLE"; path: string; property: string; value: string; className?: string | null; selector?: string | null; forceInline?: boolean }
  | { type: "UPDATE_CLASS_STYLE"; selector: string; property: string; value: string }
  | { type: "DELETE_ELEMENT"; path: string }
  | { type: "CHANGE_TAG"; path: string; newTag: string }
  | { type: "INSERT_BLOCK"; parentPath: string; position: number; html: string }
  | { type: "IMPORT_TEMPLATE"; html: string; templateId: string }
  | { type: "MOVE_ELEMENT"; sourcePath: string; targetPath: string; position: number }
  | { type: "GET_DOM_TREE" }
  | { type: "GET_FULL_HTML" }
  | { type: "GET_CSS_VARIABLES" }
  | { type: "GET_CSS_CLASSES" }
  | { type: "ADD_CLASS"; path: string; className: string }
  | { type: "REMOVE_CLASS"; path: string; className: string }
  | { type: "REMOVE_CLASS_WITH_STYLES"; path: string; className: string }
  | { type: "RENAME_CLASS"; path: string; oldClassName: string; newClassName: string }
  | { type: "ENABLE_CONTENTEDITABLE"; path: string }
  | { type: "DISABLE_CONTENTEDITABLE"; path: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "DRAG_OVER"; x: number; y: number; html: string }
  | { type: "DRAG_END" }
  | { type: "DROP"; html: string }
  | { type: "CONFIG"; styleMode: string; deviceWidth?: number | null }
  | { type: "INJECT_KEYFRAMES"; name: string; css: string }
  | { type: "INJECT_LAYOUT_CSS"; path: string; css: string }
  | { type: "UPDATE_ATTRIBUTE"; path: string; name: string; value: string; displayValue?: string }
  | { type: "REMOVE_ATTRIBUTE"; path: string; name: string }
  | { type: "CREATE_VARIABLE"; name: string; value: string }
  | { type: "UPDATE_DESIGN_VARIABLE"; name: string; value: string }
  | { type: "DELETE_DESIGN_VARIABLE"; name: string }
  | { type: "MIGRATE_DESIGN_VARIABLES" }
  | { type: "INJECT_ANIMATION_CSS"; className: string; css: string }
  | { type: "INJECT_OBSERVER_SCRIPT"; enable: boolean }
  | { type: "GET_ANIMATION_STYLES" }
  | { type: "SET_ACTIVE_CLASS"; path: string; className: string | null; subSelector?: string | null }
  | { type: "HIGHLIGHT_ELEMENT"; path: string | null }
  | { type: "CONVERT_TAILWIND_CSS" }
  | { type: "MD_FORMAT"; action: string; value?: string }
  | { type: "MD_INSERT_IMAGE"; relativePath: string; webviewUri: string }
  | { type: "MD_INSERT_LINK"; url: string; linkText: string }
  | { type: "MD_UPDATE_IMAGE"; imgId: string; src: string; displayValue?: string }
  | { type: "MD_UPDATE_LINK"; linkId: string; href: string }
  | { type: "REPLACE_DOCUMENT"; html: string; rawHtml: string }
  | { type: "GET_USED_FONTS" }
  | { type: "REPLACE_FONT"; oldFamily: string; newFamily: string; newStack?: string; googleFontUrl?: string; fontFaceCss?: string }
  | { type: "REMOVE_FONT"; family: string };

export type IframeToParentMessage =
  | { type: "READY" }
  | { type: "ELEMENT_SELECTED"; data: StyleInfo }
  | { type: "ELEMENT_DESELECTED" }
  | { type: "ELEMENT_HOVERED"; path: string; rect: { top: number; left: number; width: number; height: number } }
  | { type: "DOM_TREE"; tree: DomNode }
  | { type: "FULL_HTML"; html: string }
  | { type: "SAVE_PATCHES"; patches: SavePatchesPayload }
  | { type: "CONTENT_CHANGED"; path: string; newContent: string }
  | { type: "STYLE_CHANGED"; path: string; data: StyleInfo }
  | { type: "DOM_MUTATED" }
  | { type: "CSS_VARIABLES"; variables: CssVariable[] }
  | { type: "CSS_CLASSES"; classes: CssClassInfo[] }
  | { type: "IMAGE_UPLOADED"; relativePath: string }
  | { type: "PASTE_IMAGE"; dataBase64: string; mimeType: string }
  | { type: "REQUEST_LINK_URL"; linkText: string }
  | { type: "IMAGE_CLICKED"; imgId: string; currentSrc: string }
  | { type: "LINK_CLICKED"; linkId: string; currentHref: string; linkText: string }
  | { type: "DROP_ZONE_ACTIVE"; path: string; position: "before" | "after" | "inside" }
  | { type: "ANIMATION_STYLES"; styles: { className: string; css: string }[] }
  | { type: "EDITOR_WARNING"; code: string; message: string }
  | { type: "TAILWIND_CONVERT_RESULT"; success: boolean; error?: string; rulesCount?: number }
  | { type: "HAS_TAILWIND_CDN"; hasTailwindCdn: boolean }
  | { type: "USED_FONTS"; fonts: UsedFont[] };
