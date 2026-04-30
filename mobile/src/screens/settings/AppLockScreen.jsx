import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';

const APP_LOCK_KEY = 'app_lock_v1';

export default function AppLockScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('setup'); // setup, confirm, enter
  const [confirmPin, setConfirmPin] = useState('');

  const handleSetupPin = async () => {
    if (pin.length < 4) {
      Alert.alert('Xato', 'PIN 4 ta raqamdan iborat bo\'lishi kerak');
      return;
    }
    setMode('confirm');
    setConfirmPin(pin);
    setPin('');
  };

  const handleConfirmPin = async () => {
    if (pin !== confirmPin) {
      Alert.alert('Xato', 'PIN\' lar mos emas');
      setPin('');
      setConfirmPin('');
      setMode('setup');
      return;
    }
    try {
      await AsyncStorage.setItem(APP_LOCK_KEY, JSON.stringify({ pin: confirmPin, enabled: true }));
      Alert.alert('Tayyor', 'App Lock sozlandi');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Xato', 'Sozlamalarni saqlashda xatolik');
    }
  };

  const handleCancel = () => {
    setPin('');
    setConfirmPin('');
    setMode('setup');
  };

  return (
    <SafeAreaView style={[S.container, { backgroundColor: colors.surface }]}>
      <View style={[S.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={[S.backText, { color: colors.primary }]}>Ortga</Text>
        </Pressable>
        <Text style={[S.headerTitle, { color: colors.text }]}>App Qulfla</Text>
        <View style={S.backBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.content}>
        <View style={S.section}>
          <Text style={[S.label, { color: colors.text }]}>
            {mode === 'setup' ? 'PIN Kiriting (4 ta raqam)' : mode === 'confirm' ? 'PIN Tasdiqlang' : 'PIN Kiriting'}
          </Text>
          <TextInput
            style={[
              S.pinInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            placeholder="0000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            value={pin}
            onChangeText={setPin}
          />

          <View style={S.buttonRow}>
            {mode === 'setup' && (
              <Pressable
                style={[S.btn, S.btnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleSetupPin}
              >
                <Text style={S.btnText}>Keyingi</Text>
              </Pressable>
            )}
            {mode === 'confirm' && (
              <>
                <Pressable style={[S.btn, S.btnSecondary, { borderColor: colors.border }]} onPress={handleCancel}>
                  <Text style={[S.btnText, { color: colors.text }]}>Bekor</Text>
                </Pressable>
                <Pressable
                  style={[S.btn, S.btnPrimary, { backgroundColor: colors.primary }]}
                  onPress={handleConfirmPin}
                >
                  <Text style={S.btnText}>Saqlash</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
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
  content: { flex: 1, padding: 16 },
  section: { backgroundColor: 'transparent' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  pinInput: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 12,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  buttonRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2AABEE' },
  btnSecondary: { borderWidth: 1 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});

export { APP_LOCK_KEY };
