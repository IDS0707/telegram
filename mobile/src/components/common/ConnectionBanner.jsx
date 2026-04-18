/**
 * ConnectionBanner — Telegram-style connection status bar.
 *
 * States:
 *  connecting  → yellow bar  "Ulanmoqda..."  (with animated dots)
 *  connected   → green bar   "Ulandi"        (shown briefly, then hides)
 *  disconnected→ hidden (app just launched, before first connect)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { wsService } from '../../services/websocket';

const HIDE_DELAY = 1800; // ms to show "Ulandi" before hiding

export default function ConnectionBanner() {
  const [wsStatus, setWsStatus] = useState(wsService.status);
  const [visible, setVisible] = useState(wsService.status === 'connecting');
  const [dots, setDots] = useState('');

  // Slide + fade animation
  const slideAnim = useRef(new Animated.Value(wsService.status === 'connecting' ? 0 : -40)).current;
  const opacityAnim = useRef(new Animated.Value(wsService.status === 'connecting' ? 1 : 0)).current;

  // Dots animation for "connecting" text
  const dotsTimer = useRef(null);

  // Timer to auto-hide after "Ulandi"
  const hideTimer = useRef(null);

  // ── Dots animation ──────────────────────────────────────────────
  const startDots = () => {
    const states = ['', '.', '..', '...'];
    let idx = 0;
    setDots(states[0]);
    dotsTimer.current = setInterval(() => {
      idx = (idx + 1) % states.length;
      setDots(states[idx]);
    }, 280);
  };

  const stopDots = () => {
    if (dotsTimer.current) {
      clearInterval(dotsTimer.current);
      dotsTimer.current = null;
    }
    setDots('');
  };

  // ── Show / hide banner ──────────────────────────────────────────
  const showBanner = () => {
    setVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 160, friction: 14 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const hideBanner = () => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: -40, useNativeDriver: true, tension: 160, friction: 14 }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  // ── React to WS status changes ──────────────────────────────────
  useEffect(() => {
    const unsub = wsService.addStatusListener((status) => {
      setWsStatus(status);

      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      if (status === 'connecting') {
        stopDots();
        showBanner();
        startDots();
      } else if (status === 'connected') {
        stopDots();
        showBanner();
        // Auto-hide after a short moment
        hideTimer.current = setTimeout(() => {
          hideBanner();
        }, HIDE_DELAY);
      } else {
        // 'disconnected' → hide immediately (logout / clean disconnect)
        stopDots();
        hideBanner();
      }
    });

    return () => {
      unsub();
      stopDots();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const isConnecting = wsStatus === 'connecting';
  const bgColor = isConnecting ? '#F5A623' : '#2CB16E';
  const label = isConnecting ? 'Ulanmoqda' : 'Ulandi';

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: bgColor, transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        {isConnecting && <View style={styles.spinner} />}
        <Text style={styles.label}>{label}</Text>
        {isConnecting && <Text style={styles.label}>{dots}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spinner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
