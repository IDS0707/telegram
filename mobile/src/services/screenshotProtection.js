// Screenshot prevention utility for secret chats
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

export async function enableScreenshotProtection() {
  if (Platform.OS === 'web') return; // Web doesn't support this
  try {
    await ScreenCapture.preventScreenCaptureAsync();
  } catch (e) {
    console.log('Screenshot protection not supported', e);
  }
}

export async function disableScreenshotProtection() {
  if (Platform.OS === 'web') return;
  try {
    await ScreenCapture.allowScreenCaptureAsync();
  } catch (e) {
    console.log('Screenshot protection release not supported', e);
  }
}
