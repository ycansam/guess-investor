/**
 * Utilidades de texto para normalización y procesamiento
 */

/**
 * Normaliza texto para comparación (quita acentos y caracteres especiales)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')    // Quitar caracteres especiales
    .replace(/\s+/g, ' ')            // Normalizar espacios
    .trim();
}

/**
 * Extrae palabras del mensaje excluyendo stopwords
 */
export function extractWords(message: string, stopWords: Set<string>): string[] {
  const normalized = normalizeText(message);
  const words = normalized.split(' ');
  
  return words.filter(word => 
    word.length >= 3 && 
    !stopWords.has(word) &&
    !/^\d+$/.test(word) &&           // No números puros
    !/^\d+[a-z]+$/.test(word) &&     // No combinaciones como "15min"
    /^[a-z]+$/.test(word)            // Solo letras
  );
}

/**
 * Busca símbolos en mayúsculas en el texto (ej: AAPL, ITX.MC)
 */
export function extractDirectSymbols(message: string): string[] {
  const symbolPattern = /\b([A-Z]{2,5}(?:\.[A-Z]{1,2})?)\b/g;
  return message.toUpperCase().match(symbolPattern) || [];
}
