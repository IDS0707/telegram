import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

const DESTRUCT_OPTIONS = [
  { label: 'O\'chirish yo\'q', value: 0, icon: 'ban-outline' },
  { label: '5 soniya', value: 5, icon: 'timer-outline' },
  { label: '10 soniya', value: 10, icon: 'timer-outline' },
  { label: '30 soniya', value: 30, icon: 'timer-outline' },
  { label: '1 daqiqa', value: 60, icon: 'time-outline' },
  { label: '5 daqiqa', value: 300, icon: 'time-outline' },
  { label: '1 soat', value: 3600, icon: 'time-outline' },
  { label: '1 kun', value: 86400, icon: 'calendar-outline' },
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Kecha ${format(d, 'HH:mm')}`;
  return format(d, 'dd.MM HH:mm');
}

function formatDestructRemaining(secondsLeft) {
  if (secondsLeft <= 0) return '0s';
  if (secondsLeft < 60) return `${secondsLeft}s`;
  if (secondsLeft < 3600) return `${Math.floor(secondsLeft / 60)}m`;
  if (secondsLeft < 86400) return `${Math.floor(secondsLeft / 3600)}h`;
  return `${Math.floor(secondsLeft / 86400)}d`;
}

/* ── Message Bubble ──────────────────────────────────────────────── */
function SecretBubble({ item, isMe, colors, isDark, destructTimer }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!item.destruct_at) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(item.destruct_at) - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [item.destruct_at]);

  const isExpired = remaining !== null && remaining <= 0;
  const bubbleBg = isMe ? colors.primary : (isDark ? '#2A3A4A' : '#F0F0F0');

  return (
    <View style={[sStyles.bubbleRow, isMe && sStyles.bubbleRowMe]}>
      <View style={[sStyles.bubble, { backgroundColor: isExpired ? colors.textSecondary + '44' : bubbleBg }, isMe && sStyles.bubbleMe]}>
        {isExpired ? (
          <View style={sStyles.expiredRow}>
            <Ionicons name="flame-outline" size={14} color={colors.textSecondary} />
            <Text style={[sStyles.expiredText, { color: colors.textSecondary }]}>Xabar o'chirildi</Text>
          </View>
        ) : (
          <Text style={[sStyles.bubbleText, { color: isMe ? '#FFF' : colors.text }]}>{item.content}</Text>
        )}
        <View style={sStyles.metaRow}>
          <Text style={[sStyles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.textSecondary }]}>
            {formatTime(item.created_at)} 🔒
          </Text>
          {remaining !== null && !isExpired && (
            <View style={[sStyles.destructBadge, { backgroundColor: remaining <= 10 ? '#FF3B30' : '#FF9F0A' }]}>
              <Ionicons name="timer-outline" size={10} color="#fff" />
              <Text style={sStyles.destructText}>{formatDestructRemaining(remaining)}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const sStyles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', marginBottom: 6, paddingHorizontal: 10 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 10, paddingBottom: 6 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 2 },
  destructBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8,
  },
  destructText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  expiredRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expiredText: { fontSize: 13, fontStyle: 'italic' },
});

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
  const [destructTimer, setDestructTimer] = useState(0); // seconds, 0 = off
  const [showTimerPicker, setShowTimerPicker] = useState(false);

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
    const destructAt = destructTimer > 0
      ? new Date(Date.now() + destructTimer * 1000).toISOString()
      : undefined;
    try {
      const { data } = await apiClient.post(`/chats/${chat.id}/messages`, {
        content,
        is_secret: true,
        ...(destructAt ? { destruct_at: destructAt, destruct_after: destructTimer } : {}),
      });
      setMessages((prev) => [...prev, data]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Xato', 'Xabar yuborib bo\'lmadi');
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender_id === user?.id;
    return <SecretBubble item={item} isMe={isMe} colors={colors} isDark={isDark} destructTimer={destructTimer} />;
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
        {isEncrypted && (
          <Pressable onPress={() => setShowTimerPicker(true)} style={{ marginLeft: 8, padding: 4 }} hitSlop={8}>
            <View style={{ position: 'relative' }}>
              <Ionicons name="timer-outline" size={22} color={destructTimer > 0 ? '#FF9F0A' : colors.textSecondary} />
              {destructTimer > 0 && (
                <View style={[styles.timerDot, { backgroundColor: '#FF9F0A' }]} />
              )}
            </View>
          </Pressable>
        )}
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
          {/* Self-destruct indicator */}
          {destructTimer > 0 && (
            <Pressable onPress={() => setShowTimerPicker(true)} style={styles.activeTimerBtn}>
              <Ionicons name="timer-outline" size={16} color="#FF9F0A" />
            </Pressable>
          )}
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

      {/* Self-destruct timer picker */}
      <Modal visible={showTimerPicker} transparent animationType="slide" onRequestClose={() => setShowTimerPicker(false)}>
        <Pressable style={styles.timerOverlay} onPress={() => setShowTimerPicker(false)}>
          <Pressable style={[styles.timerSheet, { backgroundColor: isDark ? '#1F2C38' : '#fff' }]} onPress={() => {}}>
            <View style={[styles.timerHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#D0D0D0' }]} />
            <Text style={[styles.timerTitle, { color: colors.text }]}>Avtomatik o'chirish vaqti</Text>
            <Text style={[styles.timerSubtitle, { color: colors.textSecondary }]}>
              Xabarlar yuborilgandan keyin belgilangan vaqtda o'chiriladi
            </Text>
            {DESTRUCT_OPTIONS.map((opt) => {
              const active = destructTimer === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.timerOption, active && { backgroundColor: colors.primary + '18' }]}
                  onPress={() => { setDestructTimer(opt.value); setShowTimerPicker(false); }}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.timerOptionText, { color: active ? colors.primary : colors.text }]}>{opt.label}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
  timerDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  activeTimerBtn: { marginRight: 6, padding: 4 },
  timerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  timerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36, paddingTop: 12, paddingHorizontal: 16 },
  timerHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  timerTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  timerSubtitle: { fontSize: 13, marginBottom: 16 },
  timerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 10 },
  timerOptionText: { fontSize: 15, flex: 1 },
});
