(function(){
  'use strict';
  let opener;
  function init(){
    const style=document.createElement('style');
    style.textContent=`
      #backup-panel[hidden],#reload-panel[hidden]{display:none!important}
      #backup-panel:not([hidden]),#reload-panel:not([hidden]){display:flex!important;align-items:center;justify-content:center;background:rgba(15,23,42,.35)!important}
      #backup-panel section,#reload-panel section{margin:0!important;width:100%;max-width:560px!important;max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #e5e7eb;border-radius:22px!important;padding:24px!important;box-shadow:0 20px 60px rgba(15,23,42,.16);font-family:inherit;box-sizing:border-box}
      #backup-panel h2,#reload-panel h2{font-size:24px!important;font-weight:800;letter-spacing:-.025em;line-height:1.2;margin:4px 0 20px;padding-right:48px}
      #backup-panel p,#reload-panel p{font-size:14px;line-height:1.6;color:#64748b;margin:12px 0 18px}
      #backup-panel button,#reload-panel button{font:inherit;font-size:15px;font-weight:700;min-height:48px;border:1px solid #e5e7eb;border-radius:14px;padding:12px 16px;background:white;color:#0f172a;cursor:pointer;transition:box-shadow .15s,background .15s}
      #backup-panel button:hover,#reload-panel button:hover{background:#f8fafc;box-shadow:0 4px 12px rgba(0,0,0,.04)}
      #backup-panel button:focus-visible,#reload-panel button:focus-visible{outline:2px solid #2b5cff;outline-offset:3px}
      #backup-download,#reload-normal{display:block;width:100%;background:#2b5cff!important;color:white!important;border:0!important;box-shadow:0 8px 20px rgba(43,92,255,.2)}
      #backup-import{display:block;width:100%;margin-top:12px}
      #backup-close,#reload-close{min-height:40px!important;width:40px;height:40px;padding:0!important;border-radius:50%!important;background:#f1f5f9!important;font-size:20px!important;border:0!important}
      #backup-status{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px;font-size:13px!important}
      #backup-preview:empty{display:none}
      #backup-panel details{border:1px solid #e5e7eb;border-radius:14px;padding:16px}
      #backup-panel summary{font-size:14px}
      #backup-file{display:none!important}
      .dr-tool-icon{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;background:#eef4ff;border-radius:14px;font-size:24px;margin-bottom:16px}
      @media(max-width:420px){#backup-panel section,#reload-panel section{padding:20px!important}}
    `;
    document.head.appendChild(style);
    const host=document.createElement('div');
    host.innerHTML='<div id="reload-panel" hidden style="position:fixed;inset:0;z-index:10000;background:#0006;padding:16px;"><section role="dialog" aria-modal="true" aria-labelledby="reload-heading" style="max-width:520px;background:white;border-radius:20px;padding:24px;color:#0f172a;font-size:16px;"><button id="reload-close" type="button" style="float:right;" aria-label="Cerrar">×</button><div class="dr-tool-icon" aria-hidden="true">🔄</div><h2 id="reload-heading" style="font-size:22px;padding-right:70px;">Recarga y caché</h2><p>Recarga la aplicación o elimina sus archivos temporales. Tus datos y copias locales se conservan.</p><div style="display:grid;gap:12px;"><button id="reload-normal" type="button">🔄 Recargar aplicación</button><button id="reload-cache" type="button">🧹 Limpiar caché y recargar</button></div><p id="reload-status" role="status" style="color:#1d4ed8;"></p></section></div>';
    document.body.appendChild(host);
    function close(){document.getElementById('reload-panel').hidden=true;opener?.focus();}
    window.openReloadTools=function(button){opener=button;document.getElementById('reload-panel').hidden=false;document.getElementById('reload-close').focus();};
    document.getElementById('reload-close').onclick=close;
    document.getElementById('reload-normal').onclick=()=>location.reload();
    document.getElementById('reload-cache').onclick=async()=>{
      if(!confirm('¿Limpiar los archivos temporales y recargar? No se borrarán los datos ni las copias de seguridad.'))return;
      const button=document.getElementById('reload-cache');button.disabled=true;
      try{
        if('caches' in window)await Promise.all((await caches.keys()).map(key=>caches.delete(key)));
        const url=new URL(location.href);url.searchParams.set('recarga',Date.now());location.replace(url.toString());
      }catch{button.disabled=false;document.getElementById('reload-status').textContent='No se pudo limpiar la caché. Puedes utilizar Recargar aplicación. Tus datos no se han modificado.';}
    };
    // Both dialogs close on Escape and retain keyboard focus while open.
    document.addEventListener('keydown',e=>{
      const panel=['backup-panel','reload-panel'].map(id=>document.getElementById(id)).find(el=>el&&!el.hidden);
      if(!panel)return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();panel.querySelector(panel.id==='backup-panel'?'#backup-close':'#reload-close').click();}
      if(e.key==='Tab'){const items=[...panel.querySelectorAll('button,input,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
