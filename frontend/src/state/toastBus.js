// Bus fuera de React para que el QueryClient (y cualquier módulo) pueda mostrar toasts
const listeners = new Set();
let seq = 0;

function show(kind, message, opts = {}) {
  const toast = { id: ++seq, kind, message, ...opts };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export const toastBus = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  success: (message, opts) => show('success', message, opts),
  error: (message, opts) => show('error', message, opts),
  info: (message, opts) => show('info', message, opts),
};
