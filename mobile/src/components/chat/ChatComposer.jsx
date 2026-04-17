import React, { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import ScalePressable from '../common/ScalePressable';

const FORMAT_OPTIONS = [
  { label: 'B', prefix: '**', suffix: '**', textStyle: styles.bold },
  { label: 'I', prefix: '__', suffix: '__', textStyle: styles.italic },
  { label: 'U', prefix: '++', suffix: '++', textStyle: styles.underline },
  { label: 'S', prefix: '~~', suffix: '~~', textStyle: styles.strike },
  { label: '<>', prefix: '`', suffix: '`', textStyle: styles.code },
  { label: '||', prefix: '||', suffix: '||' },
];

export default function ChatComposer({
  colors,
  isDark,
  insets,
  text,
  sending,
  showFormatBar,
  setShowFormatBar,
  inputSelection,
  setInputSelection,
  textInputRef,
  handleTextChange,
  sendText,
  showAttach,
  applyFormat,
  onInputFocus,
  replyTo,
  clearReply,
  isRecording,
  cancelRecording,
  stopRecording,
  recordingTime,
  formatRecordingTime,
  videoNoteMode,
  onMicPressIn,
  onMicPressOut,
  onCameraPressIn,
  onCameraPressOut,
}) {
  const [inputHeight, setInputHeight] = useState(44);
  const bottomSpacing = Math.max(insets.bottom, 10);

  const blurTint = useMemo(() => (isDark ? 'dark' : 'light'), [isDark]);

  const updateInputHeight = (event) => {
    const nextHeight = Math.min(Math.max(Math.ceil(event.nativeEvent.contentSize.height), 44), 132);
    if (nextHeight !== inputHeight) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setInputHeight(nextHeight);
    }
  };

  return (
    <View style={styles.wrapper}>
      {replyTo && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <View style={[styles.replyBar, { backgroundColor: colors.surfaceElevated ?? colors.surface, borderColor: colors.border }]}> 
            <View style={[styles.replyAccent, { backgroundColor: colors.primary }]} />
            <View style={styles.replyBody}>
              <Text style={[styles.replyName, { color: colors.primary }]} numberOfLines={1}>
                {replyTo.sender?.display_name ?? 'Reply'}
              </Text>
              <Text style={[styles.replyText, { color: colors.textSecondary }]} numberOfLines={1}>
                {replyTo.content ?? 'Attachment'}
              </Text>
            </View>
            <ScalePressable onPress={clearReply} style={styles.replyClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </ScalePressable>
          </View>
        </Animated.View>
      )}

      {showFormatBar && !isRecording && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <View style={[styles.formatBar, { backgroundColor: colors.surfaceElevated ?? colors.surface, borderColor: colors.border }]}>
            {FORMAT_OPTIONS.map(({ label, prefix, suffix, textStyle }) => (
              <ScalePressable
                key={label}
                onPress={() => applyFormat(prefix, suffix, inputSelection)}
                style={[styles.formatButton, { backgroundColor: colors.inputBackground }]}
              >
                <Text style={[styles.formatText, { color: colors.text }, textStyle]}>{label}</Text>
              </ScalePressable>
            ))}
          </View>
        </Animated.View>
      )}

      <BlurView
        intensity={28}
        tint={blurTint}
        style={[
          styles.container,
          {
            backgroundColor: `${colors.background}E6`,
            borderTopColor: colors.border,
            paddingBottom: bottomSpacing,
          },
        ]}
      >
        {isRecording ? (
          <View style={styles.recordingRow}>
            <ScalePressable style={styles.sideButton} onPress={cancelRecording}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </ScalePressable>
            <View style={[styles.recordingPill, { backgroundColor: colors.surfaceElevated ?? colors.surface }]}>
              <View style={styles.recordingDot} />
              <Text style={[styles.recordingText, { color: colors.text }]}>
                {formatRecordingTime(recordingTime)}
              </Text>
              <Text style={[styles.recordingHint, { color: colors.textSecondary }]}>Swipe left to cancel</Text>
            </View>
            <ScalePressable
              style={[styles.sendButton, { backgroundColor: colors.primary }]}
              onPress={stopRecording}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </ScalePressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <ScalePressable onPress={showAttach} style={styles.sideButton}>
              <Ionicons name="add" size={24} color={colors.primary} />
            </ScalePressable>
            <ScalePressable onPress={() => setShowFormatBar((value) => !value)} style={styles.sideButton}>
              <Ionicons name="text" size={18} color={showFormatBar ? colors.primary : colors.textSecondary} />
            </ScalePressable>

            <View style={[styles.inputShell, { backgroundColor: colors.inputBackground, borderColor: colors.border, minHeight: inputHeight }]}> 
              <TextInput
                ref={textInputRef}
                style={[styles.input, { color: colors.text, height: inputHeight }]}
                placeholder="Message"
                placeholderTextColor={colors.textSecondary}
                value={text}
                multiline
                maxLength={4096}
                textAlignVertical="top"
                onChangeText={handleTextChange}
                onSelectionChange={(event) => setInputSelection(event.nativeEvent.selection)}
                onContentSizeChange={updateInputHeight}
                onFocus={onInputFocus}
              />
            </View>

            {text.trim() ? (
              <ScalePressable
                style={[styles.sendButton, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
                onPress={sendText}
                disabled={sending}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </ScalePressable>
            ) : videoNoteMode ? (
              <ScalePressable style={[styles.sendButton, { backgroundColor: colors.primary }]} onPressIn={onCameraPressIn} onPressOut={onCameraPressOut}>
                <Ionicons name="videocam" size={18} color="#fff" />
              </ScalePressable>
            ) : (
              <ScalePressable style={[styles.sendButton, { backgroundColor: colors.surfaceElevated ?? colors.surface }]} onPressIn={onMicPressIn} onPressOut={onMicPressOut}>
                <Ionicons name="mic" size={18} color={colors.textSecondary} />
              </ScalePressable>
            )}
          </View>
        )}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  replyAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
  replyBody: {
    flex: 1,
  },
  replyName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
  },
  replyClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  formatButton: {
    minWidth: 40,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  formatText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bold: { fontWeight: '900' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  strike: { textDecorationLine: 'line-through' },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
  },
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  sideButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputShell: {
    flex: 1,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    paddingTop: 11,
    paddingBottom: 11,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingPill: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F45B69',
  },
  recordingText: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingHint: {
    fontSize: 12,
    marginLeft: 'auto',
  },
});