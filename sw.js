// Dose Log service worker: shows reminder notifications. It does not cache
// anything, so the app always loads the latest version.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = {body: event.data ? event.data.text() : ""}; }
  event.waitUntil(self.registration.showNotification(data.title || "Dose Log", {
    body: data.body || "",
    icon: "icons/icon-192.png",
    tag: data.tag || "dose-log",
    renotify: true,
    data: {url: data.url || "./#home"}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./#home", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(wins => {
    for (const w of wins){
      if (w.url.startsWith(self.registration.scope)){
        return w.navigate(url).then(c => (c || w).focus()).catch(() => w.focus());
      }
    }
    return self.clients.openWindow(url);
  }));
});
