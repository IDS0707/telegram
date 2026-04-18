import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

const STORAGE_KEY = 'luxchat_media_cache_v1';
const MEDIA_DIR = `${FileSystem.documentDirectory}luxchat-media/`;

function safeExt(fileName = '', remoteUrl = '') {
  const fromName = String(fileName).split('.').pop();
  if (fromName && fromName.length <= 8 && !fromName.includes('/')) return fromName.toLowerCase();
  const clean = String(remoteUrl).split('?')[0].split('#')[0];
  const fromUrl = clean.split('.').pop();
  if (fromUrl && fromUrl.length <= 8 && !fromUrl.includes('/')) return fromUrl.toLowerCase();
  return 'bin';
}

async function ensureMediaDir() {
  if (Platform.OS === 'web') return;
  if (!FileSystem.documentDirectory) throw new Error('documentDirectory is unavailable');
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
}

export async function loadMediaCache() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function saveMediaCache(cache) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export async function ensureDownloadedMedia({ cacheKey, remoteUrl, fileNameHint, onProgress }) {
  if (!cacheKey || !remoteUrl) throw new Error('cacheKey and remoteUrl are required');

  // Web fallback: keep remote URL as cached URI so the button works reliably.
  if (Platform.OS === 'web') {
    const cache = await loadMediaCache();
    const record = {
      localUri: remoteUrl,
      remoteUrl,
      fileName: fileNameHint || null,
      downloadedAt: Date.now(),
    };
    cache[cacheKey] = record;
    await saveMediaCache(cache);
    if (typeof onProgress === 'function') {
      onProgress({ totalBytes: 0, writtenBytes: 0, remainingBytes: 0, progress: 1 });
    }
    return record;
  }

  await ensureMediaDir();

  const cache = await loadMediaCache();
  const existing = cache[cacheKey];
  if (existing?.localUri) {
    const existsInfo = await FileSystem.getInfoAsync(existing.localUri);
    if (existsInfo.exists) {
      if (typeof onProgress === 'function') {
        onProgress({
          totalBytes: existsInfo.size || 0,
          writtenBytes: existsInfo.size || 0,
          remainingBytes: 0,
          progress: 1,
        });
      }
      return existing;
    }
  }

  const ext = safeExt(fileNameHint, remoteUrl);
  const targetPath = `${MEDIA_DIR}${cacheKey.replace(/[^a-zA-Z0-9-_:.]/g, '_')}.${ext}`;

  let result = null;
  if (typeof FileSystem.createDownloadResumable === 'function') {
    const downloadResumable = FileSystem.createDownloadResumable(
      remoteUrl,
      targetPath,
      {},
      (progressData) => {
        if (typeof onProgress !== 'function') return;
        const total = Math.max(0, progressData?.totalBytesExpectedToWrite || 0);
        const written = Math.max(0, progressData?.totalBytesWritten || 0);
        const remaining = Math.max(0, total - written);
        onProgress({
          totalBytes: total,
          writtenBytes: written,
          remainingBytes: remaining,
          progress: total > 0 ? written / total : 0,
        });
      },
    );
    result = await downloadResumable.downloadAsync();
  } else {
    // Fallback for environments where resumable API is unavailable.
    result = await FileSystem.downloadAsync(remoteUrl, targetPath);
  }

  if (!result?.uri) throw new Error('Download failed');
  const record = {
    localUri: result.uri,
    remoteUrl,
    fileName: fileNameHint || null,
    downloadedAt: Date.now(),
  };

  cache[cacheKey] = record;
  await saveMediaCache(cache);
  return record;
}

export async function removeDownloadedMedia(cacheKey) {
  if (!cacheKey) return;
  const cache = await loadMediaCache();
  const existing = cache[cacheKey];
  if (existing?.localUri) {
    const info = await FileSystem.getInfoAsync(existing.localUri);
    if (info.exists) {
      await FileSystem.deleteAsync(existing.localUri, { idempotent: true });
    }
  }
  delete cache[cacheKey];
  await saveMediaCache(cache);
}

export async function saveLocalMediaToGallery(localUri) {
  if (!localUri) throw new Error('localUri is required');

  if (Platform.OS === 'web') {
    window.open(localUri, '_blank', 'noopener,noreferrer');
    return;
  }

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Gallery permission not granted');
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
}
