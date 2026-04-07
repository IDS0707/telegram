import { Audio } from 'expo-av';
import { wsService } from './websocket';
import apiClient from './api';

type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface CallInfo {
  callId: string | null;
  callType: 'voice' | 'video';
  remoteUserId: string;
  remoteUserName: string;
  state: CallState;
  duration: number;
  isMuted: boolean;
}

type CallStateListener = (state: CallInfo) => void;

class CallService {
  private currentCall: CallInfo = {
    callId: null,
    callType: 'voice',
    remoteUserId: '',
    remoteUserName: '',
    state: 'idle',
    duration: 0,
    isMuted: false,
  };

  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<CallStateListener> = new Set();
  private sound: Audio.Sound | null = null;

  get call(): CallInfo {
    return { ...this.currentCall };
  }

  addListener(listener: CallStateListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    const state = this.call;
    this.listeners.forEach((l) => l(state));
  }

  private updateState(partial: Partial<CallInfo>) {
    this.currentCall = { ...this.currentCall, ...partial };
    this.notify();
  }

  async initiateCall(calleeId: string, calleeName: string, type: 'voice' | 'video') {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const res = await apiClient.post('/calls', {
        callee_id: calleeId,
        call_type: type,
      });

      this.updateState({
        callId: res.data.id,
        callType: type,
        remoteUserId: calleeId,
        remoteUserName: calleeName,
        state: 'calling',
        duration: 0,
        isMuted: false,
      });
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  async handleIncomingCall(callId: string, callerId: string, callerName: string, type: 'voice' | 'video') {
    await Audio.requestPermissionsAsync();

    this.updateState({
      callId,
      callType: type,
      remoteUserId: callerId,
      remoteUserName: callerName,
      state: 'ringing',
      duration: 0,
      isMuted: false,
    });
  }

  async answerCall() {
    if (!this.currentCall.callId) return;

    try {
      await apiClient.post(`/calls/${this.currentCall.callId}/answer`);
      this.updateState({ state: 'connected' });
      this.startDurationTimer();
    } catch (err) {
      console.error('Failed to answer call:', err);
    }
  }

  async declineCall() {
    if (!this.currentCall.callId) return;

    try {
      await apiClient.post(`/calls/${this.currentCall.callId}/decline`);
    } catch {}
    this.cleanup();
  }

  async endCall() {
    if (!this.currentCall.callId) return;

    try {
      await apiClient.post(`/calls/${this.currentCall.callId}/end`);
    } catch {}
    this.cleanup();
  }

  toggleMute(): boolean {
    const newMuted = !this.currentCall.isMuted;
    this.updateState({ isMuted: newMuted });
    return newMuted;
  }

  handleCallAnswered() {
    this.updateState({ state: 'connected' });
    this.startDurationTimer();
  }

  handleCallDeclined() {
    this.cleanup();
  }

  handleCallEnded() {
    this.cleanup();
  }

  private startDurationTimer() {
    this.durationTimer = setInterval(() => {
      this.updateState({ duration: this.currentCall.duration + 1 });
    }, 1000);
  }

  cleanup() {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.sound) {
      this.sound.stopAsync().catch(() => {});
      this.sound.unloadAsync().catch(() => {});
      this.sound = null;
    }
    this.updateState({
      callId: null,
      state: 'idle',
      duration: 0,
      isMuted: false,
      remoteUserId: '',
      remoteUserName: '',
    });
  }
}

export const callService = new CallService();
