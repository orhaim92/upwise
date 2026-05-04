// Browser-side helpers for PushManager. All pure-client utilities — must
// only be called from 'use client' components or after typeof window check.

// Decode base64url (the format VAPID public keys come in) into the
// ArrayBuffer the PushManager.subscribe API expects. Note: we explicitly
// construct over an ArrayBuffer (not the default ArrayBufferLike, which
// could be SharedArrayBuffer and isn't accepted by applicationServerKey).
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export async function isPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  return true;
}

// "Standalone" = launched from home screen on iOS (or display-mode: standalone
// on Android/desktop after install). iOS specifically requires this — push
// permission can't be requested from a regular Safari tab.
export async function isStandalone(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export async function getOrCreatePushSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    console.error('VAPID public key not configured');
    return null;
  }

  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(vapidPublic),
    });
    return sub;
  } catch (err) {
    console.error('Push subscribe failed:', err);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function unsubscribePush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  try {
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

export function subscriptionToJSON(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint ?? '',
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}
