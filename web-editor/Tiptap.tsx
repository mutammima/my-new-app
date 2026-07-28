import Gapcursor from '@tiptap/extension-gapcursor';
import { EditorContent } from '@tiptap/react';
import React from 'react';

import { TenTapStartKit, useTenTap } from '@10play/tentap-editor/web';

import { CaretBridge } from './caret-bridge';
import { DrawingBridge } from './drawing-bridge';

/**
 * DuoNotes' own editor bundle (shipped to the WebView via `customSource`).
 *
 * NOTE: the native side filters bridges via `window.whiteListBridgeExtensions`,
 * so every bridge here must ALSO be passed to `useEditorBridge({
 * bridgeExtensions })` natively or `useTenTap` drops it.
 */
const bridges = [...TenTapStartKit, DrawingBridge, CaretBridge].filter(
  (e) => !window.whiteListBridgeExtensions || window.whiteListBridgeExtensions.includes(e.name),
);

export default function Tiptap() {
  const editor = useTenTap({
    bridges,
    // TenTapStartKit ships no Gapcursor, so an atom block (a drawing) at the
    // very end of the document would be impossible to place a caret after.
    tiptapOptions: { extensions: [Gapcursor] },
  });

  return (
    <EditorContent editor={editor} className={window.dynamicHeight ? 'dynamic-height' : undefined} />
  );
}
