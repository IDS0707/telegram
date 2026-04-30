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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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

    // Strip spaces from phone and prepend +998
    const cleanPhone = '+998' + phone.trim().replace(/\s+/g, '');

    setLoading(true);
    try {
      await login(cleanPhone, password);
    } catch (err) {
      const message = err?.response?.data?.error ?? err?.message ?? t('loginFailed');
      Alert.alert(t('error'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <LinearGradient
        colors={isDark ? ['#061323', '#0D223E', '#122F4F'] : ['#0A84FF', '#2B9EFF', '#7AC8FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBg}
      >
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.hero, { paddingTop: insets.top + 32 }]}> 
              <BlurView intensity={20} tint="light" style={styles.logoWrap}>
                <View style={styles.logoInner}>
                  <Ionicons name="paper-plane" size={42} color="#FFFFFF" />
                </View>
              </BlurView>
              <Text style={styles.brand}>Telegram</Text>
              <Text style={styles.tagline}>Tezkor va xavfsiz muloqot</Text>
            </View>

            <BlurView intensity={isDark ? 32 : 55} tint={isDark ? 'dark' : 'light'} style={styles.formBlur}>
              <View style={[styles.formCard, { backgroundColor: isDark ? 'rgba(18,24,33,0.82)' : 'rgba(255,255,255,0.90)' }]}> 
                <Text style={[styles.title, { color: colors.text }]}>Kirish</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Hisobingizga telefon raqam orqali kiring</Text>

                <View style={[styles.field, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}> 
                  <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={styles.icon} />
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
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>

                <View style={[styles.field, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}> 
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.icon} />
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
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.loginBtn, loading && styles.btnDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#0A84FF', '#1B9CFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.loginBtnInner}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.loginBtnText}>Kirish</Text>
                        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Register')} activeOpacity={0.8}>
                  <Text style={[styles.linkText, { color: colors.textSecondary }]}>Akkauntingiz yo'qmi? </Text>
                  <Text style={[styles.linkStrong, { color: colors.primary }]}>Royxatdan otish</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroBg: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingBottom: 58,
  },
  logoWrap: {
    borderRadius: 36,
    overflow: 'hidden',
    marginBottom: 14,
  },
  logoInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  formBlur: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    marginTop: -18,
  },
  formCard: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  field: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  icon: { marginRight: 10 },
  prefix: { fontSize: 15, fontWeight: '700', marginRight: 8 },
  divider: { width: 1, height: 22, marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
    fontWeight: '500',
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 6,
  },
  loginBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#0A84FF',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  loginBtnInner: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  btnDisabled: { opacity: 0.6 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 14 },
  linkStrong: { fontSize: 14, fontWeight: '800' },
});