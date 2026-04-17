import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Image, Modal, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

export default function StickersScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [mySets, setMySets] = useState([]);
  const [allSets, setAllSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [createModal, setCreateModal] = useState(false);
  const [setName, setSetName] = useState('');
  const [setTitle, setSetTitle] = useState('');
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

  const fetchData = async () => {
    try {
      const [myRes, allRes] = await Promise.all([
        apiClient.get('/stickers'),
        apiClient.get('/stickers/all'),
      ]);
      setMySets(Array.isArray(myRes.data) ? myRes.data : []);
      setAllSets(Array.isArray(allRes.data) ? allRes.data : []);
    } catch (e) {
      console.log('fetchData stickers error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleCreateSet = async () => {
    if (!setName.trim() || !setTitle.trim()) {
      Alert.alert('Xato', 'Nom va sarlavhani kiriting');
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post('/stickers/sets', { name: setName.trim(), title: setTitle.trim() });
      setMySets(prev => [res.data, ...prev]);
      setCreateModal(false);
      setSetName('');
      setSetTitle('');
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Yaratib bo\'lmadi');
    } finally {
      setCreating(false);
    }
  };

  const handleAddToMine = async (setId) => {
    try {
      await apiClient.post(`/stickers/sets/${setId}/add`);
      await fetchData();
      Alert.alert('Muvaffaqiyat', 'Stiker paketi qo\'shildi');
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Qo\'shib bo\'lmadi');
    }
  };

  const handleRemove = async (setId) => {
    try {
      await apiClient.delete(`/stickers/sets/${setId}/remove`);
      setMySets(prev => prev.filter(s => s.id !== setId));
    } catch (e) {
      Alert.alert('Xato', 'O\'chirib bo\'lmadi');
    }
  };

  const renderSet = ({ item }, isMySet = false) => (
    <View style={[styles.setRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Thumb */}
      {item.stickers?.[0]?.file_url ? (
        <Image source={{ uri: `${BASE_URL}${item.stickers[0].file_url}` }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumbPlaceholder, { backgroundColor: colors.border }]}>
          <Ionicons name="happy-outline" size={24} color={colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.setTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.setSub, { color: colors.textSecondary }]}>
          {item.stickers?.length ?? 0} stiker
        </Text>
      </View>
      {isMySet ? (
        <TouchableOpacity onPress={() => handleRemove(item.id)} style={{ padding: 8 }}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => handleAddToMine(item.id)}
          style={[styles.addBtn, { backgroundColor: colors.primaryLight }]}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const displayData = tab === 'mine' ? mySets : allSets;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {[{ key: 'mine', label: 'Mening' }, { key: 'all', label: 'Barcha' }].map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={displayData}
          keyExtractor={i => i.id}
          renderItem={({ item }) => renderSet({ item }, tab === 'mine')}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="happy-outline" size={64} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {tab === 'mine' ? 'Stiker paketi yo\'q' : 'Hali paketlar yo\'q'}
              </Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      )}

      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated || colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Yangi stiker paketi</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Paket nomi (lotin, bo'sh joysiz)"
              placeholderTextColor={colors.textHint}
              value={setName}
              onChangeText={setSetName}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Sarlavha (ko'rinadigan nom)"
              placeholderTextColor={colors.textHint}
              value={setTitle}
              onChangeText={setSetTitle}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateModal(false)} style={[styles.btn, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateSet} style={[styles.btn, { backgroundColor: colors.primary }]} disabled={creating}>
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
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52, borderRadius: 8, marginRight: 12 },
  thumbPlaceholder: { width: 52, height: 52, borderRadius: 8, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  setTitle: { fontSize: 16, fontWeight: '600' },
  setSub: { fontSize: 13, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
