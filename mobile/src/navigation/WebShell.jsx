/**
 * WebShell — Telegram Premium / Discord style 3-pane desktop layout.
 *
 *  ┌─────┬──────────────┬──────────────────────────────────────┐
 *  │ rail│ chats list   │ active conversation (right pane)     │
 *  │ 72  │   360 px     │   flex                               │
 *  └─────┴──────────────┴──────────────────────────────────────┘
 *
 * Right pane is independent: it owns its own NavigationContainer +
 * Stack so ChatScreen can push ChatInfo / Profile etc. without ever
 * disturbing the persistent sidebar on the left. The bridge is
 * SelectedChatContext — the sidebar publishes a chat there, the right
 * pane subscribes and remounts its stack with the new params.
 *
 * On mobile or narrow web, this component is a no-op pass-through.
 */
import React, { useMemo } from 'react';
import {
  Platform,
  View,
  useWindowDimensions,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
  DefaultTheme,
  useNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { BASE_URL } from '../../config/api';
import { useSelectedChat } from './SelectedChatContext';

import ChatScreen from '../screens/chats/ChatScreen';
import ChatInfoScreen from '../screens/chats/ChatInfoScreen';
import ChatMediaScreen from '../screens/chats/ChatMediaScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const RAIL_WIDTH = 72;
const LIST_WIDTH = 360;
const BREAKPOINT = 900;

/* ── Left rail ─────────────────────────────────────────────────── */
function NavRail({ colors, isDark }) {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const avatarUri = user?.avatar_url ? `${BASE_URL}${user.avatar_url}` : null;
  const initial = (user?.display_name || '?').charAt(0).toUpperCase();
  const palette = ['#E03A3E', '#F58D2E', '#4DC247', '#50ABF1', '#6157DD', '#B36BB7', '#FA8072', '#5DADE2'];
  const avatarBg = palette[(user?.display_name?.charCodeAt(0) ?? 0) % palette.length];

  const Icon = ({ name, onPress, active }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[railS.iconBtn, active && { backgroundColor: isDark ? 'rgba(82,136,193,0.18)' : 'rgba(82,136,193,0.12)' }]}
      activeOpacity={0.6}
    >
      <Ionicons name={name} size={22} color={active ? colors.primary : colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[railS.rail, { backgroundColor: isDark ? '#0B1018' : '#F4F7FB', borderRightColor: colors.divider }]}>
      <View style={[railS.brand, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
        <Text style={railS.brandText}>S</Text>
      </View>
      <View style={railS.iconStack}>
        <Icon name="chatbubble-ellipses" active onPress={() => navigation.navigate?.('Main', { screen: 'Chatlar' })} />
        <Icon name="people-outline" onPress={() => navigation.navigate?.('Main', { screen: 'Kontaktlar' })} />
        <Icon name="call-outline" onPress={() => navigation.navigate?.('Main', { screen: 'Qongiroqlar' })} />
        <Icon name="settings-outline" onPress={() => navigation.navigate?.('Settings')} />
      </View>
      <View style={railS.bottomStack}>
        <TouchableOpacity style={railS.avatarBtn} activeOpacity={0.7} onPress={() => navigation.navigate?.('Profile')}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={railS.avatarImg} />
          ) : (
            <View style={[railS.avatarImg, { backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={railS.avatarLetter}>{initial}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const railS = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 19, letterSpacing: 0.5 },
  iconStack: { flex: 1, gap: 6, alignItems: 'center', paddingTop: 4 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomStack: { alignItems: 'center', gap: 8 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarLetter: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

/* ── Right pane: independent navigator ─────────────────────────── */
const RightStack = createNativeStackNavigator();

function RightPaneEmpty({ colors }) {
  return (
    <View style={emptyS.wrap}>
      <View style={[emptyS.iconWrap, { backgroundColor: colors.surface }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={54} color={colors.primary} />
      </View>
      <Text style={[emptyS.title, { color: colors.text }]}>S Chat</Text>
      <Text style={[emptyS.sub, { color: colors.textSecondary }]}>
        Suhbatni boshlash uchun chap tomondan chat tanlang
      </Text>
    </View>
  );
}

const emptyS = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  sub: { fontSize: 14, fontWeight: '400', textAlign: 'center', maxWidth: 320, lineHeight: 20 },
});

function RightPane({ selectedChat, colors, isDark }) {
  // Independent navigation tree. The `key` re-mounts the stack whenever
  // the user picks a different chat so initialParams are always fresh.
  const theme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.chatBackground || colors.background,
        card: colors.headerBackground,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [colors, isDark]);

  if (!selectedChat) {
    return <RightPaneEmpty colors={colors} />;
  }

  // React Navigation 7 deprecated the `independent` prop. The correct
  // pattern is to wrap a nested NavigationContainer in
  // <NavigationIndependentTree>, which tells the library this subtree
  // does NOT participate in the outer navigation tree. Without this
  // wrapper the app crashes with "Looks like you have nested a
  // 'NavigationContainer' inside another …".
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        key={selectedChat.chatId}
        theme={theme}
      >
        <RightStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.headerBackground },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.chatBackground || colors.background },
          }}
        >
          <RightStack.Screen
            name="Chat"
            component={ChatScreen}
            initialParams={selectedChat}
            options={{
              title: selectedChat.chatName ?? 'Chat',
              headerBackTitle: '',
            }}
          />
          <RightStack.Screen name="ChatInfo" component={ChatInfoScreen} options={{ title: 'Chat info' }} />
          <RightStack.Screen name="ChatMedia" component={ChatMediaScreen} options={{ title: 'Media' }} />
          <RightStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        </RightStack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

/* ── Default export ────────────────────────────────────────────── */
export default function WebShell({ children }) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { selectedChat } = useSelectedChat();
  const wide = Platform.OS === 'web' && width >= BREAKPOINT;
  if (!wide) return children;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <NavRail colors={colors} isDark={isDark} />
      <View
        style={{
          width: LIST_WIDTH,
          borderRightColor: colors.divider,
          borderRightWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.background,
        }}
      >
        {children}
      </View>
      <View style={{ flex: 1, backgroundColor: colors.chatBackground || colors.background }}>
        <RightPane selectedChat={selectedChat} colors={colors} isDark={isDark} />
      </View>
    </View>
  );
}
