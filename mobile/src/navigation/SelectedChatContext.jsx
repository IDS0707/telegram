/**
 * SelectedChatContext — drives the desktop 3-pane layout.
 *
 * On web ≥ 900 px the chat list never goes away: instead of navigating,
 * tapping a chat publishes its identity here and the right-hand pane
 * subscribes and renders ChatScreen for it. On mobile / narrow web this
 * context's `isWebWide` is false, so callers fall back to standard
 * stack navigation.
 *
 * The selected chat object mirrors the route.params shape that
 * ChatScreen already expects:
 *   { chatId, chatName, chatType, otherUserId, chatAvatar }
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

const DESKTOP_BREAKPOINT = 900;

const SelectedChatCtx = createContext({
  selectedChat: null,
  setSelectedChat: () => {},
  clearSelectedChat: () => {},
  isWebWide: false,
});

export function SelectedChatProvider({ children }) {
  const [selectedChat, setSelected] = useState(null);
  const { width } = useWindowDimensions();
  const isWebWide = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const setSelectedChat = useCallback((next) => {
    setSelected(next ? { ...next } : null);
  }, []);
  const clearSelectedChat = useCallback(() => setSelected(null), []);

  const value = useMemo(
    () => ({ selectedChat, setSelectedChat, clearSelectedChat, isWebWide }),
    [selectedChat, setSelectedChat, clearSelectedChat, isWebWide],
  );

  return <SelectedChatCtx.Provider value={value}>{children}</SelectedChatCtx.Provider>;
}

export function useSelectedChat() {
  return useContext(SelectedChatCtx);
}
