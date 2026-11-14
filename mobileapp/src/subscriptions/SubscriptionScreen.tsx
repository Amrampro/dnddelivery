import { useState } from "react";
import { Text, View } from "react-native";
import { useApiData } from "../auth/useApiData";
import { Badge, Button, Card, Detail, ErrorMessage, ListRow, Loading, ui } from "../design/ui";
import { date, Pager, type Page } from "../stocks/ui";
import { financialMoney } from "../../../shared/finance";
type Subscription = {
  status:string; daysRemaining:number; serverTime:string;
  company:{name:string;status:string}; subscription:{expiresAt:string|null}|null;
  currentPeriod:{startsAt:string;endsAt:string}|null;
  plan:{plan:{name:string}|null;current:{amount:string;currency:string}|null};
};
type Payment={id:string;status:string;amount:string;currency:string;createdAt:string;rejectionReason:string|null};
const labels:Record<string,string>={ACTIVE:"Actif",EXPIRED:"Expiré",NONE:"Non souscrit",PENDING:"En attente de validation",SUSPENDED:"Suspendu",CANCELLED:"Résilié",APPROVED:"Confirmé",REJECTED:"Rejeté"};
export function SubscriptionScreen(){
  const [page,setPage]=useState(1), subscription=useApiData<Subscription>("/company/subscription"), payments=useApiData<Page<Payment>>(`/company/subscription/payments?page=${page}&size=10`);
  if(!subscription.data) return subscription.error?<ErrorMessage message={subscription.error} retry={subscription.reload}/>:<Loading/>;
  const value=subscription.data;
  return <View style={ui.stack}>
    <Text style={ui.kicker}>MON ABONNEMENT</Text><Text role="heading" style={ui.sectionTitle}>{value.company.name}</Text>
    {subscription.error&&<ErrorMessage message={subscription.error} retry={subscription.reload}/>}
    <Card><Badge success={value.status==="ACTIVE"}>{labels[value.status]??value.status}</Badge><Text style={ui.body}>Échéance : {date(value.subscription?.expiresAt)} · {value.daysRemaining} jour(s) restant(s), calculés par le serveur.</Text><Text style={ui.body}>Le statut de l’entreprise et celui de son abonnement sont contrôlés séparément.</Text><Button secondary title="Actualiser l’abonnement" onPress={()=>{subscription.reload();payments.reload();}}/></Card>
    <Detail entries={[{label:"Offre",value:value.plan.plan?.name??"Non configurée"},{label:"Tarif courant",value:value.plan.current?financialMoney(value.plan.current.amount,value.plan.current.currency):"Non configuré"},{label:"Période en cours",value:value.currentPeriod?`${date(value.currentPeriod.startsAt)} → ${date(value.currentPeriod.endsAt)}`:"Aucune période enregistrée"}]}/>
    <Card><Text role="heading" style={ui.sectionTitle}>Déclarations de règlement</Text><Text style={ui.body}>Les règlements sont réalisés hors plateforme. Leur déclaration et leur validation restent accessibles depuis le portail Web de l’entreprise. Aucun paiement n’est exécuté ici.</Text>
      {payments.error&&<ErrorMessage message={payments.error} retry={payments.reload}/>}
      {payments.data?.items.map(payment=><ListRow key={payment.id} title={`${financialMoney(payment.amount,payment.currency)} · ${labels[payment.status]??payment.status}`} description={`${date(payment.createdAt)}${payment.rejectionReason?`\n${payment.rejectionReason}`:""}`}/>)}
      {payments.data?.total===0&&<Text style={ui.body}>Aucune déclaration enregistrée.</Text>}
      {payments.data&&<Pager page={page} size={10} total={payments.data.total} setPage={setPage}/>}
    </Card>
  </View>;
}
