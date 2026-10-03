(function(){
'use strict';
setInterval(()=>document.querySelectorAll('.tx-panel').forEach(panel=>{
 if(panel.querySelector('[data-private-profile]'))return;
 const button=document.createElement('button');button.type='button';button.dataset.privateProfile='1';button.textContent='Importar mi perfil fiscal privado';
 button.onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{const p=JSON.parse(await input.files[0].text());if(p.format!=='don-ramon-private-profile'||!p.data||!Array.isArray(p.data.childBirthYears))throw Error('El archivo no es un perfil fiscal compatible.');localStorage.setItem('donRamonPersonalFiscalV1',JSON.stringify(p.data));location.reload();}catch(e){alert(e.message);}};input.click();};
 panel.prepend(button);
}),1000);
})();
