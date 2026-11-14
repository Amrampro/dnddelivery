// Opt-in end-to-end API recipe against the loopback-only, dedicated-MySQL preview.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const url=process.env.TEST_DATABASE_URL;
if(process.env.DND_ADMIN_TEST_PREVIEW!=='1'||process.env.NODE_ENV!=='test'||!url||!/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)))throw new Error('Dedicated test workflow required');
const folder='../.local-preserved/bloc5',credentials=JSON.parse(await readFile(`${folder}/ui-account.json`,'utf8'));
let cookies='',csrf='';
async function request(path:string,method='GET',body?:unknown,authenticated=true){const response=await fetch('http://127.0.0.1:4399/api'+path,{method,headers:{Origin:'http://127.0.0.1:5183','X-DND-Client':'web',...(body?{'Content-Type':'application/json'}:{}),...(authenticated&&cookies?{Cookie:cookies}:{}),...(authenticated&&csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});if(authenticated&&response.headers.getSetCookie().length)cookies=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');const data=await response.json().catch(()=>null);return{status:response.status,data};}
let response=await request('/auth/login','POST',credentials);assert.equal(response.status,200);csrf=response.data.csrfToken;
assert.equal((await request('/auth/switch-organization','POST',{contextKey:'global'})).status,200);
const suffix=randomUUID().slice(0,8),email=`recette-${suffix}@example.invalid`;
response=await request('/admin/companies','POST',{name:'Entreprise de recette MySQL',reference:`RECETTE-${suffix.toUpperCase()}`,email:'contact-recette@example.invalid',phone:'0000000000',address:'Adresse réservée à la recette',city:'Douala',countryCode:'CM',status:'INACTIVE',administrator:{mode:'invite',email,fullName:'Administrateur de recette'}});
assert.equal(response.status,201);assert.equal(response.data.invitationDelivery,'SENT');const id=response.data.company.id;
response=await request(`/admin/companies/${id}`);const first=response.data.invitations[0];
const readToken=async()=>{const mail=(await readFile(`${folder}/latest-test-email.txt`,'utf8')).replace(/=\r?\n/g,'').replace(/=3D/g,'=');const link=mail.match(/http:\/\/127\.0\.0\.1:5183\/invitation#token=[A-Za-z0-9_-]{43}/)?.[0];assert.ok(link);return{link,token:new URL(link).hash.slice(7)};};
const old=await readToken();assert.equal((await request(`/admin/invitations/${first.id}/resend`,'POST',{version:first.version})).status,200);const fresh=await readToken();assert.notEqual(fresh.token,old.token);assert.equal((await request('/invitations/inspect','POST',{token:old.token},false)).status,400);
const password=randomBytes(24).toString('base64url');assert.equal((await request('/invitations/accept','POST',{token:fresh.token,fullName:'Responsable de recette',password},false)).status,200);assert.equal((await request('/invitations/accept','POST',{token:fresh.token,fullName:'Replay',password},false)).status,400);
await writeFile(`${folder}/recipient-account.json`,JSON.stringify({email,password}));
for(const label of ['revoked','pending']){response=await request(`/admin/companies/${id}`);const invited=await request(`/admin/companies/${id}/admins/invite`,'POST',{version:response.data.company.version,email:`${label}-${suffix}@example.invalid`,fullName:`Invité ${label}`});assert.equal(invited.status,201);assert.equal(invited.data.invitationDelivery,'SENT');if(label==='revoked'){const invitation=invited.data.invitations.find((i:{email:string})=>i.email===`${label}-${suffix}@example.invalid`);assert.equal((await request(`/admin/invitations/${invitation.id}/revoke`,'POST',{version:invitation.version})).status,200);}else{const invitation=await readToken();await writeFile(`${folder}/ui-invitation-link.txt`,invitation.link);}}
await writeFile(`${folder}/ui-company.json`,JSON.stringify({id,reference:`RECETTE-${suffix.toUpperCase()}`}));
console.log('MySQL API recipe passed: company persisted, local SMTP received, resend rotated, old link rejected, account activated, replay rejected, revocation persisted.');
