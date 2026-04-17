import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Show notification even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  async requestPermissions() {
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
    await Notifications.dismissAllNotificationsAsync();
  }
}

export const notificationService = new NotificationService();
