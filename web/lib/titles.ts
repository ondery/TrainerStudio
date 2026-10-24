/** Display titles. Speed ids keep their id and gain the limit value. */

const BARE_TR = new Set(["hız sınırı", "hiz siniri", "speed limit"]);
const BARE_EN = new Set(["speed limit", "hız sınırı", "hiz siniri"]);

export function displayTitle(input: { id: string; title: string; titleEn?: string; detail?: string }, language: string): string {
  const key = input.id || "";
  const turkish = language.toLowerCase().startsWith("tr");
  const speed = /^speed_(\d+)$/.exec(key);
  if (speed) {
    const number = speed[1];
    const raw = turkish ? input.title : input.titleEn || input.title;
    const bare = (turkish ? BARE_TR : BARE_EN).has(raw.trim().toLowerCase());
    if (bare || !raw.includes(number)) return turkish ? `Hız sınırı ${number} km/h` : `Speed limit ${number} km/h`;
    return raw;
  }
  const end = /^end_speed_(\d+)$/.exec(key);
  if (end) {
    const number = end[1];
    const raw = turkish ? input.title : input.titleEn || input.title;
    if (!raw.includes(number)) return turkish ? `Hız sonu ${number} km/h` : `End of ${number} km/h limit`;
    return raw;
  }
  return turkish ? input.title : input.titleEn || input.title;
}

export function nextClassId(ids: string[], current: string | null): string | null {
  const at = current ? ids.indexOf(current) : -1;
  if (at < 0 || at + 1 >= ids.length) return null;
  return ids[at + 1];
}
