import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../services/api';
import { BASE_URL } from '../../../config/api';

const AUTO_DELETE_OPTIONS = [
  { label: 'O\'chirilmaydi', value: 0 },
  { label: '1 soat', value: 3600 },
  { label: '1 kun', value: 86400 },
  { label: '1 hafta', value: 604800 },
  { label: '1 oy', value: 2592000 },
];

export default function GroupAdminScreen({ navigation, route }) {
  const { chatId } = route.params || {};
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();

  const [chat, setChat] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [autoDelete, setAutoDelete] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/chats/${chatId}`);
      setChat(data);
      setMembers(data.members || []);
      setEditTitle(data.title || '');
      setEditDesc(data.description || '');
      setAutoDelete(data.auto_delete_seconds || 0);
    } catch {
      Alert.alert('Xato', 'Ma\'lumot yuklab bo\'lmadi');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const saveInfo = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/chats/${chatId}`, { title: editTitle, description: editDesc });
      Alert.alert('Muvaffaqiyat', 'Ma\'lumot yangilandi');
    } catch {
      Alert.alert('Xato', 'Saqlash muvaffaqiyatsiz');
    } finally {
      setSaving(false);
    }
  };

  const generateLink = async () => {
    try {
      const { data } = await apiClient.post(`/chats/${chatId}/invite-link`);
      setInviteLink(data.invite_link);
      Alert.alert('Havola yaratildi', `Havola kodi: ${data.invite_link}`);
    } catch {
      Alert.alert('Xato', 'Havola yaratib bo\'lmadi');
    }
  };

  const setAutoDeleteTimer = async (seconds) => {
    setAutoDelete(seconds);
    try {
      await apiClient.post(`/chats/${chatId}/messages/auto-delete`, { seconds });
    } catch {
      Alert.alert('Xato', 'Auto-o\'chirish o\'rnatilmadi');
    }
  };

  const promoteMember = async (memberId) => {
    try {
      await apiClient.put(`/chats/${chatId}/members/${memberId}/promote`);
      setMembers((prev) => prev.map((m) => m.user_id === memberId ? { ...m, role: 'admin' } : m));
    } catch {
      Alert.alert('Xato', 'Admin tayinlab bo\'lmadi');
    }
  };

  const demoteMember = async (memberId) => {
    try {
      await apiClient.put(`/chats/${chatId}/members/${memberId}/demote`);
      setMembers((prev) => prev.map((m) => m.user_id === memberId ? { ...m, role: 'member' } : m));
    } catch {
      Alert.alert('Xato', 'Admin unvonini olib bo\'lmadi');
    }
  };

  const kickMember = (memberId, name) => {
    Alert.alert(
      `${name}ni chiqarish`,
      'Bu foydalanuvchini guruhdan chiqarishni xohlaysizmi?',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Chiqarish',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/chats/${chatId}/members/${memberId}`);
              setMembers((prev) => prev.filter((m) => m.user_id !== memberId));
            } catch {
              Alert.alert('Xato', 'Chiqarib bo\'lmadi');
            }
          },
        },
      ],
    );
  };

  const renderMember = ({ item }) => {
    const isMe = item.user_id === user?.id;
    const avatarUri = item.user?.avatar_url ? `${BASE_URL}${item.user.avatar_url}` : null;
    return (
      <View style={[styles.memberRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0' }]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.memberAvatar} />
        ) : (
          <View style={[styles.memberAvatar, { backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>
              {(item.user?.display_name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.text }]}>{item.user?.display_name || 'Foydalanuvchi'}</Text>
          <View style={styles.roleRow}>
            <Text style={[styles.roleText, { color: item.role === 'admin' ? colors.primary : colors.textSecondary }]}>
              {item.role === 'admin' ? 'Admin' : 'A\'zo'}
            </Text>
          </View>
        </View>
        {!isMe && (
          <View style={styles.memberActions}>
            {item.role !== 'admin' ? (
              <Pressable onPress={() => promoteMember(item.user_id)} hitSlop={6} style={styles.actionBtn}>
                <Ionicons name="shield-outline" size={18} color={colors.primary} />
              </Pressable>
            ) : (
              <Pressable onPress={() => demoteMember(item.user_id)} hitSlop={6} style={styles.actionBtn}>
                <Ionicons name="shield-half-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable onPress={() => kickMember(item.user_id, item.user?.display_name || '')} hitSlop={6} style={styles.actionBtn}>
              <Ionicons name="person-remove-outline" size={18} color={colors.danger || '#FF3B30'} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Guruh boshqaruvi</Text>
        <Pressable onPress={saveInfo} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Saqlash</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group info */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.surfaceElevated : '#FFF' }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GURUH MA'LUMOTLARI</Text>
          <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nom</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#DDD' }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Guruh nomi"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Tavsif</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#DDD', height: 80 }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Guruh tavsifi"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </View>
        </View>

        {/* Invite link */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.surfaceElevated : '#FFF' }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TAKLIF HAVOLASI</Text>
          {inviteLink ? (
            <View style={[styles.linkBox, { backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' }]}>
              <Text style={[styles.linkText, { color: colors.primary }]} selectable>{inviteLink}</Text>
            </View>
          ) : null}
          <Pressable style={[styles.actionRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]} onPress={generateLink}>
            <Ionicons name="link-outline" size={20} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Yangi havola yaratish</Text>
          </Pressable>
        </View>

        {/* Auto-delete */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.surfaceElevated : '#FFF' }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>XABARLARNI AVTOMATIK O'CHIRISH</Text>
          {AUTO_DELETE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.optionRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0' }]}
              onPress={() => setAutoDeleteTimer(opt.value)}
            >
              <Text style={[styles.optionText, { color: colors.text }]}>{opt.label}</Text>
              {autoDelete === opt.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </View>

        {/* Members */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.surfaceElevated : '#FFF' }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            A'ZOLAR ({members.length})
          </Text>
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            scrollEnabled={false}
          />
        </View>
      </ScrollView>
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
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: {
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { paddingHorizontal: 16, paddingBottom: 12 },
  inputLabel: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  linkBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10 },
  linkText: { fontSize: 14 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 15, fontWeight: '500' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 15 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '500' },
  roleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  roleText: { fontSize: 12 },
  memberActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 4 },
});
