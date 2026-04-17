import React, { useMemo } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { format } from 'date-fns';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);
const DEFAULT_REACTION = '❤️';

export default function ChatMessageBubble({
  msg,
  isMe,
  chatType,
  colors,
  currentUserId,
  screenWidth,
  baseUrl,
  onOpenContextMenu,
  onReply,
  onReact,
  onOpenLightbox,
  onPlayVoice,
  playingMsgId,
  renderFormattedText,
  renderReactions,
  formatRecordingTime,
  visibleVideoNotes,
  isNew,
}) {
  const translateX = useSharedValue(0);
  const accentScale = useSharedValue(0);
  const ringRotation = useSharedValue(0);

  const showAvatar = chatType === 'group' && !isMe;
  const shouldAutoplay = msg.message_type === 'video_note' && visibleVideoNotes?.has(msg.id);

  if (msg.message_type === 'video_note') {
    ringRotation.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false);
  }

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIndicatorStyle = useAnimatedStyle(() => ({
    opacity: accentScale.value,
    transform: [{ scale: 0.75 + accentScale.value * 0.25 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value * 360}deg` }],
  }));

  const bubbleGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-18, 18])
      .failOffsetY([-16, 16])
      .onUpdate((event) => {
        if (isMe) {
          translateX.value = Math.max(Math.min(event.translationX, 0), -84);
          accentScale.value = Math.min(Math.abs(translateX.value) / 72, 1);
          return;
        }

        translateX.value = Math.min(Math.max(event.translationX, 0), 84);
        accentScale.value = Math.min(Math.abs(translateX.value) / 72, 1);
      })
      .onEnd(() => {
        const shouldReply = Math.abs(translateX.value) > 68;
        if (shouldReply) {
          onReply(msg);
        }
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        accentScale.value = withTiming(0, { duration: 120 });
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(220)
      .onEnd((_event, success) => {
        if (success) {
          onReact(msg, DEFAULT_REACTION);
        }
      });

    const longPress = Gesture.LongPress()
      .minDuration(220)
      .onEnd((_event, success) => {
        if (success) {
          onOpenContextMenu(msg);
        }
      });

    return Gesture.Simultaneous(pan, Gesture.Exclusive(doubleTap, longPress));
  }, [accentScale, isMe, msg, onOpenContextMenu, onReact, onReply, translateX]);

  const renderContent = () => {
    const textColor = isMe ? colors.textOnPrimary ?? '#FFFFFF' : colors.text;
    const secondaryTextColor = isMe ? 'rgba(255,255,255,0.74)' : colors.textSecondary;
    const imageSize = Math.min(Math.round(screenWidth * 0.62), 240);

    switch (msg.message_type) {
      case 'image':
        return (
          <Pressable onPress={() => onOpenLightbox({ uri: `${baseUrl}${msg.file_url}`, type: 'image', item: msg })}>
            <Image source={{ uri: `${baseUrl}${msg.file_url}` }} style={[styles.image, { width: imageSize, height: imageSize }]} resizeMode="cover" />
          </Pressable>
        );
      case 'video':
        return (
          <Pressable style={[styles.videoPreview, { width: imageSize, height: Math.round(imageSize * 0.68) }]} onPress={() => onOpenLightbox({ uri: `${baseUrl}${msg.file_url}`, type: 'video', item: msg })}>
            <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.92)" />
          </Pressable>
        );
      case 'video_note': {
        const size = Math.min(Math.round(screenWidth * 0.56), 220);

        return (
          <Pressable onPress={() => onOpenLightbox({ uri: `${baseUrl}${msg.file_url}`, type: 'video', item: msg })}>
            <View style={[styles.videoNoteFrame, { width: size, height: size }]}> 
              <AnimatedView style={[styles.videoNoteRing, ringStyle, { borderColor: isMe ? 'rgba(255,255,255,0.55)' : colors.primary }]} />
              <Video
                source={{ uri: `${baseUrl}${msg.file_url}` }}
                style={styles.videoNote}
                resizeMode={ResizeMode.COVER}
                shouldPlay={shouldAutoplay}
                isMuted
                isLooping
              />
              <View style={styles.videoNoteMetaRow}>
                <View style={styles.videoNotePill}>
                  <Ionicons name="play" size={10} color="#fff" />
                  <Text style={styles.videoNotePillText}>{formatRecordingTime(msg.duration || 0)}</Text>
                </View>
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
            </View>
          </Pressable>
        );
      }
      case 'voice':
        return (
          <Pressable style={styles.voiceRow} onPress={() => onPlayVoice(msg)}>
            <View style={[styles.voiceAction, { backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : colors.primaryLight }]}> 
              <Ionicons name={playingMsgId === msg.id ? 'pause' : 'play'} size={16} color={isMe ? '#fff' : colors.primary} />
            </View>
            <View style={styles.voiceWaveform}>
              {[5, 9, 13, 7, 11, 14, 9, 6, 12, 10, 8, 13].map((height, index) => (
                <View key={`${msg.id}-wave-${index}`} style={[styles.voiceBar, { height, backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : colors.primary }]} />
              ))}
            </View>
            <Text style={[styles.voiceDuration, { color: secondaryTextColor }]}>{msg.duration ? `${msg.duration}s` : '0s'}</Text>
          </Pressable>
        );
      case 'file':
      case 'audio':
        return (
          <View style={styles.fileRow}>
            <View style={[styles.fileIcon, { backgroundColor: isMe ? 'rgba(255,255,255,0.18)' : colors.primaryLight }]}> 
              <Ionicons name={msg.message_type === 'audio' ? 'musical-note' : 'document-text'} size={20} color={isMe ? '#fff' : colors.primary} />
            </View>
            <View style={styles.fileBody}>
              <Text style={[styles.fileName, { color: textColor }]} numberOfLines={2}>{msg.file_name ?? (msg.message_type === 'audio' ? 'Audio' : 'File')}</Text>
              <Text style={[styles.fileMeta, { color: secondaryTextColor }]}>{msg.file_size ? `${Math.max(1, Math.round(msg.file_size / 1024))} KB` : msg.message_type === 'audio' ? 'Audio' : 'Attachment'}</Text>
            </View>
          </View>
        );
      default: {
        const content = msg.content ?? '';
        if (content.startsWith('📍geo:')) {
          const [lat, lon] = content.replace('📍geo:', '').split(',');
          const mapsUrl = Platform.OS === 'ios' ? `maps://?q=${lat},${lon}` : `geo:${lat},${lon}?q=${lat},${lon}`;

          return (
            <Pressable style={[styles.locationCard, { backgroundColor: isMe ? 'rgba(255,255,255,0.14)' : colors.surface }]} onPress={() => Linking.openURL(mapsUrl)}>
              <View style={[styles.locationMap, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.primaryLight }]}>
                <Ionicons name="location" size={24} color={isMe ? '#fff' : colors.primary} />
              </View>
              <View style={styles.locationBody}>
                <Text style={[styles.locationTitle, { color: textColor }]}>Live location</Text>
                <Text style={[styles.locationCoords, { color: secondaryTextColor }]} numberOfLines={1}>{lat}, {lon}</Text>
              </View>
            </Pressable>
          );
        }

        return renderFormattedText(content, textColor);
      }
    }
  };

  return (
    <Animated.View entering={isNew ? FadeInDown.duration(180).springify() : undefined} layout={LinearTransition.springify().damping(18)} style={styles.row}>
      {!isMe && <View style={styles.leadingSpace}>{showAvatar ? (
        msg.sender?.avatar_url ? <Image source={{ uri: `${baseUrl}${msg.sender.avatar_url}` }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={styles.avatarLetter}>{msg.sender?.display_name?.charAt(0)?.toUpperCase() ?? '?'}</Text></View>
      ) : null}</View>}

      <Animated.View style={[styles.replyIndicator, replyIndicatorStyle, isMe ? styles.replyIndicatorMe : styles.replyIndicatorOther, { backgroundColor: colors.primaryLight }]}> 
        <Ionicons name="arrow-undo" size={14} color={colors.primary} />
      </Animated.View>

      <GestureDetector gesture={bubbleGesture}>
        <AnimatedPressable style={[swipeStyle, styles.bubbleWrap, isMe ? styles.alignEnd : styles.alignStart]}>
          {msg.message_type === 'video_note' ? (
            <View style={styles.videoNoteShell}>
              {renderContent()}
              <View style={[styles.metaRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{format(new Date(msg.created_at), 'HH:mm')}</Text>
                {isMe && <Ionicons name={msg.is_read ? 'checkmark-done' : 'checkmark'} size={14} color={msg.is_read ? colors.primary : colors.textSecondary} style={styles.metaIcon} />}
              </View>
            </View>
          ) : (
            <View style={[
              styles.bubble,
              {
                backgroundColor: isMe ? colors.myMessageBubble : colors.otherMessageBubble,
                shadowColor: isMe ? colors.primary : '#000000',
              },
              isMe ? styles.bubbleMe : styles.bubbleOther,
            ]}>
              {/* Telegram-style tail */}
              <View style={isMe ? styles.tailMe : styles.tailOther} pointerEvents="none">
                <View style={{
                  width: 14,
                  height: 14,
                  backgroundColor: isMe ? colors.myMessageBubble : colors.otherMessageBubble,
                  transform: isMe
                    ? [{ rotate: '30deg' }, { skewX: '20deg' }]
                    : [{ rotate: '-30deg' }, { skewX: '-20deg' }],
                  borderBottomLeftRadius: isMe ? 0 : 6,
                  borderBottomRightRadius: isMe ? 6 : 0,
                }} />
              </View>
              {chatType === 'group' && !isMe && (
                <Text style={[styles.senderName, { color: colors.primary }]} numberOfLines={1}>{msg.sender?.display_name}</Text>
              )}

              {msg.reply_to && (
                <View style={[styles.replyQuote, { borderLeftColor: colors.primary, backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.surface }]}> 
                  <Text style={[styles.replyQuoteName, { color: isMe ? '#fff' : colors.primary }]} numberOfLines={1}>{msg.reply_to.sender?.display_name ?? 'Reply'}</Text>
                  <Text style={[styles.replyQuoteText, { color: isMe ? 'rgba(255,255,255,0.78)' : colors.textSecondary }]} numberOfLines={1}>{msg.reply_to.content ?? 'Attachment'}</Text>
                </View>
              )}

              {renderContent()}

              <View style={styles.metaRow}>
                {msg.is_edited && <Text style={[styles.metaText, { color: isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary }]}>edited</Text>}
                <Text style={[styles.metaText, { color: isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary }]}>{format(new Date(msg.created_at), 'HH:mm')}</Text>
                {isMe && <Ionicons name={msg.is_read ? 'checkmark-done' : 'checkmark'} size={14} color={msg.is_read ? colors.primary : 'rgba(255,255,255,0.72)'} style={styles.metaIcon} />}
              </View>
            </View>
          )}

          {renderReactions(msg)}
        </AnimatedPressable>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  leadingSpace: {
    width: 36,
    marginRight: 6,
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  replyIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  replyIndicatorOther: {
    marginRight: 6,
  },
  replyIndicatorMe: {
    order: 2,
    marginLeft: 6,
  },
  bubbleWrap: {
    maxWidth: '75%',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  alignEnd: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  // Telegram tail for outgoing messages
  tailMe: {
    position: 'absolute',
    bottom: 0,
    right: -6,
    width: 10,
    height: 14,
    overflow: 'hidden',
  },
  // Telegram tail for incoming messages
  tailOther: {
    position: 'absolute',
    bottom: 0,
    left: -6,
    width: 10,
    height: 14,
    overflow: 'hidden',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  replyQuoteName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyQuoteText: {
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
  },
  metaIcon: {
    marginLeft: 2,
  },
  image: {
    borderRadius: 18,
  },
  videoPreview: {
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121822',
  },
  videoNoteShell: {
    gap: 4,
  },
  videoNoteFrame: {
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1720',
  },
  videoNoteRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 999,
  },
  videoNote: {
    width: '100%',
    height: '100%',
  },
  videoNoteMetaRow: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoNotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  videoNotePillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  voiceRow: {
    minWidth: 176,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceWaveform: {
    flex: 1,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  voiceBar: {
    width: 3,
    borderRadius: 999,
  },
  voiceDuration: {
    fontSize: 11,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileBody: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 190,
    borderRadius: 18,
    overflow: 'hidden',
  },
  locationMap: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationBody: {
    flex: 1,
    paddingHorizontal: 10,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  locationCoords: {
    fontSize: 12,
    marginTop: 2,
  },
});