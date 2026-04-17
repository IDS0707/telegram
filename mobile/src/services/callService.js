import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import apiClient from './api';
import { wsService } from './websocket';

const TURN_HOST = '172.20.10.2';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: `turn:${TURN_HOST}:3478?transport=udp`,
    username: 'turnuser',
    credential: 'turnpass2024',
  },
  {
    urls: `turn:${TURN_HOST}:3478?transport=tcp`,
    username: 'turnuser',
    credential: 'turnpass2024',
  },
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
          if (this.pc) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data));
            this._flushCandidates();
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
      const { Alert } = require('react-native');
      Alert.alert(
        "Qo'ng'iroq ishlamaydi",
        "Qo'ng'iroq qilish uchun ilovani to'liq native build sifatida o'rnating. Expo Go da WebRTC qo'llab-quvvatlanmaydi.",
      );
      return;
    }
    if (Platform.OS !== 'web') {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
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

    // Get local media
    this.localStream = await this._getMediaStream(type);
    const pc = this._createPeerConnection();
    if (!pc) return;

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
  }

  async handleIncomingCall(callId, callerId, callerName, type) {
    if (Platform.OS !== 'web') {
      await Audio.requestPermissionsAsync();
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
    }
  }

  async declineCall() {
    if (!this.current.callId) return;
    try {
      await apiClient.post(`/calls/${this.current.callId}/decline`);
    } catch (e) {
      console.error('declineCall error:', e);
    }
    this.cleanup();
  }

  async endCall() {
    if (!this.current.callId) return;
    try {
      await apiClient.post(`/calls/${this.current.callId}/end`);
    } catch (e) {
      console.error('endCall error:', e);
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

  handleCallAnswered() {
    this.update({ state: 'connected' });
    this.startTimer();
  }

  handleCallDeclined() {
    this.cleanup();
  }

  handleCallEnded() {
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
    this._stopSignaling();
    this.update({ ...DEFAULT_CALL });
  }
}

export const callService = new CallService();
