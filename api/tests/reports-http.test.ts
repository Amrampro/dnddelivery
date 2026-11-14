import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { app } from "../src/app.js";
import { reportKinds } from "../src/modules/reports/contracts.js";
import { createReportRouter } from "../src/modules/reports/routes.js";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { errors } from "../src/middlewares/errors.js";
import type { ReportService } from "../src/modules/reports/service.js";
import { stockError } from "../src/modules/stocks/access.js";
test("every reporting endpoint rejects anonymous access and disables caching",async()=>{
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  try{const addr=server.address();assert.ok(addr&&typeof addr!=="string");const base=`http://127.0.0.1:${addr.port}/api/reports`;
    for(const kind of [...reportKinds,"options"]){const r=await fetch(`${base}/${kind}`);assert.equal(r.status,401);assert.equal(r.headers.get("cache-control"),"no-store");}
    assert.equal((await fetch(`${base}/exports`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,401);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("export requires trusted origin, CSRF, strict filters and read authorization",async()=>{
  const f=await authFixture(),login=await f.service.login("auth-fixture@example.invalid",fixturePassword,{client:"WEB",deviceName:"Report test",userAgent:null,ipHash:null});
  const p=await f.service.authenticate(login.accessToken,"WEB");await f.service.switchOrganization(p,`agency:${f.companyA}:${f.agencyA}`);
  let reads=0;
  const service={run:async()=>{reads++;throw stockError("REPORT_DENIED","Rapport non autorisé.",403);}} as unknown as ReportService;
  const a=express();a.use(express.json(),cookieParser());a.use("/reports",createReportRouter(()=>f.service,()=>service,["http://localhost:5173"]));a.use(errors);
  const server=a.listen(0,"127.0.0.1");await once(server,"listening");
  try{const addr=server.address();assert.ok(addr&&typeof addr!=="string");const url=`http://127.0.0.1:${addr.port}/reports/exports`,body=JSON.stringify({kind:"orders",format:"csv",filters:{}}),headers={"Content-Type":"application/json","X-DND-Client":"web",Cookie:`dnd_access=${login.accessToken}`,Origin:"http://localhost:5173"};
    assert.equal((await fetch(url,{method:"POST",headers:{...headers,Origin:"https://evil.invalid"},body})).status,403);
    assert.equal((await fetch(url,{method:"POST",headers,body})).status,403);assert.equal(reads,0);
    const valid={...headers,"X-CSRF-Token":login.csrfToken!};
    assert.equal((await fetch(url,{method:"POST",headers:valid,body:JSON.stringify({kind:"orders",format:"csv",filters:{companyId:"' OR 1=1"}})})).status,400);assert.equal(reads,0);
    assert.equal((await fetch(url,{method:"POST",headers:valid,body})).status,403);assert.equal(reads,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});



