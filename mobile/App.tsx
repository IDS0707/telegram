import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { wsService } from './src/services/websocket';
import { Colors } from './src/theme/colors';

export default function App() {
  const { isLoading, loadStoredAuth, isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Handle incoming calls via WebSocket
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleIncomingCall = (payload: any) => {
      // In a full app you'd show an overlay or push notification
      // For now we log it – the navigation would need a ref for this
      console.log('Incoming call:', payload);
    };

    wsService.on('incoming_call', handleIncomingCall);
    return () => {
      wsService.off('incoming_call', handleIncomingCall);
    };
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <AppNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
});
