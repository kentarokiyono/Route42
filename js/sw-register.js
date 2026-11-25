// Service Worker の登録（https または localhost のみ有効）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker registration failed:', e));
    });
}
