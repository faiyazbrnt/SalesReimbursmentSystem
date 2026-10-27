/** Browser previews expire on navigation; only durable attachments belong in saved records. */
export function persistedReceiptUrls(primary?: string, urls?: string[]): string[] {
  return (urls?.length ? urls : primary ? [primary] : [])
    .filter(url => typeof url === 'string' && Boolean(url.trim()) && !/^(blob:|data:)/i.test(url));
}
