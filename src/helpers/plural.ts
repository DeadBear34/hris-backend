// Bahasa Inggris membedakan satu dan banyak: "1 day", tapi "2 days"
export function plural(count: number, word: string): string {
  return `${count} ${Math.abs(count) === 1 ? word : `${word}s`}`;
}
