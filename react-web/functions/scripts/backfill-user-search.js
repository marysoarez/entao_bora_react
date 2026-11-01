import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { searchGrams } from "../transferRecipientSearch.js";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
let batch = db.batch();
let writes = 0;
let indexed = 0;
let removed = 0;
let cursor;

async function flush() {
  if (!writes) return;
  await batch.commit();
  batch = db.batch();
  writes = 0;
}

while (true) {
  let query = db.collection("users").orderBy("__name__").limit(400);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const profileDoc of page.docs) {
    const profile = profileDoc.data();
    const tokens = searchGrams(profile.name, profile.email);
    const valid = profile.active === true &&
      ["user", "partner", "admin"].includes(profile.role) && tokens.length > 0;
    const ref = db.doc(`userRecipientSearch/${profileDoc.id}`);
    if (valid) {
      batch.set(ref, { tokens });
      indexed += 1;
    } else {
      batch.delete(ref);
      removed += 1;
    }
    writes += 1;
    if (writes === 400) await flush();
  }
  cursor = page.docs.at(-1);
  if (page.size < 400) break;
}

await flush();
console.log(`Backfill concluído. Indexados: ${indexed}; removidos/inativos: ${removed}.`);
