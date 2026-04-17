'use strict';
/**
 * Safe wrapper for react-native-webrtc.
 * Uses try-catch to load the real module in native builds,
 * falls back to stubs in Expo Go where the native module is missing.
 */

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
