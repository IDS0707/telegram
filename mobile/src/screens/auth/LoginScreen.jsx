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

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);
  const login = useAuthStore((s) => s.login);
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setLoading(true);
    try {
      await login(phone.trim(), password);
    } catch (err) {
      Alert.alert(t('error'), err.message ?? t('loginFailed'));
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
        <View style={[styles.hero, { paddingTop: insets.top + 32 }]}>
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="paper-plane" size={52} color="#fff" />
            </View>
          </View>
          <Text style={styles.heroTitle}>LUXCHAT</Text>
          <Text style={styles.heroSub}>Tezkor va xavfsiz messenjer</Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Kirish</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Telefon raqam va parolni kiriting</Text>

          {/* Phone */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Text style={[styles.prefix, { color: colors.textSecondary }]}>+998</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="90 123 45 67"
              placeholderTextColor={colors.textHint}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: colors.text }]}
              placeholder="Parol"
              placeholderTextColor={colors.textHint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Button */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.82}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Kirish</Text>}
          </TouchableOpacity>

          {/* Register link */}
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Register')}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>Akkaunt yo'qmi? </Text>
            <Text style={[styles.linkBold, { color: colors.primary }]}>Ro'yxatdan o'tish</Text>
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
  logoWrap: { marginBottom: 16 },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroTitle: { fontSize: 30, fontWeight: '700', color: '#fff', marginBottom: 6 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.82)' },
  card: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  cardSub: { fontSize: 14, marginBottom: 28 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 54,
    marginBottom: 14,
  },
  prefix: { fontSize: 15, fontWeight: '600', paddingRight: 10 },
  divider: { width: 1, height: 22, marginRight: 10 },
  inputIcon: { marginRight: 8 },
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
