import { Ionicons } from '@expo/vector-icons';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  defaultEditorTheme,
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  useEditorContent,
} from '@10play/tentap-editor';

import { DrawingCanvas } from '@/components/drawing-canvas';
import { Spacing } from '@/constants/theme';
import { CaretBridge, onCaret } from '@/lib/caret-bridge';
import { DrawingBridge } from '@/lib/drawing-bridge';
import { editorHtml } from '@/lib/editor-html';
import { useTheme } from '@/hooks/use-theme';

/** Breathing room kept between the caret and the edge of the visible band. */
const CARET_MARGIN = 24;

/**
 * True WYSIWYG note body: a TipTap rich-text editor running in a WebView, so
 * text is styled (bold / italic / headings / lists) live as you type — no marks,
 * no preview toggle. Content is HTML, stored in the note's `body`.
 *
 * tentap's `theme` prop only styles the native WebView bezel + toolbar chrome —
 * it does NOT set in-document text/background color (confirmed: its own
 * `darkEditorCss` export is never auto-injected). We build and inject our own
 * stylesheet from the app's actual theme tokens so the editor content matches
 * the app (and stays readable in dark mode) instead of tentap's hardcoded
 * light-only defaults.
 */
export function RichNoteEditor({
  initialHtml,
  onChangeHtml,
  children,
}: {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
  /** Rendered above the note body, INSIDE the same scrollable region — so it
   *  scrolls away with the body instead of staying pinned (e.g. the note's
   *  Title input + shared banner, owned by the screen that renders us). */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDrawing, setShowDrawing] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [anchorOffset, setAnchorOffset] = useState({ x: 0, y: 0 });
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const richTextWrapperRef = useRef<View>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  // Set while waiting for the keyboard to fully close before opening
  // DrawingCanvas — see `openDrawing` below.
  const pendingOpenRef = useRef(false);
  // Mirrors `keyboardHeight > 0`, but as a ref so `openDrawing` can read the
  // CURRENT value synchronously without depending on a stale closure.
  const keyboardVisibleRef = useRef(false);

  // Track keyboard height directly rather than relying on KeyboardAvoidingView,
  // whose automatic shift-up doesn't reliably reach an absolutely-positioned
  // child nested this deep — this keeps the toolbar's position deterministic.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      keyboardVisibleRef.current = true;
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      keyboardVisibleRef.current = false;
      setKeyboardHeight(0);
    });
    // `keyboardDidHide` (unlike the Will-event above, used for snappy visual
    // repositioning) fires only once the OS has ACTUALLY finished the dismiss
    // animation — the only reliable signal that layout has settled, which the
    // screen measurement below needs to be correct. Measuring against
    // `keyboardWillHide` instead (which fires at the START of the dismiss
    // animation) was the bug: a drawing made right after typing could land at
    // the wrong spot, because the measurement raced the still-animating
    // keyboard-dismiss/re-layout.
    const onDidHide = Keyboard.addListener('keyboardDidHide', () => {
      if (pendingOpenRef.current) {
        pendingOpenRef.current = false;
        settleThenMeasure();
      }
    });
    return () => {
      onShow.remove();
      onHide.remove();
      onDidHide.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function settleThenMeasure() {
    // A single frame after `keyboardDidHide` isn't always enough — the event
    // itself can still land a frame or two before RN's own layout pass has
    // caught up with the resulting re-render. Two back-to-back frames is the
    // same "wait for native layout to actually settle" workaround already
    // used elsewhere in this file (the staggered CSS-injection retries) for
    // the same root cause: there's no single native "layout is now final"
    // event to await instead.
    requestAnimationFrame(() => requestAnimationFrame(measureAndShowDrawing));
  }

  function measureAndShowDrawing() {
    rootRef.current?.measureInWindow((rootX, rootY) => {
      richTextWrapperRef.current?.measureInWindow((rtX, rtY) => {
        setAnchorOffset({ x: rtX - rootX, y: rtY - rootY });
        setShowDrawing(true);
      });
    });
  }

  function openDrawing() {
    // Dismiss the keyboard/editor focus first — the sketch overlay takes
    // over the same screen space, not a separate modal.
    editor.blur();
    if (!keyboardVisibleRef.current) {
      settleThenMeasure();
    } else {
      pendingOpenRef.current = true;
      Keyboard.dismiss();
    }
  }

  // The toolbar CHROME (icons/background) is a separate theme from the
  // in-document CSS injected below — override it here so it matches the app
  // instead of tentap's hardcoded light-only defaults.
  const editorTheme = {
    ...defaultEditorTheme,
    webview: { backgroundColor: theme.background },
    toolbar: {
      ...defaultEditorTheme.toolbar,
      toolbarBody: {
        ...defaultEditorTheme.toolbar.toolbarBody,
        backgroundColor: theme.backgroundElement,
        borderTopColor: theme.backgroundSelected,
        borderBottomColor: theme.backgroundSelected,
      },
      toolbarButton: { ...defaultEditorTheme.toolbar.toolbarButton, backgroundColor: theme.backgroundElement },
      iconWrapper: { ...defaultEditorTheme.toolbar.iconWrapper, backgroundColor: theme.backgroundElement },
      iconWrapperActive: { ...defaultEditorTheme.toolbar.iconWrapperActive, backgroundColor: theme.accentSoft },
      icon: { ...defaultEditorTheme.toolbar.icon, tintColor: theme.text },
    },
  };

  const editor = useEditorBridge({
    autofocus: false,
    // Deliberately OFF. On iOS this makes tentap inject an inline
    // `padding-bottom: keyboardHeight + 10` onto `.ProseMirror`, which is
    // included in the border-box height it reports back as `document-height`.
    // With `dynamicHeight` that inflated number becomes the WebView's height,
    // so opening the keyboard silently grew the content by a whole keyboard —
    // which is what made the page lurch far past the text on every new line.
    // Keeping the caret visible is handled properly by CaretBridge below, and
    // the keyboard's own space is accounted for by the ScrollView's padding.
    avoidIosKeyboard: false,
    // Size the WebView to its real content height instead of flex-filling the
    // screen, so it has nothing left to scroll internally — the outer
    // ScrollView below becomes the ONE scroll container for Title+banner+body,
    // unifying them into a single continuous page (Apple Notes-style) instead
    // of the note body scrolling independently underneath a fixed header.
    dynamicHeight: true,
    initialContent: initialHtml || '',
    theme: editorTheme,
    // Our own editor bundle (web-editor/, built by `npm run build:editor`)
    // instead of tentap's prebuilt one. Phase 1 is byte-for-byte the same
    // extension set, so this is a no-op for users — it exists so we can add
    // custom nodes/plugins (drawing, partner cursors) that the prebuilt
    // bundle gives no way to inject.
    customSource: editorHtml,
    // MUST mirror the bundle's bridge list (web-editor/Tiptap.tsx). tentap
    // builds `whiteListBridgeExtensions` from these names and the web side
    // filters on it, so omitting a bridge here makes its node/plugin unknown
    // in the editor — a `drawing` would be stripped on load and autosaved away.
    bridgeExtensions: [...TenTapStartKit, DrawingBridge, CaretBridge],
  });

  const content = useEditorContent(editor, { type: 'html', debounceInterval: 500 });
  useEffect(() => {
    if (content !== undefined) onChangeHtml(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Re-inject whenever the theme changes (initial load, or a live Settings toggle).
  // `onLoad` on the underlying WebView is not a reliable "ready" signal here — it
  // can fire before the page's JS has actually finished setting up (or not fire
  // at all for a reused instance), silently dropping the injection. `injectCSS`
  // itself is a no-op if the WebView ref isn't ready yet, so it's safe to fire
  // repeatedly; retrying at staggered delays guarantees it lands.
  useEffect(() => {
    const css = `
      html, body, .ProseMirror {
        background-color: ${theme.background};
        color: ${theme.text};
        font-family: -apple-system, system-ui, sans-serif;
        font-size: 17px;
        line-height: 1.5;
      }
      .ProseMirror { padding: 4px 24px 40px; }
      .ProseMirror p.is-editor-empty:first-child::before {
        color: ${theme.textSecondary};
        content: attr(data-placeholder);
        float: left;
        pointer-events: none;
        height: 0;
      }
      a { color: ${theme.accent}; }
      blockquote {
        border-left: 3px solid ${theme.backgroundSelected};
        padding-left: 1rem;
        color: ${theme.textSecondary};
      }
      code, pre {
        background-color: ${theme.backgroundElement};
        border-radius: 4px;
      }
      hr { border-color: ${theme.backgroundSelected}; }
      ::selection { background-color: ${theme.accentSoft}; }
      ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }
      ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }
      ul[data-type="taskList"] li > label {
        flex-shrink: 0;
        margin-top: 0.2rem;
        user-select: none;
      }
      ul[data-type="taskList"] li > div {
        flex: 1;
      }
      ul[data-type="taskList"] li > div > p {
        margin: 0;
      }
      ul[data-type="taskList"] li[data-checked="true"] > div > p {
        text-decoration: line-through;
        color: ${theme.textSecondary};
      }
      ul[data-type="taskList"] input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: ${theme.accent};
      }
    `;
    const inject = () => editor.injectCSS(css, 'duonotes-theme');
    inject();
    const timers = [100, 400, 900, 1800].map((ms) => setTimeout(inject, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.background, theme.text, theme.accent, theme.textSecondary, theme.backgroundElement, theme.backgroundSelected]);

  // Keep the caret visible above the keyboard.
  //
  // Previous attempts keyed off the editor's CONTENT HEIGHT and scrolled to
  // the bottom of the document. That was wrong twice over: pressing Enter
  // mid-note grows the document, so it yanked the view to the very end,
  // far away from where the user was actually typing — the reported "text
  // goes off the screen" — and the supposedly-bounded target it computed was
  // algebraically identical to plain `scrollToEnd()`, so replacing one with
  // the other changed nothing at all.
  //
  // The document's height simply doesn't say where the caret is. CaretBridge
  // reports the caret's real on-screen rect instead, and only when the editor
  // actually wants it revealed. We then nudge — never jump — by the minimum
  // needed to bring it inside the band that isn't covered by the keyboard.
  const scrollYRef = useRef(0);
  useEffect(() => {
    return onCaret(({ top, bottom }) => {
      if (showDrawing) return;
      const visibleHeight = scrollViewHeight - keyboardHeight - toolbarHeight;
      if (visibleHeight <= 0) return;

      // The WebView starts at `headerHeight` within the scroll content, and
      // the caret rect is relative to the WebView's own viewport.
      const caretTop = headerHeight + top;
      const caretBottom = headerHeight + bottom;
      const bandTop = scrollYRef.current;
      const bandBottom = bandTop + visibleHeight;

      let targetY: number | null = null;
      if (caretBottom > bandBottom - CARET_MARGIN) {
        targetY = caretBottom - visibleHeight + CARET_MARGIN;
      } else if (caretTop < bandTop + CARET_MARGIN) {
        targetY = caretTop - CARET_MARGIN;
      }
      // Already comfortably visible — leave the scroll position alone. This is
      // what stops ordinary typing from moving the page around at all.
      if (targetY === null) return;

      scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
    });
  }, [showDrawing, scrollViewHeight, keyboardHeight, toolbarHeight, headerHeight]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    // Deliberately DON'T pass base64 here: base64-encoding a full-resolution
    // (12MP+) photo runs synchronously while the picker is still up, which
    // freezes it on older phones so Cancel/X appears dead. `quality` still
    // compresses the file the picker writes; we then read that file's base64
    // after the picker has dismissed, off its critical path.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
    if (base64) editor.setImage(`data:image/jpeg;base64,${base64}`);
  }

  return (
    <View style={styles.flex} ref={rootRef}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        onLayout={(e) => setScrollViewHeight(e.nativeEvent.layout.height)}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        // Leaves room to scroll the true end of the note clear of the keyboard
        // and toolbar, so the last lines are always reachable rather than
        // stranded underneath them.
        contentContainerStyle={{ paddingBottom: showDrawing ? 0 : keyboardHeight + toolbarHeight }}
        // Apple Notes locks the page while its markup tool is active; this
        // also keeps the scroll offset stable for the duration of a sketch,
        // which matters once a drawing's screen position needs to map back
        // to a document position (see DrawingCanvas/onExit).
        scrollEnabled={!showDrawing}
        keyboardShouldPersistTaps="handled"
        // We position for the keyboard ourselves (the padding above plus
        // CaretBridge-driven scrolling); letting UIKit also inset would
        // double-count and fight those adjustments.
        automaticallyAdjustKeyboardInsets={false}>
        <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>{children}</View>
        <View ref={richTextWrapperRef}>
          <RichText editor={editor} />
        </View>
      </ScrollView>
      {!showDrawing && (
        <View
          onLayout={(e) => setToolbarHeight(e.nativeEvent.layout.height)}
          style={[
            styles.toolbar,
            {
              bottom: keyboardHeight,
              paddingBottom: keyboardHeight === 0 ? insets.bottom : 0,
              // This container must be filled, not transparent. The
              // paddingBottom above reserves the home-indicator inset, and
              // only the rows INSIDE it have their own background — so
              // without this the reserved strip was see-through and the note
              // content showed underneath the bar.
              backgroundColor: theme.backgroundElement,
            },
          ]}>
          <View style={[styles.attachRow, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <Pressable onPress={pickImage} hitSlop={8} style={styles.attachButton}>
              <Ionicons name="image-outline" size={20} color={theme.text} />
            </Pressable>
            <Pressable onPress={openDrawing} hitSlop={8} style={styles.attachButton}>
              <Ionicons name="brush-outline" size={20} color={theme.text} />
            </Pressable>
            {keyboardHeight > 0 && (
              <Pressable
                onPress={() => {
                  // Drop focus (and the keyboard) without leaving the note.
                  editor.blur();
                  Keyboard.dismiss();
                }}
                hitSlop={8}
                style={[styles.attachButton, styles.dismissKeyboard]}>
                <Ionicons name="chevron-down-circle-outline" size={22} color={theme.accent} />
              </Pressable>
            )}
          </View>
          <Toolbar editor={editor} hidden={false} />
        </View>
      )}
      {showDrawing && (
        <DrawingCanvas
          anchorOffset={anchorOffset}
          onExit={(drawing) => {
            if (drawing) editor.setDrawing(drawing);
            setShowDrawing(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { position: 'absolute', width: '100%', bottom: 0 },
  attachRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachButton: { padding: Spacing.one },
  dismissKeyboard: { marginLeft: 'auto' },
});
