/**
 * Servicio de Favoritos Simplificado
 * Usa el backend en lugar de AsyncStorage
 */

import { apiClient } from './api-client';

class FavoritesService {
  private favorites: Set<string> = new Set();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const response = await apiClient.getFavorites();
      this.favorites = new Set(response.map(f => f.symbol));
      this.initialized = true;
      console.log(`[Favorites] Loaded ${this.favorites.size} favorites from backend`);
    } catch (error) {
      console.error('[Favorites] Error loading from backend:', error);
      this.initialized = true;
    }
  }

  isFavorite(symbol: string): boolean {
    return this.favorites.has(symbol);
  }

  async add(symbol: string, name?: string, assetType?: string): Promise<void> {
    try {
      await apiClient.addFavorite(symbol, name, assetType);
      this.favorites.add(symbol);
    } catch (error) {
      console.error('[Favorites] Error adding:', error);
      throw error;
    }
  }

  async remove(symbol: string): Promise<void> {
    try {
      await apiClient.removeFavorite(symbol);
      this.favorites.delete(symbol);
    } catch (error) {
      console.error('[Favorites] Error removing:', error);
      throw error;
    }
  }

  async toggle(symbol: string, name?: string, assetType?: string): Promise<boolean> {
    try {
      // Usar el endpoint atómico del backend
      const result = await apiClient.toggleFavorite(symbol, name, assetType);
      
      // Actualizar caché local
      if (result.isFavorite) {
        this.favorites.add(symbol);
      } else {
        this.favorites.delete(symbol);
      }
      
      return result.isFavorite;
    } catch (error) {
      console.error('[Favorites] Error toggling:', error);
      throw error;
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
