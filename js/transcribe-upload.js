// 04/11/2026: העלאת סרטון מהגלריה בשביל "✨ תמלול מדויק".
//
// כאן בכוונה ה-uid של המחוברת עצמה, ולא subjectUid: storage.rules מתיר
// לכתוב רק ל-transcribeUploads/{request.auth.uid}/, והפונקציה
// transcribeReference מקבלת רק נתיב בתיקייה של מי שקוראת לה. הקובץ זמני
// (נמחק אחרי התמלול, ואם לא אז אחרי יום), ולא נתונים של לקוחה. כשמאיה
// צופה כלקוחה, הסרטון עולה לתיקייה שלה.
import { app, auth } from './firebase-init.js';
import { getStorage, ref, uploadBytesResumable, deleteObject } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { uploadPathFor, uploadContentType } from './reference-transcribe.js';

/* אותו bucket כמו תיקיית התמונות (story-assets.js). */
const TRANSCRIBE_BUCKET = 'gs://content-ideas-becd7-story-assets';

/** מעלה סרטון לתמלול. onProgress(0..100). מחזיר את הנתיב. */
export function uploadForTranscription(file, onProgress) {
  const me = auth.currentUser;
  const path = uploadPathFor(me.uid, file);
  const storage = getStorage(app, TRANSCRIBE_BUCKET);
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: uploadContentType(file) });
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snap) => {
      if (onProgress && snap && snap.totalBytes) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
    }, reject, () => resolve(path));
  });
}

/** מוחק העלאה שלא נשלחה לתמלול (התחיל בינתיים סרטון אחר). */
export function discardUpload(path) {
  return deleteObject(ref(getStorage(app, TRANSCRIBE_BUCKET), path));
}
