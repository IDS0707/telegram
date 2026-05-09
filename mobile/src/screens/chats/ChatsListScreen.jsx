import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Alert,
  Platform,
  Animated,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { BASE_URL, API_BASE } from '../../../config/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story
const SAVED_MESSAGES_CHAT_ID = 'saved_messages_local_chat';

function extensionFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
    'video/webm': 'webm',
  };
  return map[(mime || '').toLowerCase()] || null;
}

function ensureFilename(asset) {
  const raw = asset?.fileName || asset?.uri?.split('/').pop() || 'story';
  const hasExt = /\.[a-zA-Z0-9]+$/.test(raw);
  if (hasExt) return raw;
  const ext = extensionFromMime(asset?.mimeType) || 'jpg';
  return `${raw}.${ext}`;
}

async function normalizeUploadUri(asset, filename) {
  const inputUri = asset?.uri || '';
  if (Platform.OS !== 'android' || !inputUri.startsWith('content://')) {
    return inputUri;
  }

  if (!FileSystem || !FileSystem.cacheDirectory) return inputUri;

  try {
    const ext = filename.split('.').pop() || 'jpg';
    const target = `${FileSystem.cacheDirectory}story_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: inputUri, to: target });
    return target;
  } catch (e) {
    console.log('Story uri normalize failed, using original uri:', e?.message || e);
    return inputUri;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Kecha';
  return format(d, 'dd/MM/yy');
}

function getChatName(chat) {
  if (chat.chat_type === 'group') return chat.title ?? 'Guruh';
  return chat.other_user?.display_name ?? 'Noma\'lum';
}

function getChatAvatar(chat) {
  if (chat.chat_type === 'group') return chat.avatar_url;
  return chat.other_user?.avatar_url ?? null;
}

function getLastMessageText(msg) {
  if (!msg) return 'Hali xabar yo\'q';
  // Telegram-style preview: type prefix + caption (or default label).
  // Caption tagging puts the preview on a single visual line: "Rasm — caption"
  const caption = (msg.content || '').trim();
  switch (msg.message_type) {
    case 'image':       return caption ? `🖼 ${caption}` : '🖼 Rasm';
    case 'video':       return caption ? `🎥 ${caption}` : '🎥 Video';
    case 'video_note':  return '🎥 Video xabar';
    case 'audio':       return caption ? `🎵 ${caption}` : '🎵 Audio';
    case 'voice':       return '🎤 Ovozli xabar';
    case 'sticker':     return '🩷 Stiker';
    case 'gif':         return '🎞 GIF';
    case 'file':        return `📎 ${msg.file_name ?? 'Fayl'}`;
    case 'location':    return '📍 Joylashuv';
    case 'poll':        return '📊 So\'rovnoma';
    case 'contact':     return '👤 Kontakt';
    case 'call':        return msg.content || "📞 Qo'ng'iroq";
    default:            return caption || '';
  }
}

// Delivery tick component (like Telegram)
function DeliveryTick({ msg, currentUserId, colors }) {
  if (!msg || msg.sender?.id !== currentUserId) return null;
  if (msg.is_read) {
    return (
      <View style={tickStyles.wrap}>
        <Ionicons name="checkmark-done" size={14} color={colors.primary} />
      </View>
    );
  }
  if (msg.is_delivered) {
    return (
      <View style={tickStyles.wrap}>
        <Ionicons name="checkmark-done" size={14} color={colors.textSecondary} />
      </View>
    );
  }
  return (
    <View style={tickStyles.wrap}>
      <Ionicons name="checkmark" size={14} color={colors.textSecondary} />
    </View>
  );
}

const tickStyles = StyleSheet.create({
  wrap: { marginRight: 2, justifyContent: 'center' },
});

// Story ring avatar
function StoryAvatar({ name, avatarUrl, hasStory, storyViewed, onPress, isMe, loading, colors }) {
  const initials = name?.charAt(0)?.toUpperCase() ?? '?';
  const ringColor = isMe
    ? colors.primary
    : hasStory
    ? storyViewed
      ? colors.storyRingViewed ?? '#aaa'
      : colors.storyRingUnviewed ?? '#2AABEE'
    : 'transparent';

  return (
    <TouchableOpacity style={storyStyles.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={[storyStyles.ring, { borderColor: ringColor }]}>
        {avatarUrl ? (
          <Image source={{ uri: `${BASE_URL}${avatarUrl}` }} style={storyStyles.avatar} />
        ) : (
          <View style={[storyStyles.avatar, storyStyles.placeholder]}>
            <Text style={storyStyles.initial}>{initials}</Text>
          </View>
        )}
        {loading && (
          <View style={storyStyles.loadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </View>
      {isMe && (
        <View style={[storyStyles.addBtn, { backgroundColor: loading ? '#aaa' : colors.primary }]}>
          <Ionicons name={loading ? 'time-outline' : 'add'} size={10} color="#fff" />
        </View>
      )}
      <Text style={[storyStyles.name, { color: colors.text }]} numberOfLines={1}>
        {isMe ? 'Mening' : name?.split(' ')[0]}
      </Text>
    </TouchableOpacity>
  );
}

const storyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', marginHorizontal: 6, width: 64 },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  placeholder: { backgroundColor: '#5B8DD9', justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#fff', fontSize: 22, fontWeight: '700' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    position: 'absolute',
    bottom: 18,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 11, marginTop: 4, textAlign: 'center' },
});

export default function ChatsListScreen({ navigation, route, onOpenDrawer }) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [prefs, setPrefs] = useState({});
  const [activeFolder, setActiveFolder] = useState('all');
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [contacts, setContacts] = useState([]);
  // Stories
  const [stories, setStories] = useState([]);
  const [storyViewer, setStoryViewer] = useState(null); // { userId, userStories, index }
  const storyProgressAnim = useRef(new Animated.Value(0)).current;
  const storyAnimRef = useRef(null);
  const [uploadingStory, setUploadingStory] = useState(false);
  const storyTimerRef = useRef(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const searchBarAnim = useRef(new Animated.Value(0)).current;
  const currentUser = useAuthStore((s) => s.user);
  const setTotalUnread = useAuthStore((s) => s.setTotalUnread);

  // Hydrate from cache on mount so the list is visible instantly,
  // before the network request lands. Telegram does the same.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [chatsRaw, contactsRaw] = await Promise.all([
          AsyncStorage.getItem('schat_chats_cache_v1'),
          AsyncStorage.getItem('schat_contacts_cache_v1'),
        ]);
        if (!mounted) return;
        if (chatsRaw) {
          const cached = JSON.parse(chatsRaw);
          if (Array.isArray(cached) && cached.length) {
            setChats(cached);
            setLoading(false);
            setTotalUnread(cached.reduce((sum, c) => sum + (c.unread_count || 0), 0));
          }
        }
        if (contactsRaw) {
          const cachedContacts = JSON.parse(contactsRaw);
          if (Array.isArray(cachedContacts)) setContacts(cachedContacts);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [setTotalUnread]);

  const loadChats = useCallback(async (silent = false) => {
    if (!silent && chats.length === 0) setLoading(true);
    try {
      const [chatsRes, contactsRes] = await Promise.all([
        apiClient.get('/chats'),
        apiClient.get('/contacts').catch(() => ({ data: [] })),
      ]);
      const chatList = asArray(chatsRes.data);
      const contactList = asArray(contactsRes.data);
      setChats(chatList);
      setContacts(contactList);
      setTotalUnread(chatList.reduce((sum, c) => sum + (c.unread_count || 0), 0));
      // Persist to cache for next launch (don't await — fire and forget).
      AsyncStorage.setItem('schat_chats_cache_v1', JSON.stringify(chatList)).catch(() => {});
      AsyncStorage.setItem('schat_contacts_cache_v1', JSON.stringify(contactList)).catch(() => {});
    } catch (e) {
      console.error('Failed to load chats', e);
      // Don't clear — keep showing cached data on network failure.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chats.length, setTotalUnread]);

  const loadStories = useCallback(async () => {
    try {
      const res = await apiClient.get('/stories');
      setStories(asArray(res.data));
    } catch {
      setStories([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadChats();
      loadStories();
    }, [loadChats, loadStories])
  );

  useEffect(() => {
    const handleNewMessage = () => loadChats(true);
    wsService.on('new_message', handleNewMessage);
    return () => wsService.off('new_message', handleNewMessage);
  }, [loadChats]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !q.startsWith('@')) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setUserSearching(true);
      try {
        const res = await apiClient.get('/contacts/search', {
          params: { q: q.replace(/^@/, '') },
        });
        setUserResults(asArray(res.data));
      } catch {
        setUserResults([]);
      } finally {
        setUserSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const openChatWithUser = async (user) => {
    try {
      const res = await apiClient.post('/chats/private', { user_id: user.id });
      setSearch('');
      setUserResults([]);
      navigation.navigate('Chat', {
        chatId: res.data.id,
        chatName: user.display_name,
        chatType: 'private',
        otherUserId: user.id,
      });
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? t('failedToOpenChat');
      Alert.alert(t('error'), msg);
    }
  };

  const getPrefs = (chatId) => prefs[chatId] ?? { pinned: false, muted: false, archived: false, mutedUntil: null, notificationsEnabled: true };

  const updatePrefs = (chatId, patch) => {
    setPrefs((prev) => {
      const curr = prev[chatId] ?? { pinned: false, muted: false, archived: false, mutedUntil: null, notificationsEnabled: true };
      return { ...prev, [chatId]: { ...curr, ...patch } };
    });
  };

  const archiveChat = (chatId) => {
    updatePrefs(chatId, { archived: true });
  };

  const unarchiveChat = (chatId) => {
    updatePrefs(chatId, { archived: false });
  };

  const openChatActions = (chat) => {
    if (chat?.id === SAVED_MESSAGES_CHAT_ID) {
      Alert.alert('Saqlangan xabarlar', '', [
        { text: 'Ochish', onPress: () => navigation.navigate('SavedMessages') },
        { text: 'Bekor qilish', style: 'cancel' },
      ]);
      return;
    }
    const p = getPrefs(chat.id);
    const muteOpts = [
      { text: '🔕 1 soat', onPress: () => {
        const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        updatePrefs(chat.id, { mutedUntil: until, muted: true });
      }},
      { text: '🔕 8 soat', onPress: () => {
        const until = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        updatePrefs(chat.id, { mutedUntil: until, muted: true });
      }},
      { text: '🔕 2 kun', onPress: () => {
        const until = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
        updatePrefs(chat.id, { mutedUntil: until, muted: true });
      }},
      { text: '🔕 Doimiy', onPress: () => {
        updatePrefs(chat.id, { mutedUntil: null, muted: true });
      }},
    ];
    const opts = [
      { text: p.pinned ? '📌 Mahkamlashni olib tashlash' : '📌 Tepaga mahkamlash', onPress: () => updatePrefs(chat.id, { pinned: !p.pinned }) },
      { text: '🔔 Xabarnomalarni boshqarish', onPress: () => {
        updatePrefs(chat.id, { notificationsEnabled: !p.notificationsEnabled });
        const msg = p.notificationsEnabled ? 'Xabarnomalar o\'chirildi' : 'Xabarnomalar yoqildi';
        Alert.alert('Tayyor', msg);
      }},
      { text: 'Ovozni boshqarish', isSection: true },
      ...muteOpts,
      { text: p.muted && !p.mutedUntil ? '🔔 Ovozni yoqish' : p.muted && p.mutedUntil && new Date(p.mutedUntil) > new Date() ? '🔔 Ovozni yoqish' : '🔕 Ovozni o\'chirish', onPress: () => {
        if (p.muted) updatePrefs(chat.id, { muted: false, mutedUntil: null });
        else updatePrefs(chat.id, { muted: true, mutedUntil: null });
      }},
      { text: p.archived ? '📂 Arxivdan chiqarish' : '🗄 Arxivga yuborish', onPress: () => updatePrefs(chat.id, { archived: !p.archived }) },
      { text: 'Bekor qilish', style: 'cancel' },
    ];
    Alert.alert(getChatName(chat), '', opts);
  };

  const openChat = async (chat) => {
    if (chat?.id === SAVED_MESSAGES_CHAT_ID) {
      // Saved Messages is a self-chat (Telegram-style). Create or fetch it,
      // then open it as a regular Chat so the user can send anything.
      if (!currentUser?.id) return;
      try {
        const res = await apiClient.post('/chats/private', { user_id: currentUser.id });
        const selfChat = res.data;
        navigation.navigate('Chat', {
          chatId: selfChat.id,
          chatName: 'Saqlangan xabarlar',
          chatType: 'private',
          otherUserId: currentUser.id,
        });
      } catch (e) {
        Alert.alert('Xato', e?.response?.data?.error || e?.message || "Saqlangan xabarlarni ochib bo'lmadi");
      }
      return;
    }
    navigation.navigate('Chat', {
      chatId: chat.id,
      chatName: getChatName(chat),
      chatType: chat.chat_type,
      otherUserId: chat.other_user?.id ?? null,
    });
  };

  // ---- Stories logic ----
  // Group stories by user
  const safeChats = asArray(chats);
  const safeContacts = asArray(contacts);
  const safeStories = asArray(stories);
  const safeUserResults = asArray(userResults);

  const storiesByUser = safeStories.reduce((acc, s) => {
    const uid = s.user_id;
    if (!acc[uid]) acc[uid] = { user: s.user, stories: [] };
    acc[uid].stories.push(s);
    return acc;
  }, {});

  const myStories = storiesByUser[currentUser?.id]?.stories ?? [];
  const hasMyStory = myStories.length > 0;
  const viewedIds = new Set(
    safeStories.flatMap((s) => asArray(s.views).map((v) => v.viewer_id === currentUser?.id ? s.id : null)).filter(Boolean)
  );

  const handleAddStory = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ruxsat kerak', 'Galereya ruxsati berilmagan');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingStory(true);
    try {
      const filename = ensureFilename(asset);
      const contentType = asset.mimeType || (filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
      const uploadUri = await normalizeUploadUri(asset, filename);
      const token = await AsyncStorage.getItem('auth_token');
      const url = `${API_BASE}/stories/`;

      // Native fetch + FormData: Android'da axios'dan barqarorroq.
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        formData.append('media', new File([blob], filename, { type: contentType }));
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
      } else {
        formData.append('media', { uri: uploadUri, name: filename, type: contentType });
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
      }
      await loadStories();
    } catch (e) {
      const msg = e?.response?.data?.error
        || e?.response?.data?.detail
        || e?.userMessage
        || e?.message
        || 'Hikoya yuklashda xatolik';
      Alert.alert('Xato', String(msg));
      console.log('Story upload error:', e?.response?.data || e?.message || e);
    } finally {
      setUploadingStory(false);
    }
  };

  // Triggered when user opens Stories from Profile section.
  useEffect(() => {
    if (!route?.params?.openStoryComposer) return;
    handleAddStory();
    navigation.setParams({ openStoryComposer: false });
  }, [route?.params?.openStoryComposer, route?.params?.storyIntentAt]);

  const startStoryProgress = useCallback(() => {
    storyProgressAnim.setValue(0);
    if (storyAnimRef.current) storyAnimRef.current.stop();
    storyAnimRef.current = Animated.timing(storyProgressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    storyAnimRef.current.start(({ finished }) => {
      if (finished) {
        setStoryViewer((v) => {
          if (!v) return null;
          const next = v.index + 1;
          if (next < asArray(v.userStories).length) return { ...v, index: next };
          return null;
        });
      }
    });
  }, [storyProgressAnim]);

  const openStoryViewer = (userId) => {
    const group = storiesByUser[userId];
    if (!group) return;
    setStoryViewer({ userId, userStories: group.stories, index: 0 });
  };

  const openMyStories = () => {
    if (!hasMyStory) {
      handleAddStory();
      return;
    }
    // Show options: view own story or add new
    Alert.alert('Hikoya', '', [
      { text: '+ Yangi hikoya qo\'shish', onPress: handleAddStory },
      { text: 'Hikoyani ko\'rish', onPress: () => openStoryViewer(currentUser?.id) },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  };

  const handleDeleteStory = async (storyId) => {
    Alert.alert('Hikoyani o\'chirish', 'Bu hikoyani o\'chirmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'O\'chirish',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/stories/${storyId}`);
            setStoryViewer(null);
            await loadStories();
          } catch {
            Alert.alert('Xato', 'O\'chirib bo\'lmadi');
          }
        },
      },
    ]);
  };

  // Mark story as viewed when opened
  const markStoryViewed = useCallback(async (storyId) => {
    apiClient.post(`/stories/${storyId}/view`).catch(() => {});
  }, []);

  // Auto-start progress when story viewer index changes
  useEffect(() => {
    if (storyViewer) {
      startStoryProgress();
    } else {
      if (storyAnimRef.current) storyAnimRef.current.stop();
      storyProgressAnim.setValue(0);
    }
    return () => {
      if (storyAnimRef.current) storyAnimRef.current.stop();
    };
  }, [storyViewer?.index, storyViewer !== null, startStoryProgress, storyProgressAnim]);

  // Stories strip: own + contacts who have stories
  const storyStrip = [];
  // Own slot always first
  storyStrip.push({
    id: 'me',
    name: 'Mening',
    avatarUrl: currentUser?.avatar_url,
    hasStory: hasMyStory,
    storyViewed: false,
    isMe: true,
  });
  // Other users with stories
  Object.values(storiesByUser).forEach(({ user, stories: us }) => {
    if (user?.id === currentUser?.id) return;
    const allViewed = us.every((s) => viewedIds.has(s.id));
    storyStrip.push({
      id: user?.id,
      name: user?.display_name ?? 'User',
      avatarUrl: user?.avatar_url ?? null,
      hasStory: true,
      storyViewed: allViewed,
      isMe: false,
    });
  });
  // Also add contacts without stories (show as no-ring avatars)
  safeContacts.slice(0, 6).forEach((c) => {
    const uid = c.contact?.id ?? c.id;
    if (storiesByUser[uid]) return; // already in strip
    storyStrip.push({
      id: uid,
      name: c.contact?.display_name ?? c.name ?? 'User',
      avatarUrl: c.contact?.avatar_url ?? null,
      hasStory: false,
      storyViewed: true,
      isMe: false,
    });
  });

  const renderChatRow = ({ item }) => {
    const isSavedMessagesChat = item.id === SAVED_MESSAGES_CHAT_ID;
    const p = getPrefs(item.id);
    
    // Auto-unmute if mute duration expired
    if (p.mutedUntil && new Date(p.mutedUntil) < new Date()) {
      updatePrefs(item.id, { muted: false, mutedUntil: null });
      p.muted = false;
    }
    
    const name = isSavedMessagesChat ? 'Saqlangan xabarlar' : getChatName(item);
    const avatarUri = getChatAvatar(item);
    const lastText = isSavedMessagesChat
      ? 'O‘zingizga yuborgan xabarlar'
      : item.last_message
      ? getLastMessageText(item.last_message)
      : isOnline
      ? 'online'
      : 'Hali xabar yo‘q';
    const timeStr = item.last_message ? formatTime(item.last_message.created_at) : '';
    const isOnline = item.chat_type === 'private' && item.other_user?.is_online === true;
    const isMine = item.last_message?.sender?.id === currentUser?.id;
    const isGroup = item.chat_type === 'group';
    const unread = item.unread_count ?? 0;

    // Telegram avatar palette (used across the official clients)
    const avatarColors = ['#E03A3E', '#F58D2E', '#4DC247', '#50ABF1', '#6157DD', '#B36BB7', '#FA8072', '#5DADE2'];
    const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?';
    const colorIndex = (name?.trim()?.charCodeAt(0) ?? 0) % avatarColors.length;
    const placeholderBg = avatarColors[colorIndex];

    const renderArchiveAction = () => (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => (p.archived ? unarchiveChat(item.id) : archiveChat(item.id))}
        style={[styles.archiveSwipeAction, { backgroundColor: colors.primary }]}
      >
        <Ionicons name={p.archived ? 'archive' : 'archive-outline'} size={22} color="#fff" />
        <Text style={styles.archiveSwipeText}>{p.archived ? 'Unarchive' : 'Archive'}</Text>
      </TouchableOpacity>
    );

    const chatRow = (
      <TouchableOpacity
        style={[styles.chatItem, { backgroundColor: colors.background }]}
        onPress={() => openChat(item)}
        onLongPress={() => openChatActions(item)}
        activeOpacity={0.62}
      >
        <View style={styles.avatarWrapper}>
          {avatarUri ? (
            <Image source={{ uri: `${BASE_URL}${avatarUri}` }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: isSavedMessagesChat ? colors.primary : placeholderBg, justifyContent: 'center', alignItems: 'center' }]}>
              {isSavedMessagesChat ? (
                <Ionicons name="bookmark" size={22} color="#fff" />
              ) : (
                <Text style={styles.avatarLetter}>{initial}</Text>
              )}
            </View>
          )}
          {isOnline && (
            <View style={[styles.onlineDot, { borderColor: colors.background }]} />
          )}
        </View>

        <View style={[styles.chatContent, { borderBottomColor: colors.divider }]}>
          <View style={styles.topRow}>
            <View style={styles.nameRow}>
              <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
              {p.muted && (
                <Ionicons name="volume-mute" size={15} color={colors.textSecondary} style={{ marginLeft: 4 }} />
              )}
            </View>
            <View style={styles.timeRow}>
              {isMine && <DeliveryTick msg={item.last_message} currentUserId={currentUser?.id} colors={colors} />}
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {timeStr}
              </Text>
            </View>
          </View>
          <View style={styles.bottomRow}>
            <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
              {isMine ? (
                <>
                  <Text style={{ color: colors.primary }}>Siz: </Text>
                  {lastText}
                </>
              ) : lastText}
            </Text>
            <View style={styles.badgeArea}>
              {p.pinned && unread === 0 && (
                <Ionicons name="pin" size={15} color={colors.textSecondary} style={{ transform: [{ rotate: '45deg' }] }} />
              )}
              {unread > 0 && (
                <View style={[styles.badge, { backgroundColor: p.muted || !p.notificationsEnabled ? colors.unreadBadgeMuted : colors.unreadBadge }]}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );

    if (isSavedMessagesChat) {
      return chatRow;
    }

    if (Platform.OS === 'web') return chatRow;

    return (
      <Swipeable
        overshootRight={false}
        rightThreshold={36}
        renderRightActions={renderArchiveAction}
        onSwipeableOpen={() => (p.archived ? unarchiveChat(item.id) : archiveChat(item.id))}
      >
        {chatRow}
      </Swipeable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Chatlar hali yo'q</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        @username bilan qidiring yoki kontaktni toping
      </Text>
    </View>
  );

  const normalizedSearch = search.trim().toLowerCase();
  const savedMessagesChat = {
    id: SAVED_MESSAGES_CHAT_ID,
    chat_type: 'saved',
    title: 'Saqlangan xabarlar',
    avatar_url: null,
    unread_count: 0,
    updated_at: new Date().toISOString(),
    last_message: null,
  };
  const folderFiltered = safeChats.filter((c) => {
    const isArchived = !!getPrefs(c.id).archived;
    if (activeFolder === 'all') return true;
    if (activeFolder === 'archived') return isArchived;
    if (isArchived) return false;
    if (activeFolder === 'unread') return (c.unread_count ?? 0) > 0;
    if (activeFolder === 'groups') return c.chat_type === 'group';
    if (activeFolder === 'private') return c.chat_type === 'private';
    return true;
  });

  const filteredChats = (normalizedSearch && !normalizedSearch.startsWith('@'))
    ? folderFiltered.filter((c) => {
        const name = getChatName(c).toLowerCase();
        const last = (c.last_message?.content ?? '').toLowerCase();
        return name.includes(normalizedSearch) || last.includes(normalizedSearch);
      })
    : folderFiltered.sort((a, b) => {
        const pa = getPrefs(a.id);
        const pb = getPrefs(b.id);
        if (pa.pinned !== pb.pinned) return pa.pinned ? -1 : 1;
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      });

  const includeSavedInCurrentFilter = activeFolder === 'all' || activeFolder === 'private';
  const savedMatchesSearch = !normalizedSearch
    || 'saqlangan xabarlar'.includes(normalizedSearch)
    || 'saved messages'.includes(normalizedSearch);
  const displayChats = includeSavedInCurrentFilter && savedMatchesSearch
    ? [savedMessagesChat, ...filteredChats]
    : filteredChats;

  const archivedCount = safeChats.filter((c) => getPrefs(c.id).archived).length;
  const unreadCount = safeChats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const groupsCount = safeChats.filter((c) => c.chat_type === 'group' && !getPrefs(c.id).archived).length;
  const privateCount = safeChats.filter((c) => c.chat_type === 'private' && !getPrefs(c.id).archived).length;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isSearchingUsers = search.trim().startsWith('@') && search.trim().length >= 2;

  // ---- Story Viewer ----
  const currentStory = storyViewer
    ? asArray(storyViewer.userStories)[storyViewer.index]
    : null;

  const goNextStory = () => {
    if (!storyViewer) return;
    if (storyViewer.index + 1 < asArray(storyViewer.userStories).length) {
      setStoryViewer((v) => ({ ...v, index: v.index + 1 }));
    } else {
      setStoryViewer(null);
    }
  };

  const goPrevStory = () => {
    if (!storyViewer) return;
    if (storyViewer.index > 0) {
      setStoryViewer((v) => ({ ...v, index: v.index - 1 }));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.headerBorder, paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: `${BASE_URL}${currentUser.avatar_url}` }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {currentUser?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>S Chat</Text>
        <TouchableOpacity style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setShowCreateMenu(true)}>
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Qidiruv"
          placeholderTextColor={colors.textHint}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Folder filter tabs — pill style with counter badges (Telegram 2025) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.folderTabsScroll, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}
        contentContainerStyle={styles.folderTabsContent}
      >
        {[
          { key: 'all', label: 'Barchasi', count: chats.length },
          { key: 'unread', label: "O'qilmagan", count: unreadCount },
          { key: 'groups', label: 'Guruhlar', count: groupsCount },
          { key: 'private', label: 'Shaxsiy', count: privateCount },
          { key: 'archived', label: 'Arxiv', count: archivedCount },
        ].map(({ key, label, count }) => {
          const active = activeFolder === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveFolder(key)}
              activeOpacity={0.75}
              style={[
                styles.folderTab,
                {
                  backgroundColor: active ? colors.primary : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                },
              ]}
            >
              <Text style={[
                styles.folderTabText,
                { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '700' : '500' },
              ]}>
                {label}
              </Text>
              {count > 0 && (
                <View style={[
                  styles.folderTabBadge,
                  { backgroundColor: active ? 'rgba(255,255,255,0.22)' : colors.primary },
                ]}>
                  <Text style={[
                    styles.folderTabBadgeText,
                    { color: active ? '#FFFFFF' : '#FFFFFF' },
                  ]}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ===== STORY VIEWER MODAL ===== */}
      <Modal
        visible={!!storyViewer}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setStoryViewer(null)}
      >
        <View style={svStyles.container}>
          <StatusBar hidden />
          {currentStory && (
            <>
              {/* Story media: image or video */}
              {currentStory.media_type === 'video' ? (
                <Video
                  source={{ uri: `${BASE_URL}${currentStory.media_url}` }}
                  style={svStyles.media}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay
                  isLooping={false}
                  onLoad={() => markStoryViewed(currentStory.id)}
                  onPlaybackStatusUpdate={(s) => {
                    if (s.didJustFinish) goNextStory();
                  }}
                />
              ) : (
                <Image
                  source={{ uri: `${BASE_URL}${currentStory.media_url}` }}
                  style={svStyles.media}
                  resizeMode="cover"
                  onLoad={() => markStoryViewed(currentStory.id)}
                />
              )}
              {/* Gradient overlay top */}
              <View style={svStyles.topOverlay} />
              {/* Progress bars */}
              <View style={svStyles.progressRow}>
                {asArray(storyViewer.userStories).map((s, i) => (
                  <View key={s.id} style={[svStyles.progressTrack, { flex: 1 }]}>
                    {i < storyViewer.index ? (
                      <View style={[svStyles.progressFill, { width: '100%' }]} />
                    ) : i === storyViewer.index ? (
                      <Animated.View
                        style={[
                          svStyles.progressFill,
                          { width: storyProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                        ]}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
              {/* Header: user + close */}
              <View style={svStyles.header}>
                <View style={svStyles.userRow}>
                  {currentStory.user?.avatar_url ? (
                    <Image
                      source={{ uri: `${BASE_URL}${currentStory.user.avatar_url}` }}
                      style={svStyles.userAvatar}
                    />
                  ) : (
                    <View style={[svStyles.userAvatar, { backgroundColor: '#5B8DD9', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {currentStory.user?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={{ marginLeft: 10 }}>
                    <Text style={svStyles.userName}>{currentStory.user?.display_name ?? 'User'}</Text>
                    <Text style={svStyles.storyTime}>
                      {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {currentStory.user?.id === currentUser?.id && (
                    <TouchableOpacity onPress={() => handleDeleteStory(currentStory.id)} style={svStyles.closeBtn}>
                      <Ionicons name="trash-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setStoryViewer(null)} style={svStyles.closeBtn}>
                    <Ionicons name="close" size={26} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              {/* Caption */}
              {!!currentStory.caption && (
                <View style={svStyles.captionWrap}>
                  <Text style={svStyles.caption}>{currentStory.caption}</Text>
                </View>
              )}
              {/* Tap zones: prev / next */}
              <View style={svStyles.tapRow}>
                <TouchableOpacity style={svStyles.tapZone} onPress={goPrevStory} activeOpacity={1} />
                <TouchableOpacity style={svStyles.tapZone} onPress={goNextStory} activeOpacity={1} />
              </View>
            </>
          )}
        </View>
      </Modal>

      {isSearchingUsers ? (
        userSearching ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={safeUserResults}
            keyExtractor={(u) => String(u.id)}
            renderItem={({ item }) => {
              const avatarColors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC'];
              const ci = (item.display_name?.charCodeAt(0) ?? 0) % avatarColors.length;
              return (
                <TouchableOpacity
                  style={[styles.chatItem, { backgroundColor: colors.background }]}
                  onPress={() => openChatWithUser(item)}
                  activeOpacity={0.65}
                >
                  <View style={styles.avatarWrapper}>
                    {item.avatar_url ? (
                      <Image source={{ uri: `${BASE_URL}${item.avatar_url}` }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: avatarColors[ci] }]}>
                        <Text style={styles.avatarLetter}>{item.display_name?.charAt(0)?.toUpperCase()}</Text>
                      </View>
                    )}
                    {item.is_online && <View style={[styles.onlineDot, { borderColor: colors.background }]} />}
                  </View>
                  <View style={[styles.chatContent, { borderBottomColor: colors.divider }]}>
                    <View style={styles.topRow}>
                      <Text style={[styles.chatName, { color: colors.text }]}>{item.display_name}</Text>
                    </View>
                    <View style={styles.bottomRow}>
                      <Text style={[styles.lastMessage, { color: colors.textSecondary }]}>
                        {item.username ? `@${item.username}` : 'S Chat foydalanuvchisi'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Foydalanuvchi topilmadi</Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={displayChats}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderChatRow}
          ListHeaderComponent={
            !normalizedSearch ? (
              <>
                {/* Stories strip */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[styles.storiesScroll, { borderBottomColor: colors.divider }]}
                  contentContainerStyle={styles.storiesContent}
                >
                  {storyStrip.map((u) => (
                    <StoryAvatar
                      key={u.id}
                      name={u.name}
                      avatarUrl={u.avatarUrl}
                      hasStory={u.hasStory}
                      storyViewed={u.storyViewed}
                      isMe={u.isMe}
                      loading={u.isMe && uploadingStory}
                      colors={colors}
                      onPress={() => {
                        if (u.isMe) {
                          openMyStories();
                        } else if (u.hasStory) {
                          openStoryViewer(u.id);
                        }
                      }}
                    />
                  ))}
                </ScrollView>

                {/* Archived chats row */}
                {archivedCount > 0 && (
                  <TouchableOpacity
                    style={[styles.archivedRow, { borderBottomColor: colors.divider }]}
                    onPress={() => setActiveFolder('archived')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.archivedIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="archive-outline" size={22} color={colors.primary} />
                    </View>
                    <View style={[styles.chatContent, { borderBottomColor: 'transparent' }]}>
                      <View style={styles.topRow}>
                        <Text style={[styles.chatName, { color: colors.text }]}>Arxiv</Text>
                        <View style={[styles.badge, { backgroundColor: colors.unreadBadgeMuted }]}>
                          <Text style={styles.badgeText}>{archivedCount}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </>
            ) : null
          }
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadChats(true); loadStories(); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={[
            styles.chatListContent,
            displayChats.length === 0 && !normalizedSearch ? styles.emptyFlex : null,
          ]}
        />
      )}

      {/* Create Group / Channel quick-menu modal */}
      <Modal
        visible={showCreateMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateMenu(false)}
      >
        <TouchableOpacity
          style={createMenuStyles.overlay}
          activeOpacity={1}
          onPress={() => setShowCreateMenu(false)}
        >
          <View style={[createMenuStyles.menu, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={createMenuStyles.item}
              onPress={() => { setShowCreateMenu(false); navigation.navigate('CreateGroup'); }}
            >
              <View style={[createMenuStyles.icon, { backgroundColor: '#5B8DD9' }]}>
                <Ionicons name="people" size={20} color="#fff" />
              </View>
              <View>
                <Text style={[createMenuStyles.label, { color: colors.text }]}>Guruh yaratish</Text>
                <Text style={[createMenuStyles.sub, { color: colors.textSecondary }]}>A'zolar bilan guruh</Text>
              </View>
            </TouchableOpacity>

            <View style={[createMenuStyles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={createMenuStyles.item}
              onPress={() => { setShowCreateMenu(false); navigation.navigate('CreateChannel'); }}
            >
              <View style={[createMenuStyles.icon, { backgroundColor: '#E55B4D' }]}>
                <Ionicons name="megaphone" size={20} color="#fff" />
              </View>
              <View>
                <Text style={[createMenuStyles.label, { color: colors.text }]}>Kanal yaratish</Text>
                <Text style={[createMenuStyles.sub, { color: colors.textSecondary }]}>Kanalga post e'lon qilish</Text>
              </View>
            </TouchableOpacity>

            <View style={[createMenuStyles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={createMenuStyles.item}
              onPress={() => { setShowCreateMenu(false); handleAddStory(); }}
            >
              <View style={[createMenuStyles.icon, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="albums" size={20} color="#fff" />
              </View>
              <View>
                <Text style={[createMenuStyles.label, { color: colors.text }]}>Hikoya qo'shish</Text>
                <Text style={[createMenuStyles.sub, { color: colors.textSecondary }]}>Story joylash</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity
        style={[styles.composeFab, { backgroundColor: colors.primary, bottom: Math.max(24, insets.bottom + 12) }]}
        activeOpacity={0.85}
        onPress={() => setShowCreateMenu(true)}
      >
        <Ionicons name="create" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Web: constrain to ~720px so the chat list doesn't stretch across a
  // wide monitor (Telegram Desktop pattern). On mobile it stays full-bleed.
  container: Platform.OS === 'web'
    ? { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }
    : { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header — Telegram Android: dense, single row, title + actions
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },
  headerBtn: { padding: 6, width: 40, alignItems: 'center' },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  headerTitle: { fontSize: 19, fontWeight: '700', letterSpacing: 0.1 },

  // Search — Telegram pill, slimmer + softer
  searchWrap: {
    marginHorizontal: 12,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 0,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, fontWeight: '400' },
  folderTabsScroll: { maxHeight: 50, borderBottomWidth: 0 },
  folderTabsContent: { paddingHorizontal: 10, paddingVertical: 7, gap: 6, flexDirection: 'row', alignItems: 'center' },
  folderTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  folderTabText: { fontSize: 13.5, letterSpacing: 0.1 },
  folderTabBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTabBadgeText: { fontSize: 11, fontWeight: '700' },

  // Stories
  storiesScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  storiesContent: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },

  // Archived row
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  archivedIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  // Chat row — Telegram Android spec (54px avatar, 78 row height)
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    minHeight: 78,
  },
  avatarWrapper: { position: 'relative', marginRight: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '600' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#3DD17A',
    borderWidth: 2.5,
  },
  groupBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Chat content (right side)
  chatContent: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 14,
    borderBottomWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  chatName: { fontSize: 16.5, flex: 1, letterSpacing: -0.1, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  timeText: { fontSize: 13, fontWeight: '400' },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: { fontSize: 14.5, flex: 1, marginRight: 8, fontWeight: '400', lineHeight: 19 },
  badgeArea: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: {
    borderRadius: 12,
    minWidth: 23,
    height: 23,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  composeFab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  archiveSwipeAction: {
    width: 92,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  archiveSwipeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  chatListContent: {
    paddingBottom: 24,
  },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyFlex: { flexGrow: 1 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});

const createMenuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 90 : 82,
    paddingRight: 12,
  },
  menu: { borderRadius: 14, width: 260, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});

// Story viewer full-screen styles
const svStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'transparent',
    // linear gradient effect via just a dark top
  },
  progressRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 1,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 66 : 48,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  userName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  storyTime: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 6 },
  captionWrap: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 10,
  },
  caption: { color: '#fff', fontSize: 15, lineHeight: 22 },
  tapRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapZone: { flex: 1 },
});
