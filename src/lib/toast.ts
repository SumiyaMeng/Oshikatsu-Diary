type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string): void {
  listeners.forEach((f) => f(msg));
  clearTimeout(timer);
  timer = setTimeout(() => listeners.forEach((f) => f(null)), 2800);
}
export function onToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
