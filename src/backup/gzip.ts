/** JSON gzipped with the browser's CompressionStream, as the backup file holds it. */
export function gzipJson(value: unknown): Promise<Blob> {
  return gzipText(JSON.stringify(value));
}

/** Text gzipped as it is, for a caller that has serialized the JSON already. */
export function gzipText(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/** The text of a file that is gzipped (by its magic bytes 1f 8b) or plain, as the import takes both. */
export async function unpackText(file: Blob): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
