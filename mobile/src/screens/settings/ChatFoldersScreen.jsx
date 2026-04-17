import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';

const FOLDER_EMOJIS = ['📁', '💬', '👥', '📢', '⭐', '🔔', '🏠', '💼', '🎮', '📚'];

export default function ChatFoldersScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('📁');
  const [creating, setCreating] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setCreateModal(true)} style={{ padding: 4, marginRight: 4 }}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const fetchFolders = async () => {
    try {
      const res = await apiClient.get('/folders');
      setFolders(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.log('fetchFolders error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchFolders(); }, []));

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Xato', 'Papka nomini kiriting');
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post('/folders', { name: name.trim(), emoji: selectedEmoji });
      setFolders(prev => [...prev, res.data]);
      setCreateModal(false);
      setName('');
      setSelectedEmoji('📁');
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Papka yaratib bo\'lmadi');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (folderId, folderName) => {
    Alert.alert('O\'chirish', `"${folderName}" papkasini o\'chirmoqchimisiz?`, [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'O\'chirish', style: 'destructive', onPress: async () => {
          try {
            await apiClient.delete(`/folders/${folderId}`);
            setFolders(prev => prev.filter(f => f.id !== folderId));
          } catch (e) {
            Alert.alert('Xato', 'O\'chirib bo\'lmadi');
          }
        },
      },
    ]);
  };

  const renderFolder = ({ item }) => (
    <View style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <Text style={styles.folderEmoji}>{item.emoji}</Text>
      <View style={styles.info}>
        <Text style={[styles.folderName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.folderSub, { color: colors.textSecondary }]}>
          {Array.isArray(item.items) ? item.items.length : 0} chat
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={{ padding: 8 }}>
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
          data={folders}
          keyExtractor={i => i.id}
          renderItem={renderFolder}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFolders(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={64} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Hali papka yo'q{'\n'}Yangi papka yarating
              </Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      )}

      {/* Create Folder Modal */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated || colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Yangi papka</Text>

            {/* Emoji picker */}
            <Text style={[styles.emojiLabel, { color: colors.textSecondary }]}>Ikonka tanlang</Text>
            <View style={styles.emojiRow}>
              {FOLDER_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => setSelectedEmoji(emoji)}
                  style={[
                    styles.emojiOption,
                    selectedEmoji === emoji && { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Papka nomi"
              placeholderTextColor={colors.textHint}
              value={name}
              onChangeText={setName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateModal(false)} style={[styles.btn, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} style={[styles.btn, { backgroundColor: colors.primary }]} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Yaratish</Text>}
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
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  folderEmoji: { fontSize: 28, marginRight: 14 },
  info: { flex: 1 },
  folderName: { fontSize: 16, fontWeight: '600' },
  folderSub: { fontSize: 13, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emojiLabel: { fontSize: 13 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOption: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
