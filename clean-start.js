(function(){
  'use strict';
  const marker='donRamonCleanStartV1',version='"real-data-start-2026-10-02"';
  const storage=window.localStorage;
  if(storage.getItem(marker)===version)return;
  // User-authorized one-time removal of the prototype data, before React or backups load.
  const before={};
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key.startsWith('donRamon'))before[key]=storage.getItem(key);}
  try{
    for(const key of Object.keys(before))storage.removeItem(key);
    storage.setItem('donRamonV5',JSON.stringify({inquilinas:[],cobrosByMonth:{},compensaciones:{}}));
    storage.setItem('donRamonGastosReal','{}');
    storage.setItem('donRamonGastosV12','{}');
    storage.setItem('donRamonFiscalV12','{}');
    storage.setItem(marker,version);
  }catch(error){
    for(const key of ['donRamonV5','donRamonGastosReal','donRamonGastosV12','donRamonFiscalV12',marker])storage.removeItem(key);
    for(const [key,value] of Object.entries(before))storage.setItem(key,value);
    alert('No se pudo preparar la app vacía. Los datos anteriores se han conservado.');
    throw error;
  }
})();
