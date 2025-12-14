/**
 * Servicio de CORS Proxy con fallback automático
 * Intenta múltiples proxies hasta encontrar uno que funcione
 */

// Lista de proxies CORS ordenados por confiabilidad
// Actualizado: allorigins está dando 500, movido al final
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://proxy.cors.sh/',
  'https://api.allorigins.win/raw?url=',
];

/**
 * Realiza una petición a través de un proxy CORS con fallback automático
 * @param url URL original a la que se quiere acceder
 * @param options Opciones de fetch opcionales
 * @returns Response de la petición exitosa
 */
export async function fetchWithCorsProxy(
  url: string,
  options?: RequestInit
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const proxyName = new URL(proxy).hostname;
      
      console.log(`[CorsProxy] Intentando: ${proxyName}`);
      
      const response = await fetch(proxyUrl, {
        ...options,
        signal: options?.signal || AbortSignal.timeout(10000),
      });
      
      // Considerar 5xx como fallo del proxy, no del destino
      if (response.ok) {
        console.log(`[CorsProxy] Éxito con: ${proxyName}`);
        return response;
      } else if (response.status >= 500) {
        console.warn(`[CorsProxy] ${proxyName} error de servidor: HTTP ${response.status}, probando siguiente...`);
        lastError = new Error(`Proxy ${proxyName} devolvió ${response.status}`);
        continue; // Probar siguiente proxy
      } else {
        // 4xx significa que el proxy funcionó pero el destino falló
        console.warn(`[CorsProxy] ${proxyName} retornó HTTP ${response.status} (error del destino)`);
        return response;
      }
    } catch (error) {
      const proxyName = new URL(proxy).hostname;
      console.warn(`[CorsProxy] ${proxyName} falló:`, error);
      lastError = error as Error;
    }
  }
  
  throw lastError || new Error('Todos los proxies CORS fallaron');
}

/**
 * Obtiene la URL con proxy (para casos donde se necesita la URL directamente)
 * Usa el primer proxy de la lista
 */
export function getProxiedUrl(url: string): string {
  return `${CORS_PROXIES[0]}${encodeURIComponent(url)}`;
}
