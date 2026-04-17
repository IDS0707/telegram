import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Modal, TextInput, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';

export default function ScheduledMessagesScreen({ route, navigation }) {
  const { chatId, chatName } = route.params;
  const { colors, isDark } = useTheme();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [content, setContent] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [creating, setCreating] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: chatName ? `Rejalashtirilgan • ${chatName}` : 'Rejalashtirilgan',
      headerRight: () => (
        <TouchableOpacity onPress={() => setScheduleModal(true)} style={{ padding: 4, marginRight: 4 }}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, chatName, colors.primary]);

  const fetchScheduled = async () => {
    try {
      const res = await apiClient.get(`/scheduled/${chatId}`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.log('fetchScheduled error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchScheduled(); }, []));

  const handleCreate = async () => {
    if (!content.trim()) {
      Alert.alert('Xato', 'Xabar matnini kiriting');
      return;
    }
    if (!dateStr.trim()) {
      Alert.alert('Xato', 'Sana va vaqtni kiriting\nMasalan: 2026-04-17T15:00:00+05:00');
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post(`/scheduled/${chatId}`, {
        content: content.trim(),
        scheduled_at: dateStr.trim(),
      });
      setMessages(prev => [...prev, res.data]);
      setScheduleModal(false);
      setContent('');
      setDateStr('');
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Rejalashtirib bo\'lmadi');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (msgId) => {
    Alert.alert('O\'chirish', 'Rejalashtirilgan xabarni o\'chirmoqchimisiz?', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'O\'chirish', style: 'destructive', onPress: async () => {
          try {
            await apiClient.delete(`/scheduled/${msgId}`);
            setMessages(prev => prev.filter(m => m.id !== msgId));
          } catch (e) {
            Alert.alert('Xato', 'O\'chirib bo\'lmadi');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={[styles.item, { backgroundColor: colors.surface }]}>
      <View style={[styles.clockIcon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="time-outline" size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemContent, { color: colors.text }]} numberOfLines={2}>
          {item.content || '[Media]'}
        </Text>
        <Text style={[styles.itemTime, { color: colors.textSecondary }]}>
          {format(new Date(item.scheduled_at), 'dd MMM yyyy, HH:mm')}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 8 }}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchScheduled(); }} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={64} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Rejalashtirilgan xabarlar yo'q{'\n'}Yangi xabar rejalashtiring
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={scheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated || colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Xabar rejalashtirish</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Xabar matni"
              placeholderTextColor={colors.textHint}
              value={content}
              onChangeText={setContent}
              multiline
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Sana (masalan: 2026-04-17T15:00:00+05:00)"
              placeholderTextColor={colors.textHint}
              value={dateStr}
              onChangeText={setDateStr}
              autoCapitalize="none"
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              ISO 8601 formatida kiriting: YYYY-MM-DDTHH:MM:SS±HH:MM
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setScheduleModal(false)} style={[styles.btn, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} style={[styles.btn, { backgroundColor: colors.primary }]} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Rejalashtirish</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 12 },
  clockIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  itemContent: { fontSize: 15, marginBottom: 4 },
  itemTime: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
