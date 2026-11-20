## MODIFIED Requirements

### Requirement: Yahoo Finance provider

El sistema DEBE (MUST) incluir `YahooFinanceMarketDataProvider` como proveedor por defecto del registro. Consulta `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=6mo` para series y `?interval=2m&range=1d` para precios, con User-Agent. Los fallos de red se reintentan una vez después de 2 s antes de `NETWORK`. Para referencias existentes se conserva `assets.yahoo_symbol ?? assets.ticker`, con `NOT_FOUND` sin HTTP si faltan ambos. Las nuevas referencias marcadas por el alta autorizada requieren un símbolo de proveedor verificado para cotización automática: mientras falte, no se llama al proveedor por ticker ni se persisten precios automáticos para esa referencia (R14). Esta excepción no cambia el benchmark ni limita el uso de la referencia en compras y CSV.

#### Scenario: Cotización válida
- **WHEN** `getQuote("AAPL")` recibe un chart válido con `meta.regularMarketPrice = 192.34`
- **THEN** devuelve el precio y su fecha observada

#### Scenario: Símbolo desconocido o ausencia de precio
- **WHEN** el proveedor devuelve 404 o un chart con `meta.regularMarketPrice` nulo
- **THEN** devuelve `NOT_FOUND`

#### Scenario: Alta pendiente de vínculo verificado
- **WHEN** una compra o importación referencia un activo nuevo sin símbolo de proveedor verificado, incluso si su ticker coincide con el de otro mercado
- **THEN** se registra la operación con su referencia y los workers no consultan por el ticker ni guardan precios de otro instrumento bajo ese UUID; los activos previos y el benchmark conservan su tratamiento
