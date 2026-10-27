/** web-push on the server needs Node's crypto, so this stays a separate,
 * browser-only module the settings screen can import without pulling that in. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // TS types PushManager.subscribe's key as Uint8Array<ArrayBuffer> specifically,
  // which Uint8Array.from's inferred ArrayBufferLike backing does not satisfy.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function isStandalone(): boolean {
  const iosLegacy = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosLegacy || window.matchMedia('(display-mode: standalone)').matches;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}
