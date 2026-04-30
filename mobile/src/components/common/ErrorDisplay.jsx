import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';

/**
 * ErrorDisplay - Xato xabarlarini ko'rsatish komponenti
 * 
 * @param {Object} error - Axios yoki boshqa xato obyekti
 * @param {Function} onRetry - Qayta urinish funksiyasi (optional)
 */
export default function ErrorDisplay({ error, onRetry, style }) {
  if (!error) return null;

  // Xato xabarini aniqlash
  const errorMessage = error.userMessage || error.message || 'Kutilmagan xato yuz berdi';
  const isNetworkError = error.isNetworkError || !error.response;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{isNetworkError ? '📡' : '⚠️'}</Text>
        <Text style={styles.message}>{errorMessage}</Text>
        
        {onRetry && (
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={onRetry}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Qayta urinish</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
