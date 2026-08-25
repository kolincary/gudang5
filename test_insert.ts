import { supabase } from "./src/lib/supabase.ts";

async function run() {
  console.log(await supabase.from("stock_items").insert([{ nama_produk: "BOOK-TEST-123", rak: "UTAMA", sub_rak: "UTAMA", packing: "CTN/", satuan: "PCS", stok_awal: 0, status: "Aktif" }]).select());
}

run();
