import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, Alert, ActivityIndicator, Image, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';

export default function CreateChannelScreen({ navigation }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [username, setUsername] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [avatarUri, setAvatarUri] = useState(null);
  const [creating, setCreating] = useState(false);

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
    if (!title.trim()) { Alert.alert('Xato', 'Kanal nomini kiriting'); return; }
    if (isPublic && !username.trim()) { Alert.alert('Xato', 'Ochiq kanal uchun username kiriting'); return; }
    setCreating(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        is_public: isPublic,
        username: isPublic && username.trim() ? username.trim() : undefined,
      };
      const res = await apiClient.post('/channels', body);
      const channel = res.data;

      // Upload avatar if picked
      if (avatarUri && channel.id) {
        try {
          const fd = new FormData();
          if (Platform.OS === 'web') {
            const blob = await fetch(avatarUri).then((r) => r.blob());
            fd.append('avatar', new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' }));
          } else {
            fd.append('avatar', { uri: avatarUri, name: 'avatar.jpg', type: 'image/jpeg' });
          }
          await apiClient.patch(`/channels/${channel.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch { /* ignore */ }
      }

      navigation.replace('Channel', { channelId: channel.id, channelTitle: channel.title });
    } catch (e) {
      Alert.alert('Xato', e?.response?.data?.error || 'Kanal yaratishda xatolik');
    } finally {
      setCreating(false);
    }
  }, [avatarUri, description, isPublic, navigation, title, username]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Kanal yaratish</Text>
        <TouchableOpacity onPress={handleCreate} style={styles.headerBtn} disabled={creating}>
          {creating
            ? <ActivityIndicator color={colors.primary} size="small" />
            : <Ionicons name="checkmark" size={26} color={title.trim() ? colors.primary : colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <TouchableOpacity onPress={pickAvatar} style={[styles.avatarPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {avatarUri
            ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            : <Ionicons name="camera-outline" size={36} color={colors.textSecondary} />}
        </TouchableOpacity>
        <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>
          Rasmni bosib o'zgartirish
        </Text>

        {/* Title */}
        <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Kanal nomi *"
            placeholderTextColor={colors.textHint}
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={128}
          />
        </View>

        {/* Description */}
        <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text }]}
            placeholder="Tavsif (ixtiyoriy)"
            placeholderTextColor={colors.textHint}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={512}
          />
        </View>

        {/* Public toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleInfo}>
            <Ionicons name={isPublic ? 'earth' : 'lock-closed-outline'} size={20} color={colors.primary} />
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>
                {isPublic ? 'Ochiq kanal' : 'Yopiq kanal'}
              </Text>
              <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                {isPublic ? 'Har kim qo\'shila oladi' : 'Faqat invite orqali'}
              </Text>
            </View>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Username (only if public) */}
        {isPublic && (
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <Text style={[styles.atSign, { color: colors.textSecondary }]}>@</Text>
            <TextInput
              style={[styles.input, { color: colors.text, flex: 1 }]}
              placeholder="username"
              placeholderTextColor={colors.textHint}
              value={username}
              onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
              autoCapitalize="none"
              maxLength={32}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', marginLeft: 4 },
  body: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 20, gap: 14, paddingBottom: 40 },
  avatarPicker: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarImg: { width: 110, height: 110, borderRadius: 55 },
  avatarHint: { fontSize: 12, marginTop: -6 },
  inputWrap: { width: '100%', borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, paddingVertical: 13 },
  multiline: { textAlignVertical: 'top', paddingTop: 12, minHeight: 80 },
  atSign: { fontSize: 16, fontWeight: '600' },
  toggleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1 },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  toggleSub: { fontSize: 12, marginTop: 1 },
});
