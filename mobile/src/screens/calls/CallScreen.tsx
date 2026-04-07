import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { webrtcService } from '../../services/webrtc';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../theme/colors';

export default function CallScreen({ route, navigation }: any) {
  const { calleeId, calleeName, callType, isIncoming, callId: incomingCallId } = route.params;
  const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'calling');
  const [callId, setCallId] = useState<string | null>(incomingCallId || null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!isIncoming) {
      initiateCall();
    }
    setupWebRTC();
    setupSignaling();

    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      webrtcService.cleanup();
    };
  }, []);

  useEffect(() => {
    if (callStatus === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callStatus]);

  const initiateCall = async () => {
    try {
      const res = await apiClient.post('/calls', {
        callee_id: calleeId,
        call_type: callType,
      });
      setCallId(res.data.id);
    } catch (err) {
      navigation.goBack();
    }
  };

  const setupWebRTC = async () => {
    await webrtcService.initializePeerConnection();

    webrtcService.setSendSignal(async (signal: any) => {
      try {
        await apiClient.post('/calls/signal', {
          target_id: calleeId,
          type: signal.type,
          data: signal.data,
        });
      } catch {}
    });

    webrtcService.onCallEnd(() => {
      endCall();
    });

    const stream = await webrtcService.startLocalStream(callType === 'video');

    if (!isIncoming) {
      const offer = await webrtcService.createOffer();
      await apiClient.post('/calls/signal', {
        target_id: calleeId,
        type: 'offer',
        data: offer,
      });
    }
  };

  const setupSignaling = () => {
    const handleSignal = async (payload: any) => {
      if (payload.from !== calleeId) return;

      switch (payload.type) {
        case 'offer':
          await webrtcService.setRemoteDescription(payload.data);
          const answer = await webrtcService.createAnswer();
          await apiClient.post('/calls/signal', {
            target_id: calleeId,
            type: 'answer',
            data: answer,
          });
          break;
        case 'answer':
          await webrtcService.setRemoteDescription(payload.data);
          setCallStatus('connected');
          break;
        case 'ice-candidate':
          await webrtcService.addIceCandidate(payload.data);
          break;
      }
    };

    const handleAnswered = () => {
      setCallStatus('connected');
    };
    const handleDeclined = () => {
      setCallStatus('ended');
      setTimeout(() => navigation.goBack(), 1500);
    };
    const handleEnded = () => {
      setCallStatus('ended');
      setTimeout(() => navigation.goBack(), 1500);
    };

    wsService.on('webrtc_signal', handleSignal);
    wsService.on('call_answered', handleAnswered);
    wsService.on('call_declined', handleDeclined);
    wsService.on('call_ended', handleEnded);

    return () => {
      wsService.off('webrtc_signal', handleSignal);
      wsService.off('call_answered', handleAnswered);
      wsService.off('call_declined', handleDeclined);
      wsService.off('call_ended', handleEnded);
    };
  };

  const answerCall = async () => {
    if (callId) {
      await apiClient.post(`/calls/${callId}/answer`);
      setCallStatus('connected');
    }
  };

  const declineCall = async () => {
    if (callId) {
      await apiClient.post(`/calls/${callId}/decline`);
    }
    webrtcService.cleanup();
    navigation.goBack();
  };

  const endCall = async () => {
    if (callId) {
      try {
        await apiClient.post(`/calls/${callId}/end`);
      } catch {}
    }
    webrtcService.cleanup();
    navigation.goBack();
  };

  const toggleMute = () => {
    webrtcService.toggleMute();
    setIsMuted(!isMuted);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{calleeName?.[0]?.toUpperCase() || '?'}</Text>
          </View>
        </View>
        <Text style={styles.calleeName}>{calleeName}</Text>
        <Text style={styles.statusText}>
          {callStatus === 'calling' && 'Calling...'}
          {callStatus === 'incoming' && 'Incoming call...'}
          {callStatus === 'connected' && formatDuration(duration)}
          {callStatus === 'ended' && 'Call ended'}
        </Text>
        <Text style={styles.callTypeText}>
          {callType === 'video' ? 'Video Call' : 'Voice Call'}
        </Text>
      </View>

      <View style={styles.controls}>
        {callStatus === 'connected' && (
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.activeControl]}
              onPress={toggleMute}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={28} color="#fff" />
              <Text style={styles.controlLabel}>Mute</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isSpeaker && styles.activeControl]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons name={isSpeaker ? 'volume-high' : 'volume-medium'} size={28} color="#fff" />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>

            {callType === 'video' && (
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => webrtcService.toggleCamera()}
              >
                <Ionicons name="camera-reverse" size={28} color="#fff" />
                <Text style={styles.controlLabel}>Flip</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.mainControls}>
          {callStatus === 'incoming' && (
            <>
              <TouchableOpacity
                style={[styles.callButton, styles.declineButton]}
                onPress={declineCall}
              >
                <Ionicons name="close" size={32} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callButton, styles.answerButton]}
                onPress={answerCall}
              >
                <Ionicons name="call" size={32} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {(callStatus === 'calling' || callStatus === 'connected') && (
            <TouchableOpacity
              style={[styles.callButton, styles.endButton]}
              onPress={endCall}
            >
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '700',
  },
  calleeName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#aaa',
  },
  callTypeText: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
  },
  controls: {
    paddingBottom: 60,
    paddingHorizontal: 32,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  controlButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
  },
  activeControl: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  mainControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  callButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerButton: {
    backgroundColor: Colors.light.success,
  },
  declineButton: {
    backgroundColor: Colors.light.danger,
  },
  endButton: {
    backgroundColor: Colors.light.danger,
  },
});
