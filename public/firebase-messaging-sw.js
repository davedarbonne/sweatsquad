importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB73HAl7CIIZnGq6DkZRd4EEjfAoUBUoXw",
  authDomain: "sweatsquad-85edf.firebaseapp.com",
  projectId: "sweatsquad-85edf",
  storageBucket: "sweatsquad-85edf.firebasestorage.app",
  messagingSenderId: "627088688122",
  appId: "1:627088688122:web:171c72ca6e512beed5da43"
});

const messaging = firebase.messaging();

// Only handles background messages (when app is not open)
// Foreground messages are handled by onMessage() in App.js
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: payload.data,
    // Tag prevents duplicate notifications on the same device
    tag: payload.data?.messageId || title,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const challengeId = data.challengeId;
  const groupId = data.groupId;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, post a message to it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if (challengeId && groupId) {
            client.postMessage({ type: "notification-click", challengeId, groupId });
          }
          return client.focus();
        }
      }
      // If app is closed, open it with query params
      const url = challengeId && groupId
        ? `/?challengeId=${challengeId}&groupId=${groupId}`
        : "/";
      return clients.openWindow(url);
    })
  );
});
