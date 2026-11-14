import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { query, reportPeriod } from "../src/modules/reports/period.js";
import { availableReports, type Report } from "../src/modules/reports/contracts.js";
import { safeSpreadsheetText, encodeExport } from "../src/modules/reports/exports.js";
import { readFile } from "node:fs/promises";
const now=new Date("2026-10-30T12:00:00Z");
test("report calendar presets and inclusive custom dates",()=>{
  const expected={today:["2026-10-30","2026-10-30"],yesterday:["2026-10-29","2026-10-29"],"7d":["2026-10-24","2026-10-30"],"30d":["2026-10-01","2026-10-30"],week:["2026-10-26","2026-10-30"],month:["2026-10-01","2026-10-30"],"previous-month":["2026-09-01","2026-09-30"]};
  for(const [preset,dates] of Object.entries(expected)){const p=reportPeriod(query.parse({preset}),"Africa/Douala",now);assert.deepEqual([p.from,p.to],dates);}
  const p=reportPeriod(query.parse({preset:"custom",from:"2026-10-01",to:"2026-10-01"}),"Africa/Douala",now);assert.equal(p.start.toISOString(),"2026-09-30T23:00:00.000Z");assert.equal(p.end.toISOString(),"2026-10-01T23:00:00.000Z");
});
test("report timezone respects both DST transitions and midnight",()=>{
  for(const [date,hours] of [["2026-03-29",23],["2026-10-25",25]] as const){const p=reportPeriod(query.parse({preset:"custom",from:date,to:date}),"Europe/Brussels",now);assert.equal((p.end.getTime()-p.start.getTime())/3600000,hours);}
  const p=reportPeriod(query.parse({preset:"today"}),"Africa/Douala",new Date("2026-10-29T23:01:00Z"));assert.equal(p.from,"2026-10-30");
});
test("invalid and oversized periods or query injection fail closed",()=>{
  for(const values of [{preset:"custom"},{preset:"custom",from:"2025-01-01",to:"2026-10-30"},{preset:"custom",from:"2026-10-30",to:"2026-01-01"},{from:"2026-01-01"}])assert.throws(()=>reportPeriod(query.parse(values),"Africa/Douala",now));
  assert.throws(()=>reportPeriod(query.parse({}),"Invalid/Timezone",now));
  for(const values of [{companyId:"' OR 1=1"},{status:"' OR 1=1"},{page:0},{page:10001},{size:101},{timezone:"UTC"},{unknown:true}])assert.throws(()=>query.parse(values));
});
test("report capabilities distinguish global, operator, stock, shop and self",()=>{
  assert.deepEqual(availableReports({scope:"GLOBAL",permissions:["platform.manage"]}),["overview","subscriptions","audit"]);
  assert.deepEqual(availableReports({scope:"AGENCY",permissions:["stocks.read"]}),["overview","stocks"]);
  assert.deepEqual(availableReports({scope:"AGENCY",permissions:["deliveries.self.read","collections.self.read"]}),["overview","deliveries","collections"]);
  assert.deepEqual(availableReports({scope:"SHOP",permissions:["shop.orders.read"]}),["overview","orders"]);
  assert.deepEqual(availableReports({scope:"GLOBAL",permissions:["reports.read"]}),[]);
});
test("UI and server contracts remain identical",async()=>{
  const ui=await readFile(new URL("../../shared/reports.ts",import.meta.url),"utf8"),server=await readFile(new URL("../src/modules/reports/contracts.ts",import.meta.url),"utf8");
  assert.equal(ui.replace(/export interface ReportOptions[^\n]+\n/,""),server);
});
const fixture=():Report=>({kind:"orders",title:"Commandes",organization:"=HYPERLINK(\"https://invalid\")",generatedAt:now.toISOString(),period:{from:"2026-10-01",to:"2026-10-30",timezone:"Africa/Douala",start:now.toISOString(),end:now.toISOString()},filters:{preset:"30d"},metrics:[{key:"x",label:"Montant exact",value:"123456789012345.6789"}],tables:[{key:"orders",title:"Commandes",columns:["Nom","Montant"],rows:[[" +SUM(1;2)","0.1000"],["@X","0.2000"]],total:2,page:1,size:100}],series:[],notes:["Montants exacts et devises séparées."]});
test("CSV values are escaped and spreadsheet formulas neutralized",async()=>{
  for(const s of ["=1+1","+SUM(A1)","-1+1","@evil"," \t=evil","\uFEFF=1"])assert.ok(safeSpreadsheetText(s).startsWith("'"));
  const r=fixture();r.series=[{date:"2026-10-29",value:2}];r.comparison={from:"2026-09-01",to:"2026-09-30",orders:1};
  const {bytes,mime}=await encodeExport(r,"csv");assert.match(mime,/text\/csv/);const text=bytes.toString("utf8");assert.ok(text.startsWith("\uFEFF"));assert.match(text,/'=HYPERLINK/);assert.match(text,/123456789012345.6789/);assert.match(text,/"0.1000"/);assert.match(text,/"2026-10-29";"2"/);assert.match(text,/Comparaison précédente/);
});
test("XLSX reopens with exact text amounts and no executable formulas",async()=>{
  const {bytes}=await encodeExport(fixture(),"xlsx"),w=new ExcelJS.Workbook();await w.xlsx.load(bytes as never);
  const s=w.worksheets[0]!;assert.equal(s.getCell("B2").value,"'=HYPERLINK(\"https://invalid\")");let found=false;s.eachRow(row=>row.eachCell(c=>{assert.notEqual(c.type,ExcelJS.ValueType.Formula);if(c.value==="123456789012345.6789")found=true;}));assert.ok(found);
});
test("PDF is finalized with pages, metadata and a valid trailer",async()=>{
  const {bytes,mime}=await encodeExport(fixture(),"pdf");assert.equal(mime,"application/pdf");assert.ok(bytes.toString("ascii").startsWith("%PDF-"));assert.match(bytes.toString("latin1"),/\/Type \/Page/);assert.match(bytes.toString("latin1"),/%%EOF/);
});
test("export never silently truncates paginated tables",async()=>{const r=fixture();r.tables[0]!.total=101;for(const f of ["csv","xlsx","pdf"] as const)await assert.rejects(encodeExport(r,f),/100 lignes/);});
