/* =====================================================================
   DriveWise · Service Worker

   הגרסה מגיעה מ-index.html דרך ?v= בכתובת הרישום, כדי שיהיה מקור אמת
   אחד בלבד — הקבוע BUILD. שינוי BUILD משנה את כתובת הסקריפט, הדפדפן
   רואה worker חדש, מתקין אותו ומוחק את המטמון הישן.

   קודם לכן הרישום נעשה מ-blob:, ודפדפנים חוסמים את זה. הנפילה הייתה
   ל-sw.js שלא היה קיים, ולכן בפועל לא היה כאן service worker בכלל
   והאפליקציה מעולם לא עבדה אופליין.
   ===================================================================== */
const V = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'drivewise-' + V;

/* נטען מראש: הדף והנתונים. התמונות (~415) וקבצי השמע נכנסים תוך כדי
   שימוש — אי אפשר לעכב את ההתקנה עד שכולם יירדו. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './data/questions.he.json',
  './data/hints.he.json',
  /* חוקי ההגייה. קטן, ובלעדיו ההקראה במנוע המכשיר חוזרת לבטא
     שגוי בדיוק את המילים שתוקנו — לכן הוא נטען מראש ולא תוך כדי. */
  './data/speech-rules.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* addAll נכשל כולו אם קובץ אחד חסר — מוסיפים אחד-אחד */
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* רק המטמונים שלנו. dw-tts-v1 שייך לשכבת הקול החיצוני
         באפליקציה — מחיקתו תזרוק אודיו ששולם עליו. */
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('drivewise-') && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   /* ספקי TTS ומדדים — לא נוגעים */

  /* הדף עצמו: רשת קודם, מטמון כגיבוי. מטמון-קודם על ה-HTML הוא בדיוק
     התקלה "שיניתי קוד ולא קרה כלום" שבזבזה כאן הכי הרבה זמן. */
  if(req.mode === 'navigate' || url.pathname.endsWith('/index.html')){
    e.respondWith(
      fetch(req)
        .then(r => {
          if(r.ok){
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put('./', copy)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match('./').then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* נכסים: מטמון קודם. שמע ותמונות אינם משתנים במקום — מזהה קובץ
     השמע נגזר מהתוכן, ולכן טקסט שהשתנה מביא שם קובץ חדש. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if(r.ok && r.type === 'basic'){
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return r;
    }))
  );
});
