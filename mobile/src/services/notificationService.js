import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Web da expo-notifications listenerlari mavjud emas — handler ham web da
// kerak emas. Faqat native platformalarda o'rnatamiz. SDK 54 da `shouldShowAlert`
// deprecated bo'lib `shouldShowBanner` + `shouldShowList` ga ajratilgan.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // Backwards compatibility for older runtimes that still read shouldShowAlert.
      shouldShowAlert: true,
    }),
  });
}

// Web push helpers (browser Notification API). No service-worker backend
// required — these surface a system notification when the tab is in the
// background (most browsers also show them when the tab is hidden).
function isWebNotificationSupported() {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && typeof window.Notification !== 'undefined';
}

function shouldShowWebNotification() {
  // Don't double-notify if the user is already looking at the page.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return false;
  }
  return true;
}

class NotificationService {
  async requestPermissions() {
    // ── Web: browser Notification API ────────────────────────────
    if (Platform.OS === 'web') {
      if (!isWebNotificationSupported()) return false;
      try {
        if (window.Notification.permission === 'granted') return true;
        if (window.Notification.permission === 'denied') return false;
        const result = await window.Notification.requestPermission();
        return result === 'granted';
      } catch {
        return false;
      }
    }

    // ── Native: Android channels + permission prompt ─────────────
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 500, 500],
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  async showMessageNotification(senderName, messageText, chatId) {
    // Web — surface a browser notification when the tab is hidden.
    if (Platform.OS === 'web') {
      if (!isWebNotificationSupported()) return;
      if (!shouldShowWebNotification()) return;
      if (window.Notification.permission !== 'granted') return;
      try {
        const n = new window.Notification(senderName, {
          body: messageText || '📎 Attachment',
          tag: `msg-${chatId}`, // reuse the slot per chat — collapses spam
          renotify: false,
          icon: '/favicon.ico',
        });
        // Focus the tab + dismiss when the user clicks the notification.
        n.onclick = () => {
          try { window.focus(); } catch {}
          n.close();
        };
      } catch (e) {
        console.warn('[notifications] show failed', e);
      }
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: senderName,
        body: messageText || '📎 Attachment',
        sound: 'default',
        android: {
          channelId: 'messages',
          priority: 'high',
          smallIcon: 'ic_launcher',
          color: '#2196F3',
        },
        data: { chatId },
      },
      trigger: null, // show immediately
    });
  }

  async showCallNotification(callerName, callType) {
    if (Platform.OS === 'web') {
      if (!isWebNotificationSupported()) return;
      // Calls always surface even when the tab is visible — they're urgent.
      if (window.Notification.permission !== 'granted') return;
      try {
        const icon = callType === 'video' ? '📹' : '📞';
        const n = new window.Notification(
          `${icon} ${callType === 'video' ? 'Video' : 'Ovozli'} qo'ng'iroq`,
          {
            body: `${callerName} sizga qo'ng'iroq qilmoqda`,
            tag: 'incoming-call',
            renotify: true,
            requireInteraction: true,
            icon: '/favicon.ico',
          }
        );
        n.onclick = () => {
          try { window.focus(); } catch {}
          n.close();
        };
      } catch (e) {
        console.warn('[notifications] call show failed', e);
      }
      return;
    }

    const icon = callType === 'video' ? '📹' : '📞';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${icon} Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
        body: `${callerName} is calling you`,
        sound: 'default',
        android: {
          channelId: 'calls',
          priority: 'max',
          smallIcon: 'ic_launcher',
          color: '#4CAF50',
          ongoing: false,
        },
        data: { type: 'call' },
      },
      trigger: null,
    });
  }

  async dismissAll() {
    if (Platform.OS === 'web') return;
    await Notifications.dismissAllNotificationsAsync();
  }
}

export const notificationService = new NotificationService();
