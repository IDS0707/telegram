import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { wsService } from '../../services/websocket';
import { BASE_URL } from '../../../config/api';

const CHANNELS_CACHE_KEY = 'schat_channels_cache_v1';

export default function ChannelsListScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  // Hydrate from cache on mount so the screen renders instantly while
  // the network fetch is still in flight (Telegram-style instant open).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHANNELS_CACHE_KEY);
        if (!mounted || !raw) return;
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length) {
          setChannels(cached);
          setLoading(false);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setCreateModal(true)} style={{ padding: 4, marginRight: 4 }}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const fetchChannels = async () => {
    try {
      const res = await apiClient.get('/channels');
      const list = Array.isArray(res.data) ? res.data : [];
      setChannels(list);
      // Persist for next launch (fire and forget).
      AsyncStorage.setItem(CHANNELS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
    } catch (e) {
      console.log('fetchChannels error:', e);
      // Don't clear — keep showing cached data on network failure.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchChannels();
    }, [])
  );

  useEffect(() => {
    const unsub = wsService.on('channel_post', () => fetchChannels());
    return () => unsub();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Xato', 'Kanal nomini kiriting');
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post('/channels', { title: title.trim(), description, is_public: isPublic });
      setChannels(prev => [res.data, ...prev]);
      setCreateModal(false);
      setTitle('');
      setDescription('');
      navigation.navigate('Channel', { channel: res.data });
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Kanal yaratib bo\'lmadi');
    } finally {
      setCreating(false);
    }
  };

  const renderChannel = ({ item }) => {
    const avatarUri = item.avatar_url ? `${BASE_URL}${item.avatar_url}` : null;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Channel', { channel: item })}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarLetter}>{item.title?.charAt(0)?.toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.subscriber_count ?? 0} obunachi
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textHint} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={i => i.id}
          renderItem={renderChannel}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChannels(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={64} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Hech qanday kanal yo'q{'\n'}Yangi kanal yarating</Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      )}

      {/* Create Channel Modal */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated || colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Yangi kanal</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Kanal nomi"
              placeholderTextColor={colors.textHint}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Tavsif (ixtiyoriy)"
              placeholderTextColor={colors.textHint}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Ochiq kanal</Text>
              <TouchableOpacity
                onPress={() => setIsPublic(!isPublic)}
                style={[styles.toggle, { backgroundColor: isPublic ? colors.primary : colors.border }]}
              >
                <View style={[styles.toggleDot, { left: isPublic ? 18 : 2 }]} />
              </TouchableOpacity>
            </View>
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
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '700' },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  sub: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 15 },
  toggle: { width: 40, height: 24, borderRadius: 12, justifyContent: 'center' },
  toggleDot: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
