import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Kecha';
  return format(d, 'dd.MM.yyyy');
}

export default function SavedMessagesScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSaved = useCallback(async () => {
    try {
      const res = await apiClient.get('/saved-messages');
      setItems(res.data ?? []);
    } catch (e) {
      Alert.alert('Xato', "Saqlangan xabarlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const handleUnsave = async (item) => {
    const msgId = item.message?.id ?? item.message_id;
    const chatId = item.message?.chat_id;
    if (!msgId || !chatId) return;
    try {
      await apiClient.delete(`/chats/${chatId}/messages/${msgId}/save`);
      setItems((prev) => prev.filter((i) => (i.message?.id ?? i.message_id) !== msgId));
    } catch {
      Alert.alert('Xato', "O'chirib bo'lmadi");
    }
  };

  const renderItem = ({ item }) => {
    const msg = item.message ?? item;
    const sender = msg.sender ?? msg.Sender;
    const senderName = sender?.display_name ?? sender?.username ?? 'Foydalanuvchi';
    const avatarUri = sender?.avatar_url ? `${BASE_URL}${sender.avatar_url}` : null;
    const isMedia = !msg.content && (msg.media_url || msg.file_url);

    return (
      <View style={[styles.item, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarLetter}>{senderName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={[styles.name, { color: colors.primary }]} numberOfLines={1}>{senderName}</Text>
            <Text style={[styles.time, { color: colors.textSecondary }]}>{formatTime(item.saved_at ?? msg.created_at)}</Text>
          </View>
          <Text style={[styles.content, { color: colors.text }]} numberOfLines={2}>
            {isMedia ? '📎 Media fayl' : (msg.content ?? '')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleUnsave(item)} style={styles.unsaveBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="bookmark" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <FlatList
        data={items}
        keyExtractor={(item, idx) => String(item.id ?? idx)}
        renderItem={renderItem}
        onRefresh={loadSaved}
        refreshing={refreshing}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={56} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Saqlangan xabarlar yo'q
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textHint ?? colors.textSecondary }]}>
              Xabarlarni saqlash uchun kontekst menyusida "Saqlash" tugmasini bosing
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '700' },
  body: { flex: 1, marginRight: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  time: { fontSize: 12 },
  content: { fontSize: 14, lineHeight: 19 },
  unsaveBtn: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  emptyHint: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
