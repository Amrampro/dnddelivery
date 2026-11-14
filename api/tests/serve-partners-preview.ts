// Explicit loopback recipe, never used by the application startup.
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createDatabase} from '../src/database/client.js';
import {hashPassword} from '../src/modules/auth/crypto.js';
import {localSmtp} from './helpers/local-smtp.js';
const url=process.env.DATABASE_URL;
if(process.env.NODE_ENV!=='test'||process.env.DND_ADMIN_TEST_PREVIEW!=='1'||!url||!/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test environment only');
const db=createDatabase(url),folder=path.resolve('../.local-preserved/bloc8');
await mkdir(folder,{recursive:true});
const companies: Array<{id:string;reference:string}>=[];
for(const [i,name] of ['Transport Mboa','Colis du Littoral'].entries()){
 const reference=`BLOC8-UI-C${i+1}`;
 const company=await db.company.upsert({where:{reference},create:{reference,name,email:`bloc8-c${i}@example.invalid`,phone:'0000000000',address:'Adresse de recette',countryCode:'CM',city:'Douala',status:'ACTIVE'},update:{status:'ACTIVE'}});
 companies.push(company);
 const plan=await db.subscriptionPlan.findUniqueOrThrow({where:{referenceSlot:1}});
 await db.subscription.upsert({where:{companyId:company.id},create:{companyId:company.id,planId:plan.id,status:'ACTIVE',startedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000)},update:{status:'ACTIVE',startedAt:new Date(),expiresAt:new Date(Date.now()+30*86400000)}});
}
const shops:Array<{id:string;reference:string}>=[];
for(const [i,name] of ['Boutique Mboa','Seconde boutique de recette'].entries()){
 const reference=`BLOC8-UI-S${i+1}`;
 const shop=await db.shop.upsert({where:{reference},create:{reference,name,email:`bloc8-shop${i}@example.invalid`,phone:'0000000000',address:'Adresse de recette',countryCode:'CM',city:'Douala',district:'Bonapriso',status:'ACTIVE',termsAcceptedAt:new Date(),termsVersion:'recipe-fixture'},update:{status:'ACTIVE'}});
 shops.push(shop);
}
const accounts:Array<{kind:string;email:string;password:string;userId:string}>=[];
for(const kind of ['company_admin','shop_owner','shop_employee']){
 const email=`bloc8-ui-${kind}@example.invalid`,password=randomBytes(24).toString('base64url');
 const user=await db.user.upsert({where:{email},create:{email,fullName:kind==='company_admin'?'Administratrice transporteur':kind==='shop_owner'?'Propriétaire boutique':'Employé boutique',passwordHash:await hashPassword(password),emailVerifiedAt:new Date()},update:{status:'ACTIVE',passwordHash:await hashPassword(password)}});
 const role=await db.role.findUniqueOrThrow({where:{code:kind}});
 if(kind==='company_admin')for(const c of companies)await db.companyMembership.upsert({where:{companyId_userId:{companyId:c.id,userId:user.id}},create:{companyId:c.id,userId:user.id,roleId:role.id},update:{roleId:role.id,active:true}});
 else for(const s of kind==='shop_owner'?shops:shops.slice(0,1))await db.shopMembership.upsert({where:{shopId_userId:{shopId:s.id,userId:user.id}},create:{shopId:s.id,userId:user.id,roleId:role.id},update:{active:true,roleId:role.id}});
 accounts.push({kind,email,password,userId:user.id});
}
for(const c of companies)await db.companyShop.upsert({where:{companyId_shopId:{companyId:c.id,shopId:shops[0]!.id}},create:{companyId:c.id,shopId:shops[0]!.id,status:'ACTIVE',origin:'COMPANY',acceptedAt:new Date(),startedAt:new Date(),initiatorUserId:accounts[0]!.userId,decisionUserId:accounts[1]!.userId},update:{}});
await writeFile(path.join(folder,'ui-accounts.json'),JSON.stringify({companies,shops,accounts}));
const smtp=await localSmtp(message=>{void writeFile(path.join(folder,'latest-test-email.txt'),message);});
Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),SMTP_FROM:'test@example.invalid',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_SECURE:'false'});
const {app}=await import('../src/app.js');
const server=app.listen(4399,'127.0.0.1',()=>console.log('Partner recipe ready: MySQL and local SMTP.'));
async function close(){server.closeAllConnections();server.close();await smtp.close();await db.$disconnect();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
