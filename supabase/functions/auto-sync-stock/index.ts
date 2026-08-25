import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || "https://kalindosukses-gudang5.my.id",
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SyncResult {
  success: boolean;
  timestamp: string;
  itemsUpdated: number;
  errors: number;
  message: string;
  duration: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
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
    const { createClient: createVerifyClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const verifyClient = createVerifyClient(
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startTime = Date.now();
    let itemsUpdated = 0;
    let errors = 0;

    console.log('[Auto-Sync Stock] Starting sync...');

    const { data: stockItems, error: fetchError } = await supabase
      .from('stock_items')
      .select('id, nama_produk, rak, stok_awal')
      .eq('status', 'Aktif')
      .or('rak.ilike.%UTAMA%,sub_rak.ilike.%UTAMA%')
      .limit(500);

    if (fetchError) {
      throw new Error(`Failed to fetch stock items: ${fetchError.message}`);
    }

    if (!stockItems || stockItems.length === 0) {
      const result: SyncResult = {
        success: true,
        timestamp: new Date().toISOString(),
        itemsUpdated: 0,
        errors: 0,
        message: 'No items to sync',
        duration: Date.now() - startTime,
      };

      await supabase.from('auto_sync_logs').insert({
        sync_type: 'stock',
        status: 'success',
        items_updated: 0,
        errors: 0,
        message: 'No items to sync',
        duration_ms: Date.now() - startTime,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const item of stockItems) {
      try {
        const { data: logData } = await supabase
          .from('database_log')
          .select('jumlah, type')
          .eq('sku', item.nama_produk)
          .ilike('rak', '%UTAMA%')
          .in('type', ['IN', 'OUT']);

        const masuk = (logData || [])
          .filter((log) => log.type === 'IN')
          .reduce((sum, log) => sum + (log.jumlah || 0), 0);

        const keluar = (logData || [])
          .filter((log) => log.type === 'OUT')
          .reduce((sum, log) => sum + (log.jumlah || 0), 0);

        const tersedia = (item.stok_awal || 0) + masuk - keluar;

        const { error: updateError } = await supabase
          .from('stock_items')
          .update({ masuk, keluar, tersedia })
          .eq('id', item.id);

        if (updateError) {
          errors++;
          console.error(`Error updating ${item.nama_produk}:`, updateError);
        } else {
          itemsUpdated++;
        }
      } catch (error) {
        errors++;
        console.error(`Error syncing ${item.nama_produk}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    const message = `Synced ${itemsUpdated} items in ${(duration / 1000).toFixed(1)}s (${errors} errors)`;

    console.log(`[Auto-Sync Stock] ${message}`);

    await supabase.from('auto_sync_logs').insert({
      sync_type: 'stock',
      status: errors === 0 ? 'success' : 'partial',
      items_updated: itemsUpdated,
      errors,
      message,
      duration_ms: duration,
    });

    const result: SyncResult = {
      success: true,
      timestamp: new Date().toISOString(),
      itemsUpdated,
      errors,
      message,
      duration,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Auto-Sync Stock] Error:', error);

    const errorResult: SyncResult = {
      success: false,
      timestamp: new Date().toISOString(),
      itemsUpdated: 0,
      errors: 1,
      message: `Sync failed: ${error}`,
      duration: 0,
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('auto_sync_logs').insert({
        sync_type: 'stock',
        status: 'error',
        items_updated: 0,
        errors: 1,
        message: `Sync failed: ${error}`,
        duration_ms: 0,
      });
    }

    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});