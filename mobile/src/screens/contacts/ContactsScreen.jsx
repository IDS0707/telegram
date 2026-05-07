import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

export default function ContactsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const loadContacts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get('/contacts');
      setContacts(res.data ?? []);
    } catch (e) {
      console.error('Failed to load contacts', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [loadContacts])
  );

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.get('/contacts/search', {
          params: { q: searchQuery.trim() },
        });
        setSearchResults(res.data ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const deleteContact = (contact) => {
    const displayName = contact?.contact?.display_name ?? contact?.display_name ?? 'Foydalanuvchi';
    Alert.alert(
      'Kontaktni o\'chirish',
      `${displayName} kontaktlardan o'chirilsinmi?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/contacts/${contact.id}`);
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
            } catch {
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  const addContactByPhone = async () => {
    if (!addPhone.trim()) return;
    setAddLoading(true);
    try {
      await apiClient.post('/contacts', { phone: addPhone.trim() });
      setAddPhone('');
      setShowAddModal(false);
      loadContacts(true);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to add contact');
    } finally {
      setAddLoading(false);
    }
  };

  const addFromSearch = async (user) => {
    try {
      await apiClient.post('/contacts', { user_id: user.id });
      setSearchQuery('');
      setSearchResults([]);
      loadContacts(true);
      Alert.alert('Done', `${user.display_name} added to contacts`);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to add');
    }
  };

  const openChat = async (userId, name) => {
    try {
      const res = await apiClient.post('/chats/private', { user_id: String(userId) });
      const chatId = res.data?.id ?? res.data?.chat_id;
      if (!chatId) throw new Error('No chat ID returned');
      navigation.navigate('Chat', {
        chatId,
        chatName: name,
        chatType: 'private',
        otherUserId: String(userId),
      });
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to open chat';
      Alert.alert('Error', msg);
    }
  };

  const renderContact = ({ item }) => {
    const user = item.contact;
    const displayName = item.nickname ?? user.display_name;
    const avatarColors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#4DD0E1'];
    const ci = (displayName?.charCodeAt(0) ?? 0) % avatarColors.length;

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.background }]}
        activeOpacity={0.65}
        onPress={() => openChat(user.id, displayName)}
        onLongPress={() => deleteContact(item)}
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {user.avatar_url ? (
            <Image source={{ uri: `${BASE_URL}${user.avatar_url}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColors[ci] }]}>
              <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {user.is_online && (
            <View style={[styles.onlineDot, { borderColor: colors.background }]} />
          )}
        </View>

        {/* Info */}
        <View style={[styles.infoWrap, { borderBottomColor: colors.divider }]}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {user.is_online ? '🟢 Onlayn' : user.username ? `@${user.username}` : user.bio ?? 'S Chat foydalanuvchisi'}
          </Text>
        </View>

        {/* Quick message icon */}
        <TouchableOpacity
          style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}
          onPress={() => openChat(user.id, displayName)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderSearchUser = ({ item }) => {
    const avatarColors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC'];
    const ci = (item.display_name?.charCodeAt(0) ?? 0) % avatarColors.length;

    return (
      <View style={[styles.row, { backgroundColor: colors.background }]}>
        <View style={styles.avatarWrap}>
          {item.avatar_url ? (
            <Image source={{ uri: `${BASE_URL}${item.avatar_url}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColors[ci] }]}>
              <Text style={styles.avatarLetter}>{item.display_name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {item.is_online && <View style={[styles.onlineDot, { borderColor: colors.background }]} />}
        </View>
        <View style={[styles.infoWrap, { borderBottomColor: colors.divider }]}>
          <Text style={[styles.name, { color: colors.text }]}>{item.display_name}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {item.username ? `@${item.username}` : 'S Chat foydalanuvchisi'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}
          onPress={() => addFromSearch(item)}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  const isSearchMode = searchQuery.trim().length >= 2;

  // Group contacts alphabetically for SectionList
  const contactSections = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      const nameA = (a.nickname ?? a.contact?.display_name ?? '').toLowerCase();
      const nameB = (b.nickname ?? b.contact?.display_name ?? '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    const groups = {};
    for (const c of sorted) {
      const name = c.nickname ?? c.contact?.display_name ?? '';
      const letter = name.charAt(0).toUpperCase() || '#';
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return Object.keys(groups).sort().map((k) => ({ title: k, data: groups[k] }));
  }, [contacts]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
        <Ionicons name="search" size={16} color={colors.textHint} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Ism yoki @username bilan qidiring"
          placeholderTextColor={colors.textHint}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={16} color={colors.textHint} />
          </TouchableOpacity>
        )}
      </View>

      {isSearchMode ? (
        searching ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(u) => String(u.id)}
            renderItem={renderSearchUser}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Foydalanuvchi topilmadi</Text>
              </View>
            }
          />
        )
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={contactSections}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderContact}
          renderSectionHeader={({ section: { title } }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>{title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadContacts(true); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            contacts.length > 0 ? (
              <Text style={[styles.listHeader, { color: colors.textSecondary, borderBottomColor: colors.divider }]}>
                {contacts.length} ta kontakt
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="people-outline" size={44} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Kontaktlar yo'q</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Kontakt qo'shish uchun + tugmasini bosing
              </Text>
            </View>
          }
          contentContainerStyle={contacts.length === 0 ? styles.emptyFlex : undefined}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="person-add" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Add Contact Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceElevated ?? colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Kontakt qo'shish</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
              placeholder="Telefon raqam (masalan: +998901234567)"
              placeholderTextColor={colors.textHint}
              value={addPhone}
              onChangeText={setAddPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => { setAddPhone(''); setShowAddModal(false); }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Bekor qilish</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAddBtn, { backgroundColor: colors.primary }, addLoading && { opacity: 0.7 }]}
                onPress={addContactByPhone}
                disabled={addLoading}
              >
                {addLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalAddText}>Qo'shish</Text>
                )}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontSize: 21, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#31C46C',
    borderWidth: 2.5,
  },
  infoWrap: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  sub: { fontSize: 13 },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 1,
  },

  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '500',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyFlex: { flexGrow: 1 },
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 20,
    padding: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  modalAddBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalAddText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

