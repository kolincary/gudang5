import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyt5XTwrSIK0aWlZXkUw4wdaMrMZsfbP4",
  authDomain: "pro-pulsar-476713-s9.firebaseapp.com",
  projectId: "pro-pulsar-476713-s9",
  storageBucket: "pro-pulsar-476713-s9.firebasestorage.app",
  messagingSenderId: "1087859743191",
  appId: "1:1087859743191:web:aec1c24af3ad0b40d61392"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, "stock-lt3");

async function main() {
  const payload = {
    url: 'https://ajeohbobmvxtaicmpfgs.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3NzgsImV4cCI6MjEwNDQyODc3OH0.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxq5oZLIxTpor0',
    refId: 'ajeohbobmvxtaicmpfgs',
    name: 'Supabase Target (ajeohbobmvxtaicmpfgs)',
    broadcastAt: new Date().toISOString(),
    version: Date.now(),
    message: 'Active Supabase instance with valid anon key'
  };

  const docRef = doc(db, 'stock-lt3', 'supabase_active_config');
  await setDoc(docRef, payload, { merge: true });
  console.log('✅ SUCCESS: Saved to Firestore stock-lt3/supabase_active_config!');

  const check = await getDoc(docRef);
  console.log('Read back from Firestore:', check.data());
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
