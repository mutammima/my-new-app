import { BridgeExtension } from '@10play/tentap-editor';

/** Caret position in WebView-viewport (CSS px) coordinates. */
export type CaretRect = { top: number; bottom: number };

export enum CaretActionType {
  Reveal = 'caret-reveal',
}

export type CaretMessage = {
  type: CaretActionType.Reveal;
  payload: CaretRect;
};

/**
 * Native half of the caret bridge. The web half (web-editor/caret-bridge.ts)
 * posts the caret's on-screen rect whenever ProseMirror wants the selection
 * revealed; `RichNoteEditor` subscribes via `onCaret` and scrolls its
 * ScrollView so the caret sits above the keyboard.
 *
 * The bridge name ('caret', from the extension) must match on both sides —
 * tentap filters web-side bridges through `window.whiteListBridgeExtensions`,
 * which it builds from the native list.
 */
let listener: ((rect: CaretRect) => void) | null = null;

/** Register the (single) consumer of caret updates. Returns an unsubscribe. */
export function onCaret(fn: (rect: CaretRect) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export const CaretBridge = new BridgeExtension<object, object, CaretMessage>({
  forceName: 'caret',
  onEditorMessage: (message) => {
    if (message.type === CaretActionType.Reveal && listener) {
      listener(message.payload);
    }
    return false;
  },
  extendEditorState: () => ({}),
});
