import { useCallback, useEffect, useRef } from "react";
import { ParentToIframeMessage, IframeToParentMessage } from "@/types/editor";

export function usePostMessage(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onMessage: (msg: IframeToParentMessage) => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // In VS Code webview, origin checks are relaxed since the iframe uses srcdoc (null origin)
      if (!event.data || !event.data.type) return;
      // Filter out VS Code host messages (they have a different shape)
      const knownTypes = [
        "READY", "ELEMENT_SELECTED", "ELEMENT_DESELECTED", "ELEMENT_HOVERED",
        "DOM_TREE", "FULL_HTML", "SAVE_PATCHES", "CONTENT_CHANGED", "STYLE_CHANGED",
        "DOM_MUTATED", "DROP_ZONE_ACTIVE", "CSS_VARIABLES", "CSS_CLASSES",
        "ANIMATION_STYLES",
        "USED_FONTS",
        "IMAGE_UPLOADED",
        "PASTE_IMAGE",
        "REQUEST_LINK_URL",
        "IMAGE_CLICKED",
        "LINK_CLICKED",
      ];
      if (!knownTypes.includes(event.data.type)) return;
      onMessageRef.current(event.data as IframeToParentMessage);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const sendMessage = useCallback(
    (msg: ParentToIframeMessage) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(msg, "*");
      }
    },
    [iframeRef]
  );

  return { sendMessage };
}
