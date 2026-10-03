(function(root){
'use strict';
const first='2025-06';
function cleanMonths(map,expenses=false){return Object.fromEntries(Object.entries(map||{}).filter(([month])=>!/^\d{4}-\d{2}$/.test(month)||month>=first).map(([month,rows])=>[month,expenses&&Array.isArray(rows)?rows.filter(r=>!(r.fecha&&r.fecha<'2025-06-01')):rows]));}
function migrate(storage){const updates={},before={};
for(const key of ['donRamonGastosReal','donRamonGastosV12','donRamonV5']){const raw=storage.getItem(key);if(!raw)continue;const data=JSON.parse(raw);let clean;
if(key==='donRamonV5'){clean={...data};for(const field of ['cobrosByMonth','compensaciones','acuerdosIngresos'])if(data[field])clean[field]=cleanMonths(data[field]);if(data.fianzasV2?.records)clean.fianzasV2={...data.fianzasV2,records:data.fianzasV2.records.map(r=>({...r,movimientos:(r.movimientos||[]).filter(m=>{const month=root.DonRamonDepositCore.imputationMonth(m);return !month||month>=first;})}))};}
else clean=cleanMonths(data,true);
const value=JSON.stringify(clean);if(value!==raw){before[key]=raw;updates[key]=value;}}
if(!Object.keys(updates).length)return 0;
// Preserve the exact previous data before the user-authorized removal.
const backupKey='donRamonBeforeRentalStartCleanup_'+Date.now();storage.setItem(backupKey,JSON.stringify({createdAt:new Date().toISOString(),firstMonth:first,data:before}));
try{for(const [key,value] of Object.entries(updates))storage.setItem(key,value);}catch(error){for(const [key,value] of Object.entries(before))storage.setItem(key,value);throw error;}
return Object.keys(updates).length;
}
root.DonRamonRentalStart={cleanMonths,migrate};if(typeof module==='object')module.exports=root.DonRamonRentalStart;
if(root.localStorage)try{migrate(root.localStorage);}catch(error){console.error('No se pudo retirar el histórico anterior a junio de 2025',error);}
})(typeof window==='object'?window:globalThis);
