/** Private, fixed-rate comparison model. Money is integer cents at cash events. */
export const SCHEMA = 'coolcode.renewalbench.v1';
export const FREQUENCIES = {
  monthly: { label: 'Monthly', periods: 12 },
  semimonthly: { label: 'Twice monthly', periods: 24 },
  biweekly: { label: 'Every two weeks', periods: 26, days: 14 },
  weekly: { label: 'Weekly', periods: 52, days: 7 },
  acceleratedBiweekly: { label: 'Accelerated every two weeks', periods: 26, days: 14, divisor: 2 },
  acceleratedWeekly: { label: 'Accelerated weekly', periods: 52, days: 7, divisor: 4 },
};
const DAY = 86400000;
export function money(value, label = 'Amount', allowBlank = false) {
  const text = String(value ?? '').trim();
  if (!text && allowBlank) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label}: enter a nonnegative amount with at most two decimal places.`);
  const [a, b = ''] = text.split('.');
  const cents = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 10_000_000_000) throw new Error(`${label}: maximum amount is $100 million.`);
  return cents;
}
function numeric(value, label, low, high, integer = false) {
  if (!String(value ?? '').trim() || !/^\d+(?:\.\d+)?$/.test(String(value))) throw new Error(`${label}: enter a number.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < low || n > high || (integer && !Number.isInteger(n))) throw new Error(`${label}: enter ${integer ? 'a whole number' : 'a value'} from ${low} to ${high}.`);
  return n;
}
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a complete YYYY-MM-DD date.');
  const ms = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > '2190-12-31') throw new Error('Date is invalid or outside 1900–2190.');
  return ms / DAY;
}
export function iso(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
export function addMonths(day, months) {
  const d = new Date(day * DAY), y = d.getUTCFullYear(), m = d.getUTCMonth(), date = d.getUTCDate();
  const lastOriginal = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return Date.UTC(y, m + months, date === lastOriginal ? last : Math.min(date, last)) / DAY;
}
export function equivalentRate(annualPercent, periods) { return Math.expm1(2 / periods * Math.log1p(annualPercent / 200)); }
export function basePayment(principalCents, annualPercent, amortizationMonths, frequency) {
  const f = FREQUENCIES[frequency];
  if (!f) throw new Error('Unknown payment frequency.');
  const count = amortizationMonths;
  const rate = equivalentRate(annualPercent, 12);
  const unrounded = rate === 0 ? principalCents / count : principalCents * rate / -Math.expm1(-count * Math.log1p(rate));
  const monthly = Math.round(unrounded);
  return Math.round(f.divisor ? monthly / f.divisor : monthly * 12 / f.periods);
}
export function paymentDay(start, frequency, n) {
  if (n === 0) return start;
  const f = FREQUENCIES[frequency];
  if (f.days) return start + n * f.days;
  if (f.periods === 12) return addMonths(start, n);
  const month = Math.floor(n / 2), a = addMonths(start, month);
  return n % 2 ? a + Math.floor((addMonths(start, month + 1) - a) / 2) : a;
}
function position(start, frequency, day) {
  const f = FREQUENCIES[frequency];
  if (f.days) return (day - start) / f.days;
  let low = 0, high = 1000;
  while (low + 1 < high) { const mid = Math.floor((low + high) / 2); if (paymentDay(start, frequency, mid) <= day) low = mid; else high = mid; }
  const a = paymentDay(start, frequency, low), b = paymentDay(start, frequency, low + 1);
  return low + (day - a) / (b - a);
}
function textValue(value, label, length) {
  if (typeof value !== 'string' || !value.trim() || value.length > length) throw new Error(`${label}: enter 1–${length} characters.`);
  return value.trim();
}
export function validateWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schema !== SCHEMA) throw new Error('This is not a Renewal Bench workspace.');
  const principal = money(input.principal, 'Starting mortgage balance');
  if (principal < 100) throw new Error('Starting mortgage balance must be at least $1.');
  const start = dateValue(input.startDate);
  const amortizationMonths = numeric(input.amortizationMonths, 'Remaining amortization in months', 1, 480, true);
  const horizonMonths = numeric(input.horizonMonths, 'Comparison months', 1, 120, true);
  const end = addMonths(start, horizonMonths);
  if (!Array.isArray(input.quotes) || !input.quotes.length || input.quotes.length > 8) throw new Error('Include between one and eight quotes.');
  const quotes = input.quotes.map((q, index) => {
    if (!q || typeof q !== 'object') throw new Error('Invalid quote.');
    const name = textValue(q.name, `Quote ${index + 1} name`, 80);
    const annualRate = numeric(q.annualRate, `${name} annual rate`, 0, 30);
    const termMonths = numeric(q.termMonths, `${name} term months`, 1, 120, true);
    if (horizonMonths > termMonths) throw new Error(`${name}: comparison ends after its quoted term. Shorten the common horizon to ${termMonths} months or less.`);
    if (!Object.hasOwn(FREQUENCIES, q.frequency)) throw new Error(`${name}: select a valid payment frequency.`);
    const clean = { name, annualRate, termMonths, frequency: q.frequency };
    for (const k of ['upfrontFees', 'financedFees', 'cashback', 'penalty', 'extraPayment']) clean[k] = money(q[k] ?? '0', `${name} ${k}`);
    clean.customPayment = money(q.customPayment, `${name} quoted base payment`, true);
    if (clean.customPayment === 0) throw new Error(`${name}: quoted base payment must exceed zero, or leave it blank to calculate.`);
    clean.annualLumpLimit = money(q.annualLumpLimit, `${name} annual lump-sum limit`, true);
    clean.extraPercentLimit = String(q.extraPercentLimit ?? '').trim() === '' ? null : numeric(q.extraPercentLimit, `${name} extra-payment limit %`, 0, 1000);
    clean.notes = typeof q.notes === 'string' ? q.notes.slice(0, 1200) : '';
    return clean;
  });
  if (!Array.isArray(input.lumps) || input.lumps.length > 200) throw new Error('Use at most 200 dated lump sums.');
  const lumps = input.lumps.map((l, i) => {
    if (!l || typeof l !== 'object') throw new Error('Invalid lump sum.');
    const day = dateValue(l.date), amount = money(l.amount, `Lump sum ${i + 1}`);
    if (amount <= 0) throw new Error('A lump sum must exceed zero.');
    if (day < start || day > end) throw new Error('Every lump sum must fall within the comparison dates, including the start/end dates.');
    return { day, date: l.date, amount };
  });
  return { principal, start, end, amortizationMonths, horizonMonths, quotes, lumps };
}
export function normalizeWorkspace(input) {
  const c = validateWorkspace(input);
  const dollars = n => n === null ? '' : (n / 100).toFixed(2);
  return { schema: SCHEMA, startDate: iso(c.start), principal: dollars(c.principal), amortizationMonths: c.amortizationMonths,
    horizonMonths: c.horizonMonths, quotes: c.quotes.map(q => ({ ...q, annualRate: q.annualRate,
      ...Object.fromEntries(['upfrontFees', 'financedFees', 'cashback', 'penalty', 'extraPayment', 'customPayment', 'annualLumpLimit'].map(k => [k, dollars(q[k])])),
      extraPercentLimit: q.extraPercentLimit ?? '' })), lumps: c.lumps.map(l => ({ date: l.date, amount: dollars(l.amount) })) };
}
function loanYear(start, day) { let year = 0; while (addMonths(start, (year + 1) * 12) <= day) year++; return year; }
export function simulate(common, quote) {
  const { start, end, principal, amortizationMonths, lumps } = common;
  const initial = principal + quote.financedFees;
  const calculatedPayment = basePayment(initial, quote.annualRate, amortizationMonths, quote.frequency);
  const payment = quote.customPayment ?? calculatedPayment;
  if (payment <= 0) throw new Error(`${quote.name}: calculated payment rounds to zero; choose a shorter amortization or quote a payment.`);
  const events = new Map();
  const event = day => { if (!events.has(day)) events.set(day, { day, regular: false, requestedLump: 0 }); return events.get(day); };
  for (let n = 1; n <= 1000; n++) { const day = paymentDay(start, quote.frequency, n); if (day > end) break; event(day).regular = true; }
  for (const lump of lumps) event(lump.day).requestedLump += lump.amount;
  event(end).closing = true;
  let balance = initial, lastDay = start, interest = 0, paid = 0, regularPaid = 0, extraPaid = 0, lumpsPaid = 0;
  let negativeAmortization = false, payoffDate = null, truncatedPrepayments = false;
  const rows = [], warnings = [], annualLumps = {};
  const f = FREQUENCIES[quote.frequency];
  const logGrowth = 2 / f.periods * Math.log1p(quote.annualRate / 200);
  for (const e of [...events.values()].sort((a, b) => a.day - b.day)) {
    if (balance === 0) { if (e.requestedLump) truncatedPrepayments = true; continue; }
    const delta = position(start, quote.frequency, e.day) - position(start, quote.frequency, lastDay);
    const earned = Math.round(balance * Math.expm1(logGrowth * delta));
    if (!Number.isSafeInteger(earned) || !Number.isSafeInteger(balance + earned)) throw new Error('Scenario grows beyond supported numeric precision.');
    balance += earned; interest += earned;
    const actualRegular = e.regular ? Math.min(payment, balance) : 0;
    balance -= actualRegular;
    const actualExtra = e.regular ? Math.min(quote.extraPayment, balance) : 0;
    balance -= actualExtra;
    const actualLump = Math.min(e.requestedLump, balance);
    balance -= actualLump;
    if ((e.regular && actualRegular + actualExtra < earned) || balance > initial) negativeAmortization = true;
    if (actualLump < e.requestedLump) truncatedPrepayments = true;
    const total = actualRegular + actualExtra + actualLump;
    paid += total; regularPaid += actualRegular; extraPaid += actualExtra; lumpsPaid += actualLump;
    if (actualLump) { const y = loanYear(start, e.day); annualLumps[y] = (annualLumps[y] || 0) + actualLump; }
    rows.push({ date: iso(e.day), kind: [e.regular ? 'Payment' : '', e.requestedLump ? 'Lump sum' : '', e.closing ? 'Comparison end' : ''].filter(Boolean).join(' + '),
      interest: earned, regular: actualRegular, extra: actualExtra, lump: actualLump, requestedLump: e.requestedLump,
      payment: total, principal: total - earned, balance });
    if (balance === 0) payoffDate = iso(e.day);
    lastDay = e.day;
  }
  if (negativeAmortization) warnings.push('At least one payment did not cover its accrued interest, or the amount owing grew above the starting debt.');
  if (truncatedPrepayments) warnings.push('One or more requested lump sums exceeded the remaining debt. Only the amount needed was applied; later planned lump sums after payoff were not spent.');
  if (lumpsPaid && quote.annualLumpLimit === null) warnings.push('Lump-sum permission is unknown. Confirm allowed dates, minimum amounts and annual limits with the lender.');
  if (quote.annualLumpLimit !== null && Object.values(annualLumps).some(n => n > quote.annualLumpLimit)) warnings.push('Applied lump sums exceed the entered limit in a loan-anniversary year. The schedule still models them; any additional penalty is not calculated.');
  if (extraPaid && quote.extraPercentLimit === null) warnings.push('Recurring extra-payment permission is unknown. Confirm the lender permits this increase.');
  if (extraPaid && quote.extraPercentLimit !== null && quote.extraPayment > payment * quote.extraPercentLimit / 100 + 0.001) warnings.push('Recurring extra payments exceed the entered percentage of the base payment. Additional penalties are not calculated.');
  if (payoffDate && dateValue(payoffDate) < addMonths(start, quote.termMonths)) warnings.push('The model pays off before the quoted term ends. Confirm any breakage charge or cashback clawback and include the lender’s amount in fees/penalty.');
  const fees = quote.upfrontFees + quote.financedFees + quote.penalty;
  const netCost = interest + fees - quote.cashback;
  const cashOutlay = paid + quote.upfrontFees + quote.penalty - quote.cashback;
  return { quote, calculatedPayment, basePayment: payment, scheduledPayment: payment + quote.extraPayment,
    initial, endBalance: balance, interest, regularPaid, extraPaid, lumpsPaid, totalPayments: paid, fees,
    netCost, cashOutlay, payoffDate, warnings, rows, annualLumps, endDate: iso(end) };
}
export function compare(input) { const c = validateWorkspace(input); return { common: c, results: c.quotes.map(q => simulate(c, q)) }; }
export const currency = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
export function csvCell(value) { let t = String(value); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replaceAll('"', '""') + '"'; }
export function scheduleCSV(result) {
  const rows = [['Quote', result.quote.name], ['Comparison end', result.endDate],
    ['Date', 'Event', 'Regular payment CAD', 'Recurring extra CAD', 'Lump sum CAD', 'Interest CAD', 'Principal reduction CAD', 'Amount owing CAD']];
  for (const r of result.rows) rows.push([r.date, r.kind, ...['regular','extra','lump','interest','principal','balance'].map(k => (r[k] / 100).toFixed(2))]);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function reportText(workspace, comparison) {
  const lines = ['RENEWAL BENCH — PRIVATE QUOTE COMPARISON', `Starting balance: ${currency(comparison.common.principal)}`,
    `Dates: ${workspace.startDate} to ${iso(comparison.common.end)}`, `Remaining amortization: ${workspace.amortizationMonths} months`,
    'All money is CAD. These are the entered offers, not current market rates.', ''];
  for (const r of comparison.results) lines.push(r.quote.name, `Rate: ${r.quote.annualRate}% fixed; term ${r.quote.termMonths} months; ${FREQUENCIES[r.quote.frequency].label}`,
    `Base payment: ${currency(r.basePayment)}; recurring extra: ${currency(r.quote.extraPayment)}`, `Interest: ${currency(r.interest)}; fees/penalty: ${currency(r.fees)}; cashback kept: ${currency(r.quote.cashback)}`,
    `Borrowing cost over comparison: ${currency(r.netCost)}`, `Net cash outlay: ${currency(r.cashOutlay)}; amount owing: ${currency(r.endBalance)}`,
    `Principal reduction relative to original balance: ${currency(comparison.common.principal-r.endBalance)}`, ...r.warnings.map(w=>'Review: '+w), `Notes: ${r.quote.notes || 'None'}`, '');
  lines.push('METHOD', 'Nominal annual fixed rate compounded twice yearly, converted to equivalent payment-period rates.',
    'Base monthly annuity is rounded to cents. Standard payment = monthly × 12 / payments-per-year; accelerated biweekly = monthly / 2; accelerated weekly = monthly / 4, rounded to cents. A quoted payment overrides this estimate.',
    'Monthly dates use the start-day anniversary (month end stays month end); twice-monthly dates use midpoint and anniversary. Weekly and biweekly dates use 7/14-day intervals.',
    'Between payment dates, interest is compounded proportionally to elapsed days within that payment period; rounded to cents at every cash event and at comparison end. This is an explicit estimate convention, not a lender statement.',
    'Regular payments apply first, then recurring extras, then same-day lump sums. Fees/penalties paid at start; financed fees added to debt; cashback kept received at start.',
    'No quoted rate is projected beyond its stated term. Taxes, insurance, opportunity cost, discounting and unknown penalties/clawbacks are excluded.',
    'Lump-sum limits use loan-anniversary years and check only amount. Permission dates and other lender rules require review.',
    'Sources: FCAC mortgage information-box example and mortgage prepayment guidance; see the application’s Method tab.');
  return lines.join('\n') + '\n';
}
