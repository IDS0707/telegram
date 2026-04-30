// Media search and filtering utility
export function filterMessagesByType(messages, filterType) {
  if (!filterType || filterType === 'all') return messages;
  
  const typeMap = {
    images: ['image', 'sticker'],
    videos: ['video', 'video_note'],
    documents: ['file'],
    links: ['text'], // text messages with URLs
  };

  const types = typeMap[filterType] || [];
  
  return messages.filter((msg) => {
    if (filterType === 'links') {
      // Check if text contains URL
      return /https?:\/\//.test(msg.content || '');
    }
    return types.includes(msg.message_type);
  });
}

export function searchMessagesForKeyword(messages, keyword) {
  if (!keyword || keyword.trim().length === 0) return messages;
  const lowerKeyword = keyword.toLowerCase();
  
  return messages.filter((msg) => {
    const content = msg.content || '';
    const fileName = msg.file_name || '';
    const locationTitle = msg.location_title || '';
    
    return (
      content.toLowerCase().includes(lowerKeyword) ||
      fileName.toLowerCase().includes(lowerKeyword) ||
      locationTitle.toLowerCase().includes(lowerKeyword)
    );
  });
}

export const MEDIA_FILTER_TABS = [
  { id: 'all', label: 'Barcha', icon: 'list' },
  { id: 'images', label: 'Rasmlar', icon: 'image' },
  { id: 'videos', label: 'Videolar', icon: 'film' },
  { id: 'documents', label: 'Hujjatlar', icon: 'document' },
  { id: 'links', label: 'Havolalar', icon: 'link' },
];
