const url = "https://gmdpdnxxwuczswyilcdc.supabase.co/rest/v1/stock_items";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZHBkbnh4d3VjenN3eWlsY2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzQ3NzcsImV4cCI6MjA4NjU1MDc3N30.L9bKADTm3Hh5NVu7tpGvMVXGXtQ8GVaaSlryguENnRU";

const item = {
  nama_produk: "TEST-SKU-NEW-FIXED",
  rak: "UTAMA",
  sub_rak: "UTAMA",
  packing: "CTN/",
  satuan: "PCS",
  stok_awal: 0,
  status: "Aktif"
};

fetch(url, { 
  method: "POST", 
  headers: { 
    apikey: key, 
    Authorization: "Bearer " + key,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(item)
})
  .then(async r => {
     if(r.ok) {
       console.log("Success inserting TEST-SKU-NEW-FIXED");
     } else {
       console.log("Error:", await r.text());
     }
  })
  .catch(e => console.error(e));
