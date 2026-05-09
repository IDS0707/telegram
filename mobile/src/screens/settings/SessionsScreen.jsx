import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import apiClient from '../../services/api';
import { format } from 'date-fns';

const DEVICE_ICONS = {
  mobile: 'phone-portrait-outline',
  tablet: 'tablet-portrait-outline',
  desktop: 'desktop-outline',
  web: 'globe-outline',
};

const SESSIONS_CACHE_KEY = 'schat_sessions_cache_v1';

export default function SessionsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hydrate from cache so the list renders instantly on reopen.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSIONS_CACHE_KEY);
        if (!mounted || !raw) return;
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length) {
          setSessions(cached);
          setLoading(false);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/sessions');
      const list = data || [];
      setSessions(list);
      AsyncStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
    } catch {
      /* keep cached */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeSession = (sessionId) => {
    Alert.alert(
      'Seansni tugatish',
      'Bu qurilmadan chiqishni xohlaysizmi?',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Tugatish',
          style: 'destructive',
          onPress: async () => {
            await apiClient.delete(`/sessions/${sessionId}`);
            setSessions((s) => s.filter((x) => x.id !== sessionId));
          },
        },
      ],
    );
  };

  const revokeAll = () => {
    Alert.alert(
      'Barcha seanslarni tugatish',
      'Joriy seans tashqari barcha seanslar tugatiladi.',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Tugatish',
          style: 'destructive',
          onPress: async () => {
            await apiClient.delete('/sessions');
            setSessions((s) => s.filter((x) => x.is_current));
          },
        },
      ],
    );
  };

  const renderItem = ({ item }) => {
    const icon = DEVICE_ICONS[item.device_type] || 'phone-portrait-outline';
    return (
      <View style={[styles.card, { backgroundColor: isDark ? colors.surfaceElevated : '#FFF' }]}>
        <View style={[styles.iconBox, { backgroundColor: item.is_current ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7') }]}>
          <Ionicons name={icon} size={22} color={item.is_current ? colors.primary : colors.textSecondary} />
        </View>
        <View style={styles.info}>
          <View style={styles.row}>
            <Text style={[styles.deviceName, { color: colors.text }]}>{item.device_name}</Text>
            {item.is_current && (
              <View style={[styles.currentBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.currentBadgeText}>Joriy</Text>
              </View>
            )}
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {item.platform} · {item.ip_address}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Oxirgi faollik: {format(new Date(item.last_active_at), 'dd.MM.yyyy HH:mm')}
          </Text>
        </View>
        {!item.is_current && (
          <Pressable onPress={() => revokeSession(item.id)} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={22} color={colors.danger || '#FF3B30'} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface || colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Faol seanslar</Text>
        <Pressable onPress={revokeAll} hitSlop={8}>
          <Text style={{ color: colors.danger || '#FF3B30', fontSize: 14 }}>Barchasini tugatish</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Faol seanslar yo'q</Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '600' },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 15 },
});
