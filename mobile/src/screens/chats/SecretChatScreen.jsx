import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { wsService } from '../../services/websocket';
import { format, isToday, isYesterday } from 'date-fns';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Kecha ${format(d, 'HH:mm')}`;
  return format(d, 'dd.MM HH:mm');
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SecretChatScreen({ navigation, route }) {
  const { chat, secretChat: initialSecretChat } = route.params || {};
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();
  const flatRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [secretInfo, setSecretInfo] = useState(initialSecretChat);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [loading, setLoading] = useState(true);

  const otherUser = secretInfo
    ? secretInfo.initiator_id === user?.id
      ? secretInfo.recipient
      : secretInfo.initiator
    : null;

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!chat?.id) return;
    try {
      const { data } = await apiClient.get(`/chats/${chat.id}/messages`);
      setMessages((data || []).reverse());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [chat?.id]);

  // Load key exchange info
  const loadSecretInfo = useCallback(async () => {
    if (!chat?.id) return;
    try {
      const { data } = await apiClient.get(`/secret-chats/chat/${chat.id}`);
      setSecretInfo(data);
      setIsEncrypted(data?.status === 'accepted');
    } catch {
      /* ignore */
    }
  }, [chat?.id]);

  useEffect(() => {
    loadMessages();
    loadSecretInfo();
  }, [loadMessages, loadSecretInfo]);

  // Real-time updates
  useEffect(() => {
    const onNewMessage = (msg) => {
      if (msg.chat_id !== chat?.id) return;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    };
    wsService.on('new_message', onNewMessage);
    return () => wsService.off('new_message', onNewMessage);
  }, [chat?.id]);

  const send = async () => {
    const content = text.trim();
    if (!content || !isEncrypted) return;
    setText('');
    try {
      const { data } = await apiClient.post(`/chats/${chat.id}/messages`, {
        content,
        is_secret: true,
      });
      setMessages((prev) => [...prev, data]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Xato', 'Xabar yuborib bo\'lmadi');
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: isMe ? colors.primary : (isDark ? '#2A2A2A' : '#F0F0F0') },
            isMe && styles.bubbleMe,
          ]}
        >
          <Text style={[styles.bubbleText, { color: isMe ? '#FFF' : colors.text }]}>
            {item.content}
          </Text>
          <Text style={[styles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
            {formatTime(item.created_at)} 🔒
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB', backgroundColor: colors.background }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.text }]}>
            {otherUser?.display_name || 'Maxfiy chat'}
          </Text>
          <View style={styles.encryptedRow}>
            <Ionicons name="lock-closed" size={12} color={isEncrypted ? '#30D158' : colors.textSecondary} />
            <Text style={[styles.encryptedLabel, { color: isEncrypted ? '#30D158' : colors.textSecondary }]}>
              {isEncrypted ? 'Shifrlangan' : 'Kalit almashilmoqda...'}
            </Text>
          </View>
        </View>
        <Ionicons name="shield-checkmark" size={22} color={isEncrypted ? '#30D158' : colors.textSecondary} />
      </View>

      {/* Security notice */}
      <View style={[styles.notice, { backgroundColor: isEncrypted ? '#30D15815' : '#FF9F0A20' }]}>
        <Ionicons
          name={isEncrypted ? 'lock-closed' : 'hourglass-outline'}
          size={14}
          color={isEncrypted ? '#30D158' : '#FF9F0A'}
        />
        <Text style={[styles.noticeText, { color: isEncrypted ? '#30D158' : '#FF9F0A' }]}>
          {isEncrypted
            ? 'Ulanish shifrlangan. Xabarlar faqat bu qurilmada ko\'rinadi.'
            : 'Maxfiy chat o\'rnatilmoqda. Iltimos, kutib turing.'}
        </Text>
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="lock-closed" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Hech qanday xabar yo'q.{'\n'}Bu suhbat to'liq shifrlangan.
              </Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
          <Ionicons name="lock-closed" size={18} color={isEncrypted ? '#30D158' : colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' }]}
            placeholder={isEncrypted ? 'Shifrlangan xabar...' : 'Kalit almashilmoqda...'}
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            editable={isEncrypted}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || !isEncrypted}
            style={[styles.sendBtn, { backgroundColor: text.trim() && isEncrypted ? colors.primary : colors.textSecondary + '40' }]}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { marginRight: 12 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: '600' },
  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  encryptedLabel: { fontSize: 12 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noticeText: { fontSize: 12, flex: 1 },
  messageList: { padding: 12, flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bubbleRow: { flexDirection: 'row', marginBottom: 6 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 10, paddingBottom: 6 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
