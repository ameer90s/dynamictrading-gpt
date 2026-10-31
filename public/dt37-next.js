/* New information architecture — navigation and progressive disclosure only.
 * Existing scanners, alerts, archives, execution rules and market status remain unchanged. */
(()=>{'use strict';
  function go(tab){const api=window.DynamicTradingTabNav;if(api?.activate)api.activate(tab,true);else{
   const btn=document.querySelector(`.main-tabs .tab-button[data-tab="${tab}"]`);if(btn)btn.click();
  }}
  function start(){
    document.querySelectorAll('[data-dt37-goto]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.dt37Goto)));
    // Gate a real recommendation on its state. Visual shells never infer a green/confirmed trade.
    const obs=document.querySelector('#top5');if(obs){
      const text=document.querySelector('#dt37OpportunitiesNote');
      if(text){const update=()=>{const count=obs.querySelectorAll('.mini-rec').length,confirmed=obs.querySelectorAll('.confirmed-v32').length;
       text.textContent=confirmed?`${confirmed} فرصة CONFIRMED مسجلة`:(count?`${count} فرص للمراقبة · لا يوجد CONFIRMED`:'لا توجد إشارة محفوظة حالياً');};
       const observer=new MutationObserver(update);observer.observe(obs,{childList:true});update();}
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
