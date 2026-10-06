const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { initializeFirestore, collection, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyCyt5XTwrSIK0aWlZXkUw4wdaMrMZsfbP4',
  authDomain: 'pro-pulsar-476713-s9.firebaseapp.com',
  projectId: 'pro-pulsar-476713-s9',
  storageBucket: 'pro-pulsar-476713-s9.firebasestorage.app',
  messagingSenderId: '1087859743191',
  appId: '1:1087859743191:web:aec1c24af3ad0b40d61392'
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, 'stock-lt3');

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function exportToCsv() {
  console.log('Mengambil data log dari Firestore (collection stock-lt3) untuk tanggal 2026-10-06...');
  
  const map = new Map();

  const q1 = query(collection(db, 'stock-lt3'), where('tgl', '==', '2026-10-06'));
  const snap1 = await getDocs(q1);
  snap1.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));

  const q2 = query(collection(db, 'stock-lt3'), where('tgl_scan', '==', '2026-10-06'));
  const snap2 = await getDocs(q2);
  snap2.forEach(d => {
    if (!map.has(d.id)) {
      map.set(d.id, { id: d.id, ...d.data() });
    }
  });

  const records = Array.from(map.values());
  console.log(`Ditemukan ${records.length} data.`);

  // Urutkan berdasarkan created_at atau waktu
  records.sort((a, b) => {
    const timeA = a.created_at || `${a.tgl} ${a.waktu || ''}`;
    const timeB = b.created_at || `${b.tgl} ${b.waktu || ''}`;
    return timeA.localeCompare(timeB);
  });

  const headers = [
    'id',
    'tgl',
    'waktu',
    'sku',
    'jumlah',
    'type',
    'gudang',
    'rak',
    'sub_rak',
    'tgl_scan',
    'user_name',
    'status',
    'is_adjustment',
    'log_update_user',
    'created_at',
    'sku_pcs',
    'jumlah_pcs'
  ];

  const csvRows = [];
  // UTF-8 BOM agar Excel membukanya langsung dengan encoding yang tepat
  csvRows.push('\ufeff' + headers.join(','));

  for (const r of records) {
    const row = headers.map(h => escapeCsv(r[h]));
    csvRows.push(row.join(','));
  }

  const outputPath = path.join(__dirname, 'database_log_firestore_2026-10-06.csv');
  fs.writeFileSync(outputPath, csvRows.join('\r\n'), 'utf8');

  console.log(`✅ Berhasil membuat file CSV di: ${outputPath}`);
  console.log(`Total baris: ${records.length}`);
}

exportToCsv().catch(err => {
  console.error('Export error:', err);
  process.exit(1);
});
