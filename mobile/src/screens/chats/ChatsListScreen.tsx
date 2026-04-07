import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { API, BASE_URL } from '../../../config/api';
import { Colors } from '../../theme/colors';

interface ChatItem {
  id: string;
  chat_type: string;
  title: string | null;
  last_message: any;
  unread_count: number;
  other_user: any;
  members: any[];
  updated_at: string;
}

export default function ChatsListScreen({ navigation }: any) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [search, setSearch] = useState('');
  const user = useAuthStore((s) => s.user);

  const loadChats = async () => {
    try {
      const res = await apiClient.get('/chats');
      setChats(res.data || []);
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [])
  );

  useEffect(() => {
    const handleNewMessage = () => {
      loadChats();
    };
    wsService.on('new_message', handleNewMessage);
    wsService.on('messages_read', handleNewMessage);
    return () => {
      wsService.off('new_message', handleNewMessage);
      wsService.off('messages_read', handleNewMessage);
    };
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd.MM.yy');
  };

  const getChatName = (item: ChatItem) => {
    if (item.chat_type === 'group') return item.title || 'Group';
    return item.other_user?.display_name || item.other_user?.phone || 'Chat';
  };

  const getChatAvatar = (item: ChatItem) => {
    if (item.chat_type === 'group' && item.title) {
      return item.title[0].toUpperCase();
    }
    if (item.other_user?.avatar_url) {
      return null; // will show image
    }
    const name = getChatName(item);
    return name[0]?.toUpperCase() || '?';
  };

  const getLastMessagePreview = (item: ChatItem) => {
    if (!item.last_message) return 'No messages yet';
    const msg = item.last_message;
    switch (msg.message_type) {
      case 'text':
        return msg.content || '';
      case 'voice':
        return '🎤 Voice message';
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎬 Video';
      case 'audio':
        return '🎵 Audio';
      case 'file':
        return '📎 ' + (msg.file_name || 'File');
      default:
        return msg.content || '';
    }
  };

  const filteredChats = chats.filter((c) => {
    if (!search) return true;
    const name = getChatName(c).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const renderChat = ({ item }: { item: ChatItem }) => {
    const avatarLetter = getChatAvatar(item);
    const avatarUrl = item.other_user?.avatar_url;

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() =>
          navigation.navigate('Chat', {
            chatId: item.id,
            chatName: getChatName(item),
            chatType: item.chat_type,
            otherUser: item.other_user,
          })
        }
      >
        {avatarUrl ? (
          <Image source={{ uri: `${BASE_URL}${avatarUrl}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
        )}

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {getChatName(item)}
            </Text>
            {item.last_message && (
              <Text style={styles.chatTime}>
                {formatTime(item.last_message.created_at)}
              </Text>
            )}
          </View>
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.last_message?.sender_id === user?.id ? '✓ ' : ''}
              {getLastMessagePreview(item)}
            </Text>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.light.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search"
          placeholderTextColor={Colors.light.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filteredChats}
        renderItem={renderChat}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filteredChats.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>Start a conversation!</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Contacts')}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </TouchableOpacity>
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
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
    paddingBottom: 10,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  chatTime: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginLeft: 8,
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.light.unreadBadge,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
