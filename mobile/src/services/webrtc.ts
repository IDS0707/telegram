import { API } from '../../config/api';

// ICE servers configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type SignalHandler = (data: any) => void;

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private onRemoteStreamHandler: ((stream: MediaStream) => void) | null = null;
  private onCallEndHandler: (() => void) | null = null;

  get peerConnection() {
    return this.pc;
  }

  get local() {
    return this.localStream;
  }

  get remote() {
    return this.remoteStream;
  }

  onRemoteStream(handler: (stream: MediaStream) => void) {
    this.onRemoteStreamHandler = handler;
  }

  onCallEnd(handler: () => void) {
    this.onCallEndHandler = handler;
  }

  async initializePeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to peer via signaling
        this._sendSignal?.({
          type: 'ice-candidate',
          data: event.candidate,
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamHandler?.(event.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (
        this.pc?.connectionState === 'disconnected' ||
        this.pc?.connectionState === 'failed' ||
        this.pc?.connectionState === 'closed'
      ) {
        this.onCallEndHandler?.();
      }
    };

    return this.pc;
  }

  private _sendSignal: ((data: any) => void) | null = null;

  setSendSignal(fn: (data: any) => void) {
    this._sendSignal = fn;
  }

  async startLocalStream(video: boolean = false): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: video ? { facingMode: 'user' } : false,
    };

    // @ts-ignore – react-native-webrtc provides getUserMedia
    const stream = await (navigator.mediaDevices || (window as any).navigator.mediaDevices)
      .getUserMedia(constraints);
    this.localStream = stream;

    stream.getTracks().forEach((track: MediaStreamTrack) => {
      this.pc?.addTrack(track, stream);
    });

    return stream;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const answer = await this.pc.createAnswer({});
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  cleanup() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
  }
}

export const webrtcService = new WebRTCService();
