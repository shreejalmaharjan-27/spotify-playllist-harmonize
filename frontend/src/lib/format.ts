export function ms(t: number): string {
  const s = Math.floor((t || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
