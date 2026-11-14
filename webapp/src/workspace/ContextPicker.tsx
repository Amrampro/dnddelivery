import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { Workspace } from "../auth/types";
const environmentKey = (w:Workspace) => w.scope === 'SHOP' ? `shop:${w.shopId}` : w.companyId ? `company:${w.companyId}` : 'global';
export function ContextPicker({ context }: { context: Workspace }) {
  const auth=useAuth(),navigate=useNavigate();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const choices=auth.profile?.organizations ?? [];
  const environments=choices.filter((w,i)=>choices.findIndex(v=>environmentKey(v)===environmentKey(w))===i);
  const carriers=choices.filter(w=>w.scope==='SHOP' && w.shopId===context.shopId);
  const agencies=choices.filter(w=>w.scope==='AGENCY' && w.companyId===context.companyId);
  async function select(key:string){
    if(key===context.key)return;
    setBusy(true);setError('');
    try{const p=await auth.select(key);if(p.activeContext)navigate(`/portail/${p.activeContext.portal}`);}
    catch(e){setError(e instanceof Error?e.message:'Changement impossible.');}
    finally{setBusy(false);}
  }
  return <div className="ws-context">
    <span className="ws-company-icon"><Building2 size={19}/></span>
    <div><label htmlFor="ws-company">ENVIRONNEMENT</label>
      <select id="ws-company" disabled={busy} value={environmentKey(context)} onChange={e=>{
        const matching=choices.filter(w=>environmentKey(w)===e.target.value);
        const target=matching.find(w=>w.scope==='COMPANY'||w.scope==='GLOBAL'||(w.scope==='SHOP'&&!w.companyId))??matching[0];
        if(target)void select(target.key);
      }}>{environments.map(w=><option key={environmentKey(w)} value={environmentKey(w)}>{w.scope==='SHOP'?w.shopName:w.companyName}</option>)}</select>
    </div>
    {context.scope==='SHOP' && <div className="ws-agency-select"><label htmlFor="ws-carrier">TRANSPORTEUR</label>
      <select id="ws-carrier" value={context.key} disabled={busy} onChange={e=>void select(e.target.value)}>
        {carriers.map(w=><option key={w.key} value={w.key}>{w.companyId?`${w.companyName}${w.subscriptionAccess?.valid===false?' · accès limité':''}`:'Ma boutique · sans transporteur'}</option>)}
      </select>
    </div>}
    {context.scope!=='SHOP' && agencies.length>0 && <div className="ws-agency-select"><label htmlFor="ws-agency">AGENCE</label>
      <select id="ws-agency" value={context.agencyId?context.key:''} disabled={busy} onChange={e=>void select(e.target.value)}>
        <option value="" disabled>Choisir une agence</option>{agencies.map(w=><option key={w.key} value={w.key}>{w.agencyName}</option>)}
      </select>
    </div>}
    {busy&&<small role="status">Changement…</small>}{error&&<small role="alert" className="ds-error-text">{error}</small>}
  </div>;
}
