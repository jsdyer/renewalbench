import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEMA, FREQUENCIES, money, dateValue, iso, addMonths, equivalentRate, basePayment, paymentDay, compare, normalizeWorkspace, scheduleCSV, reportText } from '../web/model.mjs';
const example=JSON.parse(fs.readFileSync(new URL('../web/data/example.json',import.meta.url)));
const workspace=()=>structuredClone(example);
const one=(changes={},shared={})=>{const w=workspace();w.quotes=[{...w.quotes[0],...changes}];Object.assign(w,shared);return w;};
test('Canadian monthly fixture and independent present-value equation',()=>{
  // FCAC public calculator default: $100,000, 5%, 25 years, monthly = $581.60.
  assert.equal(basePayment(10000000,5,300,'monthly'),58160);
  for(const principal of [1000000,40000000,93756123])for(const apr of [0,0.01,4.19,13.25])for(const months of [12,120,300,480]){
    const payment=basePayment(principal,apr,months,'monthly')/100;
    const r=Math.pow(1+apr/200,1/6)-1;
    let present=0; for(let i=1;i<=months;i++)present+=payment/Math.pow(1+r,i);
    assert.ok(Math.abs(present-principal/100)<months*.0051,`${principal} ${apr} ${months}`);
  }
});
test('period rates reconstruct the same half-year growth',()=>{
  for(const f of [12,24,26,52])assert.ok(Math.abs((1+equivalentRate(5.4,f))**(f/2)-1.027)<1e-12);
});
test('payment amounts follow FCAC standard and accelerated conversions',()=>{
  const monthly=basePayment(40000000,4.39,240,'monthly');
  assert.equal(basePayment(40000000,4.39,240,'semimonthly'),Math.round(monthly/2));
  assert.equal(basePayment(40000000,4.39,240,'biweekly'),Math.round(monthly*12/26));
  assert.equal(basePayment(40000000,4.39,240,'weekly'),Math.round(monthly*12/52));
  assert.equal(basePayment(40000000,4.39,240,'acceleratedBiweekly'),Math.round(monthly/2));
  assert.equal(basePayment(40000000,4.39,240,'acceleratedWeekly'),Math.round(monthly/4));
});
test('independent monthly closed-form balance matches rounded event schedule',()=>{
  for(const apr of [0,1.25,4.39,15]){
    const w=one({annualRate:apr,termMonths:60},{horizonMonths:60}); const r=compare(w).results[0];
    const factor=Math.pow(1+apr/200,1/6), p=Number(w.principal)*100, payment=r.basePayment;
    const expected=apr===0?p-payment*60:p*factor**60-payment*(factor**60-1)/(factor-1);
    assert.ok(Math.abs(r.endBalance-expected)<50);
    assert.equal(r.rows.length,60);assert.equal(r.totalPayments+r.endBalance-p,r.interest);
  }
});
test('independent daily accumulation with dated cash events matches event model',()=>{
  const w=one({annualRate:5.25,frequency:'weekly',extraPayment:'17.13',upfrontFees:'44',financedFees:'131.29',cashback:'150',penalty:'25'}, {horizonMonths:12,lumps:[{date:'2027-03-12',amount:'1291.15'},{date:'2027-07-09',amount:'537.81'}]});
  const r=compare(w).results[0];let balance=40000000+13129;let accrued=0,interest=0;
  const daily=(1+5.25/200)**(2/52/7)-1, start=dateValue(w.startDate), byDate=new Map(r.rows.map(x=>[x.date,x]));
  for(let day=start+1;day<=dateValue(r.endDate);day++){
    accrued=(balance+accrued)*(1+daily)-balance;
    const row=byDate.get(iso(day));if(row){const amount=Math.round(accrued);interest+=amount;balance+=amount-row.regular-row.extra-row.lump;accrued=0;assert.equal(balance,row.balance);}
  }
  assert.equal(interest,r.interest);assert.equal(balance,r.endBalance);
  assert.equal(r.cashOutlay+r.endBalance-40000000,r.netCost);
});
test('real calendar, month end and explicit twice-monthly midpoints',()=>{
  const s=dateValue('2028-01-31');assert.equal(iso(addMonths(s,1)),'2028-02-29');assert.equal(iso(addMonths(s,2)),'2028-03-31');
  assert.equal(iso(paymentDay(s,'semimonthly',1)),'2028-02-14');assert.equal(iso(paymentDay(s,'semimonthly',2)),'2028-02-29');
  assert.equal(paymentDay(s,'biweekly',3),s+42);
  assert.throws(()=>dateValue('2027-02-29'));assert.throws(()=>dateValue('2027-13-01'));
});
test('comparison is same horizon and never extrapolates past a quote term',()=>{
  const w=workspace();const c=compare(w);assert.equal(c.results[0].endDate,c.results[1].endDate);assert.equal(c.results[0].rows.length,36);
  w.horizonMonths=37;assert.throws(()=>compare(w),/after its quoted term/);
});
test('zero-rate and earliest lump timing reduce debt correctly',()=>{
  const w=one({annualRate:0},{principal:'12000',amortizationMonths:120,horizonMonths:12,lumps:[{date:'2027-01-01',amount:'1000'}]});
  const r=compare(w).results[0];assert.equal(r.interest,0);assert.equal(r.endBalance,980000);assert.equal(r.rows[0].lump,100000);assert.equal(r.rows[0].interest,0);
  const a=one({}, {lumps:[{date:'2027-01-01',amount:'10000'}]});const b=structuredClone(a);b.lumps[0].date='2027-02-01';assert.ok(compare(a).results[0].interest<compare(b).results[0].interest);
});
test('same-day base then extra then clipped lump, no post-payoff interest',()=>{
  const w=one({annualRate:0,extraPayment:'100',annualLumpLimit:'0'}, {principal:'1000',amortizationMonths:10,horizonMonths:3,lumps:[{date:'2027-02-01',amount:'1000'},{date:'2027-03-01',amount:'50'}]});
  const r=compare(w).results[0];assert.equal(r.rows.length,1);assert.equal(r.rows[0].regular,10000);assert.equal(r.rows[0].extra,10000);assert.equal(r.rows[0].lump,80000);assert.equal(r.endBalance,0);assert.equal(r.payoffDate,'2027-02-01');assert.ok(r.warnings.some(w=>w.includes('exceeded the remaining debt')));assert.ok(r.warnings.some(w=>w.includes('before the quoted term')));
});
test('weekly close accrues interest on a nonpayment horizon date',()=>{
  const r=compare(one({frequency:'weekly'},{horizonMonths:1})).results[0];const last=r.rows.at(-1);assert.equal(last.date,'2027-02-01');assert.equal(last.regular,0);assert.ok(last.interest>0);assert.equal(last.principal,-last.interest);
});
test('annual amount caps use anniversary years, blank is unknown and zero forbids',()=>{
  const w=one({annualLumpLimit:'1000'},{horizonMonths:13,lumps:[{date:'2027-12-31',amount:'1000'},{date:'2028-01-01',amount:'1000'}]});
  assert.ok(!compare(w).results[0].warnings.some(w=>w.includes('exceed the entered limit')));
  w.quotes[0].annualLumpLimit='0';assert.ok(compare(w).results[0].warnings.some(w=>w.includes('exceed the entered limit')));
  w.quotes[0].annualLumpLimit='';assert.ok(compare(w).results[0].warnings.some(w=>w.includes('permission is unknown')));
});
test('custom underpayment and recurring limit are flagged',()=>{
  const r=compare(one({customPayment:'10',extraPayment:'1',extraPercentLimit:'0'})).results[0];assert.ok(r.endBalance>r.initial);assert.ok(r.warnings.some(w=>w.includes('accrued interest')));assert.ok(r.warnings.some(w=>w.includes('percentage')));
});
test('arbitrary added offers/frequencies preserve accounting identity',()=>{
  const w=workspace();w.quotes=Object.keys(FREQUENCIES).map((frequency,i)=>({...w.quotes[0],name:`Visitor offer ${i}`,frequency,upfrontFees:'321.25',financedFees:'198.21',cashback:'200',penalty:'35',extraPayment:'0.01'}));
  const c=compare(w);assert.equal(c.results.length,6);for(const r of c.results)assert.equal(r.cashOutlay+r.endBalance-c.common.principal,r.netCost);
});
test('workspace import normalization and invalid inputs never silently coerce',()=>{
  const w=workspace();assert.deepEqual(normalizeWorkspace(normalizeWorkspace(w)),normalizeWorkspace(w));
  for(const value of ['NaN','Infinity','-1','1e3','1.001',null,{},''])assert.throws(()=>money(value));
  for(const change of [{schema:'x'},{quotes:[]},{quotes:Array(9).fill(w.quotes[0])},{horizonMonths:0},{amortizationMonths:480.1},{principal:'0'},{lumps:[{date:'2026-01-01',amount:'10'}]},{lumps:[{date:'2027-01-01',amount:'0'}]}])assert.throws(()=>compare({...w,...change}));
  for(const change of [{name:''},{annualRate:'-1'},{frequency:'__proto__'},{customPayment:'0'},{termMonths:0}])assert.throws(()=>compare(one(change)));
});
test('safe exports preserve inputs and date conventions',()=>{
  const w=one({name:'=HYPERLINK("bad")',notes:'private note'});const c=compare(w);const csv=scheduleCSV(c.results[0]);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('Amount owing CAD'));assert.ok(csv.includes('2027-02-01'));const report=reportText(w,c);assert.ok(report.includes('private note'));assert.ok(report.includes('No quoted rate is projected'));assert.ok(report.includes('monthly × 12'));
});
