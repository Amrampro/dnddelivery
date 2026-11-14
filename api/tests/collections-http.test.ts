import {test} from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {app} from "../src/app.js";
import {units,amount,bounded} from "../src/modules/collections/money.js";
test("operational financial resources reject anonymous reads and declarations while health stays public",async()=>{
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");
 try{const address=server.address();assert.ok(address&&typeof address!=="string");const base=`http://127.0.0.1:${address.port}`;
  for(const path of ["financial-overview","financial-obligations","financial-options","financial-history","financial-corrections","financial-discrepancies","cash-remittances","collections","financial-notifications"]){const res=await fetch(`${base}/api/${path}`);assert.equal(res.status,401,path);assert.equal(res.headers.get("cache-control"),"no-store");}
  for(const path of ["driver/collections","driver/cash-remittances","financial-corrections","financial-discrepancies"]){const res=await fetch(`${base}/api/${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(res.status,401,path);}
  assert.equal((await fetch(base+"/api/health")).status,200);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("financial arithmetic retains four decimals and the full DECIMAL(19,4) range without floats",()=>{
 assert.equal(amount(units("0.1")+units("0.2")),"0.3000");assert.equal(amount(units("999999999999999.9999")),"999999999999999.9999");assert.throws(()=>bounded(units("999999999999999.9999")+1n));assert.throws(()=>bounded(-1n));assert.throws(()=>units("1e3"));
});
