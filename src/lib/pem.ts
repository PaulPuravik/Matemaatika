/**
 * Turns whatever ended up in the env var back into a usable PEM.
 *
 * The service account key is copied out of a JSON file into a dashboard field
 * by hand, so it arrives in several shapes: with the JSON quotes still
 * attached, with "\n" left as two characters rather than a newline, or with
 * Windows line endings. All of them produce the same opaque OpenSSL complaint
 * (DECODER routines::unsupported), so they are normalised here instead of
 * being left for the user to debug.
 *
 * Kept free of server-only imports so it can be unit tested directly.
 */
export function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  let key = raw.trim();

  const quoted =
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"));
  if (quoted) key = key.slice(1, -1);

  key = key
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

  if (!key) return undefined;

  // PEM parsers want the final newline.
  return `${key}\n`;
}
