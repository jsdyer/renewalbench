import {basePayment} from './model.mjs';
export function rateScenario(principal,months,oldRate,newRate){
  const read=(value,label,min,max,integer=false)=>{if(value===null||value===undefined||String(value).trim()==='')throw Error(label+' is required.');const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(label+' is outside the supported range.');return n;};
  const balance=read(principal,'Balance',.01,100000000),term=read(months,'Remaining amortization',1,480,true),old=read(oldRate,'Current nominal rate',0,50),next=read(newRate,'Scenario nominal rate',0,50);
  const cents=Math.round(balance*100),before=basePayment(cents,old,term,'monthly'),after=basePayment(cents,next,term,'monthly');
  const rates=[...new Set([old,next,...[-1,-.5,-.25,.25,.5,1,2].map(x=>Math.round((next+x)*1000)/1000)].filter(x=>x>=0&&x<=50))].sort((a,b)=>a-b);
  return {principal:cents,months:term,oldRate:old,newRate:next,before,after,difference:after-before,rows:rates.map(rate=>({rate,payment:basePayment(cents,rate,term,'monthly')}))};
}
