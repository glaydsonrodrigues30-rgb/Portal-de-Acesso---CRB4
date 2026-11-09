/**
 * Helper de cache por sessão (sessionStorage com fallback em memória)
 * Utilizado para redução drástica de leituras no plano gratuito do Firebase (Spark).
 */

const memoryCache = new Map<string, { timestamp: number; data: any }>();

export function getSessionCache<T>(key: string, maxAgeMs: number = 10 * 60 * 1000): T | null {
  try {
    // 1. Tentar ler do sessionStorage
    const stored = sessionStorage.getItem(`crb4_cache_${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < maxAgeMs) {
        return parsed.data as T;
      }
      sessionStorage.removeItem(`crb4_cache_${key}`);
    }
  } catch {
    // Fallback para memória se sessionStorage não estiver disponível
  }

  const mem = memoryCache.get(key);
  if (mem) {
    if (Date.now() - mem.timestamp < maxAgeMs) {
      return mem.data as T;
    }
    memoryCache.delete(key);
  }

  return null;
}

export function setSessionCache<T>(key: string, data: T): void {
  const payload = { timestamp: Date.now(), data };
  try {
    sessionStorage.setItem(`crb4_cache_${key}`, JSON.stringify(payload));
  } catch {
    // se exceder cota do storage ou falhar, salva em memória
  }
  memoryCache.set(key, payload);
}

export function clearSessionCache(prefix?: string): void {
  try {
    if (!prefix) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('crb4_cache_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
      memoryCache.clear();
    } else {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(`crb4_cache_${prefix}`)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
      for (const k of memoryCache.keys()) {
        if (k.startsWith(prefix)) {
          memoryCache.delete(k);
        }
      }
    }
  } catch {
    memoryCache.clear();
  }
}
