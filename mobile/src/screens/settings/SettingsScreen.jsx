import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  Folder,
  HardDrive,
  Lock,
  MoonStar,
  Palette,
  Shield,
  Smartphone,
  User,
  Volume2,
  Wifi,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { BASE_URL } from '../../../config/api';
import { notificationService } from '../../services/notificationService';
import { clearAllDownloadedMedia, getMediaCacheStats } from '../../services/mediaCache';
import { APP_LOCK_KEY } from './AppLockScreen';

const SETTINGS_STORAGE_KEY = 'schat_settings_v1';

function ItemRow({ Icon, title, subtitle, value, colors, isDark, onPress, toggleValue, onToggle, danger, hideChevron }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [
        styles.itemRow,
        Platform.OS === 'ios' && pressed ? { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' } : null,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(42,138,255,0.12)' : '#EEF4FF' }]}>
        <Icon size={18} color={danger ? colors.danger : colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={[styles.itemTitle, { color: danger ? colors.danger : colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {typeof toggleValue === 'boolean' ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.14)' : '#D6DCE3', true: colors.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={isDark ? 'rgba(255,255,255,0.14)' : '#D6DCE3'}
        />
      ) : value !== undefined ? (
        <View style={styles.itemTrailing}>
          <Text style={[styles.itemValue, { color: colors.textSecondary }]} numberOfLines={1}>{String(value)}</Text>
          {!hideChevron && <ChevronRight size={16} color={colors.textHint || colors.textSecondary} strokeWidth={2.1} />}
        </View>
      ) : !hideChevron ? (
        <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.1} />
      ) : null}
    </Pressable>
  );
}

function ProfileRow({ user, colors, onPress }) {
  const avatarLetter = (user?.display_name || 'B').charAt(0).toUpperCase();
  return (
    <Pressable onPress={onPress} style={[styles.profileRow, { backgroundColor: colors.surfaceElevated || colors.background }]}> 
      {user?.avatar_url ? (
        <Image source={{ uri: `${BASE_URL}${user.avatar_url}` }} style={styles.profileAvatar} />
      ) : (
        <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}> 
          <Text style={styles.profileAvatarLetter}>{avatarLetter}</Text>
        </View>
      )}
      <View style={styles.profileMeta}>
        <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{user?.display_name || 'S Chat User'}</Text>
        <Text style={[styles.profilePhone, { color: colors.textSecondary }]} numberOfLines={1}>{user?.phone || 'No phone number'}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.1} />
    </Pressable>
  );
}

function SectionCard({ title, colors, isDark, children }) {
  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: colors.surfaceElevated || colors.background,
          borderColor: colors.border,
          borderWidth: isDark ? StyleSheet.hairlineWidth : 1,
        },
        !isDark && styles.cardShadow,
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function formatBytes(totalBytes) {
  const bytes = Number(totalBytes || 0);
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const p = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** p);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[p]}`;
}

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuthStore();
  const { colors, isDark, mode, setMode } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [messagePreviewEnabled, setMessagePreviewEnabled] = useState(true);
  const [faceUnlockEnabled, setFaceUnlockEnabled] = useState(false);
  const [autoDownloadMobileData, setAutoDownloadMobileData] = useState(false);
  const [autoDownloadWifi, setAutoDownloadWifi] = useState(true);
  const [autoDownloadRoaming, setAutoDownloadRoaming] = useState(false);
  const [cacheStats, setCacheStats] = useState({ files: 0, totalBytes: 0 });
  const [appLockEnabled, setAppLockEnabled] = useState(false);

  const refreshStorageStats = async () => {
    try {
      const stats = await getMediaCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats({ files: 0, totalBytes: 0 });
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadLocalSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw || !mounted) return;
        const data = JSON.parse(raw);
        if (typeof data.notificationsEnabled === 'boolean') setNotificationsEnabled(data.notificationsEnabled);
        if (typeof data.soundsEnabled === 'boolean') setSoundsEnabled(data.soundsEnabled);
        if (typeof data.messagePreviewEnabled === 'boolean') setMessagePreviewEnabled(data.messagePreviewEnabled);
        if (typeof data.faceUnlockEnabled === 'boolean') setFaceUnlockEnabled(data.faceUnlockEnabled);
        if (typeof data.autoDownloadMobileData === 'boolean') setAutoDownloadMobileData(data.autoDownloadMobileData);
        if (typeof data.autoDownloadWifi === 'boolean') setAutoDownloadWifi(data.autoDownloadWifi);
        if (typeof data.autoDownloadRoaming === 'boolean') setAutoDownloadRoaming(data.autoDownloadRoaming);
      } catch {}

      try {
        const lockRaw = await AsyncStorage.getItem(APP_LOCK_KEY);
        if (!lockRaw || !mounted) return;
        const lockData = JSON.parse(lockRaw);
        setAppLockEnabled(Boolean(lockData?.enabled));
      } catch {}
    };
    loadLocalSettings();
    refreshStorageStats();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      notificationsEnabled,
      soundsEnabled,
      messagePreviewEnabled,
      faceUnlockEnabled,
      autoDownloadMobileData,
      autoDownloadWifi,
      autoDownloadRoaming,
      autoDownloadMedia: autoDownloadMobileData || autoDownloadWifi || autoDownloadRoaming,
    })).catch(() => {});
  }, [
    autoDownloadMobileData,
    autoDownloadRoaming,
    autoDownloadWifi,
    faceUnlockEnabled,
    messagePreviewEnabled,
    notificationsEnabled,
    soundsEnabled,
  ]);

  const handleToggleNotifications = async (value) => {
    if (value) {
      const ok = await notificationService.requestPermissions();
      setNotificationsEnabled(ok);
      if (!ok) {
        Alert.alert('Ruxsat berilmadi', 'Bildirishnomalarni yoqish uchun tizim ruxsatini bering.');
      }
      return;
    }
    setNotificationsEnabled(false);
  };

  const handleClearCache = () => {
    Alert.alert('Cache tozalansinmi?', 'Yuklangan media fayllar o\'chiriladi.', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'Tozalash',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAllDownloadedMedia();
            await refreshStorageStats();
            Alert.alert('Tayyor', 'Media cache tozalandi');
          } catch {
            Alert.alert('Xato', 'Cache tozalashda xatolik yuz berdi');
          }
        },
      },
    ]);
  };

  const themeLabel = useMemo(() => {
    if (mode === 'system') return t('system');
    return mode === 'dark' ? t('dark') : t('light');
  }, [mode, t]);

  const handleLogout = () => {
    Alert.alert(t('logOut'), t('logOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logOut'),
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const handleToggleAppLock = async (enabled) => {
    if (enabled) {
      navigation.navigate('AppLock');
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(APP_LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(APP_LOCK_KEY, JSON.stringify({ ...parsed, enabled: false }));
      setAppLockEnabled(false);
    } catch {
      Alert.alert('Xato', 'App lockni o\'chirishda xatolik yuz berdi.');
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      try {
        const lockRaw = await AsyncStorage.getItem(APP_LOCK_KEY);
        if (!lockRaw) {
          setAppLockEnabled(false);
          return;
        }
        const lockData = JSON.parse(lockRaw);
        setAppLockEnabled(Boolean(lockData?.enabled));
      } catch {
        setAppLockEnabled(false);
      }
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 12) }]} showsVerticalScrollIndicator={false}>
        <ProfileRow user={user} colors={colors} onPress={() => navigation.navigate('Profile')} />

        <SectionCard title={t('account')} colors={colors} isDark={isDark}>
          <ItemRow Icon={User} title={t('profile')} subtitle={t('profileSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('Profile')} />
          <ItemRow Icon={Smartphone} title={t('devices')} subtitle={t('devicesSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('Sessions')} />
          <ItemRow Icon={Shield} title={t('privacy')} subtitle={t('privacySubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('PrivacySettings')} />
          <ItemRow Icon={Folder} title="Chat papkalari" subtitle="Chatlarni papkalar bo'yicha saralash" colors={colors} isDark={isDark} onPress={() => navigation.navigate('ChatFolders')} />
        </SectionCard>

        <SectionCard title={t('notifications')} colors={colors} isDark={isDark}>
          <ItemRow Icon={Bell} title={t('pushNotifications')} subtitle={t('pushNotificationsSubtitle')} colors={colors} isDark={isDark} toggleValue={notificationsEnabled} onToggle={handleToggleNotifications} />
          <ItemRow Icon={Volume2} title={t('sound')} subtitle={t('soundSubtitle')} colors={colors} isDark={isDark} toggleValue={soundsEnabled} onToggle={setSoundsEnabled} />
          <ItemRow Icon={Smartphone} title="Message preview" subtitle="Lock-screen va push ichida matn ko'rsatish" colors={colors} isDark={isDark} toggleValue={messagePreviewEnabled} onToggle={setMessagePreviewEnabled} />
        </SectionCard>

        <SectionCard title="Data va Storage" colors={colors} isDark={isDark}>
          <ItemRow Icon={Wifi} title="Wi-Fi orqali auto download" subtitle="Rasm/video/fayllarni Wi-Fi da avtomatik yuklash" colors={colors} isDark={isDark} toggleValue={autoDownloadWifi} onToggle={setAutoDownloadWifi} />
          <ItemRow Icon={Smartphone} title="Mobile data orqali auto download" subtitle="Mobil internetda media avtomatik yuklanadi" colors={colors} isDark={isDark} toggleValue={autoDownloadMobileData} onToggle={setAutoDownloadMobileData} />
          <ItemRow Icon={Smartphone} title="Roaming auto download" subtitle="Roamingda media avtomatik yuklash" colors={colors} isDark={isDark} toggleValue={autoDownloadRoaming} onToggle={setAutoDownloadRoaming} />
          <ItemRow Icon={HardDrive} title="Cache tozalash" subtitle={`${cacheStats.files} fayl · ${formatBytes(cacheStats.totalBytes)}`} colors={colors} isDark={isDark} onPress={handleClearCache} />
        </SectionCard>

        <SectionCard title={t('security')} colors={colors} isDark={isDark}>
          <ItemRow Icon={Lock} title={t('faceUnlock')} subtitle={t('faceUnlockSubtitle')} colors={colors} isDark={isDark} toggleValue={faceUnlockEnabled} onToggle={setFaceUnlockEnabled} />
          <ItemRow Icon={Lock} title="App lock" subtitle="PIN bilan ilovani qulflash" colors={colors} isDark={isDark} toggleValue={appLockEnabled} onToggle={handleToggleAppLock} />
          <ItemRow Icon={Shield} title={t('twoStepVerification')} subtitle={t('twoStepSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('TwoFactor')} />
          <ItemRow Icon={Smartphone} title="Faol seanslar" subtitle="Ulangan qurilmalarni boshqarish" colors={colors} isDark={isDark} onPress={() => navigation.navigate('Sessions')} />
        </SectionCard>

        <SectionCard title={t('appearance')} colors={colors} isDark={isDark}>
          <ItemRow
            Icon={mode === 'dark' ? MoonStar : Palette}
            title={t('theme')}
            value={themeLabel}
            colors={colors}
            isDark={isDark}
            onPress={() => {
              const nextMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
              setMode(nextMode);
            }}
          />
        </SectionCard>

        <SectionCard title={t('session')} colors={colors} isDark={isDark}>
          <ItemRow Icon={Lock} title={t('logOut')} subtitle={t('logoutSubtitle')} colors={colors} isDark={isDark} danger onPress={handleLogout} />
        </SectionCard>

        <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 13, paddingVertical: 20, paddingBottom: 32 }}>
          S Chat 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  profileRow: {
    minHeight: 88,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 2,
  },
  profilePhone: {
    fontSize: 14,
  },
  sectionCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    marginHorizontal: 12,
  },
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 4,
    borderRadius: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
  },
  itemTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemValue: {
    fontSize: 14,
    fontWeight: '500',
  },
});
