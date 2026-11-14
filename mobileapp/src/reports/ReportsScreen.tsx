import { useState } from "react";
import { Text, View } from "react-native";
import type { Workspace } from "../auth/types";
import { useApiData } from "../auth/useApiData";
import { availableReports,reportLabels,type Report,type ReportKind,type ReportOptions } from "../../../shared/reports";
import { Button,Card,Input,Selector,ErrorMessage,Loading,EmptyState,ui } from "../design/ui";
export function ReportsScreen({context,onNavigate,defaultKind="overview"}:{context:Workspace;onNavigate:(id:string)=>void;defaultKind?:ReportKind}) {
  const kinds=availableReports(context),[kind,setKind]=useState<ReportKind>(defaultKind),[preset,setPreset]=useState("30d"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[company,setCompany]=useState(""),[query,setQuery]=useState("preset=30d"),[page,setPage]=useState(1);
  const data=useApiData<Report>(kinds.includes(kind)?`/reports/${kind}?${query}&page=${page}&size=10`:null,60000),r=data.data;
  const options=useApiData<ReportOptions>("/reports/options");
  function choose(k:ReportKind){setKind(k);setPage(1);}
  return <>
    <Text role="heading" style={ui.sectionTitle}>Rapports et statistiques</Text>
    <Text style={ui.body}>{context.agencyName??context.shopName??context.companyName}</Text>
    <Card><Text style={ui.label}>Rapport</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{kinds.map(k=><Button key={k} secondary={kind!==k} title={reportLabels[k]} onPress={()=>choose(k)}/>)}</View></Card>
    <Card><Text style={ui.label}>Période</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[["today","Aujourd’hui"],["yesterday","Hier"],["7d","7 jours"],["30d","30 jours"],["week","Semaine"],["month","Ce mois"],["previous-month","Mois précédent"],["custom","Dates"]].map(([v,l])=><Button key={v} title={l!} secondary={preset!==v} onPress={()=>setPreset(v!)}/>)}</View>
      {preset==="custom"&&<><Input label="Du (AAAA-MM-JJ)" value={from} onChangeText={setFrom}/><Input label="Au inclus (AAAA-MM-JJ)" value={to} onChangeText={setTo}/></>}
      {context.scope==="SHOP"&&<Selector label="Transporteur" value={company} onChange={setCompany} options={[{id:"",label:"Tous mes transporteurs"},...(options.data?.companies??[]).map(x=>({id:x.id,label:x.name}))]}/>}
      <Button title="Appliquer" onPress={()=>{const p=new URLSearchParams({preset});if(preset==="custom"){p.set("from",from);p.set("to",to);}if(context.scope==="SHOP"&&company)p.set("companyId",company);setQuery(p.toString());setPage(1);}}/>
    </Card>
    {options.error&&<ErrorMessage message={options.error} retry={options.reload}/>}
    {data.error&&<ErrorMessage message={data.error} retry={data.reload}/>}
    {!r&&!data.error&&<Loading/>}
    {r&&<><Text style={ui.body}>{r.period.from} → {r.period.to} · {r.period.timezone}</Text>
      {r.metrics.map(m=><Card key={m.key}><Text style={ui.label}>{m.label}</Text><Text style={ui.sectionTitle}>{m.value??"—"} {m.unit??""}</Text></Card>)}
      {r.comparison&&<Text style={ui.body}>Période précédente : {r.comparison.orders} commandes.</Text>}
      {r.series.length>0&&<Card><Text style={ui.label}>Évolution quotidienne</Text>{r.series.slice(-31).map(x=><View key={x.date} style={{gap:4,marginVertical:4}}><Text style={ui.body}>{x.date} : {x.value}</Text><View accessibilityLabel={`${x.value} opérations`} style={{height:8,borderRadius:4,backgroundColor:"#0BB058",width:`${Math.max(1,100*x.value/Math.max(1,...r.series.map(s=>s.value)))}%`}}/></View>)}</Card>}
      {r.tables.map(t=><Card key={t.key}><Text role="heading" style={ui.sectionTitle}>{t.title}</Text>{!t.rows.length?<EmptyState title="Aucune donnée" description="Aucun événement pour ces filtres."/>:t.rows.map((row,i)=><View key={i} style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e4eaf2"}}>{row.map((v,j)=><Text key={j} style={ui.body}>{t.columns[j]} : {v??"—"}</Text>)}</View>)}<Text style={ui.body}>{t.total} lignes</Text></Card>)}
      <View style={{flexDirection:"row",gap:12}}><Button title="Précédent" disabled={page===1} secondary onPress={()=>setPage(page-1)}/><Button title="Suivant" disabled={!r.tables.some(t=>t.total>page*10)} secondary onPress={()=>setPage(page+1)}/></View>
      <Card><Text style={ui.label}>Définitions</Text>{r.notes.map(note=><Text key={note} style={ui.body}>{note}</Text>)}</Card>
    </>}
    <Button secondary title="Actualiser" onPress={data.reload}/>
    {context.permissions.includes("deliveries.self.read")&&<Button title="Ouvrir mes missions" onPress={()=>onNavigate("courses")}/>}
    {context.permissions.includes("stocks.read")&&<Button title="Ouvrir les stocks" onPress={()=>onNavigate("stocks")}/>}
  </>;
}


