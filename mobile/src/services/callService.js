import { Alert, Platform } from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import apiClient from './api';
import { wsService } from './websocket';
import { ringService } from './ringService';

// expo-av is deprecated in SDK 54 — load it lazily and only on native so the
// web bundle stays clean of the deprecation warning.
let _Audio = null;
const getAudio = () => {
  if (Platform.OS === 'web') return null;
  if (_Audio) return _Audio;
  try {
    _Audio = require('expo-av').Audio;
  } catch {
    _Audio = null;
  }
  return _Audio;
};

// TURN config from mobile/.env (EXPO_PUBLIC_*). If TURN_HOST is unset
// we fall back to STUN-only — calls will work on the same NAT but may
// fail across symmetric NATs / mobile carriers.
const TURN_HOST = process.env.EXPO_PUBLIC_TURN_HOST || '';
const TURN_PORT = process.env.EXPO_PUBLIC_TURN_PORT || '3478';
const TURN_USER = process.env.EXPO_PUBLIC_TURN_USER || '';
const TURN_PASS = process.env.EXPO_PUBLIC_TURN_PASS || '';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(TURN_HOST && TURN_USER && TURN_PASS
    ? [
        {
          urls: `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
          username: TURN_USER,
          credential: TURN_PASS,
        },
        {
          urls: `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
          username: TURN_USER,
          credential: TURN_PASS,
        },
      ]
    : []),
];

const DEFAULT_CALL = {
  callId: null,
  callType: 'voice',
  remoteUserId: '',
  remoteUserName: '',
  state: 'idle',
  duration: 0,
  isMuted: false,
  isSpeaker: false,
  isCameraOff: false,
};

class CallService {
  constructor() {
    this.current = { ...DEFAULT_CALL };
    this.durationTimer = null;
    this._reconnectTimer = null;
    this.listeners = new Set();
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.pendingCandidates = [];
    this.pendingOffer = null;
    this.pendingAnswer = null;   // buffer answer if it arrives before PC is ready
    this._signalHandler = null;
  }

  get call() {
    return { ...this.current };
  }

  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(partial) {
    this.current = { ...this.current, ...partial };
    const snapshot = this.call;
    this.listeners.forEach((l) => l(snapshot));
  }

  // ---- WebRTC signaling ----

  _listenSignaling() {
    if (this._signalHandler) return;
    this._signalHandler = async (payload) => {
      const { type, data } = payload;
      try {
        if (type === 'offer') {
          if (this.pc && this.current.state !== 'idle') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data));
            this._flushCandidates();
          } else {
            this.pendingOffer = data;
          }
        } else if (type === 'answer') {
          if (this.pc && this.pc.signalingState !== 'closed') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data));
            this._flushCandidates();
          } else {
            // PC not ready yet — buffer the answer
            this.pendingAnswer = data;
          }
        } else if (type === 'ice-candidate') {
          if (this.pc && this.pc.remoteDescription) {
            await this.pc.addIceCandidate(new RTCIceCandidate(data));
          } else {
            this.pendingCandidates.push(data);
          }
        }
      } catch (e) {
        console.error('[CallService] signal error:', e);
      }
    };
    wsService.on('webrtc_signal', this._signalHandler);
  }

  _stopSignaling() {
    if (this._signalHandler) {
      wsService.off('webrtc_signal', this._signalHandler);
      this._signalHandler = null;
    }
  }

  async _flushCandidates() {
    for (const c of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.error('[CallService] flush ICE error:', e);
      }
    }
    this.pendingCandidates = [];
  }

  async _getMediaStream(callType) {
    if (!mediaDevices) return null;
    // Adaptive quality: try 60fps first, fallback to 30fps, then 15fps
    const videoProfiles = [
      { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 60, max: 60 } },
      { width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 45, max: 45 } },
      { width: { ideal: 320, max: 480 }, height: { ideal: 240, max: 360 }, frameRate: { ideal: 30, max: 30 } },
    ];
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (callType === 'video') {
      for (const videoProfile of videoProfiles) {
        try {
          const stream = await mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: { facingMode: 'user', ...videoProfile },
          });
          console.log(`[CallService] video @ ${videoProfile.frameRate.ideal}fps`);
          return stream;
        } catch (e) {
          console.log(`[CallService] ${videoProfile.frameRate.ideal}fps failed, trying lower...`);
        }
      }
      // Last resort: any video
      try {
        return await mediaDevices.getUserMedia({ audio: audioConstraints, video: true });
      } catch (e) {
        console.error('[CallService] video fallback error:', e);
      }
    }
    try {
      return await mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (e) {
      console.error('[CallService] audio error:', e);
      return null;
    }
  }

  // Limit SDP bandwidth — audio 128kbps, video up to 2Mbps
  _setSdpBitrate(sdp, audioBps = 128, videoBps = 2000) {
    return sdp
      .replace(/a=mid:audio\r\n/g, `a=mid:audio\r\nb=AS:${audioBps}\r\n`)
      .replace(/a=mid:video\r\n/g, `a=mid:video\r\nb=AS:${videoBps}\r\n`);
  }

  _createPeerConnection() {
    if (!RTCPeerConnection) return null;
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.current.remoteUserId) {
        apiClient.post('/calls/signal', {
          target_id: this.current.remoteUserId,
          type: 'ice-candidate',
          data: event.candidate.toJSON(),
        }).catch((e) => console.error('[CallService] send ICE error:', e));
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream && MediaStream) {
          this.remoteStream = new MediaStream();
        }
        if (this.remoteStream) this.remoteStream.addTrack(event.track);
      }
      this.listeners.forEach((l) => l(this.call));
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[CallService] connection:', state);
      if (state === 'disconnected') {
        // Temporary loss — try ICE restart, wait up to 8s before giving up
        this._reconnectTimer = setTimeout(async () => {
          if (!this.pc || this.pc.connectionState === 'connected') return;
          console.log('[CallService] attempting ICE restart...');
          try {
            const offer = await this.pc.createOffer({ iceRestart: true });
            await this.pc.setLocalDescription(offer);
            await apiClient.post('/calls/signal', {
              target_id: this.current.remoteUserId,
              type: 'offer',
              data: offer,
            });
          } catch (e) {
            console.error('[CallService] ICE restart failed:', e);
            this.endCall();
          }
        }, 8000);
      } else if (state === 'connected') {
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
      } else if (state === 'failed') {
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
        this.endCall();
      }
    };

    this.pc = pc;
    return pc;
  }

  // ---- Call lifecycle ----

  async initiateCall(calleeId, calleeName, type) {
    if (!RTCPeerConnection) {
      // Web/Expo fallback: create call session without WebRTC media stream.
      // This keeps call buttons functional even where native WebRTC is unavailable.
      try {
        const res = await apiClient.post('/calls', {
          callee_id: calleeId,
          call_type: type,
        });
        this.update({
          callId: res.data.id,
          callType: type,
          remoteUserId: calleeId,
          remoteUserName: calleeName,
          state: 'calling',
          duration: 0,
          isMuted: false,
          isCameraOff: false,
        });
        return true;
      } catch (e) {
        console.error('[CallService] fallback initiate error:', e);
        return false;
      }
    }
    if (Platform.OS !== 'web') {
      const Audio = getAudio();
      if (Audio) await Audio.requestPermissionsAsync().catch(() => {});
      if (type === 'video') {
        // Request camera permission explicitly before getUserMedia
        try {
          const { Camera } = require('expo-camera');
          await Camera.requestCameraPermissionsAsync();
        } catch {}
      }
      if (Audio) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false, // route audio through speaker not earpiece
        }).catch(() => {});
      }
    }

    const res = await apiClient.post('/calls', {
      callee_id: calleeId,
      call_type: type,
    });

    this.update({
      callId: res.data.id,
      callType: type,
      remoteUserId: calleeId,
      remoteUserName: calleeName,
      state: 'calling',
      duration: 0,
      isMuted: false,
      isCameraOff: false,
    });

    this._listenSignaling();

    // Start ringback tone — plays until other side answers or call ends
    ringService.startRingback();

    // Get local media
    this.localStream = await this._getMediaStream(type);
    const pc = this._createPeerConnection();
    if (!pc) return false;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Create & send offer
    const offerSdp = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video',
    });
    const modifiedOffer = {
      ...offerSdp,
      sdp: this._setSdpBitrate(offerSdp.sdp),
    };
    await pc.setLocalDescription(modifiedOffer);

    await apiClient.post('/calls/signal', {
      target_id: calleeId,
      type: 'offer',
      data: modifiedOffer,
    });

    // Apply buffered answer if it arrived before PC was ready (race condition fix)
    if (this.pendingAnswer) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(this.pendingAnswer));
        this.pendingAnswer = null;
        this._flushCandidates();
      } catch (e) {
        console.error('[CallService] apply buffered answer error:', e);
      }
    }

    return true;
  }

  async handleIncomingCall(callId, callerId, callerName, type) {
    if (Platform.OS !== 'web') {
      const Audio = getAudio();
      if (Audio) await Audio.requestPermissionsAsync().catch(() => {});
      if (type === 'video') {
        try {
          const { Camera } = require('expo-camera');
          await Camera.requestCameraPermissionsAsync();
        } catch {}
      }
      if (Audio) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
      }
    }
    this.pendingCandidates = [];
    this.pendingOffer = null;

    this.update({
      callId,
      callType: type,
      remoteUserId: callerId,
      remoteUserName: callerName,
      state: 'ringing',
      duration: 0,
      isMuted: false,
      isCameraOff: false,
    });

    // Start ringtone — plays until callee answers or declines
    ringService.startRingtone();

    this._listenSignaling();
  }

  async answerCall() {
    if (!this.current.callId) {
      console.error('answerCall: no callId');
      return;
    }
    if (!RTCPeerConnection) {
      const { Alert } = require('react-native');
      Alert.alert("Qo'ng'iroq ishlamaydi", 'WebRTC Expo Go da ishlamaydi');
      return;
    }
    try {
      await apiClient.post(`/calls/${this.current.callId}/answer`);

      // Stop ringtone when callee answers
      ringService.stopAll();

      // Get local media
      this.localStream = await this._getMediaStream(this.current.callType);
      const pc = this._createPeerConnection();
      if (!pc) return;

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.localStream);
        });
      }

      // Apply pending offer
      if (this.pendingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
        this.pendingOffer = null;
        await this._flushCandidates();
      }

      // Create & send answer
      const answerSdp = await pc.createAnswer();
      const modifiedAnswer = {
        ...answerSdp,
        sdp: this._setSdpBitrate(answerSdp.sdp),
      };
      await pc.setLocalDescription(modifiedAnswer);

      await apiClient.post('/calls/signal', {
        target_id: this.current.remoteUserId,
        type: 'answer',
        data: modifiedAnswer,
      });

      this.update({ state: 'connected' });
      this.startTimer();
    } catch (e) {
      console.error('answerCall error:', e);
      const { Alert } = require('react-native');
      const msg = e?.userMessage
        || e?.response?.data?.error
        || e?.message
        || "Qo'ng'iroqqa javob berib bo'lmadi";
      Alert.alert("Xato", msg);
      // Stop ringtone & reset so the user can try again or end the call.
      ringService.stopAll();
    }
  }

  async declineCall() {
    ringService.stopAll();
    if (this.current.callId) {
      try {
        await apiClient.post(`/calls/${this.current.callId}/decline`);
      } catch (e) {
        console.error('declineCall error:', e);
      }
    }
    this.cleanup();
  }

  async endCall() {
    ringService.stopAll();
    if (this.current.callId) {
      try {
        await apiClient.post(`/calls/${this.current.callId}/end`);
      } catch (e) {
        console.error('endCall error:', e);
      }
    }
    this.cleanup();
  }

  toggleMute() {
    const muted = !this.current.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
    this.update({ isMuted: muted });
    return muted;
  }

  toggleCamera() {
    const off = !this.current.isCameraOff;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => { t.enabled = !off; });
    }
    this.update({ isCameraOff: off });
    return off;
  }

  async toggleScreenShare() {
    this.update({ isScreenSharing: !this.current.isScreenSharing });
  }

  handleCallAnswered() {
    if (this.current.state === 'idle') return; // already cleaned up
    ringService.stopAll(); // stop ringback on caller side
    this.update({ state: 'connected' });
    this.startTimer();
  }

  handleCallDeclined() {
    if (this.current.state === 'idle') return;
    ringService.stopAll();
    this.cleanup();
  }

  handleCallEnded() {
    if (this.current.state === 'idle') return;
    ringService.stopAll();
    this.cleanup();
  }

  startTimer() {
    if (this.durationTimer) return;
    this.durationTimer = setInterval(() => {
      this.update({ duration: this.current.duration + 1 });
    }, 1000);
  }

  cleanup() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.pendingOffer = null;
    this.pendingAnswer = null;
    this._stopSignaling();
    this.update({ ...DEFAULT_CALL });
  }
}

export const callService = new CallService();
