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
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { BASE_URL } from '../../../config/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story

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
  switch (msg.message_type) {
    case 'image': return '🖼 Rasm';
    case 'video': return '🎥 Video';
    case 'audio': return '🎵 Audio';
    case 'voice': return '🎤 Ovozli xabar';
    case 'file': return `📎 ${msg.file_name ?? 'Fayl'}`;
    default: return msg.content ?? '';
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

export default function ChatsListScreen({ navigation, onOpenDrawer }) {
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

  const searchBarAnim = useRef(new Animated.Value(0)).current;
  const currentUser = useAuthStore((s) => s.user);
  const setTotalUnread = useAuthStore((s) => s.setTotalUnread);

  const loadChats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [chatsRes, contactsRes] = await Promise.all([
        apiClient.get('/chats'),
        apiClient.get('/contacts').catch(() => ({ data: [] })),
      ]);
      const chatList = asArray(chatsRes.data);
      setChats(chatList);
      setContacts(asArray(contactsRes.data));
      // Update global unread badge
      setTotalUnread(chatList.reduce((sum, c) => sum + (c.unread_count || 0), 0));
    } catch (e) {
      console.error('Failed to load chats', e);
      setChats([]);
      setContacts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const getPrefs = (chatId) => prefs[chatId] ?? { pinned: false, muted: false, archived: false };

  const updatePrefs = (chatId, patch) => {
    setPrefs((prev) => {
      const curr = prev[chatId] ?? { pinned: false, muted: false, archived: false };
      return { ...prev, [chatId]: { ...curr, ...patch } };
    });
  };

  const archiveChat = (chatId) => {
    updatePrefs(chatId, { archived: true });
  };

  const openChatActions = (chat) => {
    const p = getPrefs(chat.id);
    Alert.alert(getChatName(chat), '', [
      { text: p.pinned ? '📌 Mahkamlashni olib tashlash' : '📌 Tepaga mahkamlash', onPress: () => updatePrefs(chat.id, { pinned: !p.pinned }) },
      { text: p.muted ? '🔔 Ovozni yoqish' : '🔕 Ovozni o\'chirish', onPress: () => updatePrefs(chat.id, { muted: !p.muted }) },
      { text: p.archived ? '📂 Arxivdan chiqarish' : '🗄 Arxivga yuborish', onPress: () => updatePrefs(chat.id, { archived: !p.archived }) },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  };

  const openChat = (chat) => {
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingStory(true);
    try {
      const formData = new FormData();
      const filename = asset.uri.split('/').pop() || 'story.jpg';
      formData.append('media', { uri: asset.uri, name: filename, type: asset.mimeType ?? 'image/jpeg' });
      await apiClient.post('/stories', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadStories();
    } catch {
      Alert.alert('Xato', 'Hikoya yuklashda xatolik');
    } finally {
      setUploadingStory(false);
    }
  };

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
    const p = getPrefs(item.id);
    const name = getChatName(item);
    const avatarUri = getChatAvatar(item);
    const lastText = getLastMessageText(item.last_message);
    const timeStr = item.last_message ? formatTime(item.last_message.created_at) : '';
    const isOnline = item.chat_type === 'private' && item.other_user?.is_online === true;
    const isMine = item.last_message?.sender?.id === currentUser?.id;
    const isGroup = item.chat_type === 'group';
    const unread = item.unread_count ?? 0;

    const avatarColors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#4DD0E1'];
    const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?';
    const colorIndex = (name?.trim()?.charCodeAt(0) ?? 0) % avatarColors.length;
    const placeholderBg = avatarColors[colorIndex];

    const renderArchiveAction = () => (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => archiveChat(item.id)}
        style={[styles.archiveSwipeAction, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="archive-outline" size={22} color="#fff" />
        <Text style={styles.archiveSwipeText}>Archive</Text>
      </TouchableOpacity>
    );

    return (
      <Swipeable
        overshootRight={false}
        rightThreshold={36}
        renderRightActions={renderArchiveAction}
        onSwipeableOpen={() => archiveChat(item.id)}
      >
        <TouchableOpacity
          style={[
            styles.chatItem,
            { backgroundColor: p.pinned ? (isDark ? 'rgba(42,171,238,0.08)' : 'rgba(42,171,238,0.05)') : colors.background },
          ]}
          onPress={() => openChat(item)}
          onLongPress={() => openChatActions(item)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarWrapper}>
            {avatarUri ? (
              <Image source={{ uri: `${BASE_URL}${avatarUri}` }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: placeholderBg }]}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
            {isOnline && (
              <View style={[styles.onlineDot, { borderColor: p.pinned ? (isDark ? '#1F2E3D' : '#EEF7FF') : colors.background }]} />
            )}
          </View>

          <View style={[styles.chatContent, { borderBottomColor: colors.divider }]}>
            <View style={styles.topRow}>
              <View style={styles.nameRow}>
                {p.muted && <Ionicons name="volume-mute" size={14} color={colors.textSecondary} style={{ marginRight: 3 }} />}
                <Text style={[styles.chatName, { color: colors.text, fontWeight: unread > 0 ? '600' : '400' }]} numberOfLines={1}>{name}</Text>
              </View>
              <View style={styles.timeRow}>
                {isMine && <DeliveryTick msg={item.last_message} currentUserId={currentUser?.id} colors={colors} />}
                <Text style={[styles.timeText, { color: unread > 0 && !p.muted ? colors.primary : colors.textSecondary }]}>
                  {timeStr}
                </Text>
              </View>
            </View>
            <View style={styles.bottomRow}>
              <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                {isMine ? `Siz: ${lastText}` : lastText}
              </Text>
              <View style={styles.badgeArea}>
                {p.pinned && unread === 0 && (
                  <Ionicons name="pin" size={14} color={colors.textSecondary} />
                )}
                {unread > 0 && (
                  <View style={[styles.badge, { backgroundColor: p.muted ? colors.unreadBadgeMuted : colors.unreadBadge }]}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
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
  const allActive = safeChats.filter((c) => !getPrefs(c.id).archived);

  const folderFiltered = allActive.filter((c) => {
    if (activeFolder === 'all') return true;
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

  const archivedCount = safeChats.filter((c) => getPrefs(c.id).archived).length;

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
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.headerBorder }]}>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Telegram</Text>
        <TouchableOpacity style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.inputBackground }]}>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Qidirish"
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

      {/* Folder filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.folderTabsScroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.folderTabsContent}
      >
        {[
          { key: 'all', label: 'Barchasi' },
          { key: 'unread', label: "O'qilmagan" },
          { key: 'groups', label: 'Guruhlar' },
          { key: 'private', label: 'Shaxsiy' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveFolder(key)}
            style={[styles.folderTab, activeFolder === key && styles.folderTabActive]}
          >
            <Text style={[styles.folderTabText, { color: activeFolder === key ? colors.primary : colors.textSecondary }]}>
              {label}
            </Text>
            {activeFolder === key && <View style={[styles.folderTabUnderline, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
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
              {/* Story image */}
              <Image
                source={{ uri: `${BASE_URL}${currentStory.media_url}` }}
                style={svStyles.media}
                resizeMode="cover"
                onLoad={() => markStoryViewed(currentStory.id)}
              />
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
                        {item.username ? `@${item.username}` : 'Telegram foydalanuvchisi'}
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
          data={filteredChats}
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
            filteredChats.length === 0 && !normalizedSearch ? styles.emptyFlex : null,
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header (white/surface style like Telegram 2024)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 4, width: 36, alignItems: 'center' },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },

  // Search
  searchWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  folderTabsScroll: { maxHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  folderTabsContent: { paddingHorizontal: 8, paddingVertical: 0, gap: 0, flexDirection: 'row', alignItems: 'stretch' },
  folderTab: { paddingHorizontal: 14, paddingVertical: 10, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  folderTabActive: {},
  folderTabText: { fontSize: 14, fontWeight: '500' },
  folderTabUnderline: { position: 'absolute', bottom: 0, left: 6, right: 6, height: 3, borderRadius: 1.5 },

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

  // Chat row
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    minHeight: 76,
  },
  avatarWrapper: { position: 'relative', marginRight: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontSize: 21, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#31C46C',
    borderWidth: 2,
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
    paddingVertical: 12,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  chatName: { fontSize: 16, flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  timeText: { fontSize: 13 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: { fontSize: 14, flex: 1, marginRight: 8 },
  badgeArea: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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

  // Empty
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
