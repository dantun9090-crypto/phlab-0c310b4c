import { useState } from 'react';

const STORAGE_KEY = 'php_recently_viewed';
const MAX_ITEMS = 6;

export interface RecentlyViewedItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string;
  category: string;
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const addItem = (item: RecentlyViewedItem) => {
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== item.id);
      const updated = [item, ...filtered].slice(0, MAX_ITEMS);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  };

  const clearItems = () => {
    setItems([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  return { items, addItem, clearItems };
}

/** Read-only — just reads from localStorage, no state updates */
export function getRecentlyViewed(): RecentlyViewedItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
