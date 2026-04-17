import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import { BASE_URL } from '../../../config/api';

export default function StickerPicker({ visible, onClose, onSelectSticker }) {
  const { colors } = useTheme();
  const [stickerSets, setStickerSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) fetchStickerSets();
  }, [visible]);

  const fetchStickerSets = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/stickers');
      const sets = Array.isArray(res.data) ? res.data : [];
      setStickerSets(sets);
      if (sets.length > 0) setSelectedSet(sets[0]);
    } catch (e) {
      console.log('fetchStickerSets error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSticker = (sticker) => {
    onSelectSticker(sticker);
    onClose();
  };

  const currentStickers = selectedSet?.stickers ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Stikerlar</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ margin: 30 }} color={colors.primary} />
          ) : stickerSets.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="happy-outline" size={48} color={colors.textHint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Stikerlar yo'q{'\n'}Stikerlar bo'limidan qo'shing
              </Text>
            </View>
          ) : (
            <>
              {/* Set tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.setTabs, { borderBottomColor: colors.border }]}
              >
                {stickerSets.map(set => (
                  <TouchableOpacity
                    key={set.id}
                    onPress={() => setSelectedSet(set)}
                    style={[
                      styles.setTab,
                      selectedSet?.id === set.id && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                    ]}
                  >
                    {set.stickers?.[0]?.file_url ? (
                      <Image
                        source={{ uri: `${BASE_URL}${set.stickers[0].file_url}` }}
                        style={styles.setThumb}
                      />
                    ) : (
                      <Ionicons name="happy-outline" size={24} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Set name */}
              {selectedSet && (
                <Text style={[styles.setName, { color: colors.textSecondary }]}>{selectedSet.title}</Text>
              )}

              {/* Sticker grid */}
              <FlatList
                data={currentStickers}
                keyExtractor={s => s.id}
                numColumns={5}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSelectSticker(item)}
                    style={styles.stickerCell}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: `${BASE_URL}${item.file_url}` }}
                      style={styles.stickerImg}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ padding: 8 }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  panel: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 380 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  panelTitle: { fontSize: 16, fontWeight: '700' },
  setTabs: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 52 },
  setTab: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  setThumb: { width: 30, height: 30, borderRadius: 6 },
  setName: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 4 },
  stickerCell: { flex: 1 / 5, aspectRatio: 1, padding: 4, alignItems: 'center', justifyContent: 'center' },
  stickerImg: { width: 56, height: 56 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
