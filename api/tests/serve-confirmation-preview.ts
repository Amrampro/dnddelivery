// Explicit loopback-only recipe. Never imported by normal application startup.
import "./serve-finance-preview.js";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {createDatabase} from "../src/database/client.js";
import {TrackingService,trackingLink} from "../src/modules/confirmation/tracking.js";
import {OrderService} from "../src/modules/orders/service.js";
import {DeliveryService} from "../src/modules/deliveries/service.js";
import {OrderNotifications} from "../src/modules/orders/notifications.js";
import {DeliveryNotifications} from "../src/modules/deliveries/notifications.js";
import {ConfirmationNotifications} from "../src/modules/confirmation/internal-notifications.js";
import {subscriptionMailer} from "../src/modules/auth/smtp.js";
import {localSmtp} from "./helpers/local-smtp.js";
const url=process.env.DATABASE_URL;
if(process.env.NODE_ENV!=="test"||process.env.DND_ADMIN_TEST_PREVIEW!=="1"||!url||!/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)))throw Error("Dedicated test environment required");
const db=createDatabase(url),folder=path.resolve("../.local-preserved/bloc13"),recipe=JSON.parse(await readFile("../.local-preserved/bloc12/ui-accounts.json","utf8")) as {companyId:string;orderId:string;deliveryId:string;accounts:Array<{kind:string;userId:string;email:string;password:string}>};
await mkdir(folder,{recursive:true});
process.env.DELIVERY_PROOF_DIR=path.join(folder,"ui-proof-files");
const order=await db.order.findUniqueOrThrow({where:{id:recipe.orderId}}),link=await db.$transaction(tx=>trackingLink(tx,order));
await writeFile(path.join(folder,"ui-private.json"),JSON.stringify({...recipe,link}));
await sharp({create:{width:640,height:400,channels:3,background:"#e7edf4"}}).composite([{input:Buffer.from('<svg width="640" height="400"><rect x="150" y="80" width="340" height="250" rx="12" fill="#b28c5a"/><rect x="299" y="80" width="42" height="250" fill="#d6bc94"/><rect x="200" y="150" width="240" height="90" rx="8" fill="white"/><text x="320" y="180" text-anchor="middle" font-family="Arial" font-size="18" fill="#033173">DND Delivery</text><text x="320" y="212" text-anchor="middle" font-family="Arial" font-size="16" fill="#033173">COLIS DE RECETTE BLOC 13</text></svg>')}]).jpeg().toFile(path.join(folder,"ui-parcel.jpg"));
let messages:string[]=[];try{messages=JSON.parse(await readFile(path.join(folder,"smtp-private.json"),"utf8"));}catch{/* First run. */}
let save=Promise.resolve();
const smtp=await localSmtp(message=>{messages.push(message);save=save.then(()=>writeFile(path.join(folder,"smtp-private.json"),JSON.stringify(messages)));});
Object.assign(process.env,{SMTP_HOST:"127.0.0.1",SMTP_PORT:String(smtp.port),SMTP_FROM:"test@example.invalid",SMTP_USER:"",SMTP_PASSWORD:"",SMTP_SECURE:"false"});
await new TrackingService(db).lookup({reference:order.publicNumber,email:order.recipientEmail},"bloc13-preview-"+recipe.orderId);
const mailer=subscriptionMailer(),orders=new OrderNotifications(new OrderService(db),()=>new Date(),recipe.companyId),deliveries=new DeliveryNotifications(new DeliveryService(db),()=>new Date(),recipe.companyId),internal=new ConfirmationNotifications(db,()=>new Date(),recipe.companyId);
let processing=false;
async function processNotifications(){if(processing)return;processing=true;try{await orders.run(mailer,20);await deliveries.run(mailer,20);await internal.run(mailer,20);await save;}catch{/* Recipe keeps operations available during mail retries. */}finally{processing=false;}}
await processNotifications();setInterval(()=>void processNotifications(),3000).unref();
console.log("Confirmation recipe ready: existing mission retained, private photo storage and local SMTP only.");
