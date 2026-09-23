// Menerjemahkan TRUST_PROXY ke nilai yang dipahami Express. Angka berarti
// jumlah proxy di depan server, dan itu pilihan paling aman: "true" percaya
// pada seluruh isi X-Forwarded-For, sehingga klien dapat memalsukan IP-nya
// sendiri dan lolos dari rate limit
export function parseTrustProxy(
  value: string | undefined,
): boolean | number | string {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;

  const hops = Number(value);

  return Number.isInteger(hops) && hops >= 0 ? hops : value;
}
