import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info?.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const errorText = String(this.state.error?.stack || this.state.error?.message || this.state.error);
    const stack = this.state.info?.componentStack ?? '';

    return (
      <View style={styles.root}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Xatolik yuz berdi</Text>
        <Text style={styles.subtitle}>
          Ilovada kutilmagan xato sodir bo'ldi. Qayta urinib ko'ring yoki ilovani yopib qaytadan oching.
        </Text>

        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.85}>
          <Text style={styles.btnText}>Qayta urinish</Text>
        </TouchableOpacity>

        <ScrollView style={styles.details} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.detailsTitle}>Xato tafsiloti</Text>
          <Text style={styles.detailsText} selectable>{errorText}</Text>
          {!!stack && <Text style={styles.detailsText} selectable>{stack}</Text>}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E1621',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 56,
    alignItems: 'center',
  },
  icon: { fontSize: 56, marginBottom: 18 },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  btn: {
    backgroundColor: '#2AABEE',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    minWidth: 180,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  details: {
    marginTop: 28,
    maxHeight: 280,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
  },
  detailsTitle: {
    color: '#FF7777',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  detailsText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
});
