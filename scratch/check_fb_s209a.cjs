const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, limit } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCyt5XTwrSIK0aWlZXkUw4wdaMrMZsfbP4",
  authDomain: "pro-pulsar-476713-s9.firebaseapp.com",
  projectId: "pro-pulsar-476713-s9",
  storageBucket: "pro-pulsar-476713-s9.firebasestorage.app",
  messagingSenderId: "1087859743191",
  appId: "1:1087859743191:web:aec1c24af3ad0b40d61392"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const q = query(collection(db, 'database_log'), where('sku', '==', 'CORRECTION-CF-S209A'));
  const snap = await getDocs(q);
  console.log(`Firebase found ${snap.docs.length} docs`);
  snap.docs.forEach(d => console.log(d.id, d.data().type, d.data().tgl, d.data().jumlah));
}
check().catch(console.error);
