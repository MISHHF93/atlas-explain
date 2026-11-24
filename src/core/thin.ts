/** Keeps the shape of a long series in at most `max` points: evenly spaced, first and last kept. */
export function thinEvenly<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max || max < 2) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
