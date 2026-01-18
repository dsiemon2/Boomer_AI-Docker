// Firebase Messaging Service Worker for Boomer AI
// This service worker handles background push notifications

// Import Firebase scripts - version should match the client
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase config - will be populated from environment
// These are safe to expose - they identify your app but don't grant access
const firebaseConfig = {
  // These will need to be configured for your Firebase project
  apiKey: self.FIREBASE_API_KEY || '',
  authDomain: self.FIREBASE_AUTH_DOMAIN || '',
  projectId: self.FIREBASE_PROJECT_ID || '',
  storageBucket: self.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: self.FIREBASE_APP_ID || '',
};

// Only initialize if we have a valid config
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Handle background messages
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    const notificationTitle = payload.notification?.title || 'Boomer AI';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new notification',
      icon: '/images/icon-192.png',
      badge: '/images/badge-72.png',
      vibrate: [200, 100, 200],
      tag: payload.data?.type || 'boomer-ai-notification',
      data: payload.data || {},
      actions: getNotificationActions(payload.data?.type),
      requireInteraction: true, // Keep notification until user interacts
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// Get notification actions based on type
function getNotificationActions(type) {
  switch (type) {
    case 'medication_reminder':
      return [
        { action: 'taken', title: 'Mark as Taken' },
        { action: 'snooze', title: 'Remind in 15 min' },
      ];
    case 'appointment_reminder':
      return [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    default:
      return [
        { action: 'open', title: 'Open App' },
      ];
  }
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event.action);

  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Handle different actions
  switch (event.action) {
    case 'taken':
      // Could call API to mark medication as taken
      url = '/?action=medication-taken&id=' + (data.entityId || '');
      break;
    case 'snooze':
      url = '/?action=snooze&id=' + (data.entityId || '');
      break;
    case 'view':
      url = '/?view=' + (data.type || 'notification') + '&id=' + (data.entityId || '');
      break;
    default:
      url = '/';
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data, action: event.action });
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close (dismissed)
self.addEventListener('notificationclose', (event) => {
  console.log('[firebase-messaging-sw.js] Notification closed:', event.notification.tag);
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_FIREBASE_CONFIG') {
    // Store config for future use
    Object.assign(firebaseConfig, event.data.config);
    console.log('[firebase-messaging-sw.js] Firebase config updated');
  }
});

console.log('[firebase-messaging-sw.js] Service worker loaded');
