import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio, ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';

const triggerHaptic = (style = 'Medium') => {
  if (Platform.OS === 'web') return;
  const s = style === 'Light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
  Haptics.impactAsync(s).catch(() => {});
};
import * as Location from 'expo-location';

const DRAFT_STORAGE_KEY = 'chat_draft_v1';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { format, isToday, isYesterday } from 'date-fns';
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeContext';
import {
  ensureDownloadedMedia,
  loadMediaCache,
  removeDownloadedMedia,
  saveLocalMediaToGallery,
} from '../../services/mediaCache';
import { BASE_URL } from '../../../config/api';

const INPUT_MIN_HEIGHT = 22;
const INPUT_MAX_HEIGHT = 110;
const VIDEO_NOTE_MAX_DURATION = 60;
const VIDEO_NOTE_SIZE = 150;
const VIDEO_NOTE_RING_SIZE = 160;
const LOCK_THRESHOLD = -80;
const CANCEL_THRESHOLD = -90;
const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🎉'];
const SETTINGS_STORAGE_KEY = 'tg_settings_v1';

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function formatMessageTime(dateString) {
  const date = new Date(dateString);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
  return format(date, 'dd.MM HH:mm');
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function inferMimeTypeFromName(filename = '') {
  const name = String(filename).toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}

function getMessagePreview(msg) {
  if (msg.message_type === 'image') return '🖼 Rasm';
  if (msg.message_type === 'video') return '🎥 Video';
  if (msg.message_type === 'voice') return '🎤 Ovozli xabar';
  if (msg.message_type === 'video_note') return '📹 Video xabar';
  if (msg.message_type === 'file') return `📎 ${msg.file_name || 'Fayl'}`;
  if (msg.message_type === 'location') return `📍 ${msg.location_title || 'Joylashuv'}`;
  return msg.content || '';
}

function buildSections(messages) {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const items = [];
  let prevKey = '';
  sorted.forEach((msg) => {
    const date = new Date(msg.created_at);
    const key = format(date, 'yyyy-MM-dd');
    if (key !== prevKey) {
      let label = format(date, 'MMMM d');
      if (isToday(date)) label = 'Today';
      if (isYesterday(date)) label = 'Yesterday';
      items.push({ id: `sep-${key}`, type: 'separator', label });
      prevKey = key;
    }
    items.push({ ...msg, type: 'message' });
  });
  return items;
}

/* ── Progress Ring ─────────────────────────────────────────────── */
function ProgressRing({ progress, size, strokeWidth, activeColor, trackColor }) {
  const r = (size - strokeWidth) / 2;
  const circ = r * Math.PI * 2;
  const offset = circ - circ * clamp(progress, 0, 1);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
      <Circle
        cx={size / 2} cy={size / 2} r={r} stroke={activeColor} strokeWidth={strokeWidth} fill="transparent"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        originX={size / 2} originY={size / 2} rotation={-90}
      />
    </Svg>
  );
}

/* ── Delivery Ticks ────────────────────────────────────────────── */
function DeliveryTicks({ msg, isOwn, colors }) {
  if (!isOwn) return null;
  if (msg.is_pending) return <Ionicons name="time-outline" size={13} color={colors.textSecondary} style={{ marginLeft: 2 }} />;
  return (
    <Ionicons
      name={(msg.is_read || msg.is_delivered) ? 'checkmark-done' : 'checkmark'}
      size={14}
      color={msg.is_read ? colors.primary : colors.textSecondary}
      style={{ marginLeft: 2 }}
    />
  );
}

/* ── Reply Quote (inside bubble) ───────────────────────────────── */
function ReplyQuote({ replyTo, isOwn, colors, onPress }) {
  if (!replyTo) return null;
  const borderColor = isOwn ? 'rgba(255,255,255,0.7)' : colors.primary;
  const bg = isOwn ? 'rgba(255,255,255,0.15)' : colors.primaryLight;
  const nameColor = isOwn ? 'rgba(255,255,255,0.9)' : colors.primary;
  const textColor = isOwn ? 'rgba(255,255,255,0.75)' : colors.textSecondary;
  return (
    <Pressable onPress={onPress} style={[rqS.wrap, { backgroundColor: bg, borderLeftColor: borderColor }]}>
      <Text style={[rqS.name, { color: nameColor }]} numberOfLines={1}>
        {replyTo.sender?.display_name ?? 'Foydalanuvchi'}
      </Text>
      <Text style={[rqS.text, { color: textColor }]} numberOfLines={2}>
        {getMessagePreview(replyTo)}
      </Text>
    </Pressable>
  );
}
const rqS = StyleSheet.create({
  wrap: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  name: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  text: { fontSize: 12, lineHeight: 16 },
});

/* ── Reactions Row ─────────────────────────────────────────────── */
function ReactionsRow({ reactions, isOwn, colors, onReact }) {
  if (!reactions || reactions.length === 0) return null;
  const grouped = {};
  reactions.forEach((r) => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
  return (
    <View style={[rxS.row, isOwn ? rxS.own : rxS.other]}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <Pressable key={emoji} onPress={() => onReact?.(emoji)}
          style={({ pressed }) => [rxS.badge, { backgroundColor: isOwn ? 'rgba(255,255,255,0.18)' : colors.primaryLight, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={rxS.emoji}>{emoji}</Text>
          {count > 1 && <Text style={[rxS.count, { color: isOwn ? '#fff' : colors.primary }]}>{count}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

/* ── Highlight Text ─────────────────────────────────────────────── */
function HighlightText({ text, highlight, style }) {
  if (!highlight || !text) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase()
          ? <Text key={i} style={{ backgroundColor: '#FFD60A55', borderRadius: 2 }}>{part}</Text>
          : part
      )}
    </Text>
  );
}
const rxS = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  own: { justifyContent: 'flex-end' },
  other: { justifyContent: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, gap: 3 },
  emoji: { fontSize: 13 },
  count: { fontSize: 11, fontWeight: '700' },
});

/* ── Swipe to Reply ───────────────────────────────────────────── */
function SwipeToReply({ children, onReply, colors }) {
  // Swipeable does not work on web — render plain View on web
  if (Platform.OS === 'web') return <View>{children}</View>;
  const swipeRef = React.useRef(null);
  const renderAction = (progress) => {
    const opacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.7, 1] });
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
    return (
      <Animated.View style={{ width: 52, justifyContent: 'center', alignItems: 'center', opacity, transform: [{ scale }] }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '28', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="return-up-back" size={18} color={colors.primary} />
        </View>
      </Animated.View>
    );
  };
  return (
    <Swipeable ref={swipeRef} renderLeftActions={renderAction} leftThreshold={60}
      friction={1.5} overshootLeft={false} overshootFriction={8}
      onSwipeableLeftOpen={() => { onReply?.(); setTimeout(() => swipeRef.current?.close(), 80); }}>
      {children}
    </Swipeable>
  );
}

/* ── Typing Indicator ──────────────────────────────────────────── */
function TypingIndicator({ names, colors }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(d, { toValue: -5, duration: 280, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.delay(500),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []); // dots refs are stable — only run once on mount
  if (!names || names.length === 0) return null;
  return (
    <View style={tyS.wrap}>
      <View style={[tyS.bubble, { backgroundColor: colors.surface }]}>
        {dots.map((d, i) => (
          <Animated.View key={i} style={[tyS.dot, { backgroundColor: colors.textSecondary, transform: [{ translateY: d }] }]} />
        ))}
      </View>
      <Text style={[tyS.label, { color: colors.textSecondary }]}>{names.slice(0, 2).join(', ')} is typing...</Text>
    </View>
  );
}
const tyS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, gap: 8 },
  bubble: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: { fontSize: 12 },
});

/* ── Voice Bubble ──────────────────────────────────────────────── */
function VoiceMessageBubble({ item, isOwn, isDark, colors, onLongPress, isLastInGroup = true, playbackSpeed = 1, onSetPlaybackSpeed }) {
  const bubbleColor = isOwn ? colors.myMessageBubble : (colors.otherMessageBubble || colors.surface);
  const metaColor = isOwn ? (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.36)') : colors.textSecondary;
  const playBtnBg = isOwn ? (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)') : (colors.primary + '22');
  const playIconColor = isOwn ? (isDark ? '#ffffff' : colors.primary) : colors.primary;
  const trackBg = isOwn ? (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)') : colors.border;
  const fillColor = isOwn ? (isDark ? '#ffffff' : colors.primary) : colors.primary;
  const durColor = isOwn ? (isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.50)') : colors.textSecondary;
  const mediaUri = item.file_url ? `${BASE_URL}${item.file_url}` : null;
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(item.duration || 0);
  const webAudioRef = useRef(null);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const speedOptions = [1, 1.5, 2];

  useEffect(() => () => {
    if (Platform.OS === 'web') {
      if (webAudioRef.current) { webAudioRef.current.pause(); webAudioRef.current = null; }
    } else {
      sound?.unloadAsync().catch(() => {});
    }
  }, [sound]);
  const rowMargin = { marginBottom: isLastInGroup ? 6 : 2 };

  const toggle = useCallback(async () => {
    if (!mediaUri) return;

    // Web: use HTML5 Audio element directly (expo-av Audio.Sound does not work reliably in Chrome)
    if (Platform.OS === 'web') {
      try {
        if (!webAudioRef.current) {
          const a = new window.Audio(mediaUri);
          webAudioRef.current = a;
          a.playbackRate = playbackSpeed;
          a.ontimeupdate = () => {
            if (a.duration) {
              setProgress(a.currentTime / a.duration);
              setDur(Math.max(0, Math.ceil(a.duration - a.currentTime)));
            }
          };
          a.onended = () => { setPlaying(false); setProgress(0); setDur(item.duration || 0); };
          a.onerror = (e) => { console.error('voice play web', e); setPlaying(false); };
        }
        const audio = webAudioRef.current;
        if (playing) { audio.pause(); setPlaying(false); }
        else { await audio.play(); setPlaying(true); }
      } catch (e) { console.error('voice play web', e); }
      return;
    }

    // Native: use expo-av
    try {
      if (sound) {
        if (playing) { await sound.pauseAsync(); setPlaying(false); }
        else { await sound.playAsync(); setPlaying(true); }
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync({ uri: mediaUri }, { shouldPlay: true, rate: playbackSpeed }, (st) => {
          if (!st.isLoaded) return;
          if (st.durationMillis) {
            setDur(Math.ceil((st.durationMillis - st.positionMillis) / 1000));
            setProgress(st.positionMillis / st.durationMillis);
          }
          if (st.didJustFinish) { setPlaying(false); setProgress(0); setDur(item.duration || 0); }
        });
        setSound(s); setPlaying(true);
      }
    } catch (e) { console.error('voice play', e); }
  }, [item.duration, mediaUri, playing, sound, playbackSpeed]);

  return (
    <>
      <Pressable onLongPress={onLongPress} delayLongPress={320} style={[S.msgRow, isOwn ? S.msgOwn : S.msgOther, rowMargin]}>
        <View style={[S.voiceBubble, { backgroundColor: bubbleColor }]}>
          <TouchableOpacity
            style={[S.voicePlay, { backgroundColor: playBtnBg }]}
            onPress={toggle}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={playIconColor} />
          </TouchableOpacity>
          <View style={S.voiceContent}>
            {/* Waveform bars */}
            <View style={S.waveformRow}>
              {Array.from({ length: 30 }, (_, i) => {
                // Deterministic pseudo-random bar height based on message id and bar index
                const seed = (String(item.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0) + i * 7) % 100;
                const heightPct = 0.25 + (Math.sin(seed * 0.42) * 0.5 + 0.5) * 0.75;
                const barProgress = i / 29;
                const isPast = barProgress <= progress;
                return (
                  <View
                    key={i}
                    style={[
                      S.waveBar,
                      {
                        height: Math.max(3, Math.round(heightPct * 20)),
                        backgroundColor: isPast ? fillColor : trackBg,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={S.voiceMeta}>
              <Ionicons name="mic" size={11} color={isOwn ? (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.40)') : colors.textSecondary} />
              <Text style={[S.voiceDur, { color: durColor }]}>{formatDuration(dur)}</Text>
              <Pressable onPress={() => setShowSpeedPicker(!showSpeedPicker)} style={[S.speedBtn, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[S.speedText, { color: colors.primary }]}>{playbackSpeed}x</Text>
              </Pressable>
              <Text style={[S.msgTime, { color: metaColor, marginLeft: 'auto' }]}>{formatMessageTime(item.created_at)}</Text>
              <DeliveryTicks msg={item} isOwn={isOwn} colors={colors} />
            </View>
            {showSpeedPicker && (
              <View style={[S.speedPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {speedOptions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { onSetPlaybackSpeed?.(s); setShowSpeedPicker(false); }}
                    style={[S.speedOption, { backgroundColor: playbackSpeed === s ? colors.primary : 'transparent' }]}>
                    <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: playbackSpeed === s ? '#fff' : colors.text }]}>{s}x</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </Pressable>
      <ReactionsRow reactions={item.reactions} isOwn={isOwn} colors={colors} />
    </>
  );
}

/* ── Message Bubble ────────────────────────────────────────────── */
const URL_RE = /https?:\/\/[^\s]+/g;

function MessageBubble({ item, isOwn, isDark, colors, chatType, isVisibleVideoNote, playbackProgress, playbackSpeed = 1, onSetPlaybackSpeed, onPlaybackStatusUpdate, onOpenVideoNote, onLongPress, replyToMessage, searchText, onReact, onSenderPress, onDownloadMedia, onDeleteDownloadedMedia, onSaveToGallery, mediaLocalUri, mediaDownloading = false, mediaProgress = null, isFirstInGroup = true, isLastInGroup = true, readReceiptCount = 0, onScrollToReply }) {
  const bubbleColor = isOwn ? colors.myMessageBubble : (colors.otherMessageBubble || colors.surface);
  const textColor = isOwn ? (isDark ? '#FFFFFF' : '#000000') : colors.text;
  const metaColor = isOwn ? (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.36)') : colors.textSecondary;
  const mediaUri = item.file_url ? `${BASE_URL}${item.file_url}` : null;
  const resolvedMediaUri = mediaLocalUri || null;
  const mime = (item.mime_type || '').toLowerCase();
  const fileNameLower = (item.file_name || '').toLowerCase();
  const isImageLikeFile = item.message_type === 'file' && (
    mime.startsWith('image/') ||
    fileNameLower.endsWith('.jpg') ||
    fileNameLower.endsWith('.jpeg') ||
    fileNameLower.endsWith('.png') ||
    fileNameLower.endsWith('.webp') ||
    fileNameLower.endsWith('.gif') ||
    fileNameLower.endsWith('.heic') ||
    fileNameLower.endsWith('.heif')
  );

  // Video note inline expand state
  const [vnExpanded, setVnExpanded] = React.useState(false);
  const [vnPlaying, setVnPlaying] = React.useState(false);
  const vnScaleAnim = React.useRef(new Animated.Value(1)).current;
  const toggleVnExpand = React.useCallback(() => {
    const toVal = vnExpanded ? 1 : 1.32;
    setVnExpanded((p) => !p);
    Animated.spring(vnScaleAnim, { toValue: toVal, useNativeDriver: true, tension: 130, friction: 8 }).start();
  }, [vnExpanded, vnScaleAnim]);

  const handleVideoNotePress = React.useCallback(() => {
    if (!resolvedMediaUri) {
      onDownloadMedia?.(item);
      return;
    }
    // Play/Pause only on user tap (no autoplay on visibility).
    setVnPlaying((p) => !p);
    toggleVnExpand();
  }, [item, onDownloadMedia, resolvedMediaUri, toggleVnExpand]);

  if (item.message_type === 'voice') {
    return <VoiceMessageBubble item={item} isOwn={isOwn} isDark={isDark} colors={colors} onLongPress={onLongPress} isLastInGroup={isLastInGroup} playbackSpeed={playbackSpeed} onSetPlaybackSpeed={onSetPlaybackSpeed} />;
  }

  if (item.message_type === 'call') {
    const isVideo = (item.content || '').toLowerCase().includes('video');
    const iconName = isVideo ? 'videocam-outline' : 'call-outline';
    return (
      <View style={[S.callBubble, isOwn ? S.callBubbleOwn : S.callBubbleOther]}>
        <Ionicons name={iconName} size={16} color={isOwn ? '#fff' : colors.primary} style={{ marginRight: 6 }} />
        <Text style={[S.callBubbleText, { color: isOwn ? '#fff' : colors.text }]}>{item.content}</Text>
      </View>
    );
  }

  const toMb = (bytes) => `${(Math.max(0, Number(bytes || 0)) / (1024 * 1024)).toFixed(1)} MB`;
  const progressText = mediaProgress
    ? `${toMb(mediaProgress.writtenBytes)} / ${toMb(mediaProgress.totalBytes || 0)} • qoldi ${toMb(mediaProgress.remainingBytes)}`
    : null;
  const progressPercent = Math.max(0, Math.min(100, Math.round((mediaProgress?.progress || 0) * 100)));

  const mediaProgressBlock = mediaDownloading && progressText ? (
    <>
      <Text style={[S.mediaProgressText, { color: isOwn ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.68)') : colors.textSecondary }]}>{progressText}</Text>
      {mediaProgress?.totalBytes > 0 ? (
        <View style={[S.mediaProgressTrack, { backgroundColor: isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)' }]}>
          <View style={[S.mediaProgressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
        </View>
      ) : null}
    </>
  ) : null;

  const mediaDownloadPlaceholder = (label) => (
    <View style={[S.mediaDownloadCard, { borderColor: colors.border, backgroundColor: isOwn ? 'rgba(255,255,255,0.12)' : colors.surface }]}> 
      <Ionicons name="cloud-download-outline" size={22} color={isOwn ? (isDark ? '#fff' : '#000') : colors.primary} />
      <Text style={[S.mediaDownloadLabel, { color: isOwn ? (isDark ? '#fff' : '#000') : colors.text }]}>{label}</Text>
      {!mediaDownloading ? <Text style={[S.mediaDownloadHint, { color: colors.textSecondary }]}>Uzoq bosib menyudan yuklang</Text> : null}
      {mediaProgressBlock}
    </View>
  );

  if (item.message_type === 'video_note' && mediaUri) {
    return (
      <View style={[S.msgRow, isOwn ? S.msgOwn : S.msgOther, { marginBottom: isLastInGroup ? 10 : 4 }]}>
        <Pressable onPress={handleVideoNotePress} onLongPress={onLongPress} delayLongPress={320} style={S.videoNoteWrap}>
          <Animated.View style={[S.videoNoteTap, { transform: [{ scale: vnScaleAnim }] }]}>
            {resolvedMediaUri ? (
              <View style={S.videoNoteRing}>
                <ProgressRing progress={playbackProgress} size={VIDEO_NOTE_RING_SIZE} strokeWidth={5}
                  activeColor={colors.primary}
                  trackColor={'rgba(15,23,42,0.10)'} />
                <View style={[S.videoNoteShell, { borderColor: isOwn ? 'rgba(255,255,255,0.24)' : 'rgba(15,23,42,0.08)' }]}>
                  <Video source={{ uri: resolvedMediaUri }} style={S.videoNoteVideo} resizeMode={ResizeMode.COVER}
                    shouldPlay={vnPlaying && isVisibleVideoNote} isLooping progressUpdateIntervalMillis={200} useNativeControls={false}
                    onPlaybackStatusUpdate={(st) => {
                      if (st?.didJustFinish) setVnPlaying(false);
                      onPlaybackStatusUpdate(item.id, st);
                    }} />
                </View>
                <View style={S.vnOverBot}>
                  <Ionicons name={vnPlaying ? 'pause' : 'play'} size={11} color="#fff" />
                  <Text style={S.vnDur}>{formatDuration(item.duration)}</Text>
                </View>
              </View>
            ) : (
              <View style={[S.videoNotePlaceholder, { borderColor: colors.border, backgroundColor: isOwn ? 'rgba(255,255,255,0.12)' : colors.surface }]}> 
                <Ionicons name="cloud-download-outline" size={24} color={isOwn ? (isDark ? '#fff' : '#000') : colors.primary} />
                {!mediaDownloading ? <Text style={[S.mediaDownloadHint, { color: colors.textSecondary }]}>Uzoq bosib yuklang</Text> : null}
                {mediaProgressBlock}
              </View>
            )}
          </Animated.View>
          <View style={S.videoNoteMeta}>
            <Text style={[S.msgTime, { color: metaColor, fontSize: 11 }]}>{formatMessageTime(item.created_at)}</Text>
            <DeliveryTicks msg={item} isOwn={isOwn} colors={colors} />
          </View>
          <ReactionsRow reactions={item.reactions} isOwn={isOwn} colors={colors} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[S.msgRow, isOwn ? S.msgOwn : S.msgOther, { marginBottom: isLastInGroup ? 6 : 2 }]}>
      <Pressable onLongPress={onLongPress} delayLongPress={320}
        style={[S.bubble, { backgroundColor: bubbleColor }, isOwn ? (isLastInGroup ? S.bubbleOwn : null) : (isLastInGroup ? S.bubbleOther : null)]}>

        {/* Group sender name - only on first message in a consecutive group */}
        {chatType === 'group' && !isOwn && item.sender?.display_name && isFirstInGroup
          ? <Pressable onPress={() => onSenderPress?.(item.sender)}>
              <Text style={[S.senderName, { color: colors.primary }]} numberOfLines={1}>{item.sender.display_name}</Text>
            </Pressable>
          : null}

        {/* Reply quote */}
        <ReplyQuote replyTo={replyToMessage} isOwn={isOwn} colors={colors} onPress={onScrollToReply} />

        {/* Image */}
        {(item.message_type === 'image' || isImageLikeFile) && mediaUri
          ? (resolvedMediaUri
            ? <>
                <Image source={{ uri: resolvedMediaUri }} style={S.msgImg} />
              </>
            : mediaDownloadPlaceholder('Rasm yuklanmagan'))
          : null}

        {/* Video */}
        {item.message_type === 'video' && mediaUri && (
          resolvedMediaUri ? (
            <>
              <Video source={{ uri: resolvedMediaUri }} style={S.msgVideo} resizeMode={ResizeMode.COVER} useNativeControls shouldPlay={false} isLooping={false} />
            </>
          ) : mediaDownloadPlaceholder('Video yuklanmagan')
        )}

        {/* Sticker */}
        {item.message_type === 'sticker' && mediaUri
          ? <Image source={{ uri: mediaUri }} style={S.stickerImg} resizeMode="contain" /> : null}

        {/* Poll */}
        {item.message_type === 'poll' && item.poll && (
          <View style={S.pollBubble}>
            <Text style={[S.pollQuestion, { color: textColor }]}>{item.poll.question}</Text>
            {(item.poll.options || []).map((opt) => (
              <View key={opt.id} style={[S.pollOption, { borderColor: colors.border }]}>
                <View style={[S.pollBar, { backgroundColor: colors.primary + '33', width: `${opt.vote_count > 0 ? Math.round((opt.vote_count / Math.max(item.poll.total_votes, 1)) * 100) : 0}%` }]} />
                <Text style={[S.pollOptionText, { color: textColor }]}>{opt.text}</Text>
                <Text style={[S.pollVoteCount, { color: metaColor }]}>{opt.vote_count ?? 0}</Text>
              </View>
            ))}
            <Text style={[{ color: metaColor, fontSize: 11, marginTop: 4 }]}>{item.poll.is_anonymous ? 'Anonim' : ''} · {item.poll.total_votes ?? 0} ovoz</Text>
          </View>
        )}

        {/* Location */}
        {item.message_type === 'location' && item.latitude != null && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${item.latitude},${item.longitude}`).catch(() => {})}
            style={[S.locationBubble, { backgroundColor: isOwn ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)') : colors.primaryLight }]}>
            <View style={[S.locationMapPreview, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name="location" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.locationTitle, { color: isOwn ? (isDark ? '#fff' : '#000') : colors.text }]} numberOfLines={1}>
                {item.location_title || 'Joylashuv'}
              </Text>
              <Text style={[S.locationCoords, { color: metaColor }]}>
                {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* File */}
        {item.message_type === 'file' && !isImageLikeFile && (
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => {
              if (resolvedMediaUri) Linking.openURL(resolvedMediaUri).catch(() => {});
            }}
            style={[S.fileBubble, { backgroundColor: isOwn ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)') : colors.primaryLight }]}>
            <Ionicons name="document-outline" size={28} color={isOwn ? (isDark ? '#fff' : colors.primary) : colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[S.fileName, { color: isOwn ? (isDark ? '#fff' : '#000') : colors.text }]} numberOfLines={2}>
                {item.file_name || 'Fayl'}
              </Text>
              {item.file_size ? (
                <Text style={[S.fileSize, { color: metaColor }]}>{(item.file_size / 1024).toFixed(1)} KB</Text>
              ) : null}
              {!resolvedMediaUri ? <Text style={[S.fileSize, { color: colors.primary, marginTop: 4 }]}>Yuklanmagan (uzoq bosib yuklang)</Text> : null}
            </View>
            {!resolvedMediaUri ? <Text style={[S.fileSize, { color: colors.textSecondary }]}>Uzoq bosib menyuni oching</Text> : null}
          </TouchableOpacity>
        )}

        {/* Forwarded label */}
        {item.forwarded_from_id && (
          <View style={S.forwardedRow}>
            <Ionicons name="arrow-redo-outline" size={13} color={colors.primary} />
            <Text style={[S.forwardedLabel, { color: colors.primary, fontWeight: '600' }]}>
              {item.forward_from?.display_name
                ? `${item.forward_from.display_name}`
                : 'Yuborilgan xabar'}
            </Text>
          </View>
        )}

        {/* Text with URL detection */}
        {item.content ? (() => {
          const parts = item.content.split(URL_RE);
          const matches = item.content.match(URL_RE) || [];
          if (matches.length === 0) return <HighlightText text={item.content} highlight={searchText} style={[S.msgText, { color: textColor }]} />;
          const nodes = [];
          parts.forEach((part, i) => {
            if (part) nodes.push(<HighlightText key={`t${i}`} text={part} highlight={searchText} style={[S.msgText, { color: textColor }]} />);
            if (matches[i]) nodes.push(
              <Text key={`u${i}`} style={[S.msgText, { color: isOwn ? '#AEE0FF' : colors.primary, textDecorationLine: 'underline' }]}
                onPress={() => Linking.openURL(matches[i]).catch(() => {})}>{matches[i]}</Text>
            );
          });
          return <Text>{nodes}</Text>;
        })() : null}

        {/* Meta */}
        <View style={S.metaRow}>
          {item.is_edited ? <Text style={[S.editedLabel, { color: metaColor }]}>tahrirlangan</Text> : null}
          <Pressable onPress={() => Alert.alert('', format(new Date(item.created_at), 'dd.MM.yyyy HH:mm'))}>
            <Text style={[S.msgTime, { color: metaColor }]}>{formatMessageTime(item.created_at)}</Text>
          </Pressable>
          <DeliveryTicks msg={item} isOwn={isOwn} colors={colors} />
        </View>
      </Pressable>
      <View>
        <ReactionsRow reactions={item.reactions} isOwn={isOwn} colors={colors} onReact={onReact} />
        {readReceiptCount > 0 && isOwn && (
          <View style={[S.readReceiptRow, { marginLeft: 'auto', marginRight: 10 }]}>
            <Ionicons name="eye" size={11} color={colors.primary} />
            <Text style={[S.readReceiptText, { color: colors.primary }]}>{readReceiptCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ── Context Menu ──────────────────────────────────────────────── */
function ContextMenu({ visible, message, isOwn, colors, isDark, onClose, onReply, onCopy, onEdit, onDelete, onForward, onSave, onReact, onPin, onMediaDownload, onMediaDeleteLocal, onMediaSaveGallery, hasLocalMedia = false, pinnedMessageId }) {
  const bg = isDark ? '#2B3844' : '#FFFFFF';
  const isPinned = message?.id === pinnedMessageId;
  const hasMedia = Boolean(message?.file_url);
  const actions = [
    { key: 'reply', label: 'Javob berish', icon: 'return-up-back-outline', color: colors.primary },
    { key: 'copy', label: 'Nusxalash', icon: 'copy-outline', color: isDark ? '#fff' : '#000', show: !!message?.content },
    { key: 'pin', label: isPinned ? 'Mahkamlashni bekor qilish' : 'Xabarni mahkamlash', icon: isPinned ? 'pin' : 'pin-outline', color: isDark ? '#fff' : '#000' },
    { key: 'media_download', label: 'Yuklab olish', icon: 'download-outline', color: colors.primary, show: hasMedia && !hasLocalMedia },
    { key: 'media_delete_local', label: 'Lokal nusxani o\'chirish', icon: 'trash-outline', color: colors.danger, show: hasMedia && hasLocalMedia },
    { key: 'media_save_gallery', label: 'Galereyaga saqlash', icon: 'images-outline', color: '#2E7D32', show: hasMedia && hasLocalMedia },
    { key: 'forward', label: 'Yuborish', icon: 'arrow-redo-outline', color: isDark ? '#fff' : '#000' },
    { key: 'save', label: 'Xabarni saqlash', icon: 'bookmark-outline', color: isDark ? '#fff' : '#000' },
    { key: 'edit', label: 'Tahrirlash', icon: 'create-outline', color: colors.primary, show: isOwn && !message?.message_type || message?.message_type === 'text' },
    { key: 'delete', label: 'O\'chirish', icon: 'trash-outline', color: colors.danger, show: isOwn },
  ].filter((a) => a.show !== false);

  const handle = (key) => {
    onClose();
    setTimeout(() => {
      if (key === 'reply') onReply();
      else if (key === 'copy') onCopy();
      else if (key === 'edit') onEdit();
      else if (key === 'delete') onDelete();
      else if (key === 'forward') onForward();
      else if (key === 'save') onSave();
      else if (key === 'pin') onPin?.();
      else if (key === 'media_download') onMediaDownload?.();
      else if (key === 'media_delete_local') onMediaDeleteLocal?.();
      else if (key === 'media_save_gallery') onMediaSaveGallery?.();
    }, 200);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cmS.overlay} onPress={onClose}>
        {/* Quick reactions */}
        <View style={[cmS.reactionRow, { backgroundColor: bg }]}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity key={emoji} style={cmS.reactionBtn} onPress={() => { onClose(); setTimeout(() => onReact(emoji), 200); }}>
              <Text style={cmS.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action list */}
        <Pressable style={[cmS.menu, { backgroundColor: bg }]} onPress={() => {}}>
          {actions.map((a, idx) => (
            <TouchableOpacity
              key={a.key}
              style={[cmS.menuItem, idx < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]}
              onPress={() => handle(a.key)}
              activeOpacity={0.7}
            >
              <Text style={[cmS.menuLabel, { color: a.color }]}>{a.label}</Text>
              <Ionicons name={a.icon} size={20} color={a.color} />
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const cmS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  reactionRow: { flexDirection: 'row', borderRadius: 30, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8, gap: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10 },
  reactionBtn: { padding: 6 },
  reactionEmoji: { fontSize: 26 },
  menu: { width: '100%', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, elevation: 12 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  menuLabel: { fontSize: 16 },
});

/* ── Attach Picker ─────────────────────────────────────────────── */
function AttachPicker({ visible, onClose, colors, isDark, onPickImage, onPickFile, onPickCamera, onPoll, onScheduled, onLocation }) {
  const bg = isDark ? '#2B3844' : '#FFFFFF';
  const opts = [
    { key: 'gallery', label: 'Galereya', icon: 'images-outline', color: '#5B8DD9', fn: onPickImage },
    { key: 'camera', label: 'Kamera', icon: 'camera-outline', color: '#3BAB76', fn: onPickCamera },
    { key: 'file', label: 'Fayl', icon: 'document-outline', color: '#E8A838', fn: onPickFile },
    { key: 'poll', label: "So'rovnoma", icon: 'bar-chart-outline', color: '#9C6DD9', fn: onPoll },
    { key: 'scheduled', label: 'Rejalashtirilgan', icon: 'time-outline', color: '#3BAEB6', fn: onScheduled },
    { key: 'location', label: 'Joylashuv', icon: 'location-outline', color: '#E85454', fn: onLocation },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={apS.overlay} onPress={onClose}>
        <Pressable style={[apS.sheet, { backgroundColor: bg }]} onPress={() => {}}>
          <View style={[apS.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#D0D0D0' }]} />
          <Text style={[apS.title, { color: isDark ? '#fff' : '#000' }]}>Biriktirish</Text>
          <View style={apS.grid}>
            {opts.map((o) => (
              <TouchableOpacity key={o.key} style={apS.opt} activeOpacity={0.75}
                onPress={() => { onClose(); setTimeout(() => o.fn?.(), 300); }}>
                <View style={[apS.optIcon, { backgroundColor: o.color + '22' }]}>
                  <Ionicons name={o.icon} size={30} color={o.color} />
                </View>
                <Text style={[apS.optLabel, { color: isDark ? '#fff' : '#333' }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[apS.cancel, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4F4F5' }]} onPress={onClose}>
            <Text style={[apS.cancelText, { color: isDark ? '#fff' : '#333' }]}>Bekor qilish</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const apS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12, paddingHorizontal: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 18 },
  grid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  opt: { alignItems: 'center', gap: 8, flex: 1 },
  optIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  optLabel: { fontSize: 13, fontWeight: '500' },
  cancel: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 16, fontWeight: '600' },
});

/* ── Forward Modal ─────────────────────────────────────────────── */
function ForwardModal({ visible, onClose, colors, isDark, chats, onForwardTo }) {
  const bg = isDark ? '#1E2C3A' : '#FFFFFF';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fwS.overlay} onPress={onClose}>
        <Pressable style={[fwS.sheet, { backgroundColor: bg }]} onPress={() => {}}>
          <View style={[fwS.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#D0D0D0' }]} />
          <Text style={[fwS.title, { color: isDark ? '#fff' : '#000' }]}>Qaysi chatga yuborish?</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {chats.map((chat) => {
              const name = chat.chat_type === 'group' ? (chat.title ?? 'Guruh') : (chat.other_user?.display_name ?? 'Foydalanuvchi');
              return (
                <TouchableOpacity key={chat.id}
                  style={[fwS.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0' }]}
                  onPress={() => { onClose(); setTimeout(() => onForwardTo(chat.id), 300); }}>
                  <View style={[fwS.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={fwS.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[fwS.chatName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[fwS.cancel, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4F4F5' }]} onPress={onClose}>
            <Text style={[fwS.cancelText, { color: isDark ? '#fff' : '#333' }]}>Bekor qilish</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const fwS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12, paddingHorizontal: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontSize: 17, fontWeight: '700' },
  chatName: { fontSize: 15, fontWeight: '500', flex: 1 },
  cancel: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  cancelText: { fontSize: 16, fontWeight: '600' },
});

/* ═══════════════════════════════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════════════════════════════ */
export default function ChatScreen({ route, navigation }) {
  const { chatId, chatName, chatType, otherUserId } = route.params;
  const { colors, isDark } = useTheme();
  const currentUser = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  /* refs */
  const flatListRef = useRef(null);
  const cameraRef = useRef(null);
  const durationTimerRef = useRef(null);
  const recordSessionRef = useRef({ active: false, cancelled: false, locked: false, stopping: false, started: false });
  const recordDurationRef = useRef(0);
  const cameraFlipPendingRef = useRef(false);
  const pulseValue = useRef(new Animated.Value(0)).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const audioRecordingRef = useRef(null);
  const voiceDurationTimerRef = useRef(null);
  const voiceDurationRef = useRef(0);
  const pressTimerRef = useRef(null);
  const isPressRecordingRef = useRef(false);
  const isVoiceActiveRef = useRef(false);
  const isVoiceLockedRef = useRef(false);
  const typingTimerRef = useRef(null);
  // Web audio MediaRecorder refs
  const webMediaRecorderRef = useRef(null);
  const webMediaStreamRef = useRef(null);
  const webMediaChunksRef = useRef([]);
  const wsReloadDebounceRef = useRef(null);
  // Web video MediaRecorder refs
  const webVideoRecorderRef = useRef(null);
  const webVideoStreamRef = useRef(null);
  const webVideoChunksRef = useRef([]);
  const webVideoPreviewRef = useRef(null);

  /* state */
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [visibleVideoNotes, setVisibleVideoNotes] = useState(new Set());
  const [playbackProgress, setPlaybackProgress] = useState({});
  const [fullscreenVideoNote, setFullscreenVideoNote] = useState(null);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('front');
  const [isVideoLocked, setIsVideoLocked] = useState(false);
  const [isVideoCancelling, setIsVideoCancelling] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoDrag, setVideoDrag] = useState({ x: 0, y: 0 });
  const [inputMode, setInputMode] = useState('video');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceLocked, setIsVoiceLocked] = useState(false);
  const [isVoiceCancelling, setIsVoiceCancelling] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [voiceDrag, setVoiceDrag] = useState({ x: 0, y: 0 });
  /* new features */
  const [replyTo, setReplyTo] = useState(null);
  const [editMsg, setEditMsg] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, message: null });
  const [showAttach, setShowAttach] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardVisible, setForwardVisible] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [typingNames, setTypingNames] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAnon, setPollAnon] = useState(false);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [memberCount, setMemberCount] = useState(null);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [mediaCacheMap, setMediaCacheMap] = useState({});
  const [mediaDownloadingMap, setMediaDownloadingMap] = useState({});
  const [mediaProgressMap, setMediaProgressMap] = useState({});
  const [autoDownloadMediaEnabled, setAutoDownloadMediaEnabled] = useState(false);
  const autoDownloadRunningRef = useRef(false);
  /* P1 Features: playback speed, multi-select, read receipts */
  const [playbackSpeeds, setPlaybackSpeeds] = useState({}); // { messageId: 1 | 1.5 | 2 }
  const [selectedMessages, setSelectedMessages] = useState(new Set()); // multi-select
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const highlightTimerRef = useRef(null);

  const getMediaCacheKey = useCallback((msg) => `${chatId}:${msg?.id || 'unknown'}:${msg?.file_url || ''}`, [chatId]);

  const getLocalMediaUri = useCallback((msg) => {
    const key = getMediaCacheKey(msg);
    return mediaCacheMap[key]?.localUri || null;
  }, [getMediaCacheKey, mediaCacheMap]);

  useEffect(() => {
    let mounted = true;
    loadMediaCache().then((cache) => {
      if (mounted) setMediaCacheMap(cache || {});
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Proactively request mic + camera permissions so the system dialog
  // appears early rather than mid-recording.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        if (!cameraPermission?.granted) await requestCameraPermission?.();
      } catch {}
      try {
        if (!micPermission?.granted) await requestMicPermission?.();
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const refreshAutoDownloadSetting = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        setAutoDownloadMediaEnabled(false);
        return;
      }
      const parsed = JSON.parse(raw);
      setAutoDownloadMediaEnabled(Boolean(parsed?.autoDownloadMedia));
    } catch {
      setAutoDownloadMediaEnabled(false);
    }
  }, []);

  useEffect(() => {
    refreshAutoDownloadSetting();
    const unsub = navigation.addListener('focus', refreshAutoDownloadSetting);
    return unsub;
  }, [navigation, refreshAutoDownloadSetting]);

  const handleDownloadMedia = useCallback(async (msg) => {
    if (!msg?.file_url) return;
    const key = getMediaCacheKey(msg);
    setMediaDownloadingMap((prev) => ({ ...prev, [key]: true }));
    setMediaProgressMap((prev) => ({ ...prev, [key]: { totalBytes: 0, writtenBytes: 0, remainingBytes: 0, progress: 0 } }));
    try {
      const rec = await ensureDownloadedMedia({
        cacheKey: key,
        remoteUrl: `${BASE_URL}${msg.file_url}`,
        fileNameHint: msg.file_name || undefined,
        onProgress: (p) => {
          setMediaProgressMap((prev) => ({ ...prev, [key]: p }));
        },
      });
      setMediaCacheMap((prev) => ({ ...prev, [key]: rec }));
    } catch {
      Alert.alert('Xato', 'Media faylni yuklab bo\'lmadi');
    } finally {
      setMediaDownloadingMap((prev) => ({ ...prev, [key]: false }));
      setMediaProgressMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [getMediaCacheKey]);

  const handleDeleteDownloadedMedia = useCallback(async (msg) => {
    const key = getMediaCacheKey(msg);
    try {
      await removeDownloadedMedia(key);
      setMediaCacheMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setMediaProgressMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch {
      Alert.alert('Xato', 'Lokal faylni o\'chirib bo\'lmadi');
    }
  }, [getMediaCacheKey]);

  const handleSaveMediaToGallery = useCallback(async (msg) => {
    const key = getMediaCacheKey(msg);
    let localUri = getLocalMediaUri(msg);
    if (!localUri && msg?.file_url) {
      setMediaDownloadingMap((prev) => ({ ...prev, [key]: true }));
      setMediaProgressMap((prev) => ({ ...prev, [key]: { totalBytes: 0, writtenBytes: 0, remainingBytes: 0, progress: 0 } }));
      try {
        const rec = await ensureDownloadedMedia({
          cacheKey: key,
          remoteUrl: `${BASE_URL}${msg.file_url}`,
          fileNameHint: msg.file_name || undefined,
          onProgress: (p) => {
            setMediaProgressMap((prev) => ({ ...prev, [key]: p }));
          },
        });
        localUri = rec?.localUri || null;
        if (rec) setMediaCacheMap((prev) => ({ ...prev, [key]: rec }));
      } finally {
        setMediaDownloadingMap((prev) => ({ ...prev, [key]: false }));
        setMediaProgressMap((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
    if (!localUri) {
      Alert.alert('Xato', 'Avval media yuklab olinishi kerak');
      return;
    }
    try {
      await saveLocalMediaToGallery(localUri);
      Alert.alert('Saqlandi', Platform.OS === 'web' ? 'Media yangi oynada ochildi' : 'Media galereyaga saqlandi');
    } catch {
      Alert.alert('Xato', 'Galereyaga saqlab bo\'lmadi');
    }
  }, [getLocalMediaUri, getMediaCacheKey]);

  useEffect(() => {
    if (!autoDownloadMediaEnabled || autoDownloadRunningRef.current) return;

    const pending = messages
      .filter((m) => m?.file_url)
      .filter((m) => {
        const key = getMediaCacheKey(m);
        const hasLocal = Boolean(mediaCacheMap[key]?.localUri);
        const isDownloading = Boolean(mediaDownloadingMap[key]);
        return !hasLocal && !isDownloading;
      })
      .slice(0, 4);

    if (pending.length === 0) return;

    autoDownloadRunningRef.current = true;
    (async () => {
      try {
        for (const msg of pending) {
          // Sequential downloading keeps memory/network usage stable
          // and avoids spawning too many parallel downloads.
          // eslint-disable-next-line no-await-in-loop
          await handleDownloadMedia(msg);
        }
      } finally {
        autoDownloadRunningRef.current = false;
      }
    })();
  }, [autoDownloadMediaEnabled, getMediaCacheKey, handleDownloadMedia, mediaCacheMap, mediaDownloadingMap, messages]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated }));
  }, []);

  /* load messages */
  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get(`/chats/${chatId}/messages`, { params: { limit: 100, offset: 0 } });
      setMessages(res.data || []);
      apiClient.post(`/chats/${chatId}/messages/read`).catch(() => {});
      requestAnimationFrame(() => scrollToBottom(false));
    } catch (e) { console.error('load messages', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [chatId, scrollToBottom]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftKey = `${DRAFT_STORAGE_KEY}:${chatId}`;
        const saved = await AsyncStorage.getItem(draftKey);
        if (saved) setText(saved);
      } catch {}
    };
    loadDraft();
  }, [chatId]);

  // Auto-save draft (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (text.trim()) {
        const draftKey = `${DRAFT_STORAGE_KEY}:${chatId}`;
        try {
          await AsyncStorage.setItem(draftKey, text);
        } catch {}
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text, chatId]);

  // Fetch chat meta once on mount
  useEffect(() => {
    apiClient.get(`/chats/${chatId}`).then((r) => {
      setIsChatMuted(r.data?.is_muted ?? false);
      if (chatType === 'group') setMemberCount(r.data?.member_count ?? r.data?.members?.length ?? null);
    }).catch(() => {});
  }, [chatId, chatType]);

  useEffect(() => {
    loadMessages();
    // No polling — WebSocket handles real-time new messages
  }, [loadMessages]);

  // fetch last seen for private chats
  useEffect(() => {
    if (chatType !== 'private' || !otherUserId) return;
    apiClient.get(`/users/${otherUserId}/profile`).then((r) => {
      setLastSeen(r.data?.last_seen ?? null);
    }).catch(() => {});
  }, [chatType, otherUserId]);

  /* websocket */
  useEffect(() => {
    const onMsg = (payload) => {
      if (payload?.chat_id !== chatId) return;
      setMessages((prev) => prev.find((m) => m.id === payload.id) ? prev : [...prev, payload]);
      apiClient.post(`/chats/${chatId}/messages/read`).catch(() => {});
      // Debounced full reload to ensure complete data (sender info, reactions etc.)
      clearTimeout(wsReloadDebounceRef.current);
      wsReloadDebounceRef.current = setTimeout(() => loadMessages(true), 600);
      // Increment unread badge when scrolled up
      setShowScrollBtn((show) => {
        if (show) setUnreadCount((n) => n + 1);
        return show;
      });
    };
    const onEdited = (payload) => {
      if (payload?.chat_id && payload.chat_id !== chatId) return;
      if (!payload?.id) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.id ? { ...m, ...payload } : m)));
    };
    const onDeleted = (payload) => {
      if (payload?.chat_id && payload.chat_id !== chatId) return;
      const deletedId = payload?.message_id;
      if (!deletedId) return;
      setMessages((prev) => prev.filter((m) => m.id !== deletedId));
    };
    const onReactionUpdated = (payload) => {
      if (payload?.chat_id && payload.chat_id !== chatId) return;
      if (!payload?.message_id) return;
      setMessages((prev) => prev.map((m) => (
        m.id === payload.message_id ? { ...m, reactions: payload.reactions || [] } : m
      )));
    };
    const onTyping = (payload) => {
      if (payload?.chat_id !== chatId || payload?.user_id === currentUser?.id) return;
      setTypingNames((prev) => prev.includes(payload.display_name) ? prev : [...prev, payload.display_name]);
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setTypingNames([]), 3000);
    };
    const onRead = (payload) => {
      if (payload?.chat_id === chatId) setMessages((prev) => prev.map((m) => m.sender?.id === currentUser?.id ? { ...m, is_read: true } : m));
    };
    const onOnline = (p) => { if (chatType === 'private' && p?.user_id === otherUserId) setOnlineStatus(true); };
    const onOffline = (p) => { if (chatType === 'private' && p?.user_id === otherUserId) setOnlineStatus(false); };
    wsService.on('new_message', onMsg);
    wsService.on('message_edited', onEdited);
    wsService.on('message_deleted', onDeleted);
    wsService.on('reaction_updated', onReactionUpdated);
    wsService.on('typing', onTyping);
    wsService.on('messages_read', onRead);
    wsService.on('user_online', onOnline);
    wsService.on('user_offline', onOffline);
    return () => {
      wsService.off('new_message', onMsg);
      wsService.off('message_edited', onEdited);
      wsService.off('message_deleted', onDeleted);
      wsService.off('reaction_updated', onReactionUpdated);
      wsService.off('typing', onTyping);
      wsService.off('messages_read', onRead);
      wsService.off('user_online', onOnline);
      wsService.off('user_offline', onOffline);
      // Cancel pending timers to prevent setState on unmounted component
      clearTimeout(wsReloadDebounceRef.current);
      clearTimeout(typingTimerRef.current);
    };
  }, [chatId, chatType, currentUser?.id, otherUserId]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollToBottom(true));
    return () => sub.remove();
  }, [scrollToBottom]);

  /* call helpers */
  const startVoiceCall = useCallback(async () => {
    if (!otherUserId) {
      Alert.alert('Qo\'ng\'iroq', 'Qo\'ng\'iroq qilish uchun foydalanuvchi aniqlanmadi. Chatni qayta ochib ko\'ring.');
      return;
    }
    try {
      const { callService } = await import('../../services/callService');
      const started = await callService.initiateCall(otherUserId, chatName, 'voice');
      if (!started) {
        Alert.alert('Qo\'ng\'iroq', 'Qo\'ng\'iroqni boshlab bo\'lmadi. Web versiyada yoki Expo Go ichida cheklov bo\'lishi mumkin.');
        return;
      }
      navigation.navigate('Call', {
        returnTo: 'Chat',
        returnParams: route.params,
      });
    } catch { Alert.alert('Xato', 'Qo\'ng\'iroq boshlanmadi'); }
  }, [chatName, navigation, otherUserId, route.params]);

  const startVideoCall = useCallback(async () => {
    if (!otherUserId) {
      Alert.alert('Video qo\'ng\'iroq', 'Qo\'ng\'iroq qilish uchun foydalanuvchi aniqlanmadi. Chatni qayta ochib ko\'ring.');
      return;
    }
    try {
      const { callService } = await import('../../services/callService');
      const started = await callService.initiateCall(otherUserId, chatName, 'video');
      if (!started) {
        Alert.alert('Video qo\'ng\'iroq', 'Video qo\'ng\'iroqni boshlab bo\'lmadi. Web versiyada yoki Expo Go ichida cheklov bo\'lishi mumkin.');
        return;
      }
      navigation.navigate('Call', {
        returnTo: 'Chat',
        returnParams: route.params,
      });
    } catch { Alert.alert('Xato', 'Video qo\'ng\'iroq boshlanmadi'); }
  }, [chatName, navigation, otherUserId, route.params]);

  /* header */
  useLayoutEffect(() => {
    const avatarLetter = (chatName || '?').charAt(0).toUpperCase();
    const avatarColors = ['#E57373','#64B5F6','#81C784','#FFB74D','#BA68C8','#4DB6AC','#F06292','#4DD0E1'];
    const avatarBg = avatarColors[(chatName?.charCodeAt(0) ?? 0) % avatarColors.length];
    const chatAvatarUrl = route.params?.chatAvatar ?? null;

    navigation.setOptions({
      title: '',
      headerLeft: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -6 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={28} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', route.params)} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ marginRight: 8 }}>
              {chatAvatarUrl ? (
                <Image source={{ uri: `${BASE_URL}${chatAvatarUrl}` }} style={{ width: 38, height: 38, borderRadius: 19 }} />
              ) : (
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: avatarBg, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{avatarLetter}</Text>
                </View>
              )}
              {onlineStatus && chatType === 'private' && (
                <View style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 5.5, backgroundColor: '#31C46C', borderWidth: 2, borderColor: colors.headerBackground }} />
              )}
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[S.headerTitle, { color: colors.text }]} numberOfLines={1}>{chatName || 'Chat'}</Text>
                {isChatMuted && <Ionicons name="volume-mute-outline" size={13} color={colors.textSecondary} />}
              </View>
              {chatType === 'private' && (
                <Text style={[S.headerSub, { color: typingNames.length > 0 ? colors.primary : onlineStatus ? colors.online : colors.textSecondary }]}>
                  {typingNames.length > 0
                    ? 'typing...'
                    : onlineStatus ? 'online'
                    : lastSeen ? `last seen ${formatMessageTime(lastSeen)}`
                    : 'last seen recently'}
                </Text>
              )}
              {chatType === 'group' && (
                <Text style={[S.headerSub, { color: typingNames.length > 0 ? colors.primary : colors.textSecondary }]}>
                  {typingNames.length > 0
                    ? `${typingNames[0]} is typing...`
                    : memberCount ? `${memberCount} ta a'zo` : 'guruh'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      ),
      headerTitle: () => null,
      headerRight: () => (
        <View style={S.headerActions}>
          {chatType === 'private' && (
            <>
              <TouchableOpacity onPress={startVoiceCall} style={S.headerBtn}>
                <Ionicons name="call-outline" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={startVideoCall} style={S.headerBtn}>
                <Ionicons name="videocam-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => setSearchMode((v) => !v)} style={S.headerBtn}>
            <Ionicons name="search-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [chatName, chatType, colors, isChatMuted, lastSeen, memberCount, navigation, onlineStatus, route.params, startVoiceCall, startVideoCall, typingNames]);

  /* typing */
  const sendTyping = useCallback(() => {
    wsService.send('typing', { chat_id: chatId });
  }, [chatId]);

  /* P1: Playback Speed */
  const handleSetPlaybackSpeed = useCallback((msgId, speed) => {
    setPlaybackSpeeds((prev) => ({ ...prev, [msgId]: speed }));
  }, []);

  /* Scroll-to-original reply */
  const scrollToMessage = useCallback((msgId) => {
    if (!msgId) return;
    const idx = listItems.findIndex((i) => i.id === msgId);
    if (idx < 0) return;
    flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    clearTimeout(highlightTimerRef.current);
    setHighlightedMsgId(msgId);
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 1400);
  }, [listItems]);

  /* P1: Multi-Select */
  const toggleMessageSelection = useCallback((msgId) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const deleteSelectedMessages = useCallback(async () => {
    if (selectedMessages.size === 0) return;
    Alert.alert(
      'Xabarlarni o\'chirish',
      `${selectedMessages.size} ta xabar o'chirilsinmi?`,
      [
        {
          text: 'O\'chirish',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const msgId of selectedMessages) {
                await apiClient.delete(`/chats/${chatId}/messages/${msgId}`);
              }
              setMessages((prev) => prev.filter((m) => !selectedMessages.has(m.id)));
              setSelectedMessages(new Set());
              setMultiSelectMode(false);
            } catch {
              Alert.alert('Xato', 'Xabarlarni o\'chirib bo\'lmadi');
            }
          },
        },
        { text: 'Bekor', style: 'cancel' },
      ]
    );
  }, [chatId, selectedMessages]);

  const handleTextChange = useCallback((val) => { setText(val); sendTyping(); }, [sendTyping]);

  /* send / edit */
  const handleSend = useCallback(async (silent = false) => {
    if (editMsg) {
      const content = text.trim();
      if (!content) return;
      setSending(true);
      try {
        await apiClient.put(`/chats/${chatId}/messages/${editMsg.id}`, { content });
        setMessages((prev) => prev.map((m) => m.id === editMsg.id ? { ...m, content, is_edited: true } : m));
        setText(''); setEditMsg(null); setInputHeight(INPUT_MIN_HEIGHT);
        // Clear draft
        const draftKey = `${DRAFT_STORAGE_KEY}:${chatId}`;
        await AsyncStorage.removeItem(draftKey).catch(() => {});
      } catch { Alert.alert('Xato', 'Xabar tahrirlashda xatolik'); }
      finally { setSending(false); }
      return;
    }
    const content = text.trim();
    if (!content || sending) return;
    // optimistic UI
    const optimistic = {
      id: `pending-${Date.now()}`,
      content,
      sender_id: currentUser?.id,
      sender: currentUser,
      created_at: new Date().toISOString(),
      message_type: 'text',
      is_pending: true,
      reply_to_message_id: replyTo?.id ?? undefined,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText(''); setInputHeight(INPUT_MIN_HEIGHT); setReplyTo(null);
    scrollToBottom(true);
    setSending(true);
    try {
      const res = await apiClient.post(`/chats/${chatId}/messages`, { content, reply_to_id: replyTo?.id ?? undefined, silent });
      const created = res?.data;
      if (created?.id) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...created, is_pending: false } : m)));
      } else {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, is_pending: false } : m)));
      }
      // Clear draft
      const draftKey = `${DRAFT_STORAGE_KEY}:${chatId}`;
      await AsyncStorage.removeItem(draftKey).catch(() => {});
      // Keep UI responsive even if this refresh fails for a moment.
      loadMessages(true).catch(() => {});
    } catch (e) {
      console.error('send', e);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
    finally { setSending(false); }
  }, [chatId, editMsg, loadMessages, replyTo, scrollToBottom, sending, text]);

  const handleSendSilent = useCallback(() => handleSend(true), [handleSend]);

  /* context menu handlers */
  const openContextMenu = useCallback((msg) => {
    triggerHaptic('Medium');
    setContextMenu({ visible: true, message: msg });
  }, []);

  const handleCopy = useCallback(() => {
    if (contextMenu.message?.content) ExpoClipboard.setStringAsync(contextMenu.message.content).catch(() => {});
  }, [contextMenu.message]);

  const handleReply = useCallback(() => setReplyTo(contextMenu.message), [contextMenu.message]);

  const handleEditStart = useCallback(() => {
    const msg = contextMenu.message;
    if (msg?.content) { setEditMsg(msg); setText(msg.content); }
  }, [contextMenu.message]);

  const handleDelete = useCallback(() => {
    const msg = contextMenu.message;
    if (!msg) return;
    Alert.alert('Xabarni o\'chirish', 'Bu xabarni o\'chirmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: 'O\'chirish', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/chats/${chatId}/messages/${msg.id}`);
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        } catch { Alert.alert('Xato', 'Xabar o\'chirilmadi'); }
      }},
    ]);
  }, [chatId, contextMenu.message]);

  const handleForward = useCallback(async () => {
    setForwardMsg(contextMenu.message);
    try { const r = await apiClient.get('/chats'); setChatList(r.data ?? []); }
    catch { setChatList([]); }
    setForwardVisible(true);
  }, [contextMenu.message]);

  const handleForwardTo = useCallback(async (targetId) => {
    if (!forwardMsg) return;
    try {
      await apiClient.post('/messages/forward', { message_ids: [forwardMsg.id], to_chat_id: targetId });
      Alert.alert('Muvaffaqiyat', 'Xabar yuborildi');
    } catch { Alert.alert('Xato', 'Xabar yuborilmadi'); }
  }, [forwardMsg]);

  const handleCreatePoll = useCallback(async () => {
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q) { Alert.alert('Xato', 'Savol kiriting'); return; }
    if (opts.length < 2) { Alert.alert('Xato', 'Kamida 2 variant kerak'); return; }
    try {
      await apiClient.post('/polls', { question: q, options: opts, is_anonymous: pollAnon, is_multiple: pollMultiple, chat_id: chatId });
      setShowPollModal(false);
      setPollQuestion(''); setPollOptions(['', '']);
      await loadMessages(true); scrollToBottom(true);
    } catch { Alert.alert('Xato', 'So\'rovnoma yaratilmadi'); }
  }, [chatId, loadMessages, pollAnon, pollMultiple, pollOptions, pollQuestion, scrollToBottom]);

  const handleSaveMsg = useCallback(async () => {
    const msg = contextMenu.message;
    if (!msg) return;
    try {
      await apiClient.post(`/chats/${chatId}/messages/${msg.id}/save`);
      Alert.alert('Saqlandi', 'Saqlangan xabarlarga qo\'shildi');
    } catch { Alert.alert('Xato', 'Saqlashda xatolik'); }
  }, [chatId, contextMenu.message]);

  const handleContextMediaDownload = useCallback(() => {
    if (!contextMenu.message) return;
    handleDownloadMedia(contextMenu.message);
  }, [contextMenu.message, handleDownloadMedia]);

  const handleContextMediaDeleteLocal = useCallback(() => {
    if (!contextMenu.message) return;
    handleDeleteDownloadedMedia(contextMenu.message);
  }, [contextMenu.message, handleDeleteDownloadedMedia]);

  const handleContextMediaSaveGallery = useCallback(() => {
    if (!contextMenu.message) return;
    handleSaveMediaToGallery(contextMenu.message);
  }, [contextMenu.message, handleSaveMediaToGallery]);

  const handlePin = useCallback(async () => {
    const msg = contextMenu.message;
    if (!msg) return;
    try {
      if (pinnedMessage?.id === msg.id) {
        await apiClient.delete(`/chats/${chatId}/messages/${msg.id}/pin`);
        setPinnedMessage(null);
      } else {
        await apiClient.post(`/chats/${chatId}/messages/${msg.id}/pin`, {});
        setPinnedMessage(msg);
      }
    } catch { Alert.alert('Xato', 'Xabar mahkamlanmadi'); }
  }, [chatId, contextMenu.message, pinnedMessage]);

  const handleReact = useCallback(async (emoji) => {
    const msg = contextMenu.message;
    if (!msg || !emoji) return;
    try {
      await apiClient.post(`/chats/${chatId}/messages/${msg.id}/reactions`, { emoji });
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msg.id) return m;
        const existing = m.reactions || [];
        if (existing.find((r) => r.emoji === emoji && r.user_id === currentUser?.id)) return m;
        return { ...m, reactions: [...existing, { emoji, user_id: currentUser?.id }] };
      }));
    } catch {}
  }, [chatId, contextMenu.message, currentUser?.id]);

  const handleReactToMsg = useCallback(async (msgId, emoji) => {
    try {
      await apiClient.post(`/chats/${chatId}/messages/${msgId}/reactions`, { emoji });
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const existing = m.reactions || [];
        if (existing.find((r) => r.emoji === emoji && r.user_id === currentUser?.id)) return m;
        return { ...m, reactions: [...existing, { emoji, user_id: currentUser?.id }] };
      }));
    } catch {}
  }, [chatId, currentUser?.id]);

  /* attachment handlers */
  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Ruxsat kerak', 'Galereya ruxsatini bering'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fd = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(asset.uri)).blob();
      fd.append('file', new File([blob], asset.fileName ?? 'photo.jpg', { type: asset.type || 'image/jpeg' }));
    } else {
      fd.append('file', { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.type || 'image/jpeg' });
    }
    if (replyTo?.id) fd.append('reply_to_id', String(replyTo.id));
    setSending(true);
    try {
      await apiClient.post(`/chats/${chatId}/messages/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReplyTo(null); await loadMessages(true); scrollToBottom(true);
    } catch { Alert.alert('Xato', 'Rasm yuborilmadi'); }
    finally { setSending(false); }
  }, [chatId, loadMessages, replyTo, scrollToBottom]);

  const handlePickCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Ruxsat kerak', 'Kamera ruxsatini bering'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fd = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(asset.uri)).blob();
      fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    } else {
      fd.append('file', { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' });
    }
    if (replyTo?.id) fd.append('reply_to_id', String(replyTo.id));
    setSending(true);
    try {
      await apiClient.post(`/chats/${chatId}/messages/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReplyTo(null); await loadMessages(true); scrollToBottom(true);
    } catch { Alert.alert('Xato', 'Rasm yuborilmadi'); }
    finally { setSending(false); }
  }, [chatId, loadMessages, replyTo, scrollToBottom]);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const resolvedMime = (asset.mimeType && asset.mimeType !== 'application/octet-stream')
        ? asset.mimeType
        : inferMimeTypeFromName(asset.name);
      const fd = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        fd.append('file', new File([blob], asset.name, { type: resolvedMime }));
      } else {
        fd.append('file', { uri: asset.uri, name: asset.name, type: resolvedMime });
      }
      if (replyTo?.id) fd.append('reply_to_id', String(replyTo.id));
      setSending(true);
      await apiClient.post(`/chats/${chatId}/messages/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReplyTo(null); await loadMessages(true); scrollToBottom(true);
    } catch { Alert.alert('Xato', 'Fayl yuborilmadi'); }
    finally { setSending(false); }
  }, [chatId, loadMessages, replyTo, scrollToBottom]);

  const handleSendLocation = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Use browser Geolocation API on web
      if (!navigator.geolocation) { Alert.alert('Xato', 'Joylashuv brauzer tomonidan qo\'llab-quvvatlanmaydi'); return; }
      setSending(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await apiClient.post(`/chats/${chatId}/messages/location`, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              location_title: 'Joylashuvim',
              ...(replyTo?.id ? { reply_to_id: String(replyTo.id) } : {}),
            });
            setReplyTo(null); await loadMessages(true); scrollToBottom(true);
          } catch { Alert.alert('Xato', 'Joylashuv yuborilmadi'); }
          finally { setSending(false); }
        },
        () => { setSending(false); Alert.alert('Xato', 'Joylashuvni aniqlab bo\'lmadi'); },
      );
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Ruxsat kerak', 'Joylashuv ruxsatini bering'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setSending(true);
      try {
        await apiClient.post(`/chats/${chatId}/messages/location`, {
          latitude: lat,
          longitude: lng,
          location_title: 'Joylashuvim',
          ...(replyTo?.id ? { reply_to_id: String(replyTo.id) } : {}),
        });
        setReplyTo(null); await loadMessages(true); scrollToBottom(true);
      } catch { Alert.alert('Xato', 'Joylashuv yuborilmadi'); }
      finally { setSending(false); }
    } catch { Alert.alert('Xato', 'Joylashuvni aniqlab bo\'lmadi'); }
  }, [chatId, loadMessages, replyTo, scrollToBottom]);

  /* video/voice recording */
  const clearRecordTimer = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
  }, []);

  const stopPulse = useCallback(() => { pulseValue.stopAnimation(); pulseValue.setValue(0); }, [pulseValue]);

  const resetVideoUi = useCallback(() => {
    clearRecordTimer(); stopPulse();
    setIsVideoRecording(false); setIsVideoLocked(false); setIsVideoCancelling(false);
    setVideoDuration(0); setVideoDrag({ x: 0, y: 0 });
    recordDurationRef.current = 0;
    recordSessionRef.current = { active: false, cancelled: false, locked: false, stopping: false, started: false };
  }, [clearRecordTimer, stopPulse]);

  const uploadVideoNote = useCallback(async (uri, dur) => {
    if (!uri) return;
    const fd = new FormData();
    fd.append('video', { uri, name: `vn-${Date.now()}.mp4`, type: 'video/mp4' });
    fd.append('duration', String(dur)); fd.append('shape', 'round');
    try { await apiClient.post(`/chats/${chatId}/messages/video-note`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); await loadMessages(true); scrollToBottom(true); }
    catch { Alert.alert('Video note', 'Yuborishda xatolik.'); }
  }, [chatId, loadMessages, scrollToBottom]);

  const finalizeVideo = useCallback(async (cancelled = false) => {
    const s = recordSessionRef.current;
    if (!s.active || s.stopping) return;
    recordSessionRef.current = { ...s, cancelled, stopping: true };

    if (Platform.OS === 'web') {
      const mr = webVideoRecorderRef.current;
      const stream = webVideoStreamRef.current;
      const dur = recordDurationRef.current;
      clearRecordTimer();
      stream?.getTracks().forEach((t) => t.stop());
      webVideoStreamRef.current = null;
      if (webVideoPreviewRef.current) webVideoPreviewRef.current.srcObject = null;
      if (!mr || cancelled) {
        webVideoRecorderRef.current = null; webVideoChunksRef.current = [];
        resetVideoUi(); return;
      }
      await new Promise((resolve) => { mr.onstop = resolve; mr.stop(); });
      const chunks = webVideoChunksRef.current;
      webVideoRecorderRef.current = null; webVideoChunksRef.current = [];
      resetVideoUi();
      if (!chunks.length) return;
      const mimeType = chunks[0]?.type || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const fd = new FormData();
      fd.append('video', new File([blob], `vn-${Date.now()}.webm`, { type: mimeType }));
      fd.append('duration', String(dur)); fd.append('shape', 'round');
      try {
        await apiClient.post(`/chats/${chatId}/messages/video-note`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        await loadMessages(true); scrollToBottom(true);
      } catch { Alert.alert('Video note', 'Yuborishda xatolik.'); }
      return;
    }

    try { cameraRef.current?.stopRecording?.(); } catch { resetVideoUi(); }
  }, [chatId, clearRecordTimer, loadMessages, resetVideoUi, scrollToBottom]);

  const handleContentSizeChange = useCallback((e) => {
    const h = clamp(Math.ceil(e.nativeEvent.contentSize.height), INPUT_MIN_HEIGHT, INPUT_MAX_HEIGHT);
    if (h !== inputHeight) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setInputHeight(h); }
  }, [inputHeight]);

  useEffect(() => {
    if (!isVideoRecording) { stopPulse(); return; }
    pulseValue.setValue(0);
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulseValue, { toValue: 1, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseValue, { toValue: 0, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]));
    anim.start();
    return () => { anim.stop(); stopPulse(); };
  }, [isVideoRecording, pulseValue, stopPulse]);

  useEffect(() => {
    if (!isVideoRecording || !recordSessionRef.current.active || recordSessionRef.current.started) return;
    const t = setTimeout(async () => {
      if (!cameraRef.current?.recordAsync || !recordSessionRef.current.active) return;
      recordSessionRef.current = { ...recordSessionRef.current, started: true };
      durationTimerRef.current = setInterval(() => {
        recordDurationRef.current += 1;
        setVideoDuration(recordDurationRef.current);
        if (recordDurationRef.current >= VIDEO_NOTE_MAX_DURATION) finalizeVideo(false);
      }, 1000);
      try {
        const result = await cameraRef.current.recordAsync({ maxDuration: VIDEO_NOTE_MAX_DURATION });
        const sess = recordSessionRef.current;
        const dur = recordDurationRef.current;
        if (cameraFlipPendingRef.current) { cameraFlipPendingRef.current = false; resetVideoUi(); setTimeout(() => startVideoRecording(), 300); }
        else { resetVideoUi(); if (!sess.cancelled && result?.uri) await uploadVideoNote(result.uri, dur); }
      } catch { resetVideoUi(); }
    }, Platform.OS === 'ios' ? 80 : 140);
    return () => clearTimeout(t);
  }, [finalizeVideo, isVideoRecording, resetVideoUi, uploadVideoNote]);

  // Attach web video stream to preview element once HUD mounts
  useEffect(() => {
    if (Platform.OS !== 'web' || !isVideoRecording) return;
    const el = webVideoPreviewRef.current;
    const stream = webVideoStreamRef.current;
    if (el && stream) { el.srcObject = stream; el.play().catch(() => {}); }
  }, [isVideoRecording]);

  const resetVoiceUi = useCallback(() => {
    if (voiceDurationTimerRef.current) { clearInterval(voiceDurationTimerRef.current); voiceDurationTimerRef.current = null; }
    isVoiceActiveRef.current = false; isVoiceLockedRef.current = false;
    setIsVoiceRecording(false); setIsVoiceLocked(false); setIsVoiceCancelling(false);
    setVoiceDuration(0); setVoiceDrag({ x: 0, y: 0 });
  }, []);

  const uploadVoice = useCallback(async (uri, dur) => {
    if (!uri) return;
    const fd = new FormData();
    fd.append('voice', { uri, name: `voice-${Date.now()}.m4a`, type: 'audio/m4a' });
    fd.append('duration', String(dur));
    try { await apiClient.post(`/chats/${chatId}/messages/voice`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); await loadMessages(true); scrollToBottom(true); }
    catch { Alert.alert('Ovozli xabar', 'Yuborishda xatolik.'); }
  }, [chatId, loadMessages, scrollToBottom]);

  const startVoiceRecording = useCallback(async () => {
    if (isVoiceActiveRef.current) return;

    // Web: use MediaRecorder API
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webMediaStreamRef.current = stream;
        webMediaChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        const mr = new MediaRecorder(stream, { mimeType });
        webMediaRecorderRef.current = mr;
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) webMediaChunksRef.current.push(e.data); };
        mr.start(100);
        isVoiceActiveRef.current = true; isVoiceLockedRef.current = false; voiceDurationRef.current = 0;
        setIsVoiceRecording(true); setIsVoiceLocked(false); setIsVoiceCancelling(false); setVoiceDuration(0); setVoiceDrag({ x: 0, y: 0 });
        voiceDurationTimerRef.current = setInterval(() => { voiceDurationRef.current += 1; setVoiceDuration(voiceDurationRef.current); }, 1000);
      } catch {
        resetVoiceUi();
        Alert.alert('Ruxsat kerak', 'Mikrofon ruxsatini bering');
      }
      return;
    }

    // Native: use expo-av
    try {
      const p = await Audio.requestPermissionsAsync();
      if (p.status !== 'granted') { Alert.alert('Ruxsat kerak', 'Mikrofon ruxsatini bering'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      audioRecordingRef.current = recording;
      isVoiceActiveRef.current = true; isVoiceLockedRef.current = false; voiceDurationRef.current = 0;
      setIsVoiceRecording(true); setIsVoiceLocked(false); setIsVoiceCancelling(false); setVoiceDuration(0); setVoiceDrag({ x: 0, y: 0 });
      voiceDurationTimerRef.current = setInterval(() => { voiceDurationRef.current += 1; setVoiceDuration(voiceDurationRef.current); }, 1000);
    } catch (e) { console.warn('startVoiceRecording error:', e); resetVoiceUi(); Alert.alert('Mikrofon', 'Ovozli xabar yozishda xatolik. Ruxsatlarni tekshiring.'); }
  }, [resetVoiceUi]);

  const finalizeVoice = useCallback(async (cancelled = false) => {
    if (!isVoiceActiveRef.current) return;

    // Web: stop MediaRecorder and upload blob
    if (Platform.OS === 'web') {
      const mr = webMediaRecorderRef.current;
      const stream = webMediaStreamRef.current;
      const dur = voiceDurationRef.current;
      resetVoiceUi();
      stream?.getTracks().forEach((t) => t.stop());
      webMediaStreamRef.current = null;
      if (!mr || cancelled) { webMediaRecorderRef.current = null; webMediaChunksRef.current = []; return; }
      await new Promise((resolve) => { mr.onstop = resolve; mr.stop(); });
      const chunks = webMediaChunksRef.current;
      webMediaRecorderRef.current = null;
      webMediaChunksRef.current = [];
      if (!chunks.length) return;
      const mimeType = chunks[0]?.type || 'audio/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const fd = new FormData();
      fd.append('voice', new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType }));
      fd.append('duration', String(dur));
      try {
        await apiClient.post(`/chats/${chatId}/messages/voice`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        await loadMessages(true); scrollToBottom(true);
      } catch { Alert.alert('Ovozli xabar', 'Yuborishda xatolik.'); }
      return;
    }

    // Native
    const rec = audioRecordingRef.current;
    const dur = voiceDurationRef.current;
    resetVoiceUi(); audioRecordingRef.current = null;
    if (!rec) return;
    try { await rec.stopAndUnloadAsync(); if (!cancelled) await uploadVoice(rec.getURI(), dur); }
    catch { console.error('finalize voice'); }
  }, [chatId, loadMessages, resetVoiceUi, scrollToBottom, uploadVoice]);

  const startVideoRecording = useCallback(async () => {
    if (recordSessionRef.current.active) return;

    // Web: use MediaRecorder API
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
          audio: true,
        });
        webVideoStreamRef.current = stream;
        webVideoChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        webVideoRecorderRef.current = mr;
        mr.ondataavailable = (e) => { if (e.data?.size > 0) webVideoChunksRef.current.push(e.data); };
        mr.start(100);
        recordSessionRef.current = { active: true, cancelled: false, locked: false, stopping: false, started: true };
        setIsVideoRecording(true); setIsVideoLocked(false); setIsVideoCancelling(false);
        setVideoDuration(0); setVideoDrag({ x: 0, y: 0 }); recordDurationRef.current = 0;
        durationTimerRef.current = setInterval(() => {
          recordDurationRef.current += 1;
          setVideoDuration(recordDurationRef.current);
          if (recordDurationRef.current >= VIDEO_NOTE_MAX_DURATION) finalizeVideo(false);
        }, 1000);
      } catch {
        Alert.alert('Ruxsat kerak', 'Kamera va mikrofon ruxsatini bering');
      }
      return;
    }

    // Native
    let camOk = cameraPermission?.granted;
    if (!camOk) { const p = await requestCameraPermission(); camOk = p?.granted; }
    if (!camOk) { Alert.alert('Ruxsat kerak', 'Kamera ruxsatini bering'); return; }
    let micOk = micPermission?.granted;
    if (!micOk) { const p = await requestMicPermission(); micOk = p?.granted; }
    if (!micOk) { Alert.alert('Ruxsat kerak', 'Mikrofon ruxsatini bering'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false });
    recordSessionRef.current = { active: true, cancelled: false, locked: false, stopping: false, started: false };
    setIsVideoRecording(true); setIsVideoLocked(false); setIsVideoCancelling(false);
    setVideoDuration(0); setVideoDrag({ x: 0, y: 0 }); recordDurationRef.current = 0;
  }, [cameraPermission?.granted, finalizeVideo, micPermission?.granted, requestCameraPermission, requestMicPermission]);

  const flipCamera = useCallback(() => {
    if (recordSessionRef.current.active && recordSessionRef.current.started) {
      cameraFlipPendingRef.current = true;
      recordSessionRef.current = { ...recordSessionRef.current, cancelled: false, stopping: true };
      try { cameraRef.current?.stopRecording?.(); } catch {}
    }
    setCameraFacing((f) => (f === 'front' ? 'back' : 'front'));
  }, []);

  /* pan responder */
  const mediaResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !text.trim(),
    onMoveShouldSetPanResponder: () => !text.trim(),
    onPanResponderGrant: () => {
      isPressRecordingRef.current = false;
      // On web, getUserMedia must be triggered within the user-gesture context.
      // Pre-warm the permission here (before the 250ms setTimeout) so Chrome
      // doesn't block it as a non-user-gesture call.
      if (Platform.OS === 'web') {
        const constraints = inputMode === 'video' ? { video: true, audio: true } : { audio: true };
        navigator.mediaDevices?.getUserMedia(constraints)
          .then((s) => s.getTracks().forEach((t) => t.stop()))
          .catch(() => {});
      }
      pressTimerRef.current = setTimeout(() => {
        isPressRecordingRef.current = true;
        if (inputMode === 'video') startVideoRecording(); else startVoiceRecording();
      }, 250);
    },
    onPanResponderMove: (_e, gs) => {
      if (!isPressRecordingRef.current) return;
      if (inputMode === 'video') {
        if (!recordSessionRef.current.active) return;
        setVideoDrag({ x: gs.dx, y: gs.dy });
        if (!recordSessionRef.current.locked && gs.dy <= LOCK_THRESHOLD) { recordSessionRef.current = { ...recordSessionRef.current, locked: true }; setIsVideoLocked(true); }
        setIsVideoCancelling(gs.dx <= CANCEL_THRESHOLD);
      } else {
        if (!isVoiceActiveRef.current) return;
        setVoiceDrag({ x: gs.dx, y: gs.dy });
        if (!isVoiceLockedRef.current && gs.dy <= LOCK_THRESHOLD) { isVoiceLockedRef.current = true; setIsVoiceLocked(true); }
        setIsVoiceCancelling(gs.dx <= CANCEL_THRESHOLD);
      }
    },
    onPanResponderRelease: (_e, gs) => {
      if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
      if (!isPressRecordingRef.current) { setInputMode((m) => m === 'voice' ? 'video' : 'voice'); return; }
      if (inputMode === 'video') {
        setVideoDrag({ x: 0, y: 0 });
        if (gs.dx <= CANCEL_THRESHOLD || isVideoCancelling) { finalizeVideo(true); return; }
        if (recordSessionRef.current.locked || gs.dy <= LOCK_THRESHOLD) { recordSessionRef.current = { ...recordSessionRef.current, locked: true }; setIsVideoLocked(true); return; }
        finalizeVideo(false);
      } else {
        setVoiceDrag({ x: 0, y: 0 });
        if (gs.dx <= CANCEL_THRESHOLD || isVoiceCancelling) { finalizeVoice(true); return; }
        if (isVoiceLockedRef.current || gs.dy <= LOCK_THRESHOLD) { isVoiceLockedRef.current = true; setIsVoiceLocked(true); return; }
        finalizeVoice(false);
      }
    },
    onPanResponderTerminate: () => {
      if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
      if (inputMode === 'video' && recordSessionRef.current.active && !recordSessionRef.current.locked) finalizeVideo(false);
      else if (inputMode === 'voice' && isVoiceActiveRef.current && !isVoiceLockedRef.current) finalizeVoice(false);
    },
  }), [finalizeVideo, finalizeVoice, inputMode, isVideoCancelling, isVoiceCancelling, startVideoRecording, startVoiceRecording, text]);

  /* derived data */
  const filteredMessages = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.content || '').toLowerCase().includes(q) || (m.file_name || '').toLowerCase().includes(q) || (m.sender?.display_name || '').toLowerCase().includes(q));
  }, [messages, searchText]);

  const listItems = useMemo(() => buildSections(filteredMessages), [filteredMessages]);

  const handleRefresh = useCallback(() => { setRefreshing(true); loadMessages(true); }, [loadMessages]);

  const handlePlaybackUpdate = useCallback((msgId, status) => {
    if (!status?.isLoaded || !status.durationMillis) return;
    setPlaybackProgress((cur) => ({ ...cur, [msgId]: status.didJustFinish ? 0 : status.positionMillis / status.durationMillis }));
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const next = new Set(viewableItems.filter(({ isViewable, item }) => isViewable && item.type === 'message' && item.message_type === 'video_note').map(({ item }) => item.id));
    setVisibleVideoNotes(next);
  }).current;

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'separator') {
      return (
        <View style={S.sepWrap}>
          <View style={S.sepBadge}>
            <Text style={S.sepText}>{item.label}</Text>
          </View>
        </View>
      );
    }
    const senderId = item.sender?.id || item.sender_id;
    const isOwn = Boolean(currentUser?.id && senderId && currentUser.id === senderId);
    const replyToMessage = item.reply_to_message_id ? messages.find((m) => m.id === item.reply_to_message_id) : null;

    // Message grouping: consecutive messages from same sender within 2 min
    const prevItem = listItems[index - 1]; // older message (rendered above on screen)
    const nextItem = listItems[index + 1]; // newer message (rendered below on screen)
    const isSameSender = (other) => {
      if (!other || other.type !== 'message') return false;
      const othId = other.sender?.id || other.sender_id;
      if (othId !== senderId) return false;
      return Math.abs(new Date(item.created_at) - new Date(other.created_at)) < 2 * 60 * 1000;
    };
    const isFirstInGroup = !isSameSender(prevItem); // top of group → show sender name
    const isLastInGroup = !isSameSender(nextItem);  // bottom of group → show tail

    return (
      <SwipeToReply onReply={() => { setReplyTo(item); triggerHaptic('Light'); }} colors={colors}>
        <View style={[
          multiSelectMode ? { flexDirection: 'row', alignItems: 'center', gap: 8 } : {},
          highlightedMsgId === item.id && { backgroundColor: colors.primary + '22' },
        ]}>
          {multiSelectMode && (
            <Pressable onPress={() => toggleMessageSelection(item.id)} 
              style={[S.checkbox, { borderColor: colors.border, backgroundColor: selectedMessages.has(item.id) ? colors.primary : 'transparent' }]}>
              {selectedMessages.has(item.id) && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          )}
          <View style={multiSelectMode ? { flex: 1 } : {}}>
            <MessageBubble
              item={item} isOwn={isOwn} isDark={isDark} colors={colors} chatType={chatType}
              isVisibleVideoNote={visibleVideoNotes.has(item.id)}
              playbackProgress={playbackProgress[item.id] || 0}
              playbackSpeed={playbackSpeeds[item.id] || 1}
              onSetPlaybackSpeed={(speed) => handleSetPlaybackSpeed(item.id, speed)}
              onPlaybackStatusUpdate={handlePlaybackUpdate}
              onOpenVideoNote={setFullscreenVideoNote}
              onLongPress={() => !multiSelectMode && openContextMenu(item)}
              replyToMessage={replyToMessage}
              searchText={searchText}
              onReact={(emoji) => handleReactToMsg(item.id, emoji)}
              onSenderPress={(sender) => sender?.id && navigation.navigate('ChatInfo', { otherUserId: sender.id, chatType: 'private', chatName: sender.display_name })}
              onDownloadMedia={handleDownloadMedia}
              onDeleteDownloadedMedia={handleDeleteDownloadedMedia}
              onSaveToGallery={handleSaveMediaToGallery}
              mediaLocalUri={getLocalMediaUri(item)}
              mediaDownloading={Boolean(mediaDownloadingMap[getMediaCacheKey(item)])}
              mediaProgress={mediaProgressMap[getMediaCacheKey(item)] || null}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              readReceiptCount={chatType === 'group' ? (item.read_by_count || 0) : 0}
              onScrollToReply={replyToMessage ? () => scrollToMessage(replyToMessage.id) : undefined}
            />
          </View>
        </View>
      </SwipeToReply>
    );
  }, [chatType, colors, currentUser?.id, getLocalMediaUri, getMediaCacheKey, handleDeleteDownloadedMedia, handleDownloadMedia, handlePlaybackUpdate, handleReactToMsg, handleSaveMediaToGallery, highlightedMsgId, isDark, listItems, mediaDownloadingMap, mediaProgressMap, messages, navigation, openContextMenu, playbackProgress, scrollToMessage, searchText, setReplyTo, visibleVideoNotes]);

  const inputShellH = Math.max(48, inputHeight + 22);
  const botPad = Math.max(10, insets.bottom);
  const pulseScale = pulseValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulseValue.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] });
  const isRec = isVideoRecording || isVoiceRecording;
  const isOwnCtx = contextMenu.message?.sender?.id === currentUser?.id || contextMenu.message?.sender_id === currentUser?.id;
  const videoCancelPull = clamp(Math.abs(Math.min(videoDrag.x, 0)) / Math.abs(CANCEL_THRESHOLD), 0, 1);
  const videoLockPull = clamp(Math.abs(Math.min(videoDrag.y, 0)) / Math.abs(LOCK_THRESHOLD), 0, 1);

  return (
    <SafeAreaView style={[S.root, { backgroundColor: colors.chatBackground || colors.background }]} edges={['top', 'left', 'right']}>
      {/* On Android, windowSoftInputMode=adjustResize already resizes the window.
          Using behavior="padding" avoids double-adjustment that collapses the FlatList. */}
      <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} enabled={Platform.OS !== 'web'}>
        <View style={S.root}>

          {/* Pinned message banner */}
          {pinnedMessage && (
            <TouchableOpacity
              style={[S.pinnedBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
              onPress={() => {/* scroll to message */}}
              activeOpacity={0.85}
            >
              <View style={[S.pinnedAccent, { backgroundColor: colors.primary }]} />
              <View style={S.pinnedBody}>
                <Text style={[S.pinnedLabel, { color: colors.primary }]}>Mahkamlangan xabar</Text>
                <Text style={[S.pinnedText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {pinnedMessage.content ?? 'Media'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPinnedMessage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* Search bar */}
          {searchMode && (
            <View style={[S.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput style={[S.searchInput, { color: colors.text }]} value={searchText} onChangeText={setSearchText}
                placeholder="Xabarlarni qidirish" placeholderTextColor={colors.textSecondary} autoFocus />
              <TouchableOpacity onPress={() => { setSearchMode(false); setSearchText(''); }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Messages */}
          {multiSelectMode && (
            <View style={[S.multiSelectBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setMultiSelectMode(false)} style={S.multiSelectClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
              <Text style={[S.multiSelectCount, { color: colors.text }]}>{selectedMessages.size} tanlandi</Text>
              <Pressable 
                onPress={() => deleteSelectedMessages()} 
                style={[S.multiSelectDelete, { backgroundColor: colors.primary }]}
                disabled={selectedMessages.size === 0}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
              </Pressable>
            </View>
          )}
          {loading ? (
            <View style={S.loader}><ActivityIndicator color={colors.primary} size="large" /></View>
          ) : (
            <FlatList ref={flatListRef} data={listItems} keyExtractor={(i) => String(i.id)} renderItem={renderItem}
              contentContainerStyle={S.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={viewabilityConfig}
              initialNumToRender={20} maxToRenderPerBatch={10} windowSize={11}
              ListEmptyComponent={searchMode ? (
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                  <Ionicons name="search-outline" size={44} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 15 }}>Hech narsa topilmadi</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={56} color={colors.border} />
                  <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 15, textAlign: 'center' }}>
                    Xabarlar hali yo'q.{'\n'}Birinchi xabar yuboring!
                  </Text>
                </View>
              )}
              onScroll={(e) => {
                const offset = e.nativeEvent.contentOffset.y;
                setShowScrollBtn(offset > 200);
              }}
              scrollEventThrottle={100}
              onScrollToIndexFailed={(info) => {
                // Prevent crash when scrollToIndex targets an index not yet rendered
                const wait = new Promise((resolve) => setTimeout(resolve, 200));
                wait.then(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                });
              }}
            />
          )}

          {/* Typing indicator */}
          <TypingIndicator names={typingNames} colors={colors} />

          {/* Jump-to-bottom FAB */}
          {showScrollBtn && (
            <TouchableOpacity
              style={[S.scrollFab, { backgroundColor: colors.surface, borderColor: colors.border, bottom: inputShellH + botPad + 12 }]}
              onPress={() => { scrollToBottom(true); setShowScrollBtn(false); setUnreadCount(0); }}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-down" size={22} color={colors.primary} />
              {unreadCount > 0 && (
                <View style={[S.scrollFabBadge, { backgroundColor: colors.primary }]}>
                  <Text style={S.scrollFabBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Video recording HUD */}
          {isVideoRecording && (
            <View style={[S.recHud, { bottom: inputShellH + botPad + 20 }]} pointerEvents="box-none">
              <View style={S.videoRecOverlay}>
                {!isVideoLocked && (
                  <View style={[S.videoCancelPill, {
                    backgroundColor: isVideoCancelling ? (colors.danger || '#FF3B30') : 'rgba(8,17,31,0.84)',
                    opacity: 0.72 + (videoCancelPull * 0.28),
                    transform: [{ translateX: Math.min(0, videoDrag.x * 0.18) }],
                  }]}>
                    <Ionicons name="arrow-back" size={14} color="#fff" />
                    <Text style={S.videoCancelText}>{isVideoCancelling ? 'Bekor qilinadi' : 'Bekor qilish uchun suring'}</Text>
                  </View>
                )}

                <View style={S.videoRecStageRow}>
                  {!isVideoLocked && (
                    <View style={[S.videoLockRail, {
                      backgroundColor: 'rgba(8,17,31,0.84)',
                      opacity: 0.55 + (videoLockPull * 0.45),
                    }]}>
                      <Ionicons name="lock-closed" size={12} color="#fff" style={{ opacity: 0.75 + (videoLockPull * 0.25) }} />
                      <View style={S.videoLockLine} />
                      <Ionicons name="chevron-up" size={13} color="#fff" style={{ opacity: 0.75 + (videoLockPull * 0.25) }} />
                    </View>
                  )}

                  <View style={S.recPreviewWrap}>
                    <Animated.View style={[S.recPulse, { backgroundColor: colors.primary, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                    <View style={[S.recShell, { borderColor: colors.primary, backgroundColor: '#08111F' }]}>
                      {Platform.OS === 'web' ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          ref={webVideoPreviewRef}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          muted
                          playsInline
                          autoPlay
                        />
                      ) : (
                        <CameraView ref={cameraRef} style={S.recPreview} facing={cameraFacing} mode="video" mute={false} />
                      )}
                    </View>
                    <TouchableOpacity style={S.flipBtn} onPress={flipCamera} activeOpacity={0.86}>
                      <Ionicons name="camera-reverse-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[S.videoTimerPill, { backgroundColor: 'rgba(8,17,31,0.88)' }]}>
                  <View style={[S.recDot, { backgroundColor: isVideoCancelling ? (colors.danger || '#FF3B30') : '#FF4D4F' }]} />
                  <Text style={S.videoTimerText}>{formatDuration(videoDuration)}</Text>
                  {isVideoLocked ? (
                    <View style={[S.videoLockedPill, { backgroundColor: colors.primary + '22' }]}>
                      <Ionicons name="lock-closed" size={11} color={colors.primary} />
                      <Text style={[S.videoLockedText, { color: colors.primary }]}>Qulflangan</Text>
                    </View>
                  ) : null}
                </View>

                {isVideoLocked && (
                  <View style={S.recActions}>
                    <TouchableOpacity style={[S.recActionBtn, { backgroundColor: colors.danger }]} onPress={() => finalizeVideo(true)} activeOpacity={0.86}>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.recActionBtn, { backgroundColor: colors.primary }]} onPress={() => finalizeVideo(false)} activeOpacity={0.86}>
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Voice recording HUD */}
          {isVoiceRecording && (
            <View style={[S.recHud, { bottom: inputShellH + botPad + 20 }]} pointerEvents="box-none">
              <View style={[S.recCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={S.recPreviewWrap}>
                  <Animated.View style={[S.recPulse, { backgroundColor: colors.primary, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
                  <View style={[S.recShell, { borderColor: colors.primary, backgroundColor: colors.primary }]}>
                    <Ionicons name="mic" size={34} color="#fff" />
                  </View>
                </View>
                <View style={S.recBody}>
                  <View style={S.recTimerRow}>
                    <View style={[S.recDot, { backgroundColor: isVoiceCancelling ? colors.danger : colors.primary }]} />
                    <Text style={[S.recTimer, { color: colors.text }]}>{formatDuration(voiceDuration)}</Text>
                    {isVoiceLocked && <Ionicons name="lock-closed" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
                  </View>
                  <View style={S.recActions}>
                    <TouchableOpacity style={[S.recActionBtn, { backgroundColor: colors.danger }]} onPress={() => finalizeVoice(true)}>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.recActionBtn, { backgroundColor: colors.primary }]} onPress={() => finalizeVoice(false)}>
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Reply bar */}
          {replyTo && (
            <View style={[S.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[S.replyAccent, { backgroundColor: colors.primary }]} />
              <View style={S.replyContent}>
                <Text style={[S.replyName, { color: colors.primary }]} numberOfLines={1}>{replyTo.sender?.display_name ?? 'Foydalanuvchi'}</Text>
                <Text style={[S.replyText, { color: colors.textSecondary }]} numberOfLines={1}>{getMessagePreview(replyTo)}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} style={S.replyClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Edit bar */}
          {editMsg && (
            <View style={[S.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[S.replyAccent, { backgroundColor: colors.warning || '#FF9500' }]} />
              <View style={S.replyContent}>
                <Text style={[S.replyName, { color: colors.warning || '#FF9500' }]}>Xabarni tahrirlash</Text>
                <Text style={[S.replyText, { color: colors.textSecondary }]} numberOfLines={1}>{editMsg.content}</Text>
              </View>
              <TouchableOpacity onPress={() => { setEditMsg(null); setText(''); }} style={S.replyClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input bar */}
          <View style={[S.inputBar, { backgroundColor: colors.headerBackground, borderTopColor: colors.divider ?? colors.border, paddingBottom: botPad }]}>
            {!isRec && (
              <TouchableOpacity style={[S.attachBtn, { backgroundColor: 'transparent' }]} onPress={() => setShowAttach(true)}>
                <Ionicons name="attach" size={24} color={colors.primary} />
              </TouchableOpacity>
            )}
            <View style={[S.inputShell, { backgroundColor: isDark ? colors.inputBackground : '#FFFFFF', minHeight: inputShellH, borderColor: colors.border }]}>
              <TextInput
                style={[S.textInput, { color: colors.text, height: inputHeight }]}
                value={text} onChangeText={handleTextChange}
                placeholder={editMsg ? 'Xabarni tahrirlash...' : 'Xabar...'}
                placeholderTextColor={colors.textHint}
                multiline textAlignVertical="top"
                onFocus={() => scrollToBottom(true)}
                onContentSizeChange={handleContentSizeChange}
              />
              {text.length > 3500 && (
                <Text style={{ fontSize: 11, color: text.length > 4050 ? colors.danger ?? '#FF3B30' : colors.textSecondary, marginRight: 6, alignSelf: 'center' }}>
                  {4096 - text.length}
                </Text>
              )}
            </View>
            {text.trim() ? (
              <TouchableOpacity
                style={[S.sendBtn, { backgroundColor: editMsg ? (colors.warning || '#FF9500') : colors.primary }]}
                onPress={() => handleSend(false)}
                onLongPress={() => {
                  triggerHaptic('Medium');
                  Alert.alert(
                    'Xabar yuborish',
                    '',
                    [
                      { text: 'Oddiy yuborish', onPress: () => handleSend(false) },
                      { text: '🔕 Ovozсiz yuborish', onPress: () => handleSend(true) },
                      { text: 'Bekor qilish', style: 'cancel' },
                    ],
                  );
                }}
                disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name={editMsg ? 'checkmark' : 'send'} size={18} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <View style={[S.sendBtn, { backgroundColor: isRec ? colors.danger : colors.primary }]} {...mediaResponder.panHandlers}>
                <Ionicons name={isRec ? 'radio-button-on' : inputMode === 'video' ? 'videocam' : 'mic'} size={18} color="#fff" />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen video note modal removed — video notes expand inline on tap */}

      {/* Context menu */}
      <ContextMenu
        visible={contextMenu.visible} message={contextMenu.message} isOwn={isOwnCtx}
        colors={colors} isDark={isDark}
        onClose={() => setContextMenu({ visible: false, message: null })}
        onReply={handleReply} onCopy={handleCopy} onEdit={handleEditStart}
        onDelete={handleDelete} onForward={handleForward} onSave={handleSaveMsg} onReact={handleReact}
        onPin={handlePin} pinnedMessageId={pinnedMessage?.id}
        onMediaDownload={handleContextMediaDownload}
        onMediaDeleteLocal={handleContextMediaDeleteLocal}
        onMediaSaveGallery={handleContextMediaSaveGallery}
        hasLocalMedia={Boolean(contextMenu.message && getLocalMediaUri(contextMenu.message))}
      />

      {/* Attach picker */}
      <AttachPicker visible={showAttach} onClose={() => setShowAttach(false)} colors={colors} isDark={isDark}
        onPickImage={handlePickImage} onPickCamera={handlePickCamera} onPickFile={handlePickFile}
        onPoll={() => { setShowAttach(false); setTimeout(() => setShowPollModal(true), 300); }}
        onScheduled={() => { setShowAttach(false); setTimeout(() => navigation.navigate('ScheduledMessages', { chatId, chatName }), 300); }}
        onLocation={() => { setShowAttach(false); setTimeout(() => handleSendLocation(), 300); }} />

      {/* Forward modal */}
      <ForwardModal visible={forwardVisible} onClose={() => setForwardVisible(false)} colors={colors} isDark={isDark}
        chats={chatList} onForwardTo={handleForwardTo} />

      {/* Poll creation modal */}
      <Modal visible={showPollModal} transparent animationType="slide" onRequestClose={() => setShowPollModal(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowPollModal(false)}>
          <Pressable style={[pollS.sheet, { backgroundColor: isDark ? '#1E2C3A' : '#fff' }]} onPress={() => {}}>
            <View style={[pollS.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#D0D0D0' }]} />
            <Text style={[pollS.title, { color: isDark ? '#fff' : '#000' }]}>So'rovnoma yaratish</Text>
            <TextInput style={[pollS.input, { color: isDark ? '#fff' : '#000', borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F5F5' }]}
              value={pollQuestion} onChangeText={setPollQuestion} placeholder="Savol kiriting..." placeholderTextColor={colors.textSecondary} />
            <Text style={[pollS.label, { color: colors.textSecondary }]}>Variantlar</Text>
            {pollOptions.map((opt, idx) => (
              <View key={idx} style={pollS.optRow}>
                <TextInput style={[pollS.optInput, { color: isDark ? '#fff' : '#000', borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F5F5', flex: 1 }]}
                  value={opt} onChangeText={(v) => setPollOptions((prev) => prev.map((o, i) => i === idx ? v : o))}
                  placeholder={`Variant ${idx + 1}`} placeholderTextColor={colors.textSecondary} />
                {pollOptions.length > 2 && (
                  <TouchableOpacity onPress={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))} style={{ padding: 6 }}>
                    <Ionicons name="close-circle" size={20} color={colors.danger || '#e53935'} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {pollOptions.length < 10 && (
              <TouchableOpacity onPress={() => setPollOptions((p) => [...p, ''])} style={pollS.addOptBtn}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[pollS.addOptText, { color: colors.primary }]}>Variant qo'shish</Text>
              </TouchableOpacity>
            )}
            <View style={pollS.switchRow}>
              <Text style={{ color: isDark ? '#fff' : '#000', flex: 1 }}>Anonim so'rovnoma</Text>
              <TouchableOpacity onPress={() => setPollAnon((v) => !v)} style={[pollS.toggle, { backgroundColor: pollAnon ? colors.primary : colors.border }]}>
                <Text style={{ color: '#fff', fontSize: 12 }}>{pollAnon ? 'Ha' : 'Yo\'q'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[pollS.switchRow, { marginTop: 4 }]}>
              <Text style={{ color: isDark ? '#fff' : '#000', flex: 1 }}>Ko'p javobli</Text>
              <TouchableOpacity onPress={() => setPollMultiple((v) => !v)} style={[pollS.toggle, { backgroundColor: pollMultiple ? colors.primary : colors.border }]}>
                <Text style={{ color: '#fff', fontSize: 12 }}>{pollMultiple ? 'Ha' : 'Yo\'q'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[pollS.sendBtn, { backgroundColor: colors.primary }]} onPress={handleCreatePoll}>
              <Text style={pollS.sendBtnText}>Yaratish</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 11.5, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 6 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 10, marginTop: 6, marginBottom: 6, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, minHeight: 42 },
  searchInput: { flex: 1, fontSize: 15 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  pinnedAccent: { width: 3, height: 36, borderRadius: 2 },
  pinnedBody: { flex: 1 },
  pinnedLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  pinnedText: { fontSize: 13 },
  scrollFab: {
    position: 'absolute',
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  scrollFabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollFabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  listContent: { paddingHorizontal: 10, paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' },
  sepWrap: { alignItems: 'center', marginVertical: 10 },
  sepBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.32)' },
  sepText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  msgRow: { marginBottom: 4, flexDirection: 'row' },
  msgOwn: { justifyContent: 'flex-end' },
  msgOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '77%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOwn: { borderBottomRightRadius: 6 },
  bubbleOther: { borderBottomLeftRadius: 6 },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msgText: { fontSize: 15.5, lineHeight: 21 },
  msgImg: { width: 220, height: 180, borderRadius: 14, marginBottom: 8, resizeMode: 'cover' },
  msgVideo: { width: 220, height: 180, borderRadius: 14, marginBottom: 8, backgroundColor: '#000' },
  mediaDownloadCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'flex-start', gap: 8 },
  mediaDownloadLabel: { fontSize: 13, fontWeight: '600' },
  mediaDownloadHint: { fontSize: 12, fontWeight: '600' },
  mediaProgressText: { fontSize: 11, marginBottom: 4 },
  mediaProgressTrack: { width: '100%', height: 4, borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  mediaProgressFill: { height: 4, borderRadius: 999 },
  stickerImg: { width: 120, height: 120, marginBottom: 4 },
  pollBubble: { marginBottom: 6 },
  pollQuestion: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  pollOption: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  pollOptionText: { flex: 1, fontSize: 13 },
  pollVoteCount: { fontSize: 11, marginLeft: 4 },
  fileBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 10, marginBottom: 8 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileSize: { fontSize: 11, marginTop: 2 },
  locationBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 10, marginBottom: 8 },
  locationMapPreview: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  locationTitle: { fontSize: 13, fontWeight: '600' },
  locationCoords: { fontSize: 11, marginTop: 2 },
  forwardedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  forwardedLabel: { fontSize: 11 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 5 },
  editedLabel: { fontSize: 11 },
  msgTime: { fontSize: 11 },
  videoNoteWrap: { alignItems: 'center' },
  videoNoteTap: { width: VIDEO_NOTE_RING_SIZE, height: VIDEO_NOTE_RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  videoNoteRing: { width: VIDEO_NOTE_RING_SIZE, height: VIDEO_NOTE_RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  videoNoteShell: { position: 'absolute', width: VIDEO_NOTE_SIZE, height: VIDEO_NOTE_SIZE, borderRadius: VIDEO_NOTE_SIZE / 2, overflow: 'hidden', borderWidth: 1.5, backgroundColor: '#08111F' },
  videoNoteVideo: { width: VIDEO_NOTE_SIZE, height: VIDEO_NOTE_SIZE },
  videoNotePlaceholder: { width: VIDEO_NOTE_SIZE, height: VIDEO_NOTE_SIZE, borderRadius: VIDEO_NOTE_SIZE / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 8 },
  vnOverBot: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,10,18,0.44)', justifyContent: 'center', borderRadius: 999, marginHorizontal: 44, paddingHorizontal: 9, paddingVertical: 3 },
  vnDur: { color: '#fff', fontSize: 12, fontWeight: '700' },
  videoNoteMeta: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  replyAccent: { width: 3, height: 38, borderRadius: 2 },
  replyContent: { flex: 1 },
  replyName: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  replyText: { fontSize: 13 },
  replyClose: { padding: 4 },
  recHud: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  recCard: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 12, gap: 14 },
  videoRecOverlay: { alignItems: 'center', gap: 10, width: '100%' },
  videoRecStageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 28 },
  recPreviewWrap: { width: 164, height: 164, alignItems: 'center', justifyContent: 'center' },
  recPulse: { position: 'absolute', width: 164, height: 164, borderRadius: 82 },
  recShell: { width: 152, height: 152, borderRadius: 76, overflow: 'hidden', borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  recPreview: { width: '100%', height: '100%' },
  flipBtn: { position: 'absolute', bottom: 10, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(5,10,18,0.62)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  recBody: { flex: 1 },
  videoCancelPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, minWidth: 220, justifyContent: 'center' },
  videoCancelText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  videoLockRail: { width: 34, height: 112, borderRadius: 17, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  videoLockLine: { width: 1.5, flex: 1, marginVertical: 8, backgroundColor: 'rgba(255,255,255,0.34)' },
  videoTimerPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  videoTimerText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  videoLockedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  videoLockedText: { fontSize: 11, fontWeight: '700' },
  recTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  recDot: { width: 9, height: 9, borderRadius: 4.5 },
  recTimer: { fontSize: 16, fontWeight: '800', flex: 1 },
  videoRecBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  videoRecBadgeText: { fontSize: 11, fontWeight: '700' },
  videoRecHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  videoRecHint: { fontSize: 12, fontWeight: '600' },
  recHint: { fontSize: 12, marginLeft: 'auto' },
  recSubHint: { fontSize: 12, marginTop: 6 },
  recActions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  recActionBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  gesRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  gesMetric: { fontSize: 12, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 7, paddingTop: 5, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, shadowOpacity: 0 },
  attachBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 3 },
  inputShell: { flex: 1, borderRadius: 20, paddingHorizontal: 13, justifyContent: 'center', flexDirection: 'row', alignItems: 'flex-end', borderWidth: StyleSheet.hairlineWidth },
  textInput: { flex: 1, fontSize: 16, lineHeight: 21, paddingTop: 8, paddingBottom: 8 },
  stickerBtn: { paddingBottom: 8, paddingLeft: 6 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 10, maxWidth: '78%', gap: 10 },
  callBubble: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '75%', marginVertical: 2, alignSelf: 'flex-start' },
  callBubbleOwn: { alignSelf: 'flex-end', backgroundColor: '#2AABEE' },
  callBubbleOther: { alignSelf: 'flex-start', backgroundColor: 'rgba(120,120,128,0.18)' },
  callBubbleText: { fontSize: 14, fontWeight: '500' },
  voicePlay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceContent: { flex: 1, gap: 5, minWidth: 130 },
  voiceTrack: { height: 3, borderRadius: 2, flexDirection: 'row', overflow: 'hidden' },
  voiceFill: { borderRadius: 2 },
  waveformRow: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  waveBar: { width: 3, borderRadius: 2, minHeight: 3 },
  voiceMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voiceDur: { fontSize: 12, fontWeight: '600 ' },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  speedText: { fontSize: 11, fontWeight: '600' },
  speedPicker: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, marginTop: 4, padding: 6, flexDirection: 'row', gap: 4 },
  speedOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  multiSelectBar: { height: 56, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  multiSelectClose: { padding: 8 },
  multiSelectCount: { flex: 1, fontSize: 14, fontWeight: '600' },
  multiSelectDelete: { padding: 10, borderRadius: 8 },
  readReceiptRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4 },
  readReceiptText: { fontSize: 11, fontWeight: '600' },
  fsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  fsClose: { position: 'absolute', top: 54, right: 20, zIndex: 5, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  fsCircle: { width: Dimensions.get('window').width - 40, height: Dimensions.get('window').width - 40, borderRadius: (Dimensions.get('window').width - 40) / 2, overflow: 'hidden' },
  fsVideo: { width: '100%', height: '100%' },
});

const pollS = StyleSheet.create({
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12, paddingHorizontal: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  optInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  addOptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 8 },
  addOptText: { fontSize: 14, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  toggle: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  sendBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
