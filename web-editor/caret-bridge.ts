import { Extension } from '@tiptap/core';
import { BridgeExtension, Plugin, PluginKey } from '@10play/tentap-editor/web';

/** Where the caret is, in WebView-viewport (CSS px) coordinates. */
export type CaretRect = { top: number; bottom: number };

export enum CaretActionType {
  Reveal = 'caret-reveal',
}

/**
 * Tells the native side where the caret is so it can scroll the OUTER
 * ScrollView to reveal it.
 *
 * Why this is needed at all: with tentap's `dynamicHeight` the WebView is
 * sized to its full content, so the document has nothing to scroll inside —
 * ProseMirror's own `scrollIntoView` becomes inert and the caret can sit under
 * the keyboard. The only thing that can actually scroll is the React Native
 * ScrollView wrapping the WebView, and it has no idea where the caret is.
 *
 * Why `handleScrollToSelection` and not a transaction/selection listener:
 * it fires precisely when ProseMirror wants to reveal the selection — the real
 * "keep the caret visible" moment — instead of on every keystroke. That avoids
 * forcing a layout read (`coordsAtPos`) on each character, and avoids the
 * previous approach's central bug, which reacted to *document height changes*
 * and therefore scrolled to the bottom of the document even when the caret was
 * somewhere in the middle.
 */
function reportCaret(view: { coordsAtPos: (pos: number) => { top: number; bottom: number }; state: any }) {
  try {
    const { head } = view.state.selection;
    const coords = view.coordsAtPos(head);
    // Deliberately raw client coords: the caret's on-screen position inside
    // the WebView is exactly what the native side needs to map into its own
    // scroll space. Adding any internal scroll offset would double-count,
    // because the WebView's frame already moves with the outer ScrollView.
    const payload: CaretRect = { top: coords.top, bottom: coords.bottom };
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: CaretActionType.Reveal, payload }),
    );
  } catch {
    // coordsAtPos throws if the position isn't currently rendered; nothing
    // useful to report in that case.
  }
}

const CaretExtension = Extension.create({
  name: 'caret',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('caretReveal'),
        props: {
          handleScrollToSelection: (view: any) => {
            reportCaret(view);
            // Claim the scroll: ProseMirror's own attempt can't help here
            // (nothing scrollable inside the document) and letting it run can
            // fight the native scroll we're about to do.
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * NOTE: this bridge MUST carry a real `tiptapExtension`. A bridge without one
 * makes tentap's `configureTiptapExtensionsOnRunTime` return `[undefined]`,
 * and its `.filter()` runs on the outer array rather than its contents — so a
 * literal `undefined` reaches tiptap's extension list and blows up
 * `flattenExtensions` at mount. An extension is needed here anyway, to host
 * the ProseMirror plugin above.
 */
export type CaretMessage = {
  type: CaretActionType.Reveal;
  payload: CaretRect;
};

export const CaretBridge = new BridgeExtension<object, object, CaretMessage>({
  tiptapExtension: CaretExtension,
  extendEditorState: () => ({}),
});
