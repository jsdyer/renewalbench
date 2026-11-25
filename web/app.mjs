import { SCHEMA, FREQUENCIES, compare, normalizeWorkspace, currency, scheduleCSV, reportText, iso, addMonths } from './model.mjs';
const $ = s => document.querySelector(s);
const key = 'coolcode:renewalbench:workspace';
let example, comparison = null;
function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function button(text, action, className = 'quiet') { const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', action); return b; }
function field(parent, label, name, value, options = {}) {
  const l = el('label', label), input = el(options.choices ? 'select' : options.multiline ? 'textarea' : 'input');
  input.name = name; input.dataset.field = name;
  if (options.choices) for (const [id, title] of options.choices) { const o = el('option', title); o.value = id; input.append(o); }
  else if (!options.multiline) { input.type = options.type || 'text'; input.inputMode = options.type === 'date' ? 'none' : options.numeric ? 'decimal' : 'text'; }
  input.value = value ?? ''; if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;
  l.append(input); if (options.hint) l.append(el('small', options.hint)); parent.append(l); return input;
}
function quoteData(card) { return Object.fromEntries([...card.querySelectorAll('[data-field]')].map(n => [n.name, n.value])); }
function updateCount() { const n = $('#quotes').children.length; $('#quote-count').textContent = `${n} / 8`; $('#add-quote').disabled = n >= 8; for (const b of document.querySelectorAll('.remove-quote')) b.disabled = n === 1; }
function quoteCard(q) {
  const card = el('article', undefined, 'quote panel');
  const head = el('div', undefined, 'quote-head'), dot = el('span', 'OFFER', 'step');
  head.append(dot, button('Duplicate', () => { if ($('#quotes').children.length < 8) { quoteCard({ ...quoteData(card), name: (quoteData(card).name.slice(0, 72) + ' copy') }); changed(); } }), button('Remove', () => { card.remove(); updateCount(); changed(); }, 'quiet remove-quote'));
  card.append(head);
  const grid = el('div', undefined, 'grid two');
  field(grid, 'Offer name', 'name', q.name, { maxLength: 80 });
  field(grid, 'Fixed annual rate · %', 'annualRate', q.annualRate, { numeric: true });
  field(grid, 'Quoted term · months', 'termMonths', q.termMonths, { numeric: true });
  field(grid, 'Payment frequency', 'frequency', q.frequency, { choices: Object.entries(FREQUENCIES).map(([id,f])=>[id,f.label]) });
  card.append(grid);
  const details = el('details'), summary = el('summary', 'Fees, extra payments & contract notes'); details.append(summary);
  const more = el('div', undefined, 'grid two');
  for (const [name,label,hint] of [
    ['upfrontFees','Fees paid upfront · CAD','Legal, transfer, discharge, appraisal…'],
    ['financedFees','Fees added to debt · CAD','Increases the balance earning interest'],
    ['cashback','Cashback kept · CAD','Only the amount you expect to retain'],
    ['penalty','Known penalty / clawback · CAD','Use the lender’s actual quote; paid at start'],
    ['customPayment','Quoted base payment · CAD','Blank = calculated, excludes extras/taxes'],
    ['extraPayment','Extra each payment · CAD','Added at every scheduled payment'],
    ['annualLumpLimit','Annual lump-sum cap · CAD','Loan-anniversary year; blank = unknown'],
    ['extraPercentLimit','Allowed recurring increase · %','Of base payment; blank = unknown']
  ]) field(more,label,name,q[name],{numeric:true,hint});
  details.append(more);
  field(details,'Quote date & contract notes','notes',q.notes,{multiline:true,maxLength:1200,hint:'Record expiry, portability, permitted prepayment dates and anything still to confirm.'});
  card.append(details); $('#quotes').append(card); updateCount();
}
function lumpRow(lump) {
  const row = el('div', undefined, 'lump-row'); field(row,'Payment date','date',lump.date,{type:'date'}); field(row,'Lump sum · CAD','amount',lump.amount,{numeric:true});
  row.append(button('Remove',()=>{row.remove(); $('#no-lumps').hidden=!!$('#lumps').children.length; changed();}));
  $('#lumps').append(row); $('#no-lumps').hidden=true;
}
function read() {
  const w = { schema: SCHEMA, quotes: [...$('#quotes').children].map(quoteData), lumps: [...$('#lumps').children].map(quoteData) };
  for (const k of ['principal','startDate','amortizationMonths','horizonMonths']) w[k]=$(`[name="${k}"]`).value;
  return w;
}
function write(w) {
  for (const k of ['principal','startDate','amortizationMonths','horizonMonths']) $(`[name="${k}"]`).value=w[k];
  $('#quotes').replaceChildren(); w.quotes.forEach(quoteCard); $('#lumps').replaceChildren(); w.lumps.forEach(lumpRow); $('#no-lumps').hidden=!!w.lumps.length;
  changed();
}
function changed() {
  comparison=null; $('#results').hidden=true; $('#schedule-content').hidden=true; $('#schedule-empty').hidden=false; $('#report').disabled=true;
  $('#status').textContent='Ready to compare. Recalculate after editing.'; $('#status').className='';
}
function showView(view) {
  for (const b of document.querySelectorAll('[data-view]')) { const active=b.dataset.view===view; b.setAttribute('aria-pressed',String(active)); $(`#view-${b.dataset.view}`).hidden=!active; }
}
function statistic(parent,label,value,detail) { const box=el('div'); box.append(el('span',label,'stat-label'),el('strong',value)); if(detail)box.append(el('small',detail)); parent.append(box); }
function calculate() {
  try {
    comparison=compare(read()); renderResults(); $('#status').textContent='Comparison updated. All offers use the same end date.'; $('#status').className='success'; $('#report').disabled=false; return true;
  } catch(e) { comparison=null; $('#results').hidden=true; $('#schedule-content').hidden=true; $('#schedule-empty').hidden=false; $('#report').disabled=true; $('#status').textContent=e.message; $('#status').className='error'; return false; }
}
function renderResults() {
  const {common,results}=comparison;
  $('#results').hidden=false; $('#comparison-date').textContent=`${iso(common.start)} → ${iso(common.end)}`;
  const sorted=[...results].sort((a,b)=>a.netCost-b.netCost), lowest=sorted[0], spread=sorted.at(-1).netCost-lowest.netCost;
  const summary=$('#result-summary'); summary.replaceChildren();
  statistic(summary,'Lowest modelled borrowing cost',currency(lowest.netCost),lowest.quote.name);
  statistic(summary,'Cost spread across offers',currency(spread),`${common.horizonMonths} months, equal dates`);
  statistic(summary,'Balance is part of the comparison','Keep it in view','Cash outlay + debt left − starting balance = borrowing cost');
  const body=$('#comparison-table tbody'); body.replaceChildren(); $('#result-notes').replaceChildren();
  for (const r of results) {
    const tr=el('tr'), name=el('th',r.quote.name); name.scope='row'; name.append(el('small',`${r.quote.annualRate}% · ${r.quote.termMonths} months`)); tr.append(name);
    for (const value of [`${currency(r.basePayment)} + ${currency(r.quote.extraPayment)}`,currency(r.interest),currency(r.fees),currency(r.quote.cashback),currency(r.netCost),currency(r.cashOutlay),currency(r.endBalance)])tr.append(el('td',value)); body.append(tr);
    const note=el('details',undefined,'result-note'); const nWarnings=r.warnings.length; note.append(el('summary',`${r.quote.name} · ${nWarnings ? nWarnings+' things to review' : 'assumptions & notes'}`));
    const ul=el('ul'); ul.append(el('li',`${FREQUENCIES[r.quote.frequency].label}; ${r.rows.filter(x=>x.regular>0).length} payments; ${currency(r.lumpsPaid)} in applied lump sums. Contract ends ${iso(addMonths(common.start,r.quote.termMonths))}.`));
    if(r.payoffDate)ul.append(el('li',`Modelled payoff: ${r.payoffDate}.`));
    if(r.quote.customPayment!==null)ul.append(el('li',`Entered payment overrides the ${currency(r.calculatedPayment)} calculated base.`));
    for(const w of r.warnings)ul.append(el('li',w)); note.append(ul); if(r.quote.notes)note.append(el('p',r.quote.notes)); $('#result-notes').append(note);
  }
  const select=$('#schedule-quote'); select.replaceChildren(); results.forEach((r,i)=>{const o=el('option',r.quote.name);o.value=i;select.append(o);}); renderSchedule();
}
function renderSchedule() {
  if(!comparison)return;
  const r=comparison.results[Number($('#schedule-quote').value)||0]; $('#schedule-empty').hidden=true; $('#schedule-content').hidden=false;
  const sum=$('#schedule-summary');sum.replaceChildren();statistic(sum,'Payment + recurring extra',currency(r.scheduledPayment),FREQUENCIES[r.quote.frequency].label); statistic(sum,'Total interest',currency(r.interest)); statistic(sum,'Amount owing at comparison end',currency(r.endBalance),r.endDate);
  const body=$('#schedule-body');body.replaceChildren();for(const row of r.rows){const tr=el('tr');for(const v of [row.date,row.kind,...['regular','extra','lump','interest','principal','balance'].map(k=>currency(row[k]))])tr.append(el('td',v));body.append(tr);}
}
function download(name,type,body) { const url=URL.createObjectURL(new Blob([body],{type}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function storageAction(fn) { try {fn();}catch(e){$('#storage-status').textContent=e.message;} }
$('#workspace').addEventListener('input',changed); $('#workspace').addEventListener('change',changed);
$('#workspace').addEventListener('submit',e=>{e.preventDefault();calculate();});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>showView(b.dataset.view));
$('#add-quote').addEventListener('click',()=>{if($('#quotes').children.length<8){quoteCard({name:`Offer ${$('#quotes').children.length+1}`,annualRate:'',termMonths:'60',frequency:'monthly',upfrontFees:'0',financedFees:'0',cashback:'0',penalty:'0',extraPayment:'0',notes:''});changed();}});
$('#add-lump').addEventListener('click',()=>{if($('#lumps').children.length>=200){$('#status').textContent='The workspace supports up to 200 dated lump sums.';return;}lumpRow({date:$('[name="startDate"]').value,amount:''});changed();});
$('#schedule-quote').addEventListener('change',renderSchedule);
$('#download-csv').addEventListener('click',()=>{if(comparison)download('renewalbench-schedule.csv','text/csv;charset=utf-8',scheduleCSV(comparison.results[Number($('#schedule-quote').value)||0]));});
$('#save').addEventListener('click',()=>storageAction(()=>{localStorage.setItem(key,JSON.stringify(normalizeWorkspace(read())));$('#storage-status').textContent='Saved on this browser/device. Nothing was sent to a server.';}));
$('#load').addEventListener('click',()=>storageAction(()=>{const saved=localStorage.getItem(key);if(!saved)throw new Error('No saved workspace on this browser/device.');const w=normalizeWorkspace(JSON.parse(saved));write(w);showView('compare');$('#storage-status').textContent='Saved workspace loaded. Recalculate when ready.';}));
$('#forget').addEventListener('click',()=>storageAction(()=>{localStorage.removeItem(key);$('#storage-status').textContent='Saved workspace removed. The current open tab is unchanged.';}));
$('#export').addEventListener('click',()=>storageAction(()=>{download('renewalbench-workspace.json','application/json',JSON.stringify(normalizeWorkspace(read()),null,2)+'\n');$('#storage-status').textContent='Workspace exported. The file includes your entered financial details.';}));
$('#import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('Use a workspace JSON file smaller than 1 MB.');const w=normalizeWorkspace(JSON.parse(await file.text()));write(w);showView('compare');$('#storage-status').textContent='Workspace imported. Nothing was saved automatically.';}catch(err){$('#storage-status').textContent=`Import rejected: ${err.message} Your current workspace is unchanged.`;}finally{e.target.value='';}});
$('#report').addEventListener('click',()=>{if(comparison)download('renewalbench-report.txt','text/plain;charset=utf-8',reportText(read(),comparison));});
$('#example').addEventListener('click',()=>{if(example){write(structuredClone(example));showView('compare');$('#storage-status').textContent='Invented example restored in this tab. Saved workspace unchanged.';}});
try {const r=await fetch('./data/example.json');if(!r.ok)throw new Error('Example could not load.');example=normalizeWorkspace(await r.json());write(structuredClone(example));calculate();}catch(e){$('#status').textContent=`Could not initialize: ${e.message} Reload to retry.`;$('#status').className='error';}
