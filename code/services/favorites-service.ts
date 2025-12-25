/**
 * Servicio de favoritos
 * Gestiona los activos favoritos del usuario con persistencia
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'user-favorites';

class FavoritesService {
  private favorites: Set<string> = new Set();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.favorites = new Set(parsed);
      }
      this.initialized = true;
      console.log(`[Favorites] Loaded ${this.favorites.size} favorites`);
    } catch (error) {
      console.error('[Favorites] Error loading:', error);
      this.initialized = true;
    }
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...this.favorites]));
    } catch (error) {
      console.error('[Favorites] Error saving:', error);
    }
  }

  isFavorite(symbol: string): boolean {
    return this.favorites.has(symbol);
  }

  async add(symbol: string): Promise<void> {
    this.favorites.add(symbol);
    await this.save();
  }

  async remove(symbol: string): Promise<void> {
    this.favorites.delete(symbol);
    await this.save();
  }

  async toggle(symbol: string): Promise<boolean> {
    if (this.favorites.has(symbol)) {
      this.favorites.delete(symbol);
      await this.save();
      return false;
    } else {
      this.favorites.add(symbol);
      await this.save();
      return true;
    }
  }

  getAll(): string[] {
    return [...this.favorites];
  }

  count(): number {
    return this.favorites.size;
  }
}

export const favoritesService = new FavoritesService();
