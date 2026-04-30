import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';

export default function RegisterScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const register = useAuthStore((s) => s.register);
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const handleRegister = async () => {
    if (!displayName.trim() || !phone.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('error'), t('passwordsDontMatch'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('error'), t('passwordMinLength'));
      return;
    }

    // Strip spaces and prepend +998
    const cleanPhone = '+998' + phone.trim().replace(/\s+/g, '');

    setLoading(true);
    try {
      await register(cleanPhone, password, confirmPassword, displayName.trim());
    } catch (err) {
      const msg = err?.response?.data?.error ?? err.message ?? t('registrationFailed');
      Alert.alert(t('error'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#2AABEE" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>

        {/* Blue header */}
        <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
          <View style={styles.logoCircle}>
            <Ionicons name="person-add" size={44} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Ro'yxatdan o'tish</Text>
          <Text style={styles.heroSub}>Yangi akkaunt yarating</Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: colors.background }]}>

          {/* Display name */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Ism va Familiya"
              placeholderTextColor={colors.textHint}
              value={displayName}
              onChangeText={setDisplayName}
              returnKeyType="next"
              autoCapitalize="words"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          </View>

          {/* Phone */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Text style={[styles.prefix, { color: colors.textSecondary }]}>+998</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TextInput
              ref={phoneRef}
              style={[styles.input, { color: colors.text }]}
              placeholder="90 123 45 67"
              placeholderTextColor={colors.textHint}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
              autoCapitalize="none"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: colors.text }]}
              placeholder="Parol (kamida 6 ta belgi)"
              placeholderTextColor={colors.textHint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Confirm */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              ref={confirmRef}
              style={[styles.input, { color: colors.text }]}
              placeholder="Parolni tasdiqlang"
              placeholderTextColor={colors.textHint}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
          </View>

          {/* Button */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.82}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Akkaunt yaratish</Text>}
          </TouchableOpacity>

          {/* Login link */}
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>Akkaunt bor? </Text>
            <Text style={[styles.linkBold, { color: colors.primary }]}>Kirish</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: '#2AABEE',
    alignItems: 'center',
    paddingBottom: 48,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroTitle: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.82)' },
  card: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 54,
    marginBottom: 12,
  },
  prefix: { fontSize: 15, fontWeight: '600', paddingRight: 10 },
  divider: { width: 1, height: 22, marginRight: 10 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  eyeBtn: { paddingLeft: 8 },
  btn: {
    backgroundColor: '#2AABEE',
    borderRadius: 14,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    shadowColor: '#2AABEE',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 14 },
  linkBold: { fontSize: 14, fontWeight: '700' },
});
