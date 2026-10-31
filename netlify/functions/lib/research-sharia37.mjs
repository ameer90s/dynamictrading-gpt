import {createHash} from 'node:crypto';
/** Exact source provenance for this scan, NOT a retroactive historical compliance assertion. */
export function shariaSnapshotEvidence(sharia){
 const symbols=[...new Set((sharia?.symbols||[]).map(x=>String(x).trim().toUpperCase()))].sort();
 return {source:sharia?.source||'UNKNOWN',sourceUpdatedAt:sharia?.sourceUpdatedAt||null,
   fetchedAt:sharia?.fetchedAt||null,methodology:sharia?.methodology||null,
   cacheStatus:sharia?.cacheStatus||null,approvedCount:symbols.length,
   snapshotSha256:createHash('sha256').update(JSON.stringify(symbols)).digest('hex')};
}
