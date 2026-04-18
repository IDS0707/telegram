import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
  Bell,
  ChevronRight,
  Folder,
  Lock,
  MoonStar,
  Palette,
  Shield,
  Smartphone,
  User,
  Volume2,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { BASE_URL } from '../../../config/api';
import { notificationService } from '../../services/notificationService';

const SETTINGS_STORAGE_KEY = 'luxchat_settings_v1';

function ItemRow({ Icon, title, subtitle, colors, isDark, onPress, toggleValue, onToggle, danger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemRow,
        { opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }]}>
        <Icon size={20} color={danger ? colors.danger : colors.textSecondary} strokeWidth={2} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={[styles.itemTitle, { color: danger ? colors.danger : colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {typeof toggleValue === 'boolean' ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.18)' : '#D6DCE3', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.1} />
      )}
    </Pressable>
  );
}

function SectionCard({ title, colors, isDark, children }) {
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surfaceElevated || colors.background }, !isDark && styles.cardShadow]}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuthStore();
  const { colors, isDark, mode, setMode } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [faceUnlockEnabled, setFaceUnlockEnabled] = useState(false);
  const [autoDownloadMedia, setAutoDownloadMedia] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadLocalSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw || !mounted) return;
        const data = JSON.parse(raw);
        if (typeof data.notificationsEnabled === 'boolean') setNotificationsEnabled(data.notificationsEnabled);
        if (typeof data.soundsEnabled === 'boolean') setSoundsEnabled(data.soundsEnabled);
        if (typeof data.faceUnlockEnabled === 'boolean') setFaceUnlockEnabled(data.faceUnlockEnabled);
        if (typeof data.autoDownloadMedia === 'boolean') setAutoDownloadMedia(data.autoDownloadMedia);
      } catch {}
    };
    loadLocalSettings();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      notificationsEnabled,
      soundsEnabled,
      faceUnlockEnabled,
      autoDownloadMedia,
    })).catch(() => {});
  }, [autoDownloadMedia, faceUnlockEnabled, notificationsEnabled, soundsEnabled]);

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

  const themeLabel = useMemo(() => {
    if (mode === 'system') return t('system');
    return mode === 'dark' ? t('dark') : t('light');
  }, [mode, t]);

  const avatarLetter = (user?.display_name || 'B').charAt(0).toUpperCase();

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 12) }]} showsVerticalScrollIndicator={false}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={styles.heroBlur}>
          <View style={[styles.heroCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)' }]}>
            {user?.avatar_url ? (
              <Image source={{ uri: `${BASE_URL}${user.avatar_url}` }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
            )}
            <Text style={[styles.heroName, { color: colors.text }]}>{user?.display_name || 'LUXCHAT User'}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>{user?.phone || t('noPhoneNumber')}</Text>
            <Pressable style={[styles.editButton, { backgroundColor: colors.primaryLight || colors.surface }]} onPress={() => navigation.navigate('Profile')}>
              <Text style={[styles.editButtonText, { color: colors.primary }]}>{t('editProfile')}</Text>
            </Pressable>
          </View>
        </BlurView>

        <SectionCard title={t('account')} colors={colors} isDark={isDark}>
          <ItemRow Icon={User} title={t('profile')} subtitle={t('profileSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('Profile')} />
          <ItemRow Icon={Smartphone} title={t('devices')} subtitle={t('devicesSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('Sessions')} />
          <ItemRow Icon={Shield} title={t('privacy')} subtitle={t('privacySubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('PrivacySettings')} />
          <ItemRow Icon={Folder} title="Chat papkalari" subtitle="Chatlarni papkalar bo'yicha saralash" colors={colors} isDark={isDark} onPress={() => navigation.navigate('ChatFolders')} />
        </SectionCard>

        <SectionCard title={t('notifications')} colors={colors} isDark={isDark}>
          <ItemRow Icon={Bell} title={t('pushNotifications')} subtitle={t('pushNotificationsSubtitle')} colors={colors} isDark={isDark} toggleValue={notificationsEnabled} onToggle={handleToggleNotifications} />
          <ItemRow Icon={Volume2} title={t('sound')} subtitle={t('soundSubtitle')} colors={colors} isDark={isDark} toggleValue={soundsEnabled} onToggle={setSoundsEnabled} />
          <ItemRow Icon={Smartphone} title={t('autoDownloadMedia')} subtitle="Yoqilsa barcha media avtomatik yuklanadi" colors={colors} isDark={isDark} toggleValue={autoDownloadMedia} onToggle={setAutoDownloadMedia} />
        </SectionCard>

        <SectionCard title={t('security')} colors={colors} isDark={isDark}>
          <ItemRow Icon={Lock} title={t('faceUnlock')} subtitle={t('faceUnlockSubtitle')} colors={colors} isDark={isDark} toggleValue={faceUnlockEnabled} onToggle={setFaceUnlockEnabled} />
          <ItemRow Icon={Shield} title={t('twoStepVerification')} subtitle={t('twoStepSubtitle')} colors={colors} isDark={isDark} onPress={() => navigation.navigate('TwoFactor')} />
          <ItemRow Icon={Smartphone} title="Faol seanslar" subtitle="Ulangan qurilmalarni boshqarish" colors={colors} isDark={isDark} onPress={() => navigation.navigate('Sessions')} />
        </SectionCard>

        <SectionCard title={t('appearance')} colors={colors} isDark={isDark}>
          <ItemRow
            Icon={mode === 'dark' ? MoonStar : Palette}
            title={t('theme')}
            subtitle={themeLabel}
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
          LUXCHAT 1.0.0
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
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroBlur: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroCard: {
    borderRadius: 22,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  editButton: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
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
  },
  itemRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
