import test from 'node:test';
import assert from 'node:assert/strict';
import {pinRequestIdentity} from './request-identity.ts';
test('security: a business retry remains bound to its original user and context',()=>{
 const first=pinRequestIdentity('/orders',{method:'POST',body:'same-idempotent-body',headers:{'Content-Type':'application/json'}},{userId:'user-a',contextKey:'company-a'});
 const retry=pinRequestIdentity('/orders',first,{userId:'user-b',contextKey:'company-b'});
 const headers=new Headers(retry.headers);
 assert.equal(headers.get('X-DND-User'),'user-a');assert.equal(headers.get('X-DND-Context'),'company-a');
 assert.equal(headers.get('Content-Type'),'application/json');assert.equal(retry.body,first.body);
});
test('security: a request begun anonymously cannot become another account mutation after retry',()=>{
 const first=pinRequestIdentity('/orders',{method:'POST'},{userId:null,contextKey:null});
 const retry=pinRequestIdentity('/orders',first,{userId:'new-user',contextKey:'company-b'});
 assert.equal(new Headers(retry.headers).get('X-DND-User'),'anonymous');
});
test('security: auth profile and logout can recover from a stale selected context',()=>{
 const options={};
 assert.equal(pinRequestIdentity('/auth/logout',options,{userId:'old',contextKey:'old-company'}),options);
 assert.equal(pinRequestIdentity('/auth/me',options,{userId:'old',contextKey:'old-company'}),options);
 for(const [endpoint,method]of [['/auth/me','PATCH'],['/auth/change-password','POST'],['/auth/switch-organization','POST'],['/auth/logout-all','POST'],['/auth/sessions/id','DELETE']]){
  const operation=pinRequestIdentity(endpoint,{method},{userId:'old',contextKey:'old-company'});
  assert.equal(new Headers(operation.headers).get('X-DND-User'),'old');
 }
});
