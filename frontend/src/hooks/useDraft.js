import { useCallback, useEffect, useRef, useState } from 'react';

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Borrador local: sobrevive a recargas y a una sesión vencida a mitad de la edición
export function useDraft(key, initial) {
  const storageKey = `uf:draft:${key}`;
  const initialRef = useRef(initial);
  const [value, setValue] = useState(() => {
    const saved = read(storageKey);
    return saved ? { ...initial, ...saved } : initial;
  });

  useEffect(() => {
    if (value === initialRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* sin storage: queda en memoria */ }
  }, [storageKey, value]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch { /* nada */ }
    initialRef.current = initial;
    setValue(initial);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue, clear];
}
