import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get('ALLOWED_ORIGIN') || "https://kalindosukses-gudang5.my.id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TransferRequest {
  sku: string;
  rak_asal: string;
  sub_rak_asal: string;
  rak_tujuan: string;
  sub_rak_tujuan: string;
  jumlah: number;
  packing: string;
  satuan: string;
  tgl: string;
  waktu: string;
}

interface TransferResponse {
  success: boolean;
  message: string;
  data?: {
    log_entries_created: number;
    stock_item_created: boolean;
    total_duration_ms: number;
  };
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 🔒 SECURITY: Verify caller authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token is valid
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const verifyClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );
    const { data: { user }, error: authError } = await verifyClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  try {
    const payload: TransferRequest = await req.json();

    // Validate required fields
    if (
      !payload.sku ||
      !payload.rak_asal ||
      !payload.rak_tujuan ||
      !payload.jumlah ||
      !payload.tgl ||
      !payload.waktu
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required fields",
          error: "Required: sku, rak_asal, rak_tujuan, jumlah, tgl, waktu",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const startTime = performance.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create log entries
    const logEntries = [
      {
        tgl: payload.tgl,
        waktu: payload.waktu,
        sku: payload.sku,
        jumlah: payload.jumlah,
        type: "OUT",
        gudang: "TRANSFER",
        rak: payload.rak_asal,
        tgl_scan: payload.tgl,
        user_name: "System",
        sub_rak: payload.sub_rak_asal || payload.rak_asal,
      },
      {
        tgl: payload.tgl,
        waktu: payload.waktu,
        sku: payload.sku,
        jumlah: payload.jumlah,
        type: "IN",
        gudang: "TRANSFER",
        rak: payload.rak_tujuan,
        tgl_scan: payload.tgl,
        user_name: "System",
        sub_rak: payload.sub_rak_tujuan || payload.rak_tujuan,
      },
    ];

    // Insert log entries
    const logResponse = await fetch(`${supabaseUrl}/rest/v1/database_log`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(logEntries),
    });

    if (!logResponse.ok) {
      const logError = await logResponse.text();
      console.error("Failed to create log entries:", logError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to create log entries",
          error: logError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if destination stock item exists
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/stock_items?nama_produk=eq.${encodeURIComponent(payload.sku)}&rak=eq.${encodeURIComponent(payload.rak_tujuan)}&select=id`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const existingItems = await checkResponse.json();
    let stockItemCreated = false;

    // Create stock item if it doesn't exist
    if (!Array.isArray(existingItems) || existingItems.length === 0) {
      const newStockItem = {
        nama_produk: payload.sku,
        packing: payload.packing || "CTN/",
        rak: payload.rak_tujuan,
        sub_rak: payload.sub_rak_tujuan || payload.rak_tujuan,
        satuan: payload.satuan || "PCS",
        stok_awal: 0,
        status: "Aktif",
      };

      const createResponse = await fetch(
        `${supabaseUrl}/rest/v1/stock_items`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(newStockItem),
        }
      );

      if (!createResponse.ok) {
        const createError = await createResponse.text();
        console.error("Failed to create stock item:", createError);
        // Note: Log entries were already created, so we're in an inconsistent state
        // In production, you'd want to rollback the log entries here
        return new Response(
          JSON.stringify({
            success: false,
            message: "Failed to create destination stock item (logs were created but stock_item failed)",
            error: createError,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      stockItemCreated = true;
    }

    const duration = performance.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Transfer completed successfully",
        data: {
          log_entries_created: 2,
          stock_item_created: stockItemCreated,
          total_duration_ms: Math.round(duration),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing transfer:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
