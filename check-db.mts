import { createClient } from '@supabase/supabase-js';

const url = 'https://qzgwjrzwxqqzcumkemwo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6Z3dqcnp3eHFxemN1bWtlbXdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTIxMDgxOSwiZXhwIjoyMDk2Nzg2ODE5fQ.9FFJw8KdERecxk0Gbe_PQXyZ1k8NNMNSdw-FooVTbP4';
const c = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { count: fxCount } = await c.from('fx_rates').select('*', { count: 'exact', head: true });
  const { count: mpCount } = await c.from('market_prices').select('*', { count: 'exact', head: true });
  const { count: assetsCount } = await c.from('assets').select('*', { count: 'exact', head: true });
  const { count: syncCount } = await c.from('market_sync_runs').select('*', { count: 'exact', head: true });

  console.log('fx_rates rows:', fxCount);
  console.log('market_prices rows:', mpCount);
  console.log('assets rows:', assetsCount);
  console.log('market_sync_runs rows:', syncCount);

  const { data: sp500 } = await c.from('assets').select('id, ticker, yahoo_symbol, name').eq('ticker', '^GSPC').maybeSingle();
  console.log('S&P 500 asset:', sp500);

  const { data: latestFx } = await c.from('fx_rates').select('*').order('observed_at', { ascending: false }).limit(3);
  console.log('Latest FX rates:', latestFx);

  const { data: latestPrices } = await c.from('market_prices').select('asset_id, price_usd, observed_at').order('observed_at', { ascending: false }).limit(5);
  console.log('Latest market prices:', latestPrices);
}

main().catch(console.error);
