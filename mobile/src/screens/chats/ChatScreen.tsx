import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { format } from 'date-fns';
import apiClient from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { API, BASE_URL } from '../../../config/api';
import { Colors } from '../../theme/colors';

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  message_type: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number;
  mime_type: string | null;
  duration: number;
  is_read: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  sender: any;
  reply_to: any;
}

export default function ChatScreen({ route, navigation }: any) {
  const { chatId, chatName, otherUser } = route.params ?? {};
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const user = useAuthStore((s) => s.user);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{chatName}</Text>
          {typing && (
            <Text style={{ color: '#cce5ff', fontSize: 12 }}>typing...</Text>
          )}
          {!typing && otherUser && (
            <Text style={{ color: '#cce5ff', fontSize: 12 }}>
              {otherUser.is_online ? 'online' : 'last seen recently'}
            </Text>
          )}
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16, marginRight: 12 }}>
          <TouchableOpacity onPress={() => handleCall('voice')}>
            <Ionicons name="call-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCall('video')}>
            <Ionicons name="videocam-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [chatName, typing, otherUser]);

  const loadMessages = async () => {
    try {
      const res = await apiClient.get(`/chats/${chatId}/messages?limit=50`);
      setMessages((res.data || []).reverse());
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    // Mark as read
    apiClient.post(`/chats/${chatId}/messages/read`).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    const handleNewMsg = (payload: Message) => {
      if (payload.chat_id === chatId) {
        setMessages((prev) => [...prev, payload]);
        apiClient.post(`/chats/${chatId}/messages/read`).catch(() => {});
      }
    };
    const handleEdited = (payload: Message) => {
      if (payload.chat_id === chatId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.id ? { ...m, ...payload } : m))
        );
      }
    };
    const handleDeleted = (payload: any) => {
      if (payload.chat_id === chatId) {
        setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
      }
    };
    const handleTyping = (payload: any) => {
      if (payload.chat_id === chatId && payload.user_id !== user?.id) {
        setTyping(payload.user_id);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTyping(null), 3000);
      }
    };
    const handleStopTyping = (payload: any) => {
      if (payload.chat_id === chatId) {
        setTyping(null);
      }
    };

    wsService.on('new_message', handleNewMsg);
    wsService.on('message_edited', handleEdited);
    wsService.on('message_deleted', handleDeleted);
    wsService.on('typing', handleTyping);
    wsService.on('stop_typing', handleStopTyping);

    return () => {
      wsService.off('new_message', handleNewMsg);
      wsService.off('message_edited', handleEdited);
      wsService.off('message_deleted', handleDeleted);
      wsService.off('typing', handleTyping);
      wsService.off('stop_typing', handleStopTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chatId, user?.id]);

  const handleCall = (type: 'voice' | 'video') => {
    if (otherUser) {
      navigation.navigate('Call', {
        calleeId: otherUser.id,
        calleeName: otherUser.display_name,
        callType: type,
        isIncoming: false,
      });
    }
  };

  const sendTextMessage = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      await apiClient.post(`/chats/${chatId}/messages`, {
        content: inputText.trim(),
      });
      setInputText('');
      wsService.send('stop_typing', { chat_id: chatId });
    } catch (err) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    wsService.send('typing', { chat_id: chatId });
    typingTimeoutRef.current = setTimeout(() => {
      wsService.send('stop_typing', { chat_id: chatId });
    }, 3000);
  };

  const pickImage = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'media.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      try {
        await apiClient.post(`/chats/${chatId}/messages/file`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err) {
        Alert.alert('Error', 'Failed to send media');
      }
    }
  };

  const pickDocument = async () => {
    setShowAttach(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        } as any);

        await apiClient.post(`/chats/${chatId}/messages/file`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to send file');
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (uri) {
      const formData = new FormData();
      formData.append('voice', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);

      try {
        await apiClient.post(`/chats/${chatId}/messages/voice`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err) {
        Alert.alert('Error', 'Failed to send voice message');
      }
    }
  };

  const deleteMessage = (msgId: string) => {
    Alert.alert('Delete message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/chats/${chatId}/messages/${msgId}`);
          } catch {}
        },
      },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    const time = format(new Date(item.created_at), 'HH:mm');

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => isMe && deleteMessage(item.id)}
        style={[
          styles.messageBubble,
          isMe ? styles.myMessage : styles.otherMessage,
        ]}
      >
        {!isMe && item.sender && (
          <Text style={styles.senderName}>{item.sender.display_name}</Text>
        )}

        {item.reply_to && (
          <View style={styles.replyContainer}>
            <Text style={styles.replyName}>{item.reply_to.sender?.display_name}</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {item.reply_to.content || 'Media'}
            </Text>
          </View>
        )}

        {item.message_type === 'text' && (
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {item.content}
          </Text>
        )}

        {item.message_type === 'image' && item.file_url && (
          <Image
            source={{ uri: `${BASE_URL}${item.file_url}` }}
            style={styles.messageImage}
            resizeMode="cover"
          />
        )}

        {item.message_type === 'video' && (
          <View style={styles.mediaPlaceholder}>
            <Ionicons name="play-circle" size={48} color="#fff" />
            <Text style={styles.mediaText}>Video</Text>
          </View>
        )}

        {item.message_type === 'voice' && (
          <View style={styles.voiceContainer}>
            <Ionicons name="mic" size={20} color={isMe ? '#2e7d32' : Colors.light.primary} />
            <View style={styles.voiceWave} />
            <Text style={styles.voiceDuration}>
              {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
            </Text>
          </View>
        )}

        {item.message_type === 'audio' && (
          <View style={styles.fileContainer}>
            <Ionicons name="musical-notes" size={32} color={Colors.light.primary} />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
              <Text style={styles.fileSize}>{formatFileSize(item.file_size)}</Text>
            </View>
          </View>
        )}

        {item.message_type === 'file' && (
          <View style={styles.fileContainer}>
            <Ionicons name="document" size={32} color={Colors.light.primary} />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
              <Text style={styles.fileSize}>{formatFileSize(item.file_size)}</Text>
            </View>
          </View>
        )}

        {item.content && item.message_type !== 'text' && (
          <Text style={[styles.caption, isMe && styles.myMessageText]}>{item.content}</Text>
        )}

        <View style={styles.messageFooter}>
          {item.is_edited && <Text style={styles.editedLabel}>edited</Text>}
          <Text style={[styles.messageTime, isMe && styles.myMessageTime]}>{time}</Text>
          {isMe && (
            <Ionicons
              name={item.is_read ? 'checkmark-done' : 'checkmark'}
              size={14}
              color={item.is_read ? '#4fc3f7' : (isMe ? '#90a4ae' : '#bbb')}
              style={{ marginLeft: 2 }}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      </View>

      {showAttach && (
        <View style={styles.attachMenu}>
          <TouchableOpacity style={styles.attachOption} onPress={pickImage}>
            <Ionicons name="image" size={28} color={Colors.light.primary} />
            <Text style={styles.attachLabel}>Photo/Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
            <Ionicons name="document" size={28} color="#ff9800" />
            <Text style={styles.attachLabel}>Document</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setShowAttach(!showAttach)}
        >
          <Ionicons
            name={showAttach ? 'close' : 'attach'}
            size={24}
            color={Colors.light.textSecondary}
          />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          placeholder="Message"
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={handleTextChange}
          multiline
          maxLength={4096}
        />

        {inputText.trim() ? (
          <TouchableOpacity style={styles.sendButton} onPress={sendTextMessage}>
            <Ionicons name="send" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, isRecording && styles.recordingButton]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            <Ionicons name="mic" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.chatBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.chatBackground,
  },
  chatArea: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginVertical: 2,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.light.myMessageBubble,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.otherMessageBubble,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: Colors.light.text,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#000',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  messageTime: {
    fontSize: 11,
    color: '#90a4ae',
  },
  myMessageTime: {
    color: '#6ea06e',
  },
  editedLabel: {
    fontSize: 10,
    color: '#90a4ae',
    marginRight: 4,
    fontStyle: 'italic',
  },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginVertical: 4,
  },
  mediaPlaceholder: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  mediaText: {
    color: '#fff',
    marginTop: 4,
    fontSize: 12,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 140,
  },
  voiceWave: {
    flex: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    marginHorizontal: 8,
  },
  voiceDuration: {
    fontSize: 12,
    color: '#90a4ae',
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 180,
  },
  fileInfo: {
    marginLeft: 10,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.text,
  },
  fileSize: {
    fontSize: 12,
    color: '#90a4ae',
    marginTop: 2,
  },
  caption: {
    fontSize: 14,
    color: Colors.light.text,
    marginTop: 4,
  },
  replyContainer: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.light.primary,
    paddingLeft: 8,
    marginBottom: 4,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  replyText: {
    fontSize: 12,
    color: '#90a4ae',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.light.background,
    borderTopWidth: 0.5,
    borderTopColor: Colors.light.border,
  },
  attachButton: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: Colors.light.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    color: Colors.light.text,
    marginHorizontal: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButton: {
    backgroundColor: Colors.light.danger,
  },
  attachMenu: {
    flexDirection: 'row',
    backgroundColor: Colors.light.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: Colors.light.border,
    gap: 24,
  },
  attachOption: {
    alignItems: 'center',
    width: 70,
  },
  attachLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
});
