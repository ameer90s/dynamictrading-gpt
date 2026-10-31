(() => {
  const STORAGE_KEY = "dynamic_trading_ui_tab_v37";
  function allButtons(){ return [...document.querySelectorAll('.main-tabs .tab-button[data-tab]')]; }
  function allPanels(){ return [...document.querySelectorAll('.tab-panel[data-panel]')]; }
  function activate(name, scroll=false){
    const buttons = allButtons();
    const panels = allPanels();
    if (!buttons.length || !panels.length) return;
    const valid = new Set(buttons.map(b => b.dataset.tab));
    if (!valid.has(name)) name = 'today';
    buttons.forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    if (scroll) {
      try { window.scrollTo({top:0, behavior:'smooth'}); } catch { window.scrollTo(0,0); }
    }
    window.dispatchEvent(new CustomEvent('dynamic-trading:tabchange', {detail:{tab:name}}));
  }
  function boot(){
    const nav = document.querySelector('.main-tabs');
    if (!nav || nav.dataset.tabNavReady === '1') return;
    nav.dataset.tabNavReady = '1';
    const handler = (event) => {
      const button = event.target.closest('.tab-button[data-tab]');
      if (!button || !nav.contains(button)) return;
      event.preventDefault();
      activate(button.dataset.tab, true);
    };
    // Capture phase makes navigation survive unrelated bubbling handlers/API UI failures.
    nav.addEventListener('click', handler, true);
    nav.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') handler(event);
    }, true);
    let saved = 'today';
    try { saved = localStorage.getItem(STORAGE_KEY) || 'today'; } catch {}
    activate(saved, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  window.DynamicTradingTabNav = { activate };
})();
