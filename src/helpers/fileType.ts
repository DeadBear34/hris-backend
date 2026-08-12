export type AllowedMimeType = "image/jpeg" | "image/png" | "image/webp";

export const ALLOWED_MIME_TYPES: AllowedMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_FILE_SIZE = 5_242_880;

const EKSTENSI: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(mime: AllowedMimeType): string {
  return EKSTENSI[mime];
}

function cocok(buffer: Buffer, offset: number, pola: number[]): boolean {
  if (buffer.length < offset + pola.length) return false;

  return pola.every((byte, i) => buffer[offset + i] === byte);
}

export function detectImageMimeType(buffer: Buffer): AllowedMimeType | null {
  if (cocok(buffer, 0, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (cocok(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (
    cocok(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
    cocok(buffer, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }

  return null;
}
