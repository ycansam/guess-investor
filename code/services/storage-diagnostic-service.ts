/**
 * Herramienta de diagnóstico para ver/exportar datos de AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

class StorageDiagnosticService {
  /**
   * Listar todas las claves en AsyncStorage
   */
  async listAllKeys(): Promise<readonly string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      console.log('\n========== ASYNCSTORAGE KEYS ==========');
      console.log(`Total: ${keys.length} claves`);
      keys.forEach((key, i) => console.log(`  ${i + 1}. ${key}`));
      console.log('========================================\n');
      return keys;
    } catch (error) {
      console.error('Error listando claves:', error);
      return [];
    }
  }

  /**
   * Obtener valor de una clave específica
   */
  async getValue(key: string): Promise<any> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      console.error(`Error obteniendo ${key}:`, error);
      return null;
    }
  }

  /**
   * Exportar TODO el contenido de AsyncStorage
   */
  async exportAll(): Promise<Record<string, any>> {
    const keys = await AsyncStorage.getAllKeys();
    const result: Record<string, any> = {};

    for (const key of keys) {
      result[key] = await this.getValue(key);
    }

    return result;
  }

  /**
   * Mostrar diagnóstico completo en consola
   */
  async runDiagnostic(): Promise<string> {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           DIAGNÓSTICO DE ASYNCSTORAGE                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    
    const keys = await this.listAllKeys();
    
    if (keys.length === 0) {
      console.log('⚠️  AsyncStorage está VACÍO');
      return 'VACÍO';
    }

    const allData: Record<string, any> = {};

    for (const key of keys) {
      const value = await this.getValue(key);
      allData[key] = value;
      
      console.log(`\n📦 Clave: "${key}"`);
      console.log('─'.repeat(50));
      
      if (value === null) {
        console.log('  (vacío)');
      } else if (typeof value === 'object') {
        if (Array.isArray(value)) {
          console.log(`  Array con ${value.length} elementos`);
          if (value.length > 0 && value.length <= 5) {
            value.forEach((item, i) => {
              console.log(`    [${i}]:`, JSON.stringify(item).substring(0, 100) + '...');
            });
          } else if (value.length > 5) {
            console.log(`    Primeros 3:`, value.slice(0, 3).map(v => JSON.stringify(v).substring(0, 50)));
          }
        } else {
          const objKeys = Object.keys(value);
          console.log(`  Objeto con ${objKeys.length} propiedades`);
          if (objKeys.length <= 10) {
            objKeys.forEach(k => {
              const v = value[k];
              const preview = typeof v === 'object' ? JSON.stringify(v).substring(0, 60) + '...' : v;
              console.log(`    "${k}": ${preview}`);
            });
          } else {
            console.log(`    Propiedades: ${objKeys.slice(0, 5).join(', ')}...`);
          }
        }
      } else {
        console.log(`  Valor: ${String(value).substring(0, 100)}`);
      }
    }

    // Crear JSON exportable
    const exportJson = JSON.stringify(allData, null, 2);
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    JSON EXPORTABLE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(exportJson);
    console.log('\n═══════════════════ FIN DIAGNÓSTICO ═══════════════════════\n');

    return exportJson;
  }

  /**
   * Copiar datos al clipboard y mostrar alerta
   */
  async copyToClipboard(): Promise<void> {
    try {
      const json = await this.runDiagnostic();
      await Clipboard.setStringAsync(json);
      Alert.alert(
        '📋 Copiado al portapapeles',
        'Los datos de AsyncStorage han sido copiados. Puedes pegarlos donde necesites.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error copiando:', error);
      Alert.alert('Error', 'No se pudo copiar al portapapeles');
    }
  }

  /**
   * Buscar claves relacionadas con predicciones/training
   */
  async findPredictionData(): Promise<{
    trainingCache: any;
    predictions: any;
    favorites: any;
    other: Record<string, any>;
  }> {
    const keys = await AsyncStorage.getAllKeys();
    
    const result = {
      trainingCache: null as any,
      predictions: null as any,
      favorites: null as any,
      other: {} as Record<string, any>,
    };

    for (const key of keys) {
      const value = await this.getValue(key);
      const keyLower = key.toLowerCase();

      if (keyLower.includes('training') || keyLower.includes('cache')) {
        result.trainingCache = { key, value };
        console.log(`🎯 Training cache encontrado: "${key}"`);
      } else if (keyLower.includes('prediction')) {
        result.predictions = { key, value };
        console.log(`🎯 Predictions encontrado: "${key}"`);
      } else if (keyLower.includes('favorite')) {
        result.favorites = { key, value };
        console.log(`🎯 Favorites encontrado: "${key}"`);
      } else {
        result.other[key] = value;
      }
    }

    return result;
  }
}

export const storageDiagnosticService = new StorageDiagnosticService();
