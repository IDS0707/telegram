/**
 * WebShell — Telegram / Discord style 3-panel layout for desktop web.
 *
 *  ┌─────┬──────────────┬──────────────────────────────────────┐
 *  │ rail│ chats list   │ active chat (existing navigator)     │
 *  │ 72  │   360 px     │   flex                               │
 *  └─────┴──────────────┴──────────────────────────────────────┘
 *
 * On mobile or narrow web, this component is a no-op pass-through —
 * the existing single-column navigator renders as before.
 */
import React from 'react';
import { Platform, View, useWindowDimensions, TouchableOpacity, Text, Image, StyleSheet } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { BASE_URL } from '../../config/api';

const RAIL_WIDTH = 72;
const LIST_WIDTH = 360;
const BREAKPOINT = 900;

function NavRail({ colors, isDark }) {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const avatarUri = user?.avatar_url ? `${BASE_URL}${user.avatar_url}` : null;
  const initial = (user?.display_name || '?').charAt(0).toUpperCase();
  const palette = ['#E03A3E', '#F58D2E', '#4DC247', '#50ABF1', '#6157DD', '#B36BB7', '#FA8072', '#5DADE2'];
  const avatarBg = palette[(user?.display_name?.charCodeAt(0) ?? 0) % palette.length];

  const Icon = ({ name, onPress, badge }) => (
    <TouchableOpacity onPress={onPress} style={railS.iconBtn} activeOpacity={0.6}>
      <Ionicons name={name} size={22} color={colors.textSecondary} />
      {badge ? <View style={[railS.iconDot, { backgroundColor: colors.primary }]} /> : null}
    </TouchableOpacity>
  );

  return (
    <View style={[railS.rail, { backgroundColor: isDark ? '#0B1018' : '#F4F7FB', borderRightColor: colors.divider }]}>
      <View style={[railS.brand, { backgroundColor: colors.primary }]}>
        <Text style={railS.brandText}>S</Text>
      </View>
      <View style={railS.iconStack}>
        <Icon name="chatbubble-ellipses" onPress={() => navigation.navigate?.('Main', { screen: 'Chatlar' })} />
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  iconStack: { flex: 1, gap: 4, alignItems: 'center', paddingTop: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  bottomStack: { alignItems: 'center', gap: 8 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarLetter: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

/**
 * Default export. Wraps `children` (the root NavigationContainer's content)
 * with a 3-pane layout when running on a wide-enough web viewport.
 *
 * Note: ChatsListScreen is NOT rendered here as a separate instance —
 * we just narrow the existing navigator to the middle column. That keeps
 * a single source of truth for navigation state and avoids the React
 * Navigation single-NavigationContainer constraint. The "active chat"
 * area on the right will be tackled in a follow-up pass — for now, the
 * navigator simply renders narrower in the middle column with a static
 * placeholder beside it.
 */
export default function WebShell({ children }) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const wide = Platform.OS === 'web' && width >= BREAKPOINT;
  if (!wide) return children;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <NavRail colors={colors} isDark={isDark} />
      <View style={{ width: LIST_WIDTH, borderRightColor: colors.divider, borderRightWidth: StyleSheet.hairlineWidth }}>
        {children}
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chatBackground || colors.background }}>
        <View style={{ alignItems: 'center', gap: 12, opacity: 0.55 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={64} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '500' }}>
            Suhbatni boshlash uchun chap tomondan tanlang
          </Text>
        </View>
      </View>
    </View>
  );
}
