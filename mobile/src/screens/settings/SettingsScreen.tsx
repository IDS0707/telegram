import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../theme/colors';

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const [notifications, setNotifications] = useState(true);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const menuItems = [
    {
      icon: 'notifications-outline',
      title: 'Notifications and Sounds',
      right: (
        <Switch
          value={notifications}
          onValueChange={setNotifications}
          trackColor={{ false: '#ccc', true: Colors.light.primary }}
        />
      ),
    },
    {
      icon: 'lock-closed-outline',
      title: 'Privacy and Security',
      onPress: () => {},
    },
    {
      icon: 'chatbubble-outline',
      title: 'Chat Settings',
      onPress: () => {},
    },
    {
      icon: 'folder-outline',
      title: 'Data and Storage',
      onPress: () => {},
    },
    {
      icon: 'color-palette-outline',
      title: 'Appearance',
      onPress: () => {},
    },
    {
      icon: 'language-outline',
      title: 'Language',
      value: 'English',
      onPress: () => {},
    },
    {
      icon: 'help-circle-outline',
      title: 'Help',
      onPress: () => {},
    },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* User card */}
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => navigation.navigate('Profile')}
      >
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>
            {user?.display_name?.[0]?.toUpperCase() || 'U'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.display_name}</Text>
          <Text style={styles.userPhone}>{user?.phone}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
      </TouchableOpacity>

      {/* Menu items */}
      <View style={styles.menuSection}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <Ionicons name={item.icon as any} size={22} color={Colors.light.primary} />
            <Text style={styles.menuTitle}>{item.title}</Text>
            <View style={styles.menuRight}>
              {item.value && <Text style={styles.menuValue}>{item.value}</Text>}
              {item.right || (
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={Colors.light.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Telegram Clone v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.surface,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.light.background,
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  menuSection: {
    backgroundColor: Colors.light.background,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  menuTitle: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    marginLeft: 16,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuValue: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginRight: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.light.background,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.light.danger,
    marginLeft: 16,
  },
  version: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    fontSize: 12,
    marginVertical: 24,
  },
});
