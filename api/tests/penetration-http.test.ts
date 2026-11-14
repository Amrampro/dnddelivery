import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";
import { errors } from "../src/middlewares/errors.js";
import { app } from "../src/app.js";

async function serve(a:typeof app){const server=a.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();assert.ok(address&&typeof address!=="string");return{port:address.port,base:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};}
test("penetration: conflicting HTTP framing is rejected and does not poison the next request",async()=>{
 const h=await serve(app);
 try{
  for(const framing of ["Content-Length: 4\r\nTransfer-Encoding: chunked", "Content-Length: 4\r\nContent-Length: 8"]){
   const response=await new Promise<string>((resolve,reject)=>{const socket=createConnection({host:"127.0.0.1",port:h.port});let data="";socket.setTimeout(2000,()=>socket.destroy(Error("Local protocol test timed out")));socket.once("connect",()=>socket.write(`POST /api/auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\n${framing}\r\nConnection: close\r\n\r\n0\r\n\r\n`));socket.on("data",chunk=>{data+=chunk.toString();if(data.length>8192)socket.destroy();});socket.once("end",()=>resolve(data));socket.once("error",reject);});
   assert.match(response,/^HTTP\/1\.1 400 /);
   assert.equal((await fetch(h.base+"/api/health")).status,200);
  }
 }finally{await h.close();}
});
test("penetration: hostile origins, CSRF bypass attempts and cookie-to-mobile confusion fail",async()=>{
 const f=await authFixture(),a=express();a.use(express.json());a.use(cookieParser());a.use("/auth",createAuthRouter(()=>f.service,["http://localhost:5173"]));a.use(errors);
 const h=await serve(a);
 try{
  const login=await fetch(h.base+"/auth/login",{method:"POST",headers:{Origin:"http://localhost:5173","X-DND-Client":"web","Content-Type":"application/json"},body:JSON.stringify({email:"auth-fixture@example.invalid",password:fixturePassword})});
  assert.equal(login.status,200);const bundle=await login.json();const cookie=login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  for(const origin of ["https://hostile.invalid","http://localhost:5173.hostile.invalid","null"]){const r=await fetch(h.base+"/auth/me",{method:"PATCH",headers:{Origin:origin,"X-DND-Client":"web",Cookie:cookie,"X-CSRF-Token":bundle.csrfToken,"Content-Type":"application/json"},body:JSON.stringify({fullName:"CSRF mutation",phone:null})});assert.equal(r.status,403);}
  const noCsrf=await fetch(h.base+"/auth/me",{method:"PATCH",headers:{Origin:"http://localhost:5173","X-DND-Client":"web",Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify({fullName:"CSRF mutation",phone:null})});assert.equal(noCsrf.status,403);
  assert.equal((await fetch(h.base+"/auth/me",{headers:{"X-DND-Client":"mobile",Cookie:cookie}})).status,401);
  const access=cookie.split("; ").find(c=>c.startsWith("dnd_access="))!.slice("dnd_access=".length);
  assert.equal((await fetch(h.base+"/auth/me",{headers:{"X-DND-Client":"mobile",Authorization:"Bearer "+access}})).status,401);
  assert.notEqual(f.store.data.users.get(f.userId)!.fullName,"CSRF mutation");
 }finally{await h.close();}
});
test("penetration: forwarded-address forgery cannot bypass login throttling",async()=>{
 const f=await authFixture(),a=express();a.set("trust proxy",0);a.use(express.json());a.use(cookieParser());a.use("/auth",createAuthRouter(()=>f.service,["http://localhost:5173"]));a.use(errors);const h=await serve(a);
 try{for(let i=0;i<14;i++){const r=await fetch(h.base+"/auth/login",{method:"POST",headers:{"X-DND-Client":"mobile","X-Forwarded-For":`192.0.2.${i+1}`,"Content-Type":"application/json"},body:JSON.stringify({email:"auth-fixture@example.invalid",password:"incorrect fixture password"})});assert.equal(r.status,i<12?401:429);}}finally{await h.close();}
});
test("penetration: concurrent reuse of a refresh token revokes the resulting family",async()=>{
 const f=await authFixture(),a=express();a.use(express.json());a.use(cookieParser());a.use("/auth",createAuthRouter(()=>f.service,["http://localhost:5173"]));a.use(errors);const h=await serve(a);
 try{const initial=await f.service.login("auth-fixture@example.invalid",fixturePassword,{client:"MOBILE",deviceName:"Concurrent local test",userAgent:null,ipHash:null});const responses=await Promise.all([1,2].map(()=>fetch(h.base+"/auth/refresh",{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({refreshToken:initial.refreshToken})})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);const winner=responses.find(r=>r.status===200)!;const renewed=await winner.json();assert.equal((await fetch(h.base+"/auth/me",{headers:{"X-DND-Client":"mobile",Authorization:"Bearer "+renewed.accessToken}})).status,401);}finally{await h.close();}
});
test("penetration: hostile email coercion objects are validation errors rather than internal failures",async()=>{
 const f=await authFixture(),a=express();a.use(express.json());a.use(cookieParser());a.use("/auth",createAuthRouter(()=>f.service,["http://localhost:5173"]));a.use(errors);const h=await serve(a);
 try{
  for(const email of [{toString:null},{toString:{}},{toString:null,valueOf:null},null,42,["auth-fixture@example.invalid"]]){
   const r=await fetch(h.base+"/auth/login",{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({email,password:"invalid fixture password"})});assert.equal(r.status,400);
  }
  for(const email of [{toString:null},{toString:{}},null]){
   const r=await fetch(h.base+"/auth/forgot-password",{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({email})});assert.equal(r.status,400);
  }
  const control=await fetch(h.base+"/auth/login",{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({email:"auth-fixture@example.invalid",password:fixturePassword})});assert.equal(control.status,200);
 }finally{await h.close();}
});
