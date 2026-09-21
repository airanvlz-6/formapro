import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsRuntime} from '../sports/trainingContractTestRuntime.mjs';
const {applyFactualReview}=sportsRuntime()('../chat/coachFactualReview');
const answer='Tu HRV cayó un 25%. Reduciría la exigencia y revisaría cómo respondes.';
for(const kind of ['interpretation','recommendation','metadata'])test(kind+' cannot veto or rewrite coaching',()=>{
 const result=applyFactualReview(answer,{supported:false,unsupportedClaims:[{quote:'Reduciría la exigencia',kind}]});
 assert.equal(result.answer,answer);assert.equal(result.status,'coaching_only');assert.equal(result.allowAuthority,kind!=='metadata');
});
test('exact factual removal preserves remaining coaching and removes every occurrence',()=>{
 const result=applyFactualReview(answer+' Tu HRV cayó un 25%.',{supported:false,unsupportedClaims:[{quote:'Tu HRV cayó un 25%.',kind:'unsupported_fact'}]});
 assert.ok(!result.answer.includes('HRV'));assert.ok(result.answer.includes('Reduciría la exigencia'));assert.equal(result.allowAuthority,false);
});
test('overlapping factual spans cannot leave a partially asserted claim',()=>{
 const result=applyFactualReview(answer,{supported:false,unsupportedClaims:[{quote:'Tu HRV cayó un 25%.',kind:'unsupported_fact'},{quote:'HRV cayó',kind:'unsupported_fact'}]});
 assert.equal(result.answer,'[Afirmación factual no verificada omitida.] Reduciría la exigencia y revisaría cómo respondes.');
});
for(const review of [null,{supported:false,unsupportedClaims:[]},{supported:false,unsupportedClaims:['legacy category']},{supported:false,unsupportedClaims:[{quote:'absent',kind:'unsupported_fact'}]}])test('unusable review keeps explicitly unverified coaching with no authority '+JSON.stringify(review),()=>{
 const result=applyFactualReview(answer,review);assert.equal(result.status,'unverified');assert.equal(result.allowAuthority,false);assert.ok(result.answer.includes('> '+answer));
});
