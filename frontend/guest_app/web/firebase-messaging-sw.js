importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js");

// Configuration from lib/firebase_options.dart (Web)
firebase.initializeApp({
    apiKey: "AIzaSyDk2xEAzA51X2SVDaeYLH_rE2xUf1jK5xU",
    authDomain: "social-event-guest-app.firebaseapp.com",
    projectId: "social-event-guest-app",
    storageBucket: "social-event-guest-app.firebasestorage.app",
    messagingSenderId: "1095171762056",
    appId: "1:1095171762056:web:d55061341617e2404b7c3d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icons/Icon-192.png'
    };

    self.registration.showNotification(notificationTitle,
        notificationOptions);
});
