import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
  AtSign,
  Camera,
  Check,
  Info,
  Phone,
  User,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { BASE_URL } from '../../../config/api';

function InfoRow({ Icon, label, value, colors, isDark }) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
        <Icon size={20} color={colors.textSecondary} strokeWidth={2} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}


function MenuRow({ icon, label, subtitle, onPress, colors, isDark }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        { backgroundColor: pressed ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') : 'transparent' },
      ]}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.menuSub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textHint || colors.textSecondary} />
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, updateProfile, fetchMe } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert(t('error'), t('displayNameRequired'));
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSaving(true);
    try {
      const body = {
        display_name: displayName.trim(),
        bio: bio.trim(),
      };
      if (username.trim()) {
        body.username = username.trim().replace(/^@/, '');
      }
      await updateProfile(body);
      Alert.alert(t('saved'), t('profileUpdated'));
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.error ?? t('failedToUpdateProfile'));
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissionRequired'), t('allowMediaAccess'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();

    if (Platform.OS === 'web') {
      // On web, fetch the blob from the local URI and append as File
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const fileName = asset.fileName ?? 'avatar.jpg';
      const file = new File([blob], fileName, { type: asset.mimeType ?? 'image/jpeg' });
      formData.append('avatar', file);
    } else {
      formData.append('avatar', {
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }

    setAvatarLoading(true);
    try {
      await apiClient.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchMe();
    } catch (e) {
      Alert.alert(t('error'), e?.response?.data?.error ?? t('failedToUploadAvatar'));
    } finally {
      setAvatarLoading(false);
    }
  };

  const avatarUri = user?.avatar_url ? `${BASE_URL}${user.avatar_url}` : null;
  const avatarBg = useMemo(() => {
    const palette = ['#3B82F6', '#06B6D4', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444'];
    const idx = (user?.display_name?.charCodeAt(0) ?? 0) % palette.length;
    return palette[idx];
  }, [user?.display_name]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BlurView intensity={34} tint={isDark ? 'dark' : 'light'} style={styles.headerBlur}>
          <View style={[styles.headerCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)' }]}>
            <Pressable style={styles.avatarPress} onPress={handlePickAvatar}>
              {avatarLoading ? (
                <View style={[styles.avatar, { backgroundColor: avatarBg, justifyContent: 'center', alignItems: 'center' }]}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: avatarBg, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={styles.avatarLetter}>{user?.display_name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}> 
                <Camera size={13} color="#fff" strokeWidth={2.4} />
              </View>
            </Pressable>
            <Text style={[styles.headerName, { color: colors.text }]}>{user?.display_name ?? 'S Chat user'}</Text>
            <Text style={[styles.headerUsername, { color: colors.textSecondary }]}>{user?.username ? `@${user.username}` : ''}</Text>
          </View>
        </BlurView>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Account</Text>
          <InfoRow Icon={Phone} label="Phone" value={user?.phone ?? ''} colors={colors} isDark={isDark} />
          <InfoRow Icon={AtSign} label="Username" value={user?.username ? `@${user.username}` : '—'} colors={colors} isDark={isDark} />
          <InfoRow Icon={Info} label="Bio" value={user?.bio?.trim() ? user.bio : 'No bio yet'} colors={colors} isDark={isDark} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Profil bo'limlari</Text>
          <MenuRow
            icon="settings-outline"
            label="Sozlamalar"
            subtitle="Ilova va akkaunt sozlamalari"
            onPress={() => navigation.navigate('Settings')}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="albums-outline"
            label="Hikoyalar"
            subtitle="Hikoya qo'shish va ko'rish"
            onPress={() => navigation.navigate('Main', { screen: 'Chatlar', params: { openStoryComposer: true, storyIntentAt: Date.now() } })}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="bookmark-outline"
            label="Saqlangan xabarlar"
            subtitle="Saved messages"
            onPress={() => navigation.navigate('SavedMessages')}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="time-outline"
            label="Rejalashtirilgan xabarlar"
            subtitle="Chat ichidan boshqariladi"
            onPress={() => navigation.navigate('Main', { screen: 'Chatlar' })}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Maxfiylik va xavfsizlik"
            subtitle="Privacy, sessions, 2FA"
            onPress={() => navigation.navigate('PrivacySettings')}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="phone-portrait-outline"
            label="Faol seanslar"
            subtitle="Ulangan qurilmalar"
            onPress={() => navigation.navigate('Sessions')}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="shield-outline"
            label="Ikki bosqichli tekshiruv"
            subtitle="2FA"
            onPress={() => navigation.navigate('TwoFactor')}
            colors={colors}
            isDark={isDark}
          />
          <MenuRow
            icon="folder-outline"
            label="Chat papkalari"
            subtitle="Saralash va tartiblash"
            onPress={() => navigation.navigate('ChatFolders')}
            colors={colors}
            isDark={isDark}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Edit Profile</Text>

          <View style={styles.formRow}>
            <View style={[styles.formIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
              <User size={20} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <TextInput
              style={[styles.formInput, { color: colors.text }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={colors.textHint}
              maxLength={100}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
              <AtSign size={20} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <TextInput
              style={[styles.formInput, { color: colors.text }]}
              value={username}
              onChangeText={(v) => setUsername(v.replace(/^@/, ''))}
              placeholder="Username"
              placeholderTextColor={colors.textHint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={50}
            />
          </View>

          <View style={[styles.formRow, styles.bioRow]}>
            <View style={[styles.formIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
              <Info size={20} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <View style={styles.bioInputWrap}>
              <TextInput
                style={[styles.formInput, styles.bioInput, { color: colors.text }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Bio"
                placeholderTextColor={colors.textHint}
                multiline
                maxLength={140}
              />
              <Text style={[styles.charCount, { color: colors.textHint }]}>{bio.length}/140</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: saving ? 0.7 : pressed ? 0.92 : 1 },
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.saveContent}>
              <Check size={18} color="#fff" strokeWidth={2.6} />
              <Text style={styles.saveBtnText}>{t('saveChanges')}</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  headerBlur: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  headerCard: {
    borderRadius: 20,
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  avatarPress: { position: 'relative', marginBottom: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarLetter: { color: '#fff', fontSize: 36, fontWeight: '700' },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerName: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  headerUsername: { marginTop: 4, fontSize: 14, fontWeight: '500' },
  card: {
    marginBottom: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    marginBottom: 8,
  },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoTextWrap: { flex: 1 },
  menuRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  menuIconWrap: {
    width: 28,
    marginRight: 22,
    alignItems: 'flex-start',
  },
  menuLabel: { fontSize: 16, fontWeight: '400' },
  menuSub: { fontSize: 13, marginTop: 2 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '500' },
  formRow: {
    minHeight: 56,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  bioRow: { alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10 },
  formIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  formInput: { flex: 1, fontSize: 16, paddingVertical: 6 },
  bioInputWrap: { flex: 1 },
  bioInput: { minHeight: 64, textAlignVertical: 'top', lineHeight: 21 },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 4 },
  saveBtn: {
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
