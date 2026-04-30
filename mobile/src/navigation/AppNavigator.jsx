import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  ScrollView,
  Image,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { BASE_URL } from '../../config/api';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ChatsListScreen from '../screens/chats/ChatsListScreen';
import ChatScreen from '../screens/chats/ChatScreen';
import ChatInfoScreen from '../screens/chats/ChatInfoScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import CallScreen from '../screens/calls/CallScreen';
import ContactsScreen from '../screens/contacts/ContactsScreen';
import CallsHistoryScreen from '../screens/calls/CallsHistoryScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import SavedMessagesScreen from '../screens/chats/SavedMessagesScreen';
import ScheduledMessagesScreen from '../screens/chats/ScheduledMessagesScreen';
import ChannelsListScreen from '../screens/channels/ChannelsListScreen';
import ChannelScreen from '../screens/channels/ChannelScreen';
import ChatFoldersScreen from '../screens/settings/ChatFoldersScreen';
import TwoFactorScreen from '../screens/settings/TwoFactorScreen';
import PrivacySettingsScreen from '../screens/settings/PrivacySettingsScreen';
import AppLockScreen from '../screens/settings/AppLockScreen';
// New screens
import SessionsScreen from '../screens/settings/SessionsScreen';
import SecretChatScreen from '../screens/chats/SecretChatScreen';
import GroupCallScreen from '../screens/calls/GroupCallScreen';
import MessageSearchScreen from '../screens/chats/MessageSearchScreen';
import GroupAdminScreen from '../screens/chats/GroupAdminScreen';
import CreateGroupScreen from '../screens/chats/CreateGroupScreen';
import CreateChannelScreen from '../screens/channels/CreateChannelScreen';
import ChatMediaScreen from '../screens/chats/ChatMediaScreen';
import ConnectionBanner from '../components/common/ConnectionBanner';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

function DrawerContent({ onClose, navigation }) {
  const stackNav = useNavigation();
  const { user, logout } = useAuthStore();
  const { colors, isDark, setMode } = useTheme();
  const { t, lang, setLang } = useI18n();

  const avatarUri = user?.avatar_url ? `${BASE_URL}${user.avatar_url}` : null;
  const avatarLetter = user?.display_name?.charAt(0)?.toUpperCase() ?? '?';
  const avatarColors = ['#E57373','#64B5F6','#81C784','#FFB74D','#BA68C8','#4DB6AC','#F06292','#4DD0E1'];
  const avatarBg = avatarColors[(user?.display_name?.charCodeAt(0) ?? 0) % avatarColors.length];

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('logOutConfirm'))) logout();
      return;
    }
    Alert.alert(t('logOut'), t('logOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logOut'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  const navigateTo = (screen) => {
    onClose();
    setTimeout(() => stackNav.navigate(screen), 280);
  };

  const Row = ({ icon, label, color, onPress, right }) => (
    <TouchableOpacity
      style={[styles.drawerRow, { borderBottomColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={[styles.drawerIconWrap, { backgroundColor: (color ?? colors.primary) + '22' }]}>
        <Ionicons name={icon} size={20} color={color ?? colors.primary} />
      </View>
      <Text style={[styles.drawerRowText, { color: colors.text, flex: 1 }]}>{label}</Text>
      {right}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.drawer, { backgroundColor: colors.background }]}>
      {/* ── Telegram-style blue header ── */}
      <TouchableOpacity
        style={[styles.drawerHeader, { backgroundColor: colors.primary }]}
        onPress={() => navigateTo('Profile')}
        activeOpacity={0.85}
      >
        <View style={styles.drawerHeaderTop}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.drawerAvatar} />
          ) : (
            <View style={[styles.drawerAvatar, { backgroundColor: avatarBg, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={styles.drawerAvatarLetter}>{avatarLetter}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); setMode(isDark ? 'light' : 'dark'); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.drawerNightBtn}
          >
            <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.drawerName}>{user?.display_name ?? 'Foydalanuvchi'}</Text>
        <Text style={styles.drawerSub}>{user?.phone ?? (user?.username ? `@${user.username}` : '')}</Text>
      </TouchableOpacity>

      <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>

        {/* Quick actions */}
        <Row icon="people-outline"        label="Yangi guruh"              onPress={() => { onClose(); setTimeout(() => stackNav.navigate('CreateGroup'), 280); }} />
        <Row icon="megaphone-outline"      label="Yangi kanal"              onPress={() => { onClose(); setTimeout(() => stackNav.navigate('CreateChannel'), 280); }} />
        <Row icon="lock-closed-outline"    label="Yangi maxfiy chat"        onPress={() => navigateTo('Contacts')} />

        <View style={[styles.drawerDivider, { backgroundColor: colors.divider }]} />

        {/* Navigation */}
        <Row icon="people-outline"         label="Kontaktlar"               onPress={() => navigateTo('Kontaktlar')} color="#3BAB76" />
        <Row icon="call-outline"           label="Qo'ng'iroqlar"            onPress={() => navigateTo('Qongiroqlar')} color="#5B8DD9" />
        <Row icon="bookmark-outline"       label="Saqlangan xabarlar"       onPress={() => navigateTo('SavedMessages')} color="#F3A500" />
        <Row icon="folder-outline"         label="Chat papkalari"           onPress={() => navigateTo('ChatFolders')} color="#8B5CF6" />
        <Row icon="megaphone-outline"      label="Kanallar"                  onPress={() => navigateTo('Channels')} color="#E55B4D" />

        <View style={[styles.drawerDivider, { backgroundColor: colors.divider }]} />

        {/* Settings */}
        <Row icon="settings-outline"       label="Sozlamalar"               onPress={() => navigateTo('Settings')} color={colors.textSecondary} />
        <Row icon="lock-closed-outline"    label="Maxfiylik va xavfsizlik"  onPress={() => navigateTo('PrivacySettings')} color={colors.textSecondary} />
        <Row icon="shield-checkmark-outline" label="Ikki bosqichli tasdiqlash" onPress={() => navigateTo('TwoFactor')} color={colors.textSecondary} />
        <Row icon="phone-portrait-outline" label="Faol seanslar"            onPress={() => navigateTo('Sessions')} color={colors.textSecondary} />

        {/* Language */}
        <View style={[styles.drawerRow, { borderBottomColor: colors.divider }]}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.textSecondary + '22' }]}>
            <Ionicons name="language-outline" size={20} color={colors.textSecondary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text, flex: 1 }]}>Til</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[['uz', "O'z"], ['ru', 'Ru'], ['en', 'En']].map(([l, label]) => (
              <TouchableOpacity
                key={l}
                onPress={() => setLang(l)}
                style={{
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: lang === l ? colors.primary : colors.surface,
                }}
              >
                <Text style={{ color: lang === l ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.drawerDivider, { backgroundColor: colors.divider }]} />

        {/* Logout */}
        <TouchableOpacity
          style={[styles.drawerRow, { borderBottomColor: colors.divider }]}
          onPress={handleLogout}
          activeOpacity={0.65}
        >
          <View style={[styles.drawerIconWrap, { backgroundColor: 'rgba(229,57,53,0.12)' }]}>
            <Ionicons name="log-out-outline" size={20} color="#e53935" />
          </View>
          <Text style={[styles.drawerRowText, { color: '#e53935' }]}>Chiqish</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const totalUnread = useAuthStore((s) => s.totalUnread);

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8);
  const TAB_BAR_HEIGHT = 56 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated ?? colors.tabBar ?? colors.background,
          borderTopColor: colors.tabBarBorder ?? colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_HEIGHT,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.tabBarActive ?? colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive ?? colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          let icon;
          if (route.name === 'Chatlar') icon = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Kontaktlar') icon = focused ? 'people' : 'people-outline';
          else if (route.name === 'Qongiroqlar') icon = focused ? 'call' : 'call-outline';
          else if (route.name === 'Sozlamalar') icon = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={icon ?? 'ellipse-outline'} size={23} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Chatlar"
        options={{ title: 'Chatlar', tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined }}
      >
        {(props) => <ChatsWithDrawer {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Kontaktlar"
        component={ContactsScreen}
        options={{ title: 'Kontaktlar' }}
      />
      <Tab.Screen
        name="Qongiroqlar"
        component={CallsHistoryScreen}
        options={{ title: "Qo'ng'iroqlar" }}
      />
      <Tab.Screen
        name="Sozlamalar"
        component={SettingsScreen}
        options={{ title: 'Sozlamalar' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBackground },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
      {!isAuthenticated ? (
        <Stack.Group screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }) => ({
              title: route.params?.chatName ?? t('chat'),
              headerBackTitle: '',
            })}
          />
          <Stack.Screen
            name="ChatInfo"
            component={ChatInfoScreen}
            options={{ title: t('chatInfo') }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: t('editProfile') }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Sozlamalar' }}
          />
          <Stack.Screen
            name="Call"
            component={CallScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SavedMessages"
            component={SavedMessagesScreen}
            options={{ title: 'Saqlangan xabarlar' }}
          />
          <Stack.Screen
            name="ScheduledMessages"
            component={ScheduledMessagesScreen}
            options={{ title: "Rejalashtirilgan xabarlar" }}
          />
          <Stack.Screen
            name="Channels"
            component={ChannelsListScreen}
            options={{ title: 'Kanallar' }}
          />
          <Stack.Screen
            name="Channel"
            component={ChannelScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChatFolders"
            component={ChatFoldersScreen}
            options={{ title: 'Chat papkalari' }}
          />
          <Stack.Screen
            name="TwoFactor"
            component={TwoFactorScreen}
            options={{ title: 'Ikki bosqichli tekshiruv' }}
          />
          <Stack.Screen
            name="PrivacySettings"
            component={PrivacySettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AppLock"
            component={AppLockScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Sessions"
            component={SessionsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SecretChat"
            component={SecretChatScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="GroupCall"
            component={GroupCallScreen}
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="MessageSearch"
            component={MessageSearchScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="GroupAdmin"
            component={GroupAdminScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateGroup"
            component={CreateGroupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateChannel"
            component={CreateChannelScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChatMedia"
            component={ChatMediaScreen}
            options={({ route }) => ({ title: route.params?.chatName || 'Media' })}
          />
        </Stack.Group>
      )}
      </Stack.Navigator>
      {isAuthenticated && <ConnectionBanner />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    zIndex: 20,
    elevation: 20,
  },
  drawer: {
    flex: 1,
  },
  drawerHeader: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  drawerHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  drawerNightBtn: {
    padding: 4,
  },
  drawerAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  drawerAvatarLetter: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  drawerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  drawerSub: {
    fontSize: 14,
    marginTop: 2,
    color: 'rgba(255,255,255,0.8)',
  },
  drawerDivider: {
    height: 8,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  drawerRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

