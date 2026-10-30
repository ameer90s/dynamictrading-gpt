// Dynamic Trading 3.5 — bundled verified Sharia master universe.
// Source: user-provided halal-stock screening export; filtered to actual U.S. stocks on NYSE/NASDAQ.
// This file is local, consumes zero Sharia API credits, and is price-screened fresh each U.S. session.
export const BUNDLED_SHARIA_META = Object.freeze({
  source:'BUNDLED_VERIFIED_SHARIA_CSV', methodology:'AAOIFI',
  sourceName:'User-provided verified halal stock screening export',
  importedAt:'2026-10-20', count:172
});
export const BUNDLED_SHARIA_SYMBOLS = Object.freeze(["AAPL","ABBV","ABT","ACN","ADBE","ADI","ADM","ADP","ADSK","ALGN","AMAT","AMD","AMGN","ANET","ANSS","APD","APP","ARM","ASML","AVGO","AZN","AZO","BB","BE","BIDU","BIIB","BKNG","BKR","BSX","CARR","CDNS","CF","CHD","CL","COP","CRDO","CRM","CRWD","CSCO","CTAS","CVX","DAL","DASH","DD","DECK","DELL","DG","DHR","DLTR","DOCU","DVN","DXCM","EBAY","EL","EMR","ENPH","EOG","ETN","EW","FANG","FAST","FCX","FICO","FOX","FSLR","FTNT","GILD","GOOG","GOOGL","HAL","HD","HES","HLT","HON","HSY","HUBS","IBM","ILMN","INTC","INTU","ISRG","JCI","JNJ","K","KLAC","KMB","LLY","LRCX","LULU","LUV","MAR","MCHP","MDB","MDLZ","MDT","MELI","META","MNST","MOS","MPWR","MRK","MRVL","MSFT","MU","NEM","NKE","NOK","NOW","NSC","NVDA","NVS","NXPI","OKTA","ON","ONON","ORCL","ORLY","OXY","PANW","PATH","PAYX","PEP","PG","PH","PINS","PLUG","PTC","PXD","QCOM","QRVO","RCL","RDDT","REGN","RL","ROK","ROKU","ROST","RSG","SAP","SE","SEDG","SHEL","SKX","SLB","SNOW","SNPS","SNY","SONY","SWKS","SYK","TEAM","TER","TJX","TMO","TPR","TSLA","TSM","TT","TWLO","TXN","UBER","UNP","UPS","VALE","VEEV","VLO","VRTX","WDAY","WM","XOM","ZS","ZTS"]);
export function bundledShariaUniverse(){return {symbols:[...BUNDLED_SHARIA_SYMBOLS],...BUNDLED_SHARIA_META,fetchedAt:BUNDLED_SHARIA_META.importedAt,sourceUpdatedAt:BUNDLED_SHARIA_META.importedAt,isFresh:true};}
