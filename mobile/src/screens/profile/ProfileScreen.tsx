import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { API, BASE_URL } from '../../../config/api';
import { Colors } from '../../theme/colors';

export default function ProfileScreen({ navigation }: any) {
  const { user, updateProfile, logout } = useAuthStore();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.display_name || 'user');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');

  const handleSave = async (field: string) => {
    try {
      const data: any = {};
      if (field === 'display_name') data.display_name = displayName;
      if (field === 'username') data.username = username;
      if (field === 'bio') data.bio = bio;

      await updateProfile(data);
      setEditingField(null);
      Alert.alert('Success', 'Profile updated');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update');
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const formData = new FormData();
      formData.append('avatar', {
        uri: result.assets[0].uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);

      try {
        const token = await AsyncStorage.getItem('auth_token');
        await axios.post(API.AUTH.UPDATE_AVATAR, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        });
        useAuthStore.getState().fetchMe();
        Alert.alert('Success', 'Avatar updated');
      } catch {
        Alert.alert('Error', 'Failed to update avatar');
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={pickAvatar}>
          {user?.avatar_url ? (
            <Image source={{ uri: `${BASE_URL}${user.avatar_url}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {user?.display_name?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.displayNameLarge}>{user?.display_name}</Text>
        <Text style={styles.phoneText}>{user?.phone}</Text>
        {user?.username && (
          <Text style={styles.usernameText}>@{user.username}</Text>
        )}
      </View>

      {/* Profile fields */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        {/* Display Name */}
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => setEditingField('display_name')}
        >
          <Ionicons name="person-outline" size={22} color={Colors.light.primary} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Name</Text>
            {editingField === 'display_name' ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoFocus
                />
                <TouchableOpacity onPress={() => handleSave('display_name')}>
                  <Ionicons name="checkmark" size={24} color={Colors.light.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.fieldValue}>{user?.display_name}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Username */}
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => setEditingField('username')}
        >
          <Ionicons name="at" size={22} color={Colors.light.primary} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Username</Text>
            {editingField === 'username' ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={username}
                  onChangeText={setUsername}
                  autoFocus
                  autoCapitalize="none"
                  placeholder="Set unique username"
                />
                <TouchableOpacity onPress={() => handleSave('username')}>
                  <Ionicons name="checkmark" size={24} color={Colors.light.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.fieldValue}>
                {user?.username ? `@${user.username}` : 'Not set'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Bio */}
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => setEditingField('bio')}
        >
          <Ionicons name="information-circle-outline" size={22} color={Colors.light.primary} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Bio</Text>
            {editingField === 'bio' ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={bio}
                  onChangeText={setBio}
                  autoFocus
                  multiline
                />
                <TouchableOpacity onPress={() => handleSave('bio')}>
                  <Ionicons name="checkmark" size={24} color={Colors.light.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.fieldValue}>{user?.bio || 'Not set'}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Phone (read-only) */}
        <View style={styles.fieldRow}>
          <Ionicons name="call-outline" size={22} color={Colors.light.primary} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <Text style={styles.fieldValue}>{user?.phone}</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={Colors.light.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.light.primary,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: '#006699',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.light.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  displayNameLarge: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
  },
  phoneText: {
    color: '#cce5ff',
    fontSize: 14,
    marginTop: 4,
  },
  usernameText: {
    color: '#cce5ff',
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  fieldContent: {
    flex: 1,
    marginLeft: 16,
  },
  fieldLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  fieldValue: {
    fontSize: 16,
    color: Colors.light.text,
    marginTop: 2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.primary,
    paddingVertical: 4,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 24,
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.light.danger,
    marginLeft: 16,
  },
});
