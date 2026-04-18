import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useTheme } from '../../theme/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { callService } from '../../services/callService';
import { wsService } from '../../services/websocket';
import apiClient from '../../services/api';

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function GroupCallScreen({ navigation, route }) {
  const { chatId, callId: initialCallId, chatTitle } = route.params || {};
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();

  const [call, setCall] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const timerRef = useRef(null);
  const peerConnections = useRef({}); // userId -> RTCPeerConnection

  // Join on mount
  useEffect(() => {
    joinCall();
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => {
      clearInterval(timerRef.current);
      leaveCall();
    };
  }, []);

  // WebSocket listeners for group call events
  useEffect(() => {
    const onParticipantJoined = ({ user_id }) => {
      setParticipants((prev) => {
        if (prev.find((p) => p.user_id === user_id)) return prev;
        return [...prev, { user_id, is_muted: false, is_video_enabled: false }];
      });
    };
    const onParticipantLeft = ({ user_id }) => {
      setParticipants((prev) => prev.filter((p) => p.user_id !== user_id));
      // Close peer connection
      if (peerConnections.current[user_id]) {
        peerConnections.current[user_id].close();
        delete peerConnections.current[user_id];
      }
    };
    const onStatusUpdate = (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.user_id === data.user_id
            ? { ...p, is_muted: data.is_muted, is_video_enabled: data.is_video_enabled, is_screen_sharing: data.is_screen_sharing }
            : p,
        ),
      );
    };
    wsService.on('group_call_participant_joined', onParticipantJoined);
    wsService.on('group_call_participant_left', onParticipantLeft);
    wsService.on('group_call_status_update', onStatusUpdate);
    return () => {
      wsService.off('group_call_participant_joined', onParticipantJoined);
      wsService.off('group_call_participant_left', onParticipantLeft);
      wsService.off('group_call_status_update', onStatusUpdate);
    };
  }, []);

  const joinCall = async () => {
    try {
      let callData;
      if (initialCallId) {
        const { data } = await apiClient.post(`/group-calls/${initialCallId}/join`);
        callData = data;
      } else {
        const { data } = await apiClient.post(`/chats/${chatId}/group-call`);
        callData = data;
      }
      setCall(callData);
      setParticipants(callData?.participants || []);

      // Get local media
      const stream = await callService.getLocalStream({ video: false, audio: true });
      setLocalStream(stream);
    } catch (e) {
      Alert.alert('Xato', 'Guruh qo\'ng\'irog\'iga ulanib bo\'lmadi');
      navigation.goBack();
    }
  };

  const leaveCall = async () => {
    if (!call?.id) return;
    try {
      localStream?.getTracks().forEach((t) => t.stop());
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      await apiClient.post(`/group-calls/${call.id}/leave`);
    } catch {
      /* ignore */
    }
  };

  const handleLeave = useCallback(async () => {
    await leaveCall();
    navigation.goBack();
  }, [call?.id]);

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    if (call?.id) {
      await apiClient.post(`/group-calls/${call.id}/status`, {
        is_muted: newMuted,
        is_video_enabled: !isCameraOff,
        is_screen_sharing: isScreenSharing,
      });
    }
  };

  const toggleCamera = async () => {
    const newOff = !isCameraOff;
    setIsCameraOff(newOff);
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !newOff; });
    if (call?.id) {
      await apiClient.post(`/group-calls/${call.id}/status`, {
        is_muted: isMuted,
        is_video_enabled: !newOff,
        is_screen_sharing: isScreenSharing,
      });
    }
  };

  const ParticipantTile = ({ participant }) => {
    const isMe = participant.user_id === user?.id;
    const name = participant.user?.display_name || (isMe ? 'Siz' : 'Foydalanuvchi');
    return (
      <View style={[styles.tile, { backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0' }]}>
        <View style={[styles.tileAvatar, { backgroundColor: colors.primary + '30' }]}>
          <Text style={[styles.tileAvatarText, { color: colors.primary }]}>{name.charAt(0).toUpperCase()}</Text>
          {participant.is_muted && (
            <View style={styles.mutedBadge}>
              <Ionicons name="mic-off" size={10} color="#FFF" />
            </View>
          )}
        </View>
        <Text style={[styles.tileName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <View style={styles.tileIcons}>
          {participant.is_video_enabled && <Ionicons name="videocam" size={12} color={colors.primary} />}
          {participant.is_screen_sharing && <Ionicons name="desktop" size={12} color={colors.primary} />}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#111' : '#1C1C1E' }]}>
      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{chatTitle || 'Guruh qo\'ng\'irog\'i'}</Text>
          <Text style={styles.headerDuration}>{formatDuration(duration)}</Text>
        </View>
      </SafeAreaView>

      {/* Participants grid */}
      <ScrollView contentContainerStyle={styles.grid}>
        {participants.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyText}>Ishtirokchilar yo'q</Text>
          </View>
        ) : (
          participants.map((p) => <ParticipantTile key={p.user_id} participant={p} />)
        )}
      </ScrollView>

      {/* Controls */}
      <SafeAreaView edges={['bottom']}>
        <View style={styles.controls}>
          <Pressable onPress={toggleMute} style={[styles.ctrlBtn, { backgroundColor: isMuted ? '#FF3B30' : 'rgba(255,255,255,0.15)' }]}>
            <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="#FFF" />
          </Pressable>

          <Pressable onPress={toggleCamera} style={[styles.ctrlBtn, { backgroundColor: isCameraOff ? 'rgba(255,255,255,0.15)' : colors.primary }]}>
            <Ionicons name={isCameraOff ? 'videocam-off' : 'videocam'} size={24} color="#FFF" />
          </Pressable>

          <Pressable
            onPress={handleLeave}
            style={[styles.ctrlBtn, styles.endBtn]}
          >
            <Ionicons name="call" size={24} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingVertical: 16 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  headerDuration: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
    justifyContent: 'center',
  },
  tile: {
    width: 140,
    height: 140,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  tileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tileAvatarText: { fontSize: 26, fontWeight: '600' },
  mutedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 3,
  },
  tileName: { fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  tileIcons: { flexDirection: 'row', gap: 4, marginTop: 4 },
  emptyBox: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 12 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  ctrlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: { backgroundColor: '#FF3B30' },
});
