import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Report } from "./contracts.js";
import { stockError } from "../stocks/access.js";
export const safeSpreadsheetText = (value: unknown) => {
  const s = Array.from(String(value ?? "")).filter(c=>{const code=c.charCodeAt(0);return code>=32||[9,10,13].includes(code);}).join("");
  return /^[\s\uFEFF]*[-=+@]/u.test(s) ? "'" + s : s;
};
export function exportRows(r: Report): string[][] {
  const rows: string[][] = [["DND Delivery",r.title],["Organisation",r.organization],["Période",`${r.period.from} → ${r.period.to}`],["Fuseau",r.period.timezone],["Généré le",r.generatedAt],["Filtres",JSON.stringify(r.filters)],[]];
  for(const m of r.metrics) rows.push([m.label,m.value==null?"Indisponible":String(m.value),m.unit??""]);
  if(r.comparison) rows.push([], ["Comparaison précédente",`${r.comparison.from} au ${r.comparison.to}`],["Commandes de la période précédente",String(r.comparison.orders)]);
  if(r.series.length) rows.push([], ["Évolution quotidienne",r.kind==="collections"?"Nombre de déclarations":"Volume"],["Date locale","Volume"],...r.series.map(x=>[x.date,String(x.value)]));
  for(const table of r.tables) {
    if(table.total>table.rows.length) throw stockError("EXPORT_TOO_LARGE","Le rapport dépasse 100 lignes par tableau. Réduisez les filtres pour un export complet.",422);
    rows.push([], [table.title],table.columns,...table.rows.map(row=>row.map(v=>v==null?"":String(v))));
  }
  rows.push([], ["Définitions et limites"],...r.notes.map(note=>[note]));
  if(rows.length>2000) throw stockError("EXPORT_TOO_LARGE","Export limité à 2 000 lignes.",422);
  return rows;
}
export async function encodeExport(r: Report, format: "csv"|"xlsx"|"pdf") {
  const rows=exportRows(r);
  if(format==="csv") return { mime:"text/csv; charset=utf-8", bytes:Buffer.from("\uFEFF"+rows.map(row=>row.map(v=>'"'+safeSpreadsheetText(v).replaceAll('"','""')+'"').join(";")).join("\r\n"),"utf8") };
  if(format==="xlsx") {
    const workbook=new ExcelJS.Workbook();workbook.creator="DND Delivery";workbook.created=new Date(r.generatedAt);
    const sheet=workbook.addWorksheet("Rapport",{views:[{state:"frozen",ySplit:7}]});
    for(const row of rows) sheet.addRow(row.map(safeSpreadsheetText));
    sheet.columns.forEach(column=>{column.width=28;});
    sheet.eachRow(row=>{row.alignment={wrapText:true,vertical:"top"};});
    sheet.getRow(1).font={bold:true,color:{argb:"FF033173"},size:16};
    return {mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytes:Buffer.from(await workbook.xlsx.writeBuffer())};
  }
  const document=new PDFDocument({size:"A4",layout:"landscape",margin:36,info:{Title:r.title,Author:"DND Delivery"}}),chunks:Buffer[]=[];
  const result=new Promise<Buffer>((resolve,reject)=>{document.on("data",(chunk:Buffer)=>chunks.push(chunk));document.on("end",()=>resolve(Buffer.concat(chunks)));document.on("error",reject);});
  document.fillColor("#033173").fontSize(18).text("DND Delivery — "+r.title).moveDown();
  document.fontSize(9).fillColor("#172c43");
  for(const row of rows.slice(1)) { if(document.y>document.page.height-65) document.addPage(); document.text(row.join("  |  ").replaceAll("→"," vers ").replaceAll("−","-"),{width:document.page.width-72}).moveDown(0.35); }
  document.end();
  return {mime:"application/pdf",bytes:await result};
}
