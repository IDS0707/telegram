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
import StickersScreen from '../screens/settings/StickersScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

function DrawerContent({ onClose, navigation }) {
  const stackNav = useNavigation();
  const { user, logout } = useAuthStore();
  const { colors, mode, setMode, isDark } = useTheme();
  const { t, lang, setLang } = useI18n();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const avatarUri = user?.avatar_url ? `${BASE_URL}${user.avatar_url}` : null;

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(t('logOutConfirm'));
      if (confirmed) { logout(); }
      return;
    }
    Alert.alert(t('logOut'), t('logOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logOut'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  const navigateTo = (screen) => {
    onClose();
    setTimeout(() => stackNav.navigate(screen), 300);
  };

  const langLabel = { en: 'English', ru: 'Русский', uz: "O'zbekcha" };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.drawer, { backgroundColor: colors.background }]}>
      {/* Profile Header */}
      <TouchableOpacity
        style={[styles.drawerHeader, { backgroundColor: colors.headerBackground }]}
        onPress={() => navigateTo('Profile')}
        activeOpacity={0.8}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.drawerAvatar} />
        ) : (
          <View style={[styles.drawerAvatar, styles.drawerAvatarPlaceholder]}>
            <Text style={styles.drawerAvatarLetter}>
              {user?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <Text style={styles.drawerName}>{user?.display_name}</Text>
        {user?.username ? (
          <Text style={styles.drawerSub}>@{user.username}</Text>
        ) : (
          <Text style={styles.drawerSub}>{user?.phone}</Text>
        )}
      </TouchableOpacity>

      <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
        {/* Edit Profile */}
        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('Profile')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="person-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('editProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('SavedMessages')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Saqlangan xabarlar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('Channels')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Kanallar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('ChatFolders')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="folder-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Chat papkalari</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('Stickers')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="happy-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Stikerlar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={() => navigateTo('TwoFactor')}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Ikki bosqichli tekshiruv</Text>
        </TouchableOpacity>

        {/* Theme */}
        <View style={[styles.drawerSection, { borderBottomColor: colors.border }]}>
          <View style={styles.drawerRow}>
            <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.primary} />
            </View>
            <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('theme')}</Text>
          </View>
          <View style={styles.chipRow}>
            {['light', 'dark', 'system'].map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.chip,
                  {
                    backgroundColor: mode === m ? colors.primary : colors.surface,
                    borderColor: mode === m ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setMode(m)}
              >
                <Text style={{ color: mode === m ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {t(m)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Language */}
        <View style={[styles.drawerSection, { borderBottomColor: colors.border }]}>
          <View style={styles.drawerRow}>
            <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="language-outline" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('language')}</Text>
          </View>
          <View style={styles.chipRow}>
            {['en', 'ru', 'uz'].map((l) => (
              <TouchableOpacity
                key={l}
                style={[
                  styles.chip,
                  {
                    backgroundColor: lang === l ? colors.primary : colors.surface,
                    borderColor: lang === l ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setLang(l)}
              >
                <Text style={{ color: lang === l ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {langLabel[l]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notifications */}
        <View style={[styles.drawerRow, { borderBottomColor: colors.border }]}>
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { flex: 1, color: colors.text }]}>{t('pushNotifications')}</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>

        {/* Privacy */}
        <TouchableOpacity
          style={[styles.drawerRow, { borderBottomColor: colors.border }]}
          onPress={() => Alert.alert(t('privacy'), t('privacyComingSoon'))}
        >
          <View style={[styles.drawerIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('privacySecurity')}</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={[styles.drawerRow, { borderBottomColor: colors.border }]} onPress={handleLogout}>
          <View style={[styles.drawerIconWrap, { backgroundColor: 'rgba(229,57,53,0.1)' }]}>
            <Ionicons name="log-out-outline" size={20} color="#e53935" />
          </View>
          <Text style={[styles.drawerRowText, { color: '#e53935' }]}>{t('logOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatsWithDrawer({ navigation }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  };

  return (
    <View style={{ flex: 1 }}>
      <ChatsListScreen navigation={navigation} onOpenDrawer={openDrawer} />

      {drawerOpen && (
        <>
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <Animated.View style={[styles.overlay, { opacity: overlayAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
            <DrawerContent onClose={closeDrawer} navigation={navigation} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

function MainTabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const totalUnread = useAuthStore((s) => s.totalUnread);

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8);
  const TAB_BAR_HEIGHT = 58 + bottomInset;

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
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.tabBarActive ?? colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive ?? colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused, size }) => {
          let icon;
          if (route.name === 'Chatlar') icon = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Kontaktlar') icon = focused ? 'people' : 'people-outline';
          else if (route.name === 'Qongiroqlar') icon = focused ? 'call' : 'call-outline';
          else if (route.name === 'Sozlamalar') icon = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={icon} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Chatlar"
        options={{ title: 'Chatlar', tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined }}
      >
        {(props) => <ChatsWithDrawer {...props} navigation={props.navigation} />}
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
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
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
            name="Stickers"
            component={StickersScreen}
            options={{ title: 'Stikerlar' }}
          />
        </Stack.Group>
      )}
    </Stack.Navigator>
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
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  drawerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
  },
  drawerAvatarPlaceholder: {
    backgroundColor: '#4c8ef7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAvatarLetter: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  drawerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  drawerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 2,
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
  drawerSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 66,
    paddingBottom: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
