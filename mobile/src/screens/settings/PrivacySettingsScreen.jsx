import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Shield, EyeOff, UserX } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

const PRIVACY_STORAGE_KEY = 'luxchat_privacy_v1';

function Row({ Icon, title, subtitle, value, onChange, colors, isDark }) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }]}>
        <Icon size={20} color={colors.textSecondary} strokeWidth={2} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: isDark ? 'rgba(255,255,255,0.18)' : '#D6DCE3', true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function PrivacySettingsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [lastSeenVisible, setLastSeenVisible] = useState(true);
  const [profilePhotoVisible, setProfilePhotoVisible] = useState(true);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [allowInvites, setAllowInvites] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
        if (!raw || !mounted) return;
        const saved = JSON.parse(raw);
        if (typeof saved.lastSeenVisible === 'boolean') setLastSeenVisible(saved.lastSeenVisible);
        if (typeof saved.profilePhotoVisible === 'boolean') setProfilePhotoVisible(saved.profilePhotoVisible);
        if (typeof saved.phoneVisible === 'boolean') setPhoneVisible(saved.phoneVisible);
        if (typeof saved.allowInvites === 'boolean') setAllowInvites(saved.allowInvites);
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({
      lastSeenVisible,
      profilePhotoVisible,
      phoneVisible,
      allowInvites,
    })).catch(() => {});
  }, [allowInvites, lastSeenVisible, phoneVisible, profilePhotoVisible]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.primary }]}>Ortga</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Maxfiylik</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(24, insets.bottom + 12) }}>
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated || colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ko'rinish</Text>
          <Row
            Icon={EyeOff}
            title="Oxirgi kirish"
            subtitle="Boshqalar sizning online holatingizni ko'rishi"
            value={lastSeenVisible}
            onChange={setLastSeenVisible}
            colors={colors}
            isDark={isDark}
          />
          <Row
            Icon={Shield}
            title="Profil rasmi"
            subtitle="Profil rasmingiz kimlarga ko'rinadi"
            value={profilePhotoVisible}
            onChange={setProfilePhotoVisible}
            colors={colors}
            isDark={isDark}
          />
          <Row
            Icon={Lock}
            title="Telefon raqami"
            subtitle="Telefon raqamingizni ko'rsatish"
            value={phoneVisible}
            onChange={setPhoneVisible}
            colors={colors}
            isDark={isDark}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated || colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Xavfsizlik</Text>
          <Row
            Icon={UserX}
            title="Guruh/channel takliflari"
            subtitle="Boshqalar sizni guruhga qo'shishi"
            value={allowInvites}
            onChange={setAllowInvites}
            colors={colors}
            isDark={isDark}
          />

          <Pressable
            style={({ pressed }) => [styles.dangerBtn, { opacity: pressed ? 0.9 : 1 }]}
            onPress={() => Alert.alert('Maxfiylik', 'Sozlamalar saqlandi.')}
          >
            <Text style={styles.dangerBtnText}>Saqlashni tekshirish</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  backBtn: { minWidth: 48, paddingVertical: 8 },
  backText: { fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  card: {
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
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  dangerBtn: {
    marginTop: 6,
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  dangerBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
