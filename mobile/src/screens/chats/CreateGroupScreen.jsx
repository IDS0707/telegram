import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

export default function CreateGroupScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1); // 1=select members, 2=set name
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);

  useEffect(() => {
    apiClient.get('/contacts').then((r) => {
      setContacts(r.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const pickAvatar = useCallback(async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) setAvatarUri(URL.createObjectURL(file));
      };
      input.click();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled) setAvatarUri(res.assets[0].uri);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Xato', 'Guruh nomini kiriting'); return; }
    setCreating(true);
    try {
      const res = await apiClient.post('/chats/group', {
        title: title.trim(),
        members: Array.from(selected),
      });
      const chat = res.data;

      // Upload avatar if picked
      if (avatarUri && chat.id) {
        try {
          const fd = new FormData();
          if (Platform.OS === 'web') {
            const blob = await fetch(avatarUri).then((r) => r.blob());
            fd.append('avatar', new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' }));
          } else {
            fd.append('avatar', { uri: avatarUri, name: 'avatar.jpg', type: 'image/jpeg' });
          }
          await apiClient.post(`/chats/${chat.id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch { /* ignore avatar upload failure */ }
      }

      navigation.replace('Chat', {
        chatId: chat.id,
        chatName: chat.title,
        chatType: 'group',
      });
    } catch (e) {
      Alert.alert('Xato', e?.response?.data?.error || 'Guruh yaratishda xatolik');
    } finally {
      setCreating(false);
    }
  }, [avatarUri, navigation, selected, title]);

  const selectedContacts = contacts.filter((c) => selected.has(c.contact?.id));

  const renderContact = ({ item }) => {
    const u = item.contact;
    if (!u) return null;
    const isSelected = selected.has(u.id);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => toggle(u.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          {u.avatar_url
            ? <Image source={{ uri: `${BASE_URL}${u.avatar_url}` }} style={styles.avatarImg} />
            : <Text style={styles.avatarText}>{u.display_name?.charAt(0)?.toUpperCase()}</Text>}
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.name, { color: colors.text }]}>{u.display_name}</Text>
          <Text style={[styles.phone, { color: colors.textSecondary }]}>{u.phone}</Text>
        </View>
        <View style={[styles.check, { borderColor: colors.primary, backgroundColor: isSelected ? colors.primary : 'transparent' }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step === 2 ? setStep(1) : navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {step === 1 ? 'A\'zolar qo\'shish' : 'Guruh nomi'}
        </Text>
        {step === 1 ? (
          <TouchableOpacity
            onPress={() => { if (selected.size === 0) { Alert.alert('', 'Kamida 1 ta kontakt tanlang'); return; } setStep(2); }}
            style={styles.headerBtn}
          >
            <Ionicons name="arrow-forward" size={24} color={selected.size > 0 ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleCreate} style={styles.headerBtn} disabled={creating}>
            {creating ? <ActivityIndicator color={colors.primary} size="small" />
              : <Ionicons name="checkmark" size={26} color={colors.primary} />}
          </TouchableOpacity>
        )}
      </View>

      {step === 1 ? (
        <>
          {selected.size > 0 && (
            <View style={[styles.selectedBar, { borderBottomColor: colors.border }]}>
              <Text style={[styles.selectedCount, { color: colors.primary }]}>
                {selected.size} ta tanlangan
              </Text>
            </View>
          )}
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : contacts.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={52} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Kontaktlar yo'q</Text>
            </View>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(i) => i.id}
              renderItem={renderContact}
            />
          )}
        </>
      ) : (
        <View style={styles.nameStep}>
          <TouchableOpacity onPress={pickAvatar} style={[styles.avatarPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={styles.avatarPickerImg} />
              : <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />}
          </TouchableOpacity>
          <TextInput
            style={[styles.titleInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
            placeholder="Guruh nomi"
            placeholderTextColor={colors.textHint}
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={128}
          />
          <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
            {selectedContacts.map((c) => c.contact?.display_name).join(', ')}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', marginLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15 },
  selectedBar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  selectedCount: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  rowInfo: { flex: 1, marginLeft: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  phone: { fontSize: 13, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nameStep: { flex: 1, alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, gap: 20 },
  avatarPicker: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarPickerImg: { width: 100, height: 100, borderRadius: 50 },
  titleInput: { width: '100%', height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  memberCount: { fontSize: 13, textAlign: 'center' },
});
