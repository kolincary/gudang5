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

async function run() {
  try {
    // Collection 'stock-lt3' is allowed in active Firestore rules!
    const docRef = doc(db, 'stock-lt3', 'supabase_active_config');
    const targetUrl = 'https://ajeohbobmvxtaicmpfgs.supabase.co';
    const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZW9oYm9ibXZ4dGFpY21wZmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2NTg0MCwiZXhwIjoyMDY5MjM0NDQwfQ.N9vDWiCXoS6TQ5uBZkFPNGDgcC95ZWxqSoZLIXTpor0';
    
    await setDoc(docRef, {
      url: targetUrl,
      anonKey: targetKey,
      refId: 'ajeohbobmvxtaicmpfgs',
      broadcastAt: new Date().toISOString(),
      version: Date.now()
    }, { merge: true });

    console.log('✅ SUCCESS: Saved to Firestore stock-lt3/supabase_active_config!');
    
    const snap = await getDoc(docRef);
    console.log('Read back:', snap.data());
  } catch (err) {
    console.error('Error writing to Firestore:', err);
  }
}

run();
