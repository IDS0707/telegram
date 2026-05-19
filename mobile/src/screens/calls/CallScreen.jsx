import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { callService } from '../../services/callService';
import { wsService } from '../../services/websocket';

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CallScreen({ navigation, route }) {
  const [callInfo, setCallInfo] = useState(callService.call);
  const [, setStreamTick] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const navigateAfterEnd = useCallback(() => {
    const returnTo = route?.params?.returnTo;
    const returnParams = route?.params?.returnParams;

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (returnTo === 'Chat' && returnParams) {
      navigation.navigate('Chat', returnParams);
      return;
    }

    navigation.navigate('Main');
  }, [navigation, route?.params]);

  const forceStreamUpdate = useCallback(() => {
    setStreamTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const unsub = callService.addListener((info) => {
      setCallInfo(info);
      forceStreamUpdate();
      if (info.state === 'ended' || info.state === 'idle') {
        navigateAfterEnd();
      }
    });
    return unsub;
  }, [forceStreamUpdate, navigateAfterEnd]);

  useEffect(() => {
    const onAnswered = () => callService.handleCallAnswered();
    const onDeclined = () => callService.handleCallDeclined();
    const onEnded = () => callService.handleCallEnded();

    wsService.on('call_answered', onAnswered);
    wsService.on('call_declined', onDeclined);
    wsService.on('call_ended', onEnded);

    return () => {
      wsService.off('call_answered', onAnswered);
      wsService.off('call_declined', onDeclined);
      wsService.off('call_ended', onEnded);
    };
  }, []);

  const { state, callType, remoteUserName, duration, isMuted, isCameraOff } = callInfo;
  const localStream = callService.localStream;
  const remoteStream = callService.remoteStream;
  const isVideo = callType === 'video';
  const isConnected = state === 'connected';
  const isIncoming = state === 'ringing';

  const getStatusText = () => {
    switch (state) {
      case 'calling': return "Qo'ng'iroq qilinmoqda…";
      case 'ringing': return "Kiruvchi qo'ng'iroq";
      case 'connected': return formatDuration(duration);
      default: return '';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Full-screen remote video background */}
      {isVideo && remoteStream && isConnected && (
        <View style={StyleSheet.absoluteFill}>
          <RTCView
            streamURL={remoteStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
          {/* Gradient overlay for readability */}
          <View style={styles.videoGradientTop} />
          <View style={styles.videoGradientBottom} />
        </View>
      )}

      {/* Voice call gradient background */}
      {!isVideo && (
        <View style={[StyleSheet.absoluteFill, styles.voiceBg]}>
          <View style={styles.voiceBgCircle1} />
          <View style={styles.voiceBgCircle2} />
        </View>
      )}

      {/* Remote audio (voice call) - invisible RTCView plays audio automatically */}
      {!isVideo && remoteStream && (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={{ width: 0, height: 0 }}
        />
      )}

      {/* Local video PiP */}
      {isVideo && localStream && !isCameraOff && (
        <View style={styles.localVideoWrap}>
          <RTCView
            streamURL={localStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={true}
          />
          <View style={styles.localVideoLabel}>
            <Text style={styles.localVideoLabelText}>Sen</Text>
          </View>
        </View>
      )}

      {/* Top section: Avatar + Name + Status */}
      <View style={styles.topSection}>
        {/* Back button */}
        <View style={styles.topBar}>
          <Text style={styles.topCallLabel}>
            {isVideo ? '📹 Video qo\'ng\'iroq' : '📞 Ovozli qo\'ng\'iroq'}
          </Text>
        </View>

        {/* Avatar */}
        {!(isVideo && isConnected && remoteStream) && (
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>
                  {(remoteUserName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
            {isConnected && (
              <View style={styles.onlinePulseOuter}>
                <View style={styles.onlinePulseInner} />
              </View>
            )}
          </View>
        )}

        <Text style={styles.callerName}>{remoteUserName}</Text>
        <Text style={styles.statusText}>
          {isVideo && state === 'calling' ? 'Video qo\'ng\'iroq ketmoqda...' :
           state === 'calling' ? 'Qo\'ng\'iroq qilinmoqda...' :
           state === 'ringing' ? 'Kiruvchi qo\'ng\'iroq' :
           isConnected ? formatDuration(duration) : ''}
        </Text>

        {/* Signal quality indicator */}
        {isConnected && (
          <View style={styles.signalRow}>
            {[1,2,3,4].map((i) => (
              <View key={i} style={[styles.signalBar, { height: 4 + i * 3, opacity: i <= 3 ? 1 : 0.3 }]} />
            ))}
            <Text style={styles.signalText}>Yaxshi</Text>
          </View>
        )}
      </View>

      {/* Mid controls (mute, camera, speaker, etc.) */}
      {isConnected && (
        <View style={styles.midControls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, isMuted && styles.ctrlBtnOn]}
            onPress={() => callService.toggleMute()}
          >
            <Ionicons name={isMuted ? 'mic-off' : 'mic-outline'} size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>{isMuted ? 'Ovoz yoq' : 'Mikrofon'}</Text>
          </TouchableOpacity>

          {isVideo ? (
            <TouchableOpacity
              style={[styles.ctrlBtn, isCameraOff && styles.ctrlBtnOn]}
              onPress={() => callService.toggleCamera()}
            >
              <Ionicons name={isCameraOff ? 'videocam-off-outline' : 'videocam-outline'} size={24} color="#fff" />
              <Text style={styles.ctrlLabel}>{isCameraOff ? 'Kamera yoq' : 'Kamera'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.ctrlBtn}>
              <Ionicons name="volume-high-outline" size={24} color="#fff" />
              <Text style={styles.ctrlLabel}>Dinamik</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.ctrlBtn, isScreenSharing && styles.ctrlBtnOn]}
            onPress={() => {
              setIsScreenSharing((v) => !v);
              // Notify backend about screen share state (best-effort)
              callService.toggleScreenShare?.().catch?.(() => {});
            }}
          >
            <Ionicons name={isScreenSharing ? 'stop-circle-outline' : 'phone-portrait-outline'} size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>{isScreenSharing ? 'To\'xtatish' : 'Ekran'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ctrlBtn}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>Ko'proq</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom action buttons */}
      <View style={styles.bottomActions}>
        {isIncoming ? (
          <View style={styles.incomingRow}>
            {/* Decline */}
            <View style={styles.actionCol}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.endBtn]}
                onPress={() => { callService.declineCall(); }}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Rad etish</Text>
            </View>

            {/* Answer */}
            <View style={styles.actionCol}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.answerBtn]}
                onPress={async () => {
                  console.log('[CallScreen] Javob berish pressed');
                  try {
                    await callService.answerCall();
                  } catch (err) {
                    console.error('[CallScreen] answerCall threw', err);
                  }
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name={isVideo ? 'videocam' : 'call'} size={30} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Javob berish</Text>
            </View>
          </View>
        ) : (
          <View style={styles.activeRow}>
            <View style={styles.actionCol}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.endBtn]}
                onPress={async () => {
                  await callService.endCall();
                  navigateAfterEnd();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Tugatish</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#17212B',
  },

  // Voice call background art
  voiceBg: {
    backgroundColor: '#0E1621',
    overflow: 'hidden',
  },
  voiceBgCircle1: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(42,171,238,0.12)',
    top: -100,
    left: -100,
  },
  voiceBgCircle2: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(42,171,238,0.07)',
    bottom: -80,
    right: -80,
  },

  // Video overlays
  videoGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0)',
  },
  videoGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // Local PiP
  localVideoWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    right: 16,
    width: 110,
    height: 155,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    elevation: 10,
  },
  localVideoLabel: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  localVideoLabelText: { color: '#fff', fontSize: 11 },

  // Top section
  topSection: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 64 : 50,
    zIndex: 5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  topCallLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Avatar
  avatarWrap: { position: 'relative', marginBottom: 22, alignItems: 'center' },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(42,171,238,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#2AABEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 48, fontWeight: '700' },
  onlinePulseOuter: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(76,175,80,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlinePulseInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#17212B',
  },

  callerName: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  statusText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Signal
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 12,
  },
  signalBar: { width: 4, backgroundColor: '#4CAF50', borderRadius: 2 },
  signalText: { color: '#4CAF50', fontSize: 12, marginLeft: 5 },

  // Mid controls
  midControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
    marginTop: 'auto',
    paddingBottom: 32,
    zIndex: 5,
  },
  ctrlBtn: {
    alignItems: 'center',
    width: 76,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctrlBtnOn: { backgroundColor: 'rgba(229,57,53,0.25)' },
  ctrlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 6, textAlign: 'center' },

  // Bottom actions
  bottomActions: {
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    paddingHorizontal: 32,
    zIndex: 5,
  },
  incomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  activeRow: {
    alignItems: 'center',
  },
  actionCol: { alignItems: 'center', gap: 10 },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  answerBtn: { backgroundColor: '#4CAF50' },
  endBtn: { backgroundColor: '#E53935' },
});
