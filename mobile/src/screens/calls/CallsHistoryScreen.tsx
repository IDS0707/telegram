import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import apiClient from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { BASE_URL } from '../../../config/api';
import { Colors } from '../../theme/colors';

interface CallItem {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration: number;
  caller: any;
  callee: any;
}

export default function CallsHistoryScreen({ navigation }: any) {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadCalls();
  }, []);

  const loadCalls = async () => {
    try {
      const res = await apiClient.get('/calls/history');
      setCalls(res.data || []);
    } catch (err) {
      console.error('Failed to load calls:', err);
    }
  };

  const getOtherUser = (call: CallItem) => {
    return call.caller_id === user?.id ? call.callee : call.caller;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const renderCall = ({ item }: { item: CallItem }) => {
    const other = getOtherUser(item);
    const isOutgoing = item.caller_id === user?.id;
    const isMissed = item.status === 'missed' || item.status === 'declined';

    return (
      <TouchableOpacity
        style={styles.callItem}
        onPress={() =>
          navigation.navigate('Call', {
            calleeId: other.id,
            calleeName: other.display_name,
            callType: item.call_type,
            isIncoming: false,
          })
        }
      >
        {other.avatar_url ? (
          <Image source={{ uri: `${BASE_URL}${other.avatar_url}` }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{other.display_name?.[0]?.toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.callInfo}>
          <Text style={[styles.callName, isMissed && styles.missedCall]}>
            {other.display_name}
          </Text>
          <View style={styles.callMeta}>
            <Ionicons
              name={isOutgoing ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={isMissed ? Colors.light.danger : Colors.light.success}
            />
            <Text style={styles.callDetail}>
              {item.call_type === 'video' ? 'Video' : 'Voice'} call
              {item.duration > 0 ? ` • ${formatDuration(item.duration)}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.callRight}>
          <Text style={styles.callTime}>
            {format(new Date(item.started_at), 'HH:mm')}
          </Text>
          <Ionicons
            name={item.call_type === 'video' ? 'videocam-outline' : 'call-outline'}
            size={20}
            color={Colors.light.primary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={calls}
        renderItem={renderCall}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={64} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No call history</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  callItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  callInfo: {
    flex: 1,
    marginLeft: 12,
  },
  callName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
  },
  missedCall: {
    color: Colors.light.danger,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  callDetail: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  callRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  callTime: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 150,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginTop: 16,
  },
});
