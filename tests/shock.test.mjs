import test from 'node:test';import assert from 'node:assert/strict';import {rateScenario} from '../web/shock.mjs';
test('independent Canadian mortgage reference and zero change',()=>{const r=rateScenario(100000,300,5,5);assert.equal(r.before,58160);assert.equal(r.after,58160);assert.equal(r.difference,0);});
test('zero interest and rate rise payments',()=>{const r=rateScenario(120000,120,0,6);assert.equal(r.before,100000);assert.ok(r.after>r.before);assert.equal(r.difference,r.after-r.before);assert.ok(r.rows.every(p=>p.rate>=0));});
test('reject missing rates and fractional amortization rather than treating blank as zero',()=>{for(const values of [[100000,240,'',5],[100000,2.5,4,5],[-10,240,4,5]])assert.throws(()=>rateScenario(...values));});
