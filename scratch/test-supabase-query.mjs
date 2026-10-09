const url = 'https://eojyqaffjqiuxldprwph.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanlxYWZmanFpdXhsZHByd3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODYwNzUsImV4cCI6MjEwNTE2MjA3NX0.pGTbwCdpMOG8X4N-_GZJidulS7KmzZd82ocv6zFUmuA';

const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  let clean = dateStr.trim();
  if (clean.includes(' ') || clean.includes('T')) clean = clean.split(/[ T]/)[0];
  if (/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.test(clean)) {
    const m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return clean;
};

const normalizeTime = (timeStr) => {
  if (!timeStr) return '00:00:00';
  const clean = timeStr.trim().replace(/\./g, ':');
  const parts = clean.split(':');
  const h = (parts[0] || '00').padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  return `${h}:${m}:${s}`;
};

async function testSku(skuName) {
  console.log(`\n=================== TESTING SKU: ${skuName} ===================`);
  const r = await fetch(`${url}/rest/v1/database_log?select=*&sku=ilike.${skuName}&order=id.asc`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const allSkuLogs = await r.json();

  const rackBalances = {};
  allSkuLogs.forEach(d => {
    const r = (d.rak || '').trim().toUpperCase();
    if (!r) return;
    const q = Number(d.jumlah || 0);
    if (d.type === 'IN') rackBalances[r] = (rackBalances[r] || 0) + q;
    else if (d.type === 'OUT') rackBalances[r] = (rackBalances[r] || 0) - q;
  });

  console.log('Rack Balances:', rackBalances);

  // Find all transfers
  const transferLogs = allSkuLogs.filter(
    l => (l.gudang || '').toUpperCase().includes('TRANSFER') || l.type === 'MOVE'
  );

  const inTransfers = transferLogs.filter(l => l.type === 'IN');
  const outTransfers = transferLogs.filter(l => l.type === 'OUT');
  const usedOutIds = new Set();
  const transferPairs = [];

  inTransfers.forEach(inT => {
    const dIn = normalizeDate(inT.tgl);
    const tIn = normalizeTime(inT.waktu);
    const qIn = Number(inT.jumlah || 0);

    let outT = outTransfers.find(o => 
      !usedOutIds.has(o.id) &&
      normalizeDate(o.tgl) === dIn &&
      normalizeTime(o.waktu) === tIn &&
      Number(o.jumlah || 0) === qIn
    ) || outTransfers.find(o => 
      !usedOutIds.has(o.id) &&
      normalizeDate(o.tgl) === dIn &&
      Number(o.jumlah || 0) === qIn
    );

    if (outT) {
      usedOutIds.add(outT.id);
      transferPairs.push({
        date: inT.tgl,
        time: inT.waktu,
        originRak: (outT.rak || '').trim().toUpperCase(),
        destRak: (inT.rak || '').trim().toUpperCase(),
        qty: qIn,
        inId: inT.id,
        outId: outT.id
      });
    }
  });

  console.log('Detected Transfer Pairs:', transferPairs);

  const deficitRaks = Object.keys(rackBalances).filter(r => rackBalances[r] < 0);
  const surplusRaks = Object.keys(rackBalances).filter(r => rackBalances[r] > 0);
  console.log('Deficit Raks:', deficitRaks, 'Surplus Raks:', surplusRaks);

  // Check for any OUT transaction on a deficit rack that occurred after any transfer of that rack
  const mismatches = [];
  deficitRaks.forEach(defRak => {
    // Find all transfers where defRak was the origin
    const transList = transferPairs.filter(p => p.originRak === defRak);
    transList.forEach(t => {
      const tDate = normalizeDate(t.date);
      const tTime = normalizeTime(t.time);

      const candidateOuts = allSkuLogs.filter(l => {
        if (l.type !== 'OUT') return false;
        if ((l.gudang || '').toUpperCase().includes('TRANSFER')) return false;
        if ((l.rak || '').trim().toUpperCase() !== defRak) return false;
        const d = normalizeDate(l.tgl);
        const tm = normalizeTime(l.waktu);
        if (d > tDate) return true;
        if (d === tDate) return tm >= tTime;
        return false;
      });

      candidateOuts.forEach(c => {
        // Find best target rack with surplus
        let suggested = t.destRak;
        if ((rackBalances[suggested] || 0) <= 0 && surplusRaks.length > 0) {
          suggested = surplusRaks[0];
        }

        mismatches.push({
          id: c.id,
          tgl: c.tgl,
          waktu: c.waktu,
          currentRak: c.rak,
          suggestedRak: suggested,
          jumlah: c.jumlah,
          user: c.user_name || c.user,
          transferRef: `${t.originRak} -> ${t.destRak} (${t.date} ${t.time})`,
          isIntermediate: true, // "nyelip"
          reason: `Transaksi "nyelip" dipotong di rak asal ${c.rak} setelah transfer ke ${suggested} (Saldo ${c.rak}: ${rackBalances[defRak]}, Saldo ${suggested}: +${rackBalances[suggested] || 0})`
        });
      });
    });
  });

  console.log(`Detected ${mismatches.length} mismatches for ${skuName}:`);
  mismatches.forEach(m => {
    console.log(`  [${m.tgl} ${m.waktu}] OUT ${m.currentRak} -> ${m.suggestedRak} (${m.jumlah} pcs) | User: ${m.user} | Ref: ${m.transferRef}`);
  });
}

async function run() {
  await testSku('BOOK-PAD-1000');
  await testSku('BOOK-NB-690/BROWN');
}

run();
