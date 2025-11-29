/// <reference lib="WebWorker" />
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? { title: 'Default Title', body: 'Default body' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/pwa-192x192.png'
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow('/')
    );
});
