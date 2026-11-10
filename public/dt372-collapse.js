/* DT PULSE 3.7.2 — optional collapse for all large independent sections.
 * Progressive enhancement: everything is visible if JS is disabled.
 * This never removes, re-fetches or changes scanner data.
 */
(()=>{
function attach(section){
 if(section.dataset.dt372Collapsible==='1'||section.closest('details'))return;
 const header=section.querySelector(':scope > .section-title, :scope > .desk-command-header');
 if(!header)return;
 const content=Array.from(section.children).filter(c=>c!==header);
 if(!content.length)return;
 const originallyHidden=content.map(c=>c.hidden);
 const button=document.createElement('button');
 button.type='button';button.className='dt372-fold-toggle';button.textContent='طي القسم';
 button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','طي أو توسيع هذا القسم');
 button.addEventListener('click',()=>{
  const closed=button.getAttribute('aria-expanded')==='true';
  button.setAttribute('aria-expanded',String(!closed));
  button.textContent=closed?'توسيع القسم':'طي القسم';
  content.forEach((node,i)=>{node.hidden=closed||originallyHidden[i]});
 });
 header.appendChild(button);section.dataset.dt372Collapsible='1';
}
function init(){
 document.querySelectorAll('.dt37-next .tab-panel .card, .dt37-next .desk-command, .dt37-next .tab-panel .desk-research-section').forEach(attach);
 const labels={
  'dt37-action-panel':'ملخص اليوم والإجراءات','desk-agents':'الماسحات والباحث',
  'stats-grid':'إحصاءات الأداء','quick-stats':'مؤشرات الأداء المختصرة',
  'desk-research-hero':'مقدمة الباحث','desk-research-stats':'حالة التقرير والميزانية',
  'weekly371-calculator':'الحاسبة الأسبوعية التراكمية'};
 document.querySelectorAll('.tab-panel > section, .tab-panel > .desk-research-stats, .tab-panel > .quick-stats').forEach(section=>{
  if(section.classList.contains('dt37-section-intro')||section.closest('details')||section.dataset.dt372Collapsible==='1')return;
  const label=Object.entries(labels).find(([cls])=>section.classList.contains(cls))?.[1]||
   section.querySelector('h2,h3')?.textContent||'تفاصيل القسم';
  const details=document.createElement('details'),summary=document.createElement('summary');
  details.className='dt372-major-fold';details.open=true;summary.textContent=label;
  section.before(details);details.append(summary,section);section.dataset.dt372Collapsible='1';
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
