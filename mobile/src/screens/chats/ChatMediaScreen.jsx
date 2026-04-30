import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { format, isToday, isYesterday } from 'date-fns';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_COLS = 3;
const PHOTO_SIZE = Math.floor((SCREEN_W - 2) / PHOTO_COLS);

const TABS = [
  { key: 'media', label: 'Media', icon: 'images-outline' },
  { key: 'files', label: 'Fayllar', icon: 'document-outline' },
  { key: 'links', label: 'Havolalar', icon: 'link-outline' },
  { key: 'voice', label: 'Ovoz', icon: 'mic-outline' },
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Kecha ${format(d, 'HH:mm')}`;
  return format(d, 'dd.MM.yyyy HH:mm');
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── Photo/Video Grid Item ─────────────────────────────────────── */
function MediaGridItem({ item, onPress }) {
  const isVideo = item.message_type === 'video';
  const uri = `${BASE_URL}${item.file_url}`;
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.82 : 1 }]}
    >
      <Image source={{ uri }} style={styles.gridImg} resizeMode="cover" />
      {isVideo && (
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={30} color="rgba(255,255,255,0.92)" />
          {item.duration ? (
            <Text style={styles.videoDur}>{formatDuration(item.duration)}</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/* ── File Row ──────────────────────────────────────────────────── */
function FileRow({ item, colors }) {
  const ext = (item.file_name || '').split('.').pop().toLowerCase();
  const iconMap = {
    pdf: 'document-text-outline',
    doc: 'document-outline', docx: 'document-outline',
    xls: 'grid-outline', xlsx: 'grid-outline',
    ppt: 'easel-outline', pptx: 'easel-outline',
    zip: 'archive-outline', rar: 'archive-outline',
    mp4: 'videocam-outline', mov: 'videocam-outline',
    mp3: 'musical-notes-outline', m4a: 'musical-notes-outline',
  };
  const icon = iconMap[ext] || 'document-outline';
  return (
    <Pressable
      style={({ pressed }) => [styles.fileRow, { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
      onPress={() => {
        const url = `${BASE_URL}${item.file_url}`;
        Linking.openURL(url).catch(() => {});
      }}
    >
      <View style={[styles.fileIcon, { backgroundColor: colors.primary + '18' }]}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {item.file_name || 'Fayl'}
        </Text>
        <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
          {formatBytes(item.file_size)} · {formatTime(item.created_at)}
        </Text>
      </View>
      <Ionicons name="cloud-download-outline" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

/* ── Link Row ──────────────────────────────────────────────────── */
const URL_RE = /https?:\/\/[^\s]+/g;

function LinkRow({ item, colors }) {
  const urls = (item.content || '').match(URL_RE) || [];
  if (urls.length === 0) return null;
  const url = urls[0];
  return (
    <Pressable
      style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
      onPress={() => Linking.openURL(url).catch(() => {})}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.primary + '18' }]}>
        <Ionicons name="link-outline" size={20} color={colors.primary} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.linkUrl, { color: colors.primary }]} numberOfLines={1}>{url}</Text>
        {item.content && item.content !== url ? (
          <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.content}
          </Text>
        ) : null}
        <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>{formatTime(item.created_at)}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/* ── Voice Row ─────────────────────────────────────────────────── */
function VoiceRow({ item, colors }) {
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => { sound?.unloadAsync().catch(() => {}); }, [sound]);

  const toggle = async () => {
    const uri = `${BASE_URL}${item.file_url}`;
    try {
      if (sound) {
        if (playing) { await sound.pauseAsync(); setPlaying(false); }
        else { await sound.playAsync(); setPlaying(true); }
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true }, (st) => {
          if (!st.isLoaded) return;
          if (st.durationMillis) setProgress(st.positionMillis / st.durationMillis);
          if (st.didJustFinish) { setPlaying(false); setProgress(0); }
        });
        setSound(s);
        setPlaying(true);
      }
    } catch {}
  };

  return (
    <View style={[styles.voiceRow, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={toggle} style={[styles.voicePlayBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
      </TouchableOpacity>
      <View style={styles.fileInfo}>
        <View style={[styles.voiceTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.voiceFill, { flex: Math.max(0.001, progress), backgroundColor: colors.primary }]} />
          <View style={{ flex: Math.max(0.001, 1 - progress) }} />
        </View>
        <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
          {formatDuration(item.duration)} · {formatTime(item.created_at)}
        </Text>
      </View>
    </View>
  );
}

/* ── Lightbox ──────────────────────────────────────────────────── */
function Lightbox({ item, visible, onClose }) {
  if (!item) return null;
  const uri = `${BASE_URL}${item.file_url}`;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.lightboxOverlay} onPress={onClose}>
        <Image source={{ uri }} style={styles.lightboxImg} resizeMode="contain" />
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close-circle" size={34} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.lightboxMeta}>
          <Text style={styles.lightboxMetaText}>{formatTime(item.created_at)}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(uri).catch(() => {})}>
            <Ionicons name="cloud-download-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════════════════════════════ */
export default function ChatMediaScreen({ route, navigation }) {
  const { chatId, chatName, initialTab } = route.params || {};
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState(initialTab || 'media');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxItem, setLightboxItem] = useState(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: chatName || 'Media' });
  }, [navigation, chatName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/chats/${chatId}/messages`, {
        params: { limit: 500, offset: 0 },
      });
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const mediaItems = useMemo(
    () => messages.filter((m) => m.message_type === 'image' || m.message_type === 'video'),
    [messages],
  );

  const fileItems = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.message_type === 'file' &&
          !['image/', 'video/'].some((p) => (m.mime_type || '').startsWith(p)),
      ),
    [messages],
  );

  const linkItems = useMemo(
    () =>
      messages.filter(
        (m) => m.message_type === 'text' && URL_RE.test(m.content || ''),
      ),
    [messages],
  );

  const voiceItems = useMemo(
    () => messages.filter((m) => m.message_type === 'voice'),
    [messages],
  );

  const openLightbox = (item) => {
    setLightboxItem(item);
    setLightboxVisible(true);
  };

  const renderMedia = () => {
    if (mediaItems.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="images-outline" size={52} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Media topilmadi</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={mediaItems}
        keyExtractor={(i) => String(i.id)}
        numColumns={PHOTO_COLS}
        renderItem={({ item }) => (
          <MediaGridItem
            item={item}
            onPress={(it) => it.message_type === 'image' ? openLightbox(it) : null}
          />
        )}
        contentContainerStyle={{ gap: 1 }}
        columnWrapperStyle={{ gap: 1 }}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderFiles = () => {
    if (fileItems.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-outline" size={52} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Fayllar topilmadi</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={fileItems}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => <FileRow item={item} colors={colors} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderLinks = () => {
    if (linkItems.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="link-outline" size={52} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Havolalar topilmadi</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={linkItems}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => <LinkRow item={item} colors={colors} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderVoice = () => {
    if (voiceItems.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="mic-outline" size={52} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Ovozli xabarlar topilmadi</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={voiceItems}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => <VoiceRow item={item} colors={colors} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const counts = {
    media: mediaItems.length,
    files: fileItems.length,
    links: linkItems.length,
    voice: voiceItems.length,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabItem, active && styles.tabItemActive]}
            >
              <Ionicons
                name={t.icon}
                size={18}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textSecondary }, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {counts[t.key] > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: active ? colors.primary : colors.border }]}>
                  <Text style={[styles.tabBadgeText, { color: active ? '#fff' : colors.textSecondary }]}>
                    {counts[t.key]}
                  </Text>
                </View>
              )}
              {active && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <>
          {tab === 'media' && renderMedia()}
          {tab === 'files' && renderFiles()}
          {tab === 'links' && renderLinks()}
          {tab === 'voice' && renderVoice()}
        </>
      )}

      <Lightbox
        item={lightboxItem}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 48,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
    paddingBottom: 2,
  },
  tabItemActive: {},
  tabLabel: { fontSize: 12, fontWeight: '600' },
  tabLabelActive: { fontWeight: '700' },
  tabBadge: {
    minWidth: 18,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2.5,
    borderRadius: 2,
  },

  // Media grid
  gridItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    backgroundColor: '#000',
  },
  gridImg: { width: '100%', height: '100%' },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDur: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4 },

  // Files
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  fileIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  fileMeta: { fontSize: 12 },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  linkIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  linkUrl: { fontSize: 14, fontWeight: '600', marginBottom: 2 },

  // Voice
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  voicePlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceTrack: { height: 4, borderRadius: 2, flexDirection: 'row', overflow: 'hidden', marginBottom: 5 },
  voiceFill: {},

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 15, fontWeight: '500' },

  // Lightbox
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImg: { width: SCREEN_W, height: SCREEN_W * 1.2 },
  lightboxClose: { position: 'absolute', top: 48, right: 16 },
  lightboxMeta: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lightboxMetaText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
