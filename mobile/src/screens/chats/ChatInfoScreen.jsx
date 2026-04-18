import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Pressable,
  Alert,
  Image,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  Bell,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  LogOut,
  Mic,
  Pin,
  Settings,
  Trash2,
  Users,
  Video,
} from 'lucide-react-native';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { BASE_URL } from '../../../config/api';

function InfoRow({ Icon, label, value, color, onPress, right, colors, isDark }) {
  const iconBg = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  return (
    <Pressable
      style={styles.row}
      disabled={!onPress}
      activeOpacity={onPress ? 0.75 : 1}
      onPress={onPress}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg }]}>
        <Icon size={20} color={color ?? colors.textSecondary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: color ?? colors.text }]}>{label}</Text>
        {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.textHint ?? colors.textSecondary} strokeWidth={2.2} /> : null)}
    </Pressable>
  );
}

export default function ChatInfoScreen({ route, navigation }) {
  const { chatId, chatName, chatType, otherUserId } = route.params;

  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mute, setMute] = useState(false);
  const [pin, setPin] = useState(false);
  const [saveMedia, setSaveMedia] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    navigation.setOptions({ title: 'Chat ma\'lumotlari' });
  }, [navigation]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [chatRes, msgRes] = await Promise.all([
          apiClient.get(`/chats/${chatId}`),
          apiClient.get(`/chats/${chatId}/messages`, { params: { limit: 100, offset: 0 } }),
        ]);
        setChat(chatRes.data);
        setMessages(msgRes.data ?? []);
      } catch {
        setChat(null);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [chatId]);

  // Load block status for private chats
  useEffect(() => {
    if (chatType !== 'private' || !otherUserId) return;
    apiClient.get(`/contacts/block/${otherUserId}`)
      .then((res) => setIsBlocked(res.data.is_blocked ?? false))
      .catch(() => {});
  }, [chatType, otherUserId]);

  const handleClearHistory = () => {
    Alert.alert(
      'Tarixni tozalash',
      'Ushbu chatdagi barcha xabarlar o\'chiriladi. Davom etasizmi?',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Tozalash',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/chats/${chatId}/messages`);
              Alert.alert('Muvaffaqiyat', 'Chat tarixi tozalandi');
              navigation.goBack();
            } catch {
              Alert.alert('Xato', 'Tarixni tozalab bo\'lmadi');
            }
          },
        },
      ],
    );
  };

  const handleMuteToggle = async (value) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMute(value);
    try {
      await apiClient.post(`/chats/${chatId}/mute`, { muted: value });
    } catch {
      setMute(!value);
    }
  };

  const handlePinToggle = async (value) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPin(value);
    try {
      await apiClient.post(`/chats/${chatId}/pin`, { pinned: value });
    } catch {
      setPin(!value);
    }
  };

  const handleToggleBlock = () => {
    if (!otherUserId) return;
    const targetName = chat?.members?.find((m) => m.user_id !== currentUser?.id)?.user?.display_name ?? 'Foydalanuvchi';
    if (isBlocked) {
      Alert.alert(
        'Blokdan chiqarish',
        `${targetName} ni blokdan chiqarmoqchimisiz?`,
        [
          { text: 'Bekor qilish', style: 'cancel' },
          {
            text: 'Chiqarish',
            onPress: async () => {
              setBlockLoading(true);
              try {
                await apiClient.delete(`/contacts/block/${otherUserId}`);
                setIsBlocked(false);
              } catch {
                Alert.alert('Xato', 'Amal bajarilmadi');
              } finally {
                setBlockLoading(false);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Bloklash',
        `${targetName} ni bloklash. Bu foydalanuvchi sizga xabar yubora olmaydi.`,
        [
          { text: 'Bekor qilish', style: 'cancel' },
          {
            text: 'Bloklash',
            style: 'destructive',
            onPress: async () => {
              setBlockLoading(true);
              try {
                await apiClient.post(`/contacts/block/${otherUserId}`);
                setIsBlocked(true);
              } catch {
                Alert.alert('Xato', 'Amal bajarilmadi');
              } finally {
                setBlockLoading(false);
              }
            },
          },
        ],
      );
    }
  };

  const mediaStats = useMemo(() => {
    const photo = messages.filter((m) => m.message_type === 'image').length;
    const video = messages.filter((m) => m.message_type === 'video').length;
    const files = messages.filter((m) => m.message_type === 'file').length;
    const voice = messages.filter((m) => m.message_type === 'voice').length;
    return { photo, video, files, voice };
  }, [messages]);

  const title = chat?.title ?? chatName;
  const avatar = chat?.avatar_url;
  const membersCount = chat?.members?.length ?? (chatType === 'private' ? 2 : 0);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(18, insets.bottom + 12) }}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.topCard, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
        {avatar ? (
          <Image source={{ uri: `${BASE_URL}${avatar}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={styles.avatarLetter}>{title?.charAt(0).toUpperCase() ?? '?'}</Text>
          </View>
        )}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {chatType === 'group' ? `${membersCount} a'zo` : 'Shaxsiy chat'}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Sozlamalar</Text>
      <View style={[styles.section, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
        <InfoRow
          Icon={Bell}
          label="Bildirishnomalarni o'chirish"
          colors={colors}
          isDark={isDark}
          right={
            <Switch
              value={mute}
              onValueChange={handleMuteToggle}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#fff"
            />
          }
        />
        <InfoRow
          Icon={Pin}
          label="Chatni mahkamlash"
          colors={colors}
          isDark={isDark}
          right={
            <Switch
              value={pin}
              onValueChange={handlePinToggle}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#fff"
            />
          }
        />
        <InfoRow
          Icon={Download}
          label="Save incoming media"
          colors={colors}
          isDark={isDark}
          right={
            <Switch
              value={saveMedia}
              onValueChange={(value) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSaveMedia(value);
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#fff"
            />
          }
        />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Umumiy media</Text>
      <View style={[styles.section, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
        <InfoRow Icon={ImageIcon} label="Photos" value={`${mediaStats.photo}`} colors={colors} isDark={isDark} />
        <InfoRow Icon={Video} label="Videos" value={`${mediaStats.video}`} colors={colors} isDark={isDark} />
        <InfoRow Icon={FileText} label="Files" value={`${mediaStats.files}`} colors={colors} isDark={isDark} />
        <InfoRow Icon={Mic} label="Voice" value={`${mediaStats.voice}`} colors={colors} isDark={isDark} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>A'zolar</Text>
      <View style={[styles.section, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
        {chat?.members?.slice(0, 15).map((m) => (
          <InfoRow
            key={m.id}
            Icon={Users}
            label={m?.user?.display_name ?? 'Foydalanuvchi'}
            value={m.role}
            colors={colors}
            isDark={isDark}
          />
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Amallar</Text>
      <View style={[styles.section, { backgroundColor: colors.surfaceElevated ?? colors.background }, !isDark && styles.cardShadow]}>
        {chatType !== 'private' && chat?.members?.find((m) => m.user_id === currentUser?.id)?.role === 'admin' && (
          <InfoRow
            Icon={Settings}
            label="Guruh boshqaruvi"
            value="Admin paneli"
            onPress={() => navigation.navigate('GroupAdmin', { chatId, chatName: title })}
            colors={colors}
            isDark={isDark}
          />
        )}
        <InfoRow
          Icon={Trash2}
          label="Tarixni tozalash"
          color={colors.danger}
          onPress={handleClearHistory}
          colors={colors}
          isDark={isDark}
        />
        {chatType === 'private' && otherUserId && (
          <InfoRow
            Icon={Ban}
            label={blockLoading ? 'Yuklanmoqda...' : isBlocked ? 'Blokdan chiqarish' : 'Foydalanuvchini bloklash'}
            color={isBlocked ? colors.primary : colors.danger}
            onPress={blockLoading ? undefined : handleToggleBlock}
            colors={colors}
            isDark={isDark}
          />
        )}
        {chatType !== 'private' && (
          <InfoRow
            Icon={LogOut}
            label="Guruhdan chiqish"
            color={colors.danger}
            onPress={() =>
              Alert.alert('Guruhdan chiqish', 'Bu guruhdan chiqmoqchimisiz?', [
                { text: 'Bekor qilish', style: 'cancel' },
                {
                  text: 'Chiqish',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiClient.delete(`/chats/${chatId}/members/me`);
                      navigation.popToTop();
                    } catch {
                      navigation.popToTop();
                    }
                  },
                },
              ])
            }
            colors={colors}
            isDark={isDark}
          />
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topCard: {
    alignItems: 'center',
    paddingVertical: 22,
    borderRadius: 18,
    marginBottom: 14,
  },
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarLetter: { color: '#fff', fontSize: 34, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 4 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 2,
    marginLeft: 2,
  },
  section: {
    marginBottom: 14,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    marginBottom: 8,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowValue: { fontSize: 12, marginTop: 2 },
});
