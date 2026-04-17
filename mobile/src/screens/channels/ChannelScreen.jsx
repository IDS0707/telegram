import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ActivityIndicator, Image,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { format, isToday, isYesterday } from 'date-fns';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { wsService } from '../../services/websocket';
import { BASE_URL } from '../../../config/api';

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Kecha';
  return format(d, 'dd/MM/yy');
}

export default function ChannelScreen({ route, navigation }) {
  const { channel: initialChannel } = route.params;
  const { colors, isDark } = useTheme();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef();

  const [channel, setChannel] = useState(initialChannel);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const fetchData = async () => {
    try {
      const [postsRes, channelRes] = await Promise.all([
        apiClient.get(`/channels/${channel.id}/posts`),
        apiClient.get(`/channels/${channel.id}`),
      ]);
      setPosts(Array.isArray(postsRes.data) ? postsRes.data.reverse() : []);
      setChannel(channelRes.data.channel ?? channelRes.data);
      setSubscriberCount(channelRes.data.subscriber_count ?? 0);
      setIsOwner(channelRes.data.channel?.owner_id === user?.id);

      // Check subscription
      const myChannels = await apiClient.get('/channels');
      const found = (myChannels.data || []).find(c => c.id === channel.id);
      setIsSubscribed(!!found);
    } catch (e) {
      console.log('fetchData error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  useEffect(() => {
    const unsub = wsService.on('channel_post', (data) => {
      if (data?.channel_id === channel.id) {
        setPosts(prev => [...prev, data]);
      }
    });
    return () => unsub();
  }, [channel.id]);

  const handleSubscribe = async () => {
    try {
      if (isSubscribed) {
        await apiClient.delete(`/channels/${channel.id}/leave`);
        setIsSubscribed(false);
        setSubscriberCount(n => Math.max(0, n - 1));
      } else {
        await apiClient.post(`/channels/${channel.id}/join`);
        setIsSubscribed(true);
        setSubscriberCount(n => n + 1);
      }
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Amalga oshmadi');
    }
  };

  const handleSendPost = async () => {
    if (!composerText.trim()) return;
    setSending(true);
    try {
      const res = await apiClient.post(`/channels/${channel.id}/posts`, { content: composerText.trim() });
      setPosts(prev => [...prev, res.data]);
      setComposerText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e) {
      Alert.alert('Xato', e.response?.data?.error || 'Post yuborib bo\'lmadi');
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (postId, emoji) => {
    try {
      const res = await apiClient.post(`/channels/${channel.id}/posts/${postId}/react`, { emoji });
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        // Optimistically update reactions
        const reactions = Array.isArray(p.reactions) ? [...p.reactions] : [];
        if (res.data.action === 'removed') {
          return { ...p, reactions: reactions.filter(r => r.user_id !== user?.id) };
        }
        const existing = reactions.findIndex(r => r.user_id === user?.id);
        if (existing >= 0) reactions[existing] = { ...reactions[existing], emoji };
        else reactions.push({ user_id: user?.id, emoji });
        return { ...p, reactions };
      }));
    } catch (e) { /* silent */ }
  };

  const handleDeletePost = async (postId) => {
    Alert.alert('O\'chirish', 'Bu postni o\'chirmoqchimisiz?', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'O\'chirish', style: 'destructive', onPress: async () => {
          try {
            await apiClient.delete(`/channels/${channel.id}/posts/${postId}`);
            setPosts(prev => prev.filter(p => p.id !== postId));
          } catch (e) { Alert.alert('Xato', 'O\'chirib bo\'lmadi'); }
        },
      },
    ]);
  };

  const renderPost = ({ item }) => {
    const authorAvatarUri = item.author?.avatar_url ? `${BASE_URL}${item.author.avatar_url}` : null;
    const reactionEmojis = ['👍', '❤️', '🔥', '😂', '😮', '👎'];

    const myReaction = Array.isArray(item.reactions)
      ? item.reactions.find(r => r.user_id === user?.id)?.emoji
      : null;

    const reactionCounts = {};
    (item.reactions || []).forEach(r => {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
    });

    return (
      <View style={[styles.postCard, { backgroundColor: colors.surface }]}>
        {/* Author */}
        <View style={styles.postHeader}>
          <View style={[styles.postAvatar, { backgroundColor: colors.primary }]}>
            {authorAvatarUri
              ? <Image source={{ uri: authorAvatarUri }} style={styles.postAvatarImg} />
              : <Text style={styles.postAvatarLetter}>{item.author?.display_name?.charAt(0)?.toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.postAuthor, { color: colors.text }]}>{item.author?.display_name}</Text>
            <Text style={[styles.postTime, { color: colors.textSecondary }]}>{formatTime(item.created_at)}</Text>
          </View>
          {isOwner && (
            <TouchableOpacity onPress={() => handleDeletePost(item.id)} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {item.content ? <Text style={[styles.postContent, { color: colors.text }]}>{item.content}</Text> : null}
        {item.media_url && item.media_type === 'image' ? (
          <Image source={{ uri: `${BASE_URL}${item.media_url}` }} style={styles.postImage} resizeMode="cover" />
        ) : null}

        {/* Reaction bar */}
        <View style={styles.reactionBar}>
          {reactionEmojis.map(emoji => (
            <TouchableOpacity
              key={emoji}
              onPress={() => handleReact(item.id, emoji)}
              style={[styles.reactionBtn, myReaction === emoji && { backgroundColor: colors.primaryLight }]}
            >
              <Text style={{ fontSize: 16 }}>{emoji}</Text>
              {reactionCounts[emoji] ? (
                <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{reactionCounts[emoji]}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <Text style={[styles.viewCount, { color: colors.textSecondary }]}>
            <Ionicons name="eye-outline" size={12} /> {item.view_count ?? 0}
          </Text>
        </View>
      </View>
    );
  };

  const avatarUri = channel?.avatar_url ? `${BASE_URL}${channel.avatar_url}` : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={[styles.hAvatar, { backgroundColor: colors.primary }]}>
          {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.hAvatarImg} /> : (
            <Text style={styles.hAvatarLetter}>{channel?.title?.charAt(0)?.toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hTitle, { color: colors.text }]} numberOfLines={1}>{channel?.title}</Text>
          <Text style={[styles.hSub, { color: colors.textSecondary }]}>{subscriberCount} obunachi</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubscribe}
          style={[styles.subBtn, { backgroundColor: isSubscribed ? colors.surface : colors.primary }]}
        >
          <Text style={{ color: isSubscribed ? colors.text : '#fff', fontWeight: '600', fontSize: 13 }}>
            {isSubscribed ? 'Chiqish' : 'Obuna'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={64} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Hali post yo'q</Text>
            </View>
          }
        />
      )}

      {/* Composer (only for owners/admins) */}
      {isOwner && (
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={[styles.composerInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Post yozing..."
            placeholderTextColor={colors.textHint}
            value={composerText}
            onChangeText={setComposerText}
            multiline
          />
          <TouchableOpacity
            onPress={handleSendPost}
            disabled={!composerText.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: composerText.trim() ? colors.primary : colors.border }]}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1 },
  backBtn: { padding: 4, marginRight: 6 },
  hAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  hAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  hAvatarLetter: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hTitle: { fontSize: 16, fontWeight: '700' },
  hSub: { fontSize: 12 },
  subBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginLeft: 8 },
  postCard: { borderRadius: 12, padding: 14, gap: 10 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  postAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  postAvatarLetter: { color: '#fff', fontSize: 14, fontWeight: '700' },
  postAuthor: { fontSize: 14, fontWeight: '600' },
  postTime: { fontSize: 12, marginTop: 1 },
  postContent: { fontSize: 15, lineHeight: 21 },
  postImage: { width: '100%', height: 200, borderRadius: 8 },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 4 },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, gap: 2 },
  reactionCount: { fontSize: 12 },
  viewCount: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, gap: 8 },
  composerInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
