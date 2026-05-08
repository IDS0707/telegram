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

class NotificationService {
  async requestPermissions() {
    if (Platform.OS === 'web') return false;
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
    if (Platform.OS === 'web') return;
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
    if (Platform.OS === 'web') return;
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
