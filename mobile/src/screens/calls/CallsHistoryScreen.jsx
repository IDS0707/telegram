import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday } from 'date-fns';
import apiClient from '../../services/api';
import { callService } from '../../services/callService';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

function formatDuration(secs) {
  if (secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getStatusIcon(status, isOutgoing, colors) {
  // Diagonal arrows like real Telegram
  if (status === 'missed' || status === 'declined') {
    return { name: 'arrow-down-outline', color: colors.danger };
  }
  return { name: isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline', color: colors.success };
}

export default function CallsHistoryScreen({ navigation }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'missed'
  const currentUser = useAuthStore((s) => s.user);
  const { colors, isDark } = useTheme();

  const loadCalls = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get('/calls/history');
      const data = res.data;
      setCalls(Array.isArray(data) ? data : data?.calls ?? data?.data ?? []);
    } catch {
      console.error('Failed to load calls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCalls();
    }, [loadCalls])
  );

  const initiateCall = async (userId, name, type) => {
    try {
      const started = await callService.initiateCall(userId, name, type);
      if (!started) {
        Alert.alert('Qo\'ng\'iroq', 'Qo\'ng\'iroqni boshlab bo\'lmadi. Web versiyada yoki Expo Go ichida cheklov bo\'lishi mumkin.');
        return;
      }
      navigation.navigate('Call');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to start call');
    }
  };

  const renderCall = ({ item }) => {
    const isOutgoing = item.caller_id === currentUser?.id;
    const other = isOutgoing ? item.callee : item.caller;
    const { name: iconName, color: iconColor } = getStatusIcon(item.status, isOutgoing, colors);
    const avatarColors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC'];
    const ci = (other.display_name?.charCodeAt(0) ?? 0) % avatarColors.length;
    const isMissed = item.status === 'missed' || item.status === 'declined';
    const callColor = isMissed ? colors.danger : colors.success;
    const directionIcon = isOutgoing ? 'arrow-up' : 'arrow-down';
    const callTypeIcon = item.call_type === 'video' ? 'videocam' : 'call';
    const timeStr = isToday(new Date(item.started_at))
      ? format(new Date(item.started_at), 'HH:mm')
      : format(new Date(item.started_at), 'dd MMM');

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.background }]}
        activeOpacity={0.65}
        onPress={() => {
          Alert.alert(
            other.display_name,
            null,
            [
              { text: 'Voice Call', onPress: () => initiateCall(other.id, other.display_name, 'voice') },
              { text: 'Video Call', onPress: () => initiateCall(other.id, other.display_name, 'video') },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }}
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {other.avatar_url ? (
            <Image source={{ uri: `${BASE_URL}${other.avatar_url}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColors[ci] }]}>
              <Text style={styles.avatarLetter}>{other.display_name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={[styles.infoWrap, { borderBottomColor: colors.divider }]}>
          <View style={styles.infoTop}>
            <Text style={[styles.name, { color: isMissed ? colors.danger : colors.text }]} numberOfLines={1}>
              {other.display_name}
            </Text>
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>{timeStr}</Text>
          </View>
          <View style={styles.infoBottom}>
            <Ionicons name={directionIcon} size={13} color={callColor} />
            <Ionicons name={callTypeIcon} size={13} color={colors.textSecondary} style={{ marginLeft: 4 }} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {'  '}{isOutgoing ? 'Outgoing' : 'Incoming'}
              {item.call_type === 'video' ? ' video' : ' voice'}
              {item.duration > 0 ? ` · ${formatDuration(item.duration)}` : ''}
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.callIconBtn, { backgroundColor: colors.primaryLight }]}
              onPress={() => initiateCall(other.id, other.display_name, item.call_type)}
            >
              <Ionicons name={callTypeIcon} size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const filteredCalls = filterTab === 'missed'
    ? calls.filter((c) => c.status === 'missed' || c.status === 'declined')
    : calls;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* All / Missed filter tabs */}
      <View style={[styles.filterRow, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        {[{ key: 'all', label: 'Barchasi' }, { key: 'missed', label: "O'tkazib yuborilgan" }].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilterTab(key)}
            style={[styles.filterTab, filterTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.filterTabText, { color: filterTab === key ? colors.primary : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filteredCalls}
        keyExtractor={(c) => c.id}
        renderItem={renderCall}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadCalls(true); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="call-outline" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {filterTab === 'missed' ? "O'tkazib yuborilgan qo'ng'iroqlar yo'q" : "Hali qo'ng'iroqlar yo'q"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Qo'ng'iroqlar tarixi bu yerda ko'rsatiladi
            </Text>
          </View>
        }
        contentContainerStyle={filteredCalls.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabText: { fontSize: 14, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#ffffff', fontSize: 21, fontWeight: '700' },
  infoWrap: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  infoBottom: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  timeText: { fontSize: 12 },
  statusText: { fontSize: 13 },
  callIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyContainer: { flexGrow: 1 },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
