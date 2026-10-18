import { ref, watch, type Ref } from "vue";

/** useStoredSize is a size in pixels, kept in the browser (localStorage, by
 * key) across visits: def when none was kept, always between min and max.
 * begin and drag make it follow a ResizeHandle (drag's delta added to the size
 * the drag began from; sign -1 for an edge whose drag the other way grows it). */
export function useStoredSize(key: string, def: number, min = 80, max = 4000) {
  const clamp = (v: number) => Math.min(Math.max(v, min), max);
  let kept = NaN;
  try {
    kept = Number(window.localStorage.getItem(key));
  } catch {
    // no storage: the default
  }
  const size: Ref<number> = ref(Number.isFinite(kept) && kept > 0 ? clamp(kept) : def);
  watch(size, (v) => {
    try {
      window.localStorage.setItem(key, String(Math.round(v)));
    } catch {
      // no storage: not kept
    }
  });
  let from = size.value;
  return {
    size,
    begin: () => (from = size.value),
    drag: (delta: number, sign = 1) => (size.value = clamp(from + sign * delta)),
    reset: () => (size.value = def),
  };
}
