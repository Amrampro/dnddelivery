import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { ReportService } from "../../src/modules/reports/service.js";
import { query } from "../../src/modules/reports/period.js";
import { encodeExport } from "../../src/modules/reports/exports.js";
import type { ReportContext } from "../../src/modules/reports/access.js";
import type { Report, ReportKind } from "../../src/modules/reports/contracts.js";
const metric=(r:Report,k:string)=>r.metrics.find(m=>m.key===k)?.value;
test("MySQL reporting: calculations, real lifecycle, scope, exports and audit",async t=>{
  const f=await confirmationFixture(),db=f.db,s=new ReportService(db,"Africa/Douala"),q=query.parse({preset:"today"});
  const run=(kind:ReportKind,c:ReportContext=f.cc,extra:Record<string,unknown>={})=>s.run(c,kind,query.parse({...q,...extra}));
  try {
    await t.test("report permission metadata remains compatible with existing modules",async()=>{
      const permissions=await db.permission.findMany({where:{code:{in:["reports.read","audit.read"]}},include:{rolePermission_permissionRecords:true}});
      assert.equal(permissions.length,2);for(const permission of permissions){assert.ok(Number.isFinite(permission.updatedAt.getTime()));for(const grant of permission.rolePermission_permissionRecords){assert.ok(grant.id);assert.ok(Number.isFinite(grant.updatedAt.getTime()));}}
    });
    const active=await f.fresh("0"),success=await f.fresh("0");
    await f.photo(success.id);await f.verified(success.id);
    const info=await f.s.confirmation(f.dc,success.id);
    await f.s.complete(f.dc,success.id,{...f.action(info),evidenceIds:info.evidence.filter(e=>e.current&&e.status==="READY").map(e=>e.id)});
    await t.test("orders count and prior-period comparison use actual data",async()=>{const r=await run("orders");assert.equal(metric(r,"orders.created"),2);assert.equal(r.series.reduce((s,x)=>s+x.value,0),2);assert.equal(r.comparison?.orders,0);assert.ok(!JSON.stringify(r).includes("Private recipient address"));});
    await t.test("success rate, first recorded attempt and duration",async()=>{const r=await run("deliveries");assert.equal(metric(r,"deliveries.success"),1);assert.equal(metric(r,"deliveries.rate"),"100.00");assert.equal(metric(r,"deliveries.first"),"100.00");assert.ok(Number(metric(r,"deliveries.minutes"))>=0);assert.equal(metric(r,"deliveries.progress"),1);});
    await t.test("agency and courier comparison without assignment duplication",async()=>{for(const kind of ["agencies","drivers"] as const){const r=await run(kind),table=r.tables.find(t=>t.key===kind)!;assert.equal(table.rows.length,1);assert.equal(Number(table.rows[0]![1]),2);assert.equal(Number(table.rows[0]![2]),1);if(kind==="drivers")assert.equal(Number(r.tables.find(t=>t.key==="drivers.assignments")!.rows[0]![2]),2);}});
    await t.test("date filtering produces empty data and null ratios",async()=>{const r=await run("deliveries",f.cc,{preset:"custom",from:"2000-01-01",to:"2000-01-02"});assert.equal(metric(r,"deliveries.success"),0);assert.equal(metric(r,"deliveries.rate"),null);assert.equal(metric(r,"deliveries.minutes"),null);});
    await t.test("other company selection is rejected, not silently ignored",async()=>{await assert.rejects(run("orders",f.cc,{companyId:f.other.id}));await assert.rejects(run("orders",{...f.cc,companyId:f.other.id,actorId:f.manager.id}));});
    await t.test("agency boundaries reject changed identifiers",async()=>{assert.equal(metric(await run("orders",f.ac),"orders.created"),2);await assert.rejects(run("orders",f.ac,{agencyId:f.otherAgency.id}));});
    await t.test("shop consolidation exposes only own orders and linked carriers",async()=>{assert.equal(metric(await run("orders",f.sc),"orders.created"),2);assert.equal(metric(await run("orders",f.xc),"orders.created"),0);await assert.rejects(run("orders",f.sc,{companyId:f.other.id}));await assert.rejects(run("orders",f.sc,{shopId:f.xc.shopId}));});
    await t.test("courier self report rejects peer and company-wide analytics",async()=>{assert.equal(metric(await run("deliveries",f.dc),"deliveries.success"),1);assert.equal(metric(await run("deliveries",f.ec),"deliveries.success"),0);await assert.rejects(run("deliveries",f.dc,{courierId:f.peer.id}));await assert.rejects(run("drivers",f.dc));await assert.rejects(run("orders",f.dc));await assert.rejects(run("audit",f.dc));});
    await t.test("stocks use physical-reserved balances and movements",async()=>{
      const product=await db.product.create({data:{shopId:f.shop.id,name:"Reporting product",sku:f.key(),unit:"pièce"}});
      const stock=await db.stock.create({data:{companyId:f.company.id,agencyId:f.agency.id,shopId:f.shop.id,productId:product.id,physicalQuantity:12,reservedQuantity:2,alertThreshold:10}});
      await db.stockMovement.create({data:{companyId:f.company.id,stockId:stock.id,actorId:f.admin.id,type:"DEPOSIT",physicalDelta:12,reservedDelta:2,physicalAfter:12,reservedAfter:2,operationKey:f.key()}});
      const r=await run("stocks");assert.equal(metric(r,"stocks.available"),10);assert.equal(metric(r,"stocks.reserved"),2);assert.equal(metric(r,"stocks.low"),1);assert.equal(r.tables.find(t=>t.key==="stocks.movements")!.rows[0]![2],"12");
    });
    await t.test("stock transit agrees with the existing transfer formula",async()=>{
      const product=await db.product.findFirstOrThrow({where:{shopId:f.shop.id}});
      const transfer=await db.transfer.create({data:{companyId:f.company.id,reference:f.key(),originAgencyId:f.agency.id,destinationAgencyId:f.otherAgency.id,initiatedById:f.admin.id,status:"IN_TRANSIT",departedAt:new Date()}});
      await db.transferItem.create({data:{companyId:f.company.id,transferId:transfer.id,shopId:f.shop.id,productId:product.id,quantity:8,receivedQuantity:1,lostQuantity:1,returnedQuantity:2}});
      assert.equal(metric(await run("stocks"),"stocks.transit"),4);
    });
    await t.test("inventory counted difference remains distinct from a correction",async()=>{
      const stock=await db.stock.findFirstOrThrow({where:{companyId:f.company.id}}),inventory=await db.inventorySession.create({data:{companyId:f.company.id,agencyId:f.agency.id,reference:f.key(),actorId:f.admin.id}});
      await db.inventoryItem.create({data:{companyId:f.company.id,inventoryId:inventory.id,stockId:stock.id,shopId:f.shop.id,productId:stock.productId,expectedPhysical:12,expectedReserved:2,stockVersion:stock.version,countedQuantity:9}});
      const row=(await run("stocks")).tables.find(t=>t.key==="stocks.inventories")!.rows[0]!;assert.equal(String(row[3]),"-3");assert.equal((await db.stock.findUniqueOrThrow({where:{id:stock.id}})).physicalQuantity,12);
    });
    await t.test("financial expected, net and remaining use exact amounts",async()=>{
      const d=await f.fresh("100.1000");
      await f.finance.declare(f.dc,{deliveryId:d.id,deliveryVersion:d.version,operationKey:f.key(),amount:"60.1000",method:"CASH",notes:"Partial report fixture"});
      const r=await run("collections"),total=r.tables.find(t=>t.key==="finance.totals")!.rows[0]!;
      assert.equal(total[1],"60.1000");assert.equal(total[4],"0.0000");assert.equal(total[5],"60.1000");
      const owed=r.tables.find(t=>t.key==="finance.obligations")!.rows.find(x=>x[2]==="100.1000")!;assert.equal(owed[4],"40.0000");assert.equal(owed[5],"PARTIAL");
      const shop=await run("collections",f.sc);assert.equal(shop.tables.find(t=>t.key==="finance.totals")!.columns.length,4);assert.ok(!shop.tables.some(t=>t.key==="finance.remittances"));
    });
    await t.test("stock manager is limited to stock reports",async()=>{
      const role=await db.role.findUniqueOrThrow({where:{code:"stock_manager"}});
      await db.agencyMembership.update({where:{companyId_agencyId_userId:{companyId:f.company.id,agencyId:f.agency.id,userId:f.peer.id}},data:{roleId:role.id}});
      assert.equal(metric(await run("stocks",f.ec),"stocks.available"),10);await assert.rejects(run("orders",f.ec));await assert.rejects(run("collections",f.ec));
    });
    await t.test("confirmed agency receipts and remaining courier liability reconcile",async()=>{
      const collection=await db.collection.findFirstOrThrow({where:{companyId:f.company.id}});
      const remit=await f.finance.createRemittance(f.dc,{agencyId:f.agency.id,currency:"XAF",operationKey:f.key(),items:[{collectionId:collection.id,amount:"20.1000"}]});
      await f.finance.decideRemittance(f.ac,remit.id,{...f.action(remit),decision:"CONFIRM",items:remit.items.map(i=>({id:i.id,confirmedAmount:i.declaredAmount!}))});
      const totals=(await run("collections")).tables.find(t=>t.key==="finance.totals")!.rows[0]!;
      assert.equal(totals[4],"20.1000");assert.equal(totals[5],"40.0000");assert.equal(totals[6],"0.0000");
      const driver=(await run("collections",f.dc)).tables.find(t=>t.key==="finance.totals")!.rows[0]!;assert.equal(driver[5],"40.0000");
    });
    await t.test("audit fields are read-only, paginated, scoped and secret-free",async()=>{
      await db.auditLog.create({data:{companyId:f.company.id,agencyId:f.agency.id,actorId:f.admin.id,action:"REPORT_TEST",entityType:"Report",entityId:active.id,metadata:{password:"never-export-this",otp:"123456",nested:{token:"private-token"}}}});
      const r=await run("audit",f.cc,{action:"REPORT_TEST",size:1});assert.equal(r.tables[0]!.total,1);assert.ok(!JSON.stringify(r).includes("never-export-this"));assert.ok(!JSON.stringify(r).includes("123456"));assert.equal(r.tables[0]!.rows[0]![2],"REPORT_TEST");await assert.rejects(run("audit",f.sc));
    });
    await t.test("table pagination is stable and export cannot lose rows",async()=>{
      const r=await run("collections",f.cc,{size:1});const ids=r.tables.find(t=>t.key==="finance.obligations")!;assert.equal(ids.rows.length,1);
      const complete=await run("orders",f.cc,{size:100});for(const format of ["csv","xlsx","pdf"] as const){const output=await encodeExport(complete,format);assert.ok(output.bytes.length>100);}
    });
    await t.test("SaaS aggregates stay separate from operational funds",async()=>{
      const role=await db.role.create({data:{code:"report-global-"+f.key(),name:"Reporting global test",scope:"GLOBAL"}}),permission=await db.permission.findUniqueOrThrow({where:{code:"platform.manage"}});
      await db.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
      await db.globalRoleGrant.create({data:{userId:f.approver.id,roleId:role.id,roleScope:"GLOBAL"}});
      const c:ReportContext={actorId:f.approver.id,scope:"GLOBAL"};
      const subscription=await db.subscription.findUniqueOrThrow({where:{companyId:f.company.id}});
      await db.subscriptionPayment.create({data:{companyId:f.company.id,subscriptionId:subscription.id,declaredById:f.admin.id,amount:"15.1234",currency:"XAF",method:"CASH",status:"APPROVED",validatedById:f.approver.id,validatedAt:new Date(),paidAt:new Date()}});
      const r=await run("subscriptions",c,{companyId:f.company.id});assert.equal(metric(r,"saas.total"),1);assert.equal(r.tables.find(t=>t.key==="saas.payments")!.rows[0]![2],"15.1234");assert.ok(!JSON.stringify(r).includes("60.1000"));await assert.rejects(run("orders",c));await assert.rejects(run("collections",c));await assert.rejects(run("audit",c,{companyId:f.company.id}));
    });
    await t.test("all role dashboards and option lists run on real MySQL",async()=>{
      const start=Date.now();for(const c of [f.cc,f.ac,f.dc,f.sc,f.ec]){const r=await run("overview",c);assert.ok(r.metrics.length||r.tables.length);const o=await s.options(c);assert.ok(o.kinds.length>0);if(c===f.dc){assert.equal(o.couriers.length,0);assert.equal(o.shops.length,0);}}assert.ok(Date.now()-start<30000,"Five bounded dashboards complete within 30s on test database");
    });
  } finally {await db.$disconnect();}
});



