import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EyeOff, Lock, Shield, UserX } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

const PRIVACY_STORAGE_KEY = 'schat_privacy_v2';
const AUDIENCE_OPTIONS = ['everyone', 'contacts', 'nobody'];

const AUDIENCE_LABELS = {
  everyone: 'Hamma',
  contacts: 'Kontaktlarim',
  nobody: 'Hech kim',
};

function ChoiceRow({ Icon, title, subtitle, value, onPress, colors, isDark }) {
  return (
    <Pressable onPress={onPress} style={styles.rowWrap}>
      <View style={styles.rowMain}>
        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }]}>
          <Icon size={20} color={colors.textSecondary} strokeWidth={2} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.valueText, { color: colors.textSecondary }]}>{AUDIENCE_LABELS[value]}</Text>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ExceptionRow({ title, subtitle, count, onPress, colors, isDark }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.exceptionRow,
        {
          opacity: pressed ? 0.9 : 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <View style={[styles.countPill, { backgroundColor: colors.primary + '20' }]}>
        <Text style={[styles.countText, { color: colors.primary }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

export default function PrivacySettingsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [lastSeen, setLastSeen] = useState('contacts');
  const [profilePhoto, setProfilePhoto] = useState('everyone');
  const [phoneNumber, setPhoneNumber] = useState('nobody');
  const [invites, setInvites] = useState('contacts');
  const [alwaysAllow, setAlwaysAllow] = useState([]);
  const [neverAllow, setNeverAllow] = useState([]);
  const [exceptionModal, setExceptionModal] = useState(null); // { type: 'always'|'never' }
  const [exceptionInput, setExceptionInput] = useState('');
  const exceptionInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
        if (!raw || !mounted) return;
        const saved = JSON.parse(raw);
        if (AUDIENCE_OPTIONS.includes(saved.lastSeen)) setLastSeen(saved.lastSeen);
        if (AUDIENCE_OPTIONS.includes(saved.profilePhoto)) setProfilePhoto(saved.profilePhoto);
        if (AUDIENCE_OPTIONS.includes(saved.phoneNumber)) setPhoneNumber(saved.phoneNumber);
        if (AUDIENCE_OPTIONS.includes(saved.invites)) setInvites(saved.invites);
        if (Array.isArray(saved.alwaysAllow)) setAlwaysAllow(saved.alwaysAllow);
        if (Array.isArray(saved.neverAllow)) setNeverAllow(saved.neverAllow);
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({
      lastSeen,
      profilePhoto,
      phoneNumber,
      invites,
      alwaysAllow,
      neverAllow,
    })).catch(() => {});
  }, [alwaysAllow, invites, lastSeen, neverAllow, phoneNumber, profilePhoto]);

  const summary = useMemo(() => {
    return `${AUDIENCE_LABELS[lastSeen]} · Istisno: +${alwaysAllow.length} / -${neverAllow.length}`;
  }, [alwaysAllow.length, lastSeen, neverAllow.length]);

  const chooseAudience = (title, currentValue, onChange) => {
    const options = AUDIENCE_OPTIONS.map((opt) => ({ text: AUDIENCE_LABELS[opt], onPress: () => onChange(opt) }));
    Alert.alert(title, `Joriy: ${AUDIENCE_LABELS[currentValue]}`, [...options, { text: 'Bekor', style: 'cancel' }]);
  };

  const openExceptionEditor = (type) => {
    const current = type === 'always' ? alwaysAllow : neverAllow;
    setExceptionInput(current.join(', '));
    setExceptionModal({ type });
    setTimeout(() => exceptionInputRef.current?.focus(), 150);
  };

  const saveExceptions = () => {
    const parsed = exceptionInput.split(',').map((x) => x.trim()).filter(Boolean);
    if (exceptionModal?.type === 'always') setAlwaysAllow(parsed);
    else setNeverAllow(parsed);
    setExceptionModal(null);
  };

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
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ko'rinish va kirish</Text>
          <ChoiceRow
            Icon={EyeOff}
            title='Oxirgi kirish va online'
            subtitle={summary}
            value={lastSeen}
            onPress={() => chooseAudience('Oxirgi kirish va online', lastSeen, setLastSeen)}
            colors={colors}
            isDark={isDark}
          />
          <ChoiceRow
            Icon={Shield}
            title='Profil rasmi'
            subtitle='Profil rasmingiz kimlarga ko\'rinadi'
            value={profilePhoto}
            onPress={() => chooseAudience('Profil rasmi', profilePhoto, setProfilePhoto)}
            colors={colors}
            isDark={isDark}
          />
          <ChoiceRow
            Icon={Lock}
            title='Telefon raqami'
            subtitle='Telefon raqamingiz ko\'rinish doirasi'
            value={phoneNumber}
            onPress={() => chooseAudience('Telefon raqami', phoneNumber, setPhoneNumber)}
            colors={colors}
            isDark={isDark}
          />
          <ChoiceRow
            Icon={UserX}
            title='Guruh va kanal takliflari'
            subtitle='Sizni kim qo\'sha oladi'
            value={invites}
            onPress={() => chooseAudience('Guruh va kanal takliflari', invites, setInvites)}
            colors={colors}
            isDark={isDark}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated || colors.background }, !isDark && styles.cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Istisnolar</Text>
          <ExceptionRow
            title='Doim ruxsat berilganlar'
            subtitle='Asosiy cheklovlardan mustasno'
            count={alwaysAllow.length}
            onPress={() => openExceptionEditor('always')}
            colors={colors}
            isDark={isDark}
          />
          <ExceptionRow
            title='Doim taqiqlanganlar'
            subtitle='Har qanday holatda bloklangan ko\'rinish'
            count={neverAllow.length}
            onPress={() => openExceptionEditor('never')}
            colors={colors}
            isDark={isDark}
          />
        </View>
      </ScrollView>

      {/* Cross-platform exception editor modal */}
      <Modal
        visible={Boolean(exceptionModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setExceptionModal(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExceptionModal(null)} />
          <View style={[styles.modalBox, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {exceptionModal?.type === 'always' ? 'Doim ruxsat berilganlar' : 'Doim taqiqlanganlar'}
            </Text>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              Vergul bilan username kiriting: ali, vali, nodir
            </Text>
            <TextInput
              ref={exceptionInputRef}
              style={[styles.modalInput, { backgroundColor: colors.inputBackground || colors.background, color: colors.text, borderColor: colors.border }]}
              value={exceptionInput}
              onChangeText={setExceptionInput}
              placeholder="ali, vali, nodir"
              placeholderTextColor={colors.textHint || colors.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setExceptionModal(null)} style={[styles.modalBtn, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Bekor</Text>
              </Pressable>
              <Pressable onPress={saveExceptions} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Saqlash</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  rowWrap: { marginBottom: 6 },
  rowMain: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
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
  rowRight: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  valueText: { fontSize: 14, fontWeight: '500' },
  chevron: { fontSize: 20, marginLeft: 8, marginTop: -2 },
  exceptionRow: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  countPill: {
    minWidth: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countText: { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  modalBox: { width: '100%', maxWidth: 400, borderRadius: 18, padding: 20, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  modalHint: { fontSize: 13, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 60, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
