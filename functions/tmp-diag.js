// זמני (06/10/2026): שתי שאלות של מאיה - אילו סרטונים לא נפתחים או בלי
// תמונה, והאם אפשר לזהות בוודאות שסרטון הוא שיר.
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const TOKEN = '01052bd93420d1a680a1edaddd700a8d0662b0f0768a511a';

const IG = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;
const TT = /tiktok\.com\/.*\/video\/(\d+)/;
// סימנים שהמתמלל עצמו שם כשהוא שומע מוזיקה. דטרמיניסטי, לא ניחוש
const MUSIC_MARK = /[♪♫]|\[\s*music\s*\]|\(\s*music\s*\)|\[\s*מוזיקה\s*\]|\[\s*שיר\s*\]|\bMusic\b|\bMUSIC\b/;

exports.tmpDiag = onRequest({ region: 'us-central1', timeoutSeconds: 180 }, async (req, res) => {
  if (req.query.t !== TOKEN) { res.status(403).send('no'); return; }
  const snap = await admin.firestore().collection('inspirationBank').get();
  const out = {
    total: snap.size,
    noThumb: 0, noThumbIds: [],
    cantOpen: 0, cantOpenIds: [],
    noThumbAndCantOpen: 0,
    musicMarker: 0, musicIds: [],
    veryRepetitive: 0,
    shortText: 0,
    bothSignals: 0,
  };
  snap.docs.forEach((d) => {
    const v = d.data();
    const u = String(v.url || '');
    const openable = Boolean(v.tiktokVideoId) || IG.test(u) || TT.test(u);
    const hasThumb = Boolean(v.thumbnailUrl);
    if (!hasThumb) { out.noThumb += 1; if (out.noThumbIds.length < 12) out.noThumbIds.push(d.id + ' | ' + (v.platform || '?') + ' | ' + u.slice(0, 48)); }
    if (!openable) { out.cantOpen += 1; if (out.cantOpenIds.length < 12) out.cantOpenIds.push(d.id + ' | ' + (v.platform || '?') + ' | ' + u.slice(0, 48)); }
    if (!hasThumb && !openable) out.noThumbAndCantOpen += 1;

    const text = String(v.translationHe || v.transcriptHe || v.transcript || '').trim();
    const raw = String(v.transcript || '');
    const marked = MUSIC_MARK.test(raw) || MUSIC_MARK.test(text);
    if (marked) { out.musicMarker += 1; if (out.musicIds.length < 10) out.musicIds.push((v.domain || '') + ' | ' + text.slice(0, 50)); }
    // חזרתיות: כמה מהשורות הייחודיות מתוך כלל השורות
    const lines = text.split(/[\n.!?]+/).map((x) => x.trim()).filter((x) => x.length > 4);
    let rep = false;
    if (lines.length >= 6) {
      const uniq = new Set(lines).size;
      rep = uniq / lines.length < 0.55;
    }
    if (rep) out.veryRepetitive += 1;
    if (text.length > 0 && text.length < 120) out.shortText += 1;
    if (marked && rep) out.bothSignals += 1;
  });
  res.json(out);
});
