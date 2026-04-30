// GIF and Sticker search service
// Integrates with public APIs or local sticker packs

export async function searchGifs(query) {
  if (!query || query.trim().length === 0) return [];
  
  try {
    // Using Tenor API (public endpoints don't require key for basic search)
    const response = await fetch(
      `https://tenor.googleapis.com/client_api/?q=${encodeURIComponent(query)}&key=AAAAAAAAAAA&limit=20&media_filter=minimal`
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.results || []).map((item) => ({
      id: item.id,
      preview: item.media_formats?.tinygif?.url || item.media_formats?.gif?.url,
      url: item.media_formats?.gif?.url,
      title: query,
    }));
  } catch (e) {
    console.error('GIF search failed', e);
    return [];
  }
}

export async function searchStickers(query) {
  // Placeholder: would integrate with OpenDoodle, Twemoji, or custom sticker API
  // For now, return empty - can be populated with local sticker packs
  return [];
}

export function getPopularEmojis() {
  return [
    '😀', '😂', '❤️', '👍', '🎉', '🎊', '😍', '🔥',
    '💯', '🙌', '😘', '😎', '🤔', '👏', '🤗', '😢',
  ];
}

export function getFrequentEmojis() {
  // Can be persisted via AsyncStorage
  return [];
}

export async function saveEmojiFrequency(emoji) {
  // Would track emoji usage for quick access
}
