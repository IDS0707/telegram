import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import apiClient from '../../services/api';
import { format, isToday, isYesterday } from 'date-fns';

const MESSAGE_TYPE_ICONS = {
  image: { icon: 'image-outline', label: 'Rasm' },
  video: { icon: 'videocam-outline', label: 'Video' },
  voice: { icon: 'mic-outline', label: 'Ovoz' },
  audio: { icon: 'musical-notes-outline', label: 'Audio' },
  file: { icon: 'document-outline', label: 'Fayl' },
  location: { icon: 'location-outline', label: 'Joylashuv' },
  poll: { icon: 'stats-chart-outline', label: 'So\'rovnoma' },
  text: { icon: 'text-outline', label: 'Matn' },
};

const TYPE_FILTERS = [
  { key: '', label: 'Barchasi' },
  { key: 'text', label: 'Matn' },
  { key: 'image', label: 'Rasmlar' },
  { key: 'video', label: 'Videolar' },
  { key: 'voice', label: 'Ovozli' },
  { key: 'file', label: 'Fayllar' },
  { key: 'location', label: 'Joylashuv' },
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Kecha';
  return format(d, 'dd.MM.yyyy');
}

export default function MessageSearchScreen({ navigation, route }) {
  const { chatId, chatTitle } = route.params || {};
  const { colors, isDark } = useTheme();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback(
    async (q, type) => {
      if (!q.trim() && !type) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (type) params.set('type', type);
        const { data } = await apiClient.get(
          `/chats/${chatId}/search/advanced?${params.toString()}`,
        );
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [chatId],
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, typeFilter), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, typeFilter, search]);

  const getPreview = (msg) => {
    if (msg.message_type === 'location') return '📍 Joylashuv';
    if (msg.message_type === 'poll') return '📊 So\'rovnoma';
    const info = MESSAGE_TYPE_ICONS[msg.message_type];
    if (info && msg.message_type !== 'text') return `${msg.file_name || info.label}`;
    return msg.content || '';
  };

  const renderItem = ({ item }) => {
    const typeInfo = MESSAGE_TYPE_ICONS[item.message_type] || MESSAGE_TYPE_ICONS.text;
    return (
      <Pressable
        style={[styles.resultItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0' }]}
        onPress={() => navigation.navigate('Chat', { chat: { id: item.chat_id }, scrollToMessageId: item.id })}
      >
        <View style={[styles.typeIcon, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name={typeInfo.icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.resultInfo}>
          <View style={styles.resultRow}>
            <Text style={[styles.senderName, { color: colors.text }]}>
              {item.sender?.display_name || 'Foydalanuvchi'}
            </Text>
            <Text style={[styles.resultTime, { color: colors.textSecondary }]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
          <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>
            {getPreview(item)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <TextInput
          style={[styles.searchInput, { color: colors.text, backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' }]}
          placeholder={`${chatTitle || 'Chat'}da qidirish...`}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Type filters */}
      <View>
        <FlatList
          horizontal
          data={TYPE_FILTERS}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setTypeFilter(item.key === typeFilter ? '' : item.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: typeFilter === item.key ? colors.primary : (isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7'),
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: typeFilter === item.key ? '#FFF' : colors.text }]}>
                {item.label}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.filterRow}
          showsHorizontalScrollIndicator={false}
        />
      </View>

      {/* Results */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.resultList}
          ListEmptyComponent={
            query || typeFilter ? (
              <View style={styles.emptyBox}>
                <Ionicons name="search-outline" size={40} color={colors.textSecondary} style={{ marginBottom: 10 }} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Hech narsa topilmadi</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="search-outline" size={40} color={colors.textSecondary} style={{ marginBottom: 10 }} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Qidirish uchun yozing</Text>
              </View>
            )
          }
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
  },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  filterChipText: { fontSize: 13, fontWeight: '500' },
  resultList: { paddingBottom: 20 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultInfo: { flex: 1 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  senderName: { fontSize: 15, fontWeight: '600' },
  resultTime: { fontSize: 12 },
  preview: { fontSize: 14, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14 },
});
