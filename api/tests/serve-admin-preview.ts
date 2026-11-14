// Real-MySQL UI test harness. Explicitly guarded, loopback only, never imported by the runtime.
import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase } from '../src/database/client.js';
import { hashPassword } from '../src/modules/auth/crypto.js';
import { localSmtp } from './helpers/local-smtp.js';
const value=process.env.DATABASE_URL;
if(process.env.DND_ADMIN_TEST_PREVIEW!=='1'||process.env.NODE_ENV!=='test'||!value||!/^dnd_delivery[\w]*_test$/.test(new URL(value).pathname.slice(1)))throw new Error('Dedicated test environment required');
const db=createDatabase(value),folder=path.resolve('../.local-preserved/bloc5');await mkdir(folder,{recursive:true});
const password=randomBytes(24).toString('base64url'),email='bloc5-ui-owner@example.invalid';
const user=await db.user.upsert({where:{email},create:{email,fullName:'Administrateur · Recette MySQL',passwordHash:await hashPassword(password)},update:{passwordHash:await hashPassword(password),status:'ACTIVE'}});
const role=await db.role.upsert({where:{code:'bloc5_ui_global'},create:{code:'bloc5_ui_global',name:'Super Administrateur · Recette',scope:'GLOBAL'},update:{}});
for(const code of ['workspace.access','platform.manage','subscriptions.validate']){const permission=await db.permission.upsert({where:{code},create:{code,description:code},update:{}});await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});}
await db.globalRoleGrant.upsert({where:{userId:user.id},create:{userId:user.id,roleId:role.id,roleScope:'GLOBAL'},update:{roleId:role.id,active:true}});
await writeFile(path.join(folder,'ui-account.json'),JSON.stringify({email,password}));
const smtp=await localSmtp(message=>{void writeFile(path.join(folder,'latest-test-email.txt'),message);});
process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT=String(smtp.port);process.env.SMTP_FROM='test@example.invalid';process.env.SMTP_USER='';process.env.SMTP_PASSWORD='';process.env.SMTP_SECURE='false';
const {app}=await import('../src/app.js');
const server=app.listen(4399,'127.0.0.1',()=>console.log('MySQL administration test UI ready on loopback; SMTP remains local.'));
async function close(){server.closeAllConnections();server.close();await smtp.close();await db.$disconnect();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
