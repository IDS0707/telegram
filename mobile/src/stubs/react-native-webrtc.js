'use strict';
/**
 * Safe wrapper for react-native-webrtc.
 *
 * - Web   : expose the browser's native WebRTC APIs from `window` /
 *           `navigator.mediaDevices`. Without this, every PeerConnection
 *           field in the rest of the code is `null` on the web bundle and
 *           call/accept paths silently return early.
 * - Native: try the real module; fall back to no-op stubs in Expo Go
 *           where the native module is unavailable.
 */

const { Platform } = require('react-native');

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  module.exports = {
    // RTCView is a native UI component; on web we render a plain <video>
    // element directly in the screen, so this just returns null.
    RTCView: () => null,
    RTCPeerConnection: window.RTCPeerConnection
      || window.webkitRTCPeerConnection
      || null,
    RTCSessionDescription: window.RTCSessionDescription || null,
    RTCIceCandidate: window.RTCIceCandidate || null,
    MediaStream: window.MediaStream || null,
    mediaDevices: (typeof navigator !== 'undefined' && navigator.mediaDevices)
      ? navigator.mediaDevices
      : {
          getUserMedia: () =>
            Promise.reject(new Error('Brauzeringiz WebRTC ni qo\'llab-quvvatlamaydi')),
          enumerateDevices: () => Promise.resolve([]),
        },
    registerGlobals: () => {},
  };
} else {
  try {
    module.exports = require('react-native-webrtc/lib/commonjs/index.js');
  } catch (e) {
    module.exports = {
      RTCView: () => null,
      RTCPeerConnection: null,
      RTCSessionDescription: null,
      RTCIceCandidate: null,
      MediaStream: null,
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject(new Error('WebRTC is not available in Expo Go')),
        enumerateDevices: () => Promise.resolve([]),
      },
      registerGlobals: () => {},
    };
  }
}
