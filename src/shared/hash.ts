/**
 * SHA-256 als Hex-String, über die Web-Crypto-API (im Tauri-WebView
 * wie auch in Node/Vitest über globalThis.crypto verfügbar).
 */
export async function sha256Hex(
  value: string,
): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    data,
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
