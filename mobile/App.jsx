import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';

// Silence non-essential logs in production builds. Errors and warnings are
// kept so crash-reporting / red-screens still surface real failures.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { wsService } from './src/services/websocket';
import { callService } from './src/services/callService';
import { notificationService } from './src/services/notificationService';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { I18nProvider } from './src/i18n/I18nContext';
import ErrorBoundary from './src/components/common/ErrorBoundary';

function AppContent() {
  const { isLoading, loadStoredAuth, isAuthenticated, user } = useAuthStore();
  const { isDark, colors } = useTheme();
  const navigationRef = useRef(null);

  useEffect(() => {
    loadStoredAuth();
    notificationService.requestPermissions();
  }, []);  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // New message notification
    const handleNewMsg = (payload) => {
      // Only notify if message is NOT from current user
      if (payload.sender_id === user.id) return;
      const senderName = payload.sender?.display_name ?? 'New message';
      const body = payload.message_type === 'text'
        ? payload.content
        : payload.message_type === 'image' ? '📷 Photo'
        : payload.message_type === 'video' ? '🎥 Video'
        : payload.message_type === 'voice' ? '🎤 Voice'
        : '📎 Attachment';
      notificationService.showMessageNotification(senderName, body, payload.chat_id);
    };
    wsService.on('new_message', handleNewMsg);
    return () => { wsService.off('new_message', handleNewMsg); };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const handleIncomingCall = async (payload) => {
      try {
        const callerName = payload.caller?.display_name ?? 'Unknown';
        const callType = payload.call_type ?? 'voice';
        await callService.handleIncomingCall(
          payload.id,
          payload.caller_id,
          callerName,
          callType,
        );
        notificationService.showCallNotification(callerName, callType);
        if (navigationRef.current) {
          navigationRef.current.navigate('Call');
        }
      } catch (e) {
        console.error('Incoming call error:', e);
      }
    };
    wsService.on('incoming_call', handleIncomingCall);
    return () => { wsService.off('incoming_call', handleIncomingCall); };
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary, notification: colors.primary } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary, notification: colors.primary } };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <ThemeProvider>
            <I18nProvider>
              <AppContent />
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
