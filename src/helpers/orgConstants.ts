// baru: konstanta struktur organisasi, dipisah biar gampang di-mock
// Jenis unit organisasi, dari yang paling luas sampai paling sempit
export const UNIT_TYPES = [
  "company",
  "directorate",
  "division",
  "department",
  "team",
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

// Pengaman kedalaman pohon unit dan jabatan, juga mencegah query rekursif
// berputar tanpa henti bila data terlanjur membentuk lingkaran
export const MAX_TREE_DEPTH = 15;
