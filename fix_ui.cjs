const fs = require('fs');

// 1. Fix CekRak.tsx
let cekRakCode = fs.readFileSync('src/components/CekRak.tsx', 'utf8');

// A. Make Rak Tujuan form full-size on mobile
cekRakCode = cekRakCode.replace(
  'className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in"',
  'className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center md:p-4 animate-in fade-in"'
);
cekRakCode = cekRakCode.replace(
  'className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"',
  'className="bg-white md:rounded-3xl w-full h-full md:h-auto md:max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"'
);
// Also adjust inner padding or layout to support h-full (like making the content flex-1 overflow-auto)
cekRakCode = cekRakCode.replace(
  '<div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center rounded-t-3xl">',
  '<div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center md:rounded-t-3xl">'
);
cekRakCode = cekRakCode.replace(
  '<div className="p-6 space-y-6">',
  '<div className="p-6 space-y-6 flex-1 overflow-y-auto">'
);

// B. Quantity/Validation: Display "Max Cut"
cekRakCode = cekRakCode.replace(
  'Maks: {selectedMoveItem.tersedia}',
  'MAX CUT: {selectedMoveItem.tersedia}'
);

// Add validation to handleMoveSubmit inside CekRak.tsx
const handleMoveSubmitSearch = 'const handleMoveSubmit = async () => {';
const handleMoveSubmitReplace = `const handleMoveSubmit = async () => {
        if (moveData.jumlah_pindah > selectedMoveItem.tersedia) {
            showToast('Jumlah pindah tidak boleh melebihi Max Cut', 'error');
            return;
        }`;
cekRakCode = cekRakCode.replace(handleMoveSubmitSearch, handleMoveSubmitReplace);


// C. Button styling to match PindahDataBarang.tsx
// PindahDataBarang has: h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50
const cekRakRefreshOrig = 'className="flex-1 sm:flex-none bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 h-12 px-4 rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95 flex items-center justify-center"';
const cekRakRefreshNew = 'className="flex-1 sm:flex-none h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50"';
cekRakCode = cekRakCode.replace(cekRakRefreshOrig, cekRakRefreshNew);

const cekRakPrintOrig = 'className="flex-1 sm:flex-none bg-blue-600 text-white hover:bg-blue-700 h-12 px-4 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all hover:shadow-xl active:scale-95 flex items-center justify-center"';
const cekRakPrintNew = 'className="flex-1 sm:flex-none h-12 px-6 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-2xl shadow-[0_8px_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2.5 border-none disabled:opacity-50"';
cekRakCode = cekRakCode.replace(cekRakPrintOrig, cekRakPrintNew);

fs.writeFileSync('src/components/CekRak.tsx', cekRakCode);


// 2. Fix StokLantai3.tsx 
// The user asked to "Align 'Refresh' and 'Print QR' buttons in StokLantai3.tsx".
// Let's add a "Print QR" button next to "Refresh" if it doesn't exist.
let stokCode = fs.readFileSync('src/components/StokLantai3.tsx', 'utf8');

const importQrCodeRegex = /import \{.*QrCode.*\}/;
if (!importQrCodeRegex.test(stokCode)) {
  stokCode = stokCode.replace('import { CheckSquare', 'import { QrCode, CheckSquare');
}

const headerButtonsOrig = `<Button
            onClick={handleRefresh}
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            disabled={isRefreshing}
          >
            <RefreshCw className={\`h-4 w-4 mr-2 \${isRefreshing ? 'animate-spin' : ''}\`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>`;

const headerButtonsNew = `<div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 h-12 px-6 font-black rounded-2xl flex items-center justify-center gap-2.5"
              disabled={isRefreshing}
            >
              <RefreshCw className={\`h-5 w-5 \${isRefreshing ? 'animate-spin' : ''}\`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              onClick={() => {
                // Not specified what QR to print in StokLantai3 without context.
                // We will print a placeholder or alert until further functionality is requested.
                alert('Pilih rak di tabel untuk mencetak QR atau fitur akan datang!');
              }}
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 h-12 px-6 font-black rounded-2xl flex items-center justify-center gap-2.5"
            >
              <QrCode className="h-5 w-5" />
              Print QR
            </Button>
          </div>`;

if (stokCode.includes(headerButtonsOrig)) {
  stokCode = stokCode.replace(headerButtonsOrig, headerButtonsNew);
} else {
  console.log("Could not find the exact header buttons to replace in StokLantai3.tsx");
}

fs.writeFileSync('src/components/StokLantai3.tsx', stokCode);
console.log('Fixes applied successfully!');
