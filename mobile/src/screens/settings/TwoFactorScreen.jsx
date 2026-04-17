import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';

export default function TwoFactorScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/2fa/status');
        setIsEnabled(res.data.enabled);
      } catch (e) {
        console.log('2fa status error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleEnable = async () => {
    if (!password) {
      Alert.alert('Xato', 'Parolni kiriting');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Xato', 'Parol kamida 6 ta belgi bo\'lishi kerak');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Xato', 'Parollar mos kelmadi');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/2fa/enable', { password });
      setIsEnabled(true);
      setRecoveryCode(res.data.recovery_code);
      setPassword('');
      setConfirmPassword('');
      Alert.alert(
        'Muvaffaqiyat',
        `Ikki bosqichli autentifikatsiya yoqildi!\n\nTiklash kodi:\n${res.data.recovery_code}\n\nBu kodni xavfsiz joyda saqlang!`,
        [{ text: 'OK' }]
      );
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Amalga oshmadi');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!password) {
      Alert.alert('Xato', 'Mavjud parolni kiriting');
      return;
    }
    Alert.alert('Tasdiqlash', '2FA ni o\'chirmoqchimisiz?', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'O\'chirish', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await apiClient.post('/2fa/disable', { password });
            setIsEnabled(false);
            setPassword('');
          } catch (e) {
            Alert.alert('Xato', e.response?.data?.error || 'Noto\'g\'ri parol');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Status card */}
        <View style={[styles.statusCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.statusIcon, { backgroundColor: isEnabled ? '#4CAF5020' : '#9E9E9E20' }]}>
            <Ionicons
              name={isEnabled ? 'shield-checkmark' : 'shield-outline'}
              size={36}
              color={isEnabled ? '#4CAF50' : colors.textSecondary}
            />
          </View>
          <Text style={[styles.statusTitle, { color: colors.text }]}>
            {isEnabled ? 'Faol' : 'Faol emas'}
          </Text>
          <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
            {isEnabled
              ? 'Hisobingiz ikki bosqichli parol bilan himoyalangan'
              : 'Hisobingizga qo\'shimcha himoya qo\'shing'}
          </Text>
        </View>

        {/* Password input */}
        <View style={[styles.inputGroup, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {isEnabled ? 'Mavjud parol' : 'Yangi parol'}
          </Text>
          <View style={[styles.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Parolni kiriting"
              placeholderTextColor={colors.textHint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 8 }}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!isEnabled && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>Parolni tasdiqlang</Text>
              <View style={[styles.inputRow, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Parolni takrorlang"
                  placeholderTextColor={colors.textHint}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>
            </>
          )}
        </View>

        {/* Hint */}
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {isEnabled
            ? 'Ikki bosqichli tasdiqlashni o\'chirish uchun mavjud parolni kiriting'
            : 'Bu parol telefon raqamingiz bilan birga talab qilinadi'}
        </Text>

        {/* Action button */}
        <TouchableOpacity
          onPress={isEnabled ? handleDisable : handleEnable}
          style={[
            styles.actionBtn,
            { backgroundColor: isEnabled ? colors.danger : colors.primary },
          ]}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.actionBtnText}>{isEnabled ? '2FA ni o\'chirish' : '2FA ni yoqish'}</Text>}
        </TouchableOpacity>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusCard: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 8 },
  statusIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  statusSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  inputGroup: { borderRadius: 12, padding: 16 },
  label: { fontSize: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  input: { flex: 1, height: 44, fontSize: 15 },
  hint: { fontSize: 13, lineHeight: 18 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
