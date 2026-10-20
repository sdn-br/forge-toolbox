/** The game sends its JSON requests as an ArrayBuffer of UTF-8 text; anything else that is not text is dropped. */
export function bodyText(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  return null;
}
