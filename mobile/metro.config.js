const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Fix: react-native-screens has 'react-native' field pointing to src/index (TypeScript)
// which Metro cannot compile. Force it to use the compiled lib/commonjs/index instead.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native-screens' &&
    (platform === 'android' || platform === 'ios')
  ) {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/react-native-screens/lib/commonjs/index.js'
      ),
      type: 'sourceFile',
    };
  }
  // Safe wrapper: in Expo Go the WebRTC native module is not registered.
  // The stub checks at runtime and only loads the real module in a native build.
  if (moduleName === 'react-native-webrtc') {
    return {
      filePath: path.resolve(__dirname, 'src/stubs/react-native-webrtc.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
