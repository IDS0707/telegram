import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { BASE_URL } from '../../../config/api';
import { Colors } from '../../theme/colors';

interface ContactItem {
  id: string;
  contact: {
    id: string;
    phone: string;
    display_name: string;
    username: string | null;
    avatar_url: string | null;
    is_online: boolean;
  };
  nickname: string | null;
}

export default function ContactsScreen({ navigation }: any) {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const res = await apiClient.get('/contacts');
      setContacts(res.data || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  };

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await apiClient.get(`/contacts/search?q=${encodeURIComponent(query)}`);
      const filtered = (res.data || []).filter((u: any) => u.id !== user?.id);
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const addContact = async (userId: string) => {
    try {
      await apiClient.post('/contacts', { user_id: userId });
      Alert.alert('Success', 'Contact added');
      loadContacts();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to add contact');
    }
  };

  const startChat = async (userId: string, name: string) => {
    try {
      const res = await apiClient.post('/chats/private', { user_id: userId });
      navigation.navigate('Chat', {
        chatId: res.data.id,
        chatName: name,
        chatType: 'private',
        otherUser: res.data.members?.find((m: any) => m.user_id !== user?.id)?.user,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to start chat');
    }
  };

  const renderContact = ({ item }: { item: ContactItem }) => {
    const c = item.contact;
    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => startChat(c.id, c.display_name)}
      >
        {c.avatar_url ? (
          <Image source={{ uri: `${BASE_URL}${c.avatar_url}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{c.display_name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.nickname || c.display_name}</Text>
          <Text style={styles.contactStatus}>
            {c.is_online ? 'online' : c.phone}
          </Text>
        </View>
        {c.is_online && <View style={styles.onlineDot} />}
      </TouchableOpacity>
    );
  };

  const renderSearchResult = ({ item }: { item: any }) => {
    const isContact = contacts.some((c) => c.contact.id === item.id);
    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => startChat(item.id, item.display_name)}
      >
        {item.avatar_url ? (
          <Image source={{ uri: `${BASE_URL}${item.avatar_url}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{item.display_name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.display_name}</Text>
          <Text style={styles.contactStatus}>
            {item.username ? `@${item.username}` : item.phone}
          </Text>
        </View>
        {!isContact && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => addContact(item.id)}
          >
            <Ionicons name="person-add" size={18} color={Colors.light.primary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.light.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by phone or username"
          placeholderTextColor={Colors.light.textSecondary}
          value={searchQuery}
          onChangeText={searchUsers}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setIsSearching(false); }}>
            <Ionicons name="close-circle" size={20} color={Colors.light.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No users found</Text>
          }
        />
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={64} color={Colors.light.textSecondary} />
              <Text style={styles.emptyText}>No contacts yet</Text>
              <Text style={styles.emptySubtext}>Search for users to add</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.inputBackground,
    margin: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: Colors.light.text,
  },
  contactItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
  },
  contactStatus: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.online,
  },
  addButton: {
    padding: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
});
