import { useEffect, useState } from 'react';

// Preferencias del usuario (filtros, grupos abiertos). Si el storage falla, queda en memoria.
export function usePersistentState(key, initial) {
  const storageKey = `uf:pref:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* nada */ }
  }, [storageKey, value]);
  return [value, setValue];
}
