import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { availableReports, reportLabels, type Report, type ReportKind, type ReportOptions } from "../../../shared/reports";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import { useDeliveryData } from "../deliveries/useDeliveryData";
import { Card, Field, Select, Button, DataTable, Stat, Skeleton, ErrorState, EmptyState } from "../design/ui";
import "./reports.css";
const presets = [["today","Aujourd’hui"],["yesterday","Hier"],["7d","Sept derniers jours"],["30d","Trente derniers jours"],["week","Semaine en cours"],["month","Mois en cours"],["previous-month","Mois précédent"],["custom","Dates personnalisées"]];
export function ReportsWorkspace({context,dashboard=false,defaultKind="overview"}:{context:Workspace;dashboard?:boolean;defaultKind?:ReportKind}) {
  const kinds=availableReports(context),[params,setParams]=useSearchParams(),chosen=params.get("report") as ReportKind;
  const kind=kinds.includes(chosen)?chosen:defaultKind;
  const [draft,setDraft]=useState<Record<string,string>>({preset:"30d"}),[filters,setFilters]=useState<Record<string,string>>({preset:"30d"}),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[exportError,setExportError]=useState("");
  const url=`/reports/${kind}?${new URLSearchParams({...filters,page:String(page),size:"20"})}`;
  const data=useDeliveryData<Report>(kinds.length?url:null),r=data.data;
  const options=useDeliveryData<ReportOptions>("/reports/options");
  const exporting=useRef<AbortController|null>(null);
  useEffect(()=>()=>exporting.current?.abort(),[]);
  function changeKind(value:string){setParams(p=>{p.set("report",value);return p;});setFilters({preset:"30d"});setDraft({preset:"30d"});setPage(1);setExportError("");}
  async function download(format:"csv"|"xlsx"|"pdf") {
    exporting.current?.abort();
    const controller=new AbortController();exporting.current=controller;
    setBusy(true);setExportError("");
    try {
      const file=await api<{filename:string;mime:string;base64:string}>("/reports/exports",{method:"POST",signal:controller.signal,body:JSON.stringify({kind,format,filters})});
      if(controller.signal.aborted)return;
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)),href=URL.createObjectURL(new Blob([bytes],{type:file.mime}));
      const a=document.createElement("a");a.href=href;a.download=file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
    } catch(e){if(!controller.signal.aborted)setExportError(e instanceof Error?e.message:"Export indisponible.");}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  if(!kinds.length)return <EmptyState title="Aucun rapport autorisé" description="Choisissez un environnement disposant des permissions de lecture."/>;
  const global=context.scope==="GLOBAL",audit=kind==="audit",logistics=["orders","deliveries","agencies","drivers"].includes(kind);
  return <>
    <header className="ws-page-title"><div><span className="ws-eyebrow">DND DELIVERY · DONNÉES RÉELLES</span><h1>{dashboard?"Votre activité en un regard":"Rapports et statistiques"}</h1><p>{context.agencyName??context.shopName??context.companyName}</p></div></header>
    <Card title="Période et périmètre">
      <form onSubmit={e=>{e.preventDefault();setFilters(Object.fromEntries(Object.entries(draft).filter(([,v])=>v!=="")));setPage(1);setExportError("");}}>
        <div className="ds-form-grid">
          <Select label="Rapport" value={kind} onChange={e=>changeKind(e.target.value)}>{kinds.map(k=><option key={k} value={k}>{reportLabels[k]}</option>)}</Select>
          <Select label="Période" value={draft.preset} onChange={e=>setDraft({...draft,preset:e.target.value,from:"",to:""})}>{presets.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select>
          {draft.preset==="custom"&&<><Field label="Du" type="date" required value={draft.from??""} onChange={e=>setDraft({...draft,from:e.target.value})}/><Field label="Au (inclus)" type="date" required value={draft.to??""} onChange={e=>setDraft({...draft,to:e.target.value})}/></>}
        </div>
        <details><summary>Filtres avancés</summary><div className="ds-form-grid">
          {([
            ["companyId","Entreprise / transporteur",options.data?.companies],
            ["agencyId","Agence",options.data?.agencies],
            ...(!audit?[["shopId","Boutique",options.data?.shops],["courierId","Livreur",options.data?.couriers]]:[]),
          ] as [string,string,{id:string;name:string}[]|undefined][]).filter(([key,,items])=>items?.length&&!(audit&&key==="companyId")).map(([key,label,items])=><Select key={key} label={label} value={draft[key]??""} onChange={e=>setDraft({...draft,[key]:e.target.value})}><option value="">Tout le périmètre autorisé</option>{items?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select>)}
          {audit&&[["actorId","Identifiant de l’auteur"],["module","Entité / module"],["action","Action exacte"]].map(([key,label])=><Field key={key} label={label} value={draft[key]??""} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>)}
          {logistics&&<><Field label="Statut exact" value={draft.status??""} onChange={e=>setDraft({...draft,status:e.target.value})}/><Select label="Type de commande" value={draft.type??""} onChange={e=>setDraft({...draft,type:e.target.value})}><option value="">Tous</option><option value="ONE_OFF">Ponctuelle</option><option value="FROM_STOCK">Depuis stock</option></Select></>}
        </div></details>
        <div className="report-actions"><Button type="submit">Appliquer les filtres</Button><Button type="button" variant="secondary" onClick={data.reload}>Actualiser</Button></div>
      </form>
    </Card>
    {options.error&&<ErrorState message={options.error} retry={options.reload}/>}
    {data.error&&<ErrorState message={data.error} retry={data.reload}/>}
    {!r&&!data.error&&<Skeleton rows={5}/>}
    {r&&<>
      <p className="report-caption">Du {r.period.from} au {r.period.to} · {r.period.timezone} · Généré le {new Date(r.generatedAt).toLocaleString("fr-FR",{timeZone:r.period.timezone})}</p>
      {r.metrics.length>0&&<div className="report-metrics">{r.metrics.map(m=><Stat key={m.key} label={m.label} value={m.value??"—"} detail={m.unit??"Données du périmètre sélectionné"}/>)}</div>}
      {r.comparison&&<p>Comparaison : {r.comparison.orders} commandes du {r.comparison.from} au {r.comparison.to}.</p>}
      {r.series.length>0?<Card title={global?"Évolution des inscriptions":kind==="collections"?"Nombre de déclarations reçues":"Évolution des commandes"}><div className="report-chart" role="img" aria-label="Évolution quotidienne, valeurs dans le tableau accessible"><ResponsiveContainer width="100%" height="100%"><LineChart data={r.series}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="value" name="Volume" stroke="#033173" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div><details><summary>Consulter les valeurs</summary><DataTable caption="Évolution quotidienne" columns={["Date","Volume"]} rows={r.series.map(x=>[x.date,x.value])}/></details></Card>:kind!=="audit"&&<EmptyState title="Aucune évolution enregistrée" description="Les tableaux ci-dessous restent disponibles pour les données de votre périmètre."/>}
      {r.tables.map(t=><Card key={t.key} title={t.title}>
        {["orders.status","agencies","drivers","stocks.agencies"].includes(t.key)&&t.rows.length>0&&<div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={t.rows.map(row=>({label:row[0],value:Number(row[t.key==="stocks.agencies"?4:1])}))}><XAxis dataKey="label" hide/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#0BB058" name="Volume"/></BarChart></ResponsiveContainer></div>}
        {t.rows.length?<DataTable caption={t.title} columns={t.columns} rows={t.rows.map(row=>row.map(v=>v??"—"))}/>:<EmptyState title="Aucune donnée pour ces filtres" description="Aucun événement enregistré dans ce périmètre et cette période."/>}
        <p>{t.total} lignes · page {t.page}</p>
      </Card>)}
      <div className="report-actions"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(page-1)}>Précédent</Button><span>Page {page}</span><Button variant="secondary" disabled={!r.tables.some(t=>t.total>page*20)} onClick={()=>setPage(page+1)}>Suivant</Button></div>
      <Card title="Exporter le rapport complet"><p>CSV, Excel ou PDF. Réduisez les filtres si un tableau dépasse 100 lignes.</p><div className="report-actions">{(["csv","xlsx","pdf"] as const).map(f=><Button key={f} busy={busy} onClick={()=>void download(f)}>{f.toUpperCase()}</Button>)}</div>{exportError&&<p role="alert">{exportError}</p>}</Card>
      <Card title="Définitions et limites">{r.notes.map(note=><p key={note}>{note}</p>)}</Card>
      {dashboard&&<div className="report-actions">{[["commandes","orders.read"],["stocks","stocks.read"],["encaissements","financial.supervise.read"],["courses","deliveries.self.read"]].filter(([,p])=>context.permissions.includes(p)).map(([id])=><Link key={id} className="ds-button ds-secondary" to={`/portail/${context.portal}/${id}`}>Ouvrir {id}</Link>)}</div>}
    </>}
  </>;
}
