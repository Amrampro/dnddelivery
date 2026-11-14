// Local test recipe only. Never imported by production code.
import "dotenv/config";
import { mkdir, writeFile, access } from "node:fs/promises";
import { confirmationFixture } from "./helpers/confirmation-fixture.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
import { app } from "../src/app.js";
import { createDatabase } from "../src/database/client.js";
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.NODE_ENV!=="test"||process.env.DND_REPORT_PREVIEW!=="1"||process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL||!target||!/^dnd_delivery[\w]*_test$/.test(target.pathname.slice(1))||!["127.0.0.1","localhost"].includes(target.hostname))throw Error("Explicit dedicated local report recipe required");
await mkdir("../.local-preserved/bloc15",{recursive:true});
const exists=await access("../.local-preserved/bloc15/ui-private.json").then(()=>true,()=>false);
const db=exists?createDatabase(process.env.DATABASE_URL!):await (async()=>{
  const f=await confirmationFixture(),password="Reporting recipe only 2026",passwordHash=await hashPassword(password);
  for(const user of [f.admin,f.manager,f.courier,f.owner])await f.db.user.update({where:{id:user.id},data:{passwordHash}});
  await f.fresh("100.1000");await f.fresh("0");
  await writeFile("../.local-preserved/bloc15/ui-private.json",JSON.stringify({companyId:f.company.id,accounts:[f.admin,f.manager,f.courier,f.owner].map((u,i)=>({kind:["company","agency","courier","shop"][i],email:u.email,password}))}));
  return f.db;
})();
const server=app.listen(4399,"127.0.0.1",()=>console.log("Reporting recipe ready on loopback 4399; real MySQL test data only."));
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{server.closeAllConnections();server.close(()=>{void db.$disconnect().finally(()=>process.exit(0));});});
