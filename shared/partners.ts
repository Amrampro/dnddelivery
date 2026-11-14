/** Shared API contracts for partner shops; no permissions are inferred here. */
export interface PartnerPage<T> { items:T[];total:number;page:number;size:number }
export type CollaborationStatus = 'PENDING'|'ACTIVE'|'REJECTED'|'SUSPENDED'|'ENDED';
export type CollaborationOrigin = 'COMPANY'|'SHOP';
export type ShopRole = 'shop_owner'|'shop_manager'|'shop_employee';
export interface ShopProfile {
 id:string;reference:string;name:string;legalName:string|null;description:string|null;
 email:string;phone:string;countryCode:string|null;city:string|null;district:string|null;
 address:string;logoUrl:string|null;status:string;version:number;createdAt:string;updatedAt:string;
}
export interface PartnerCompany {
 id:string;reference:string;name:string;tradeName?:string|null;logoUrl?:string|null;
 email?:string;phone?:string;address?:string;city:string;countryCode:string;
}
export interface CollaborationEvent {
 id:string;action:string;createdAt:string;actorId?:string|null;reason?:string|null;
 metadata?:Record<string,unknown>|null;actor?:{fullName:string}|null;
}
export interface PartnerCollaboration {
 id:string;companyId:string;shopId:string;status:CollaborationStatus;origin:CollaborationOrigin;
 version:number;reason:string|null;observations?:string|null;requestedAt:string;
 acceptedAt:string|null;suspendedAt:string|null;endedAt:string|null;createdAt?:string;updatedAt?:string;
 shop:ShopProfile;company:PartnerCompany;
 openOperations?:{stockLocations:number;openOrders:number;openDeliveries:number;openTransfers:number};
 allowedAgencyIds?:string[]|null;
 agencies?:Array<{id:string;name:string;reference:string;city?:string|null}>;
 history?:CollaborationEvent[];
 subscriptionAccess?:{valid:boolean;status:string;expiresAt:string|null};
}
export interface ShopUser {
 userId:string;shopId?:string;role:ShopRole;active:boolean;status:string;version:number;
 user:{id:string;fullName:string;email:string;phone:string|null};createdAt?:string;
}
export interface ShopInvitation {
 id:string;kind:string;email:string;name?:string;fullName?:string;role?:ShopRole;
 status:string;deliveryStatus?:string;expiresAt:string;createdAt:string;shopName?:string;companyName?:string;
}
export const collaborationLabels:Record<CollaborationStatus,string>={PENDING:'En attente',ACTIVE:'Active',REJECTED:'Refusée',SUSPENDED:'Suspendue',ENDED:'Terminée'};
export const shopRoleLabels:Record<ShopRole,string>={shop_owner:'Propriétaire',shop_manager:'Gestionnaire',shop_employee:'Employé'};
export const partnerActionLabels:Record<string,string>={
 PARTNER_SHOP_CREATED:'Boutique créée',PARTNER_PROFILE_UPDATED:'Profil commercial modifié',
 PARTNER_USER_INVITED:'Utilisateur invité',PARTNER_USER_UPDATED:'Affiliation modifiée',PARTNER_USER_REMOVED:'Affiliation retirée',
 PARTNER_REQUESTED:'Collaboration demandée',PARTNER_ACCEPTED:'Collaboration acceptée',PARTNER_REJECTED:'Collaboration refusée',PARTNER_SUSPENDED:'Collaboration suspendue',PARTNER_ENDED:'Collaboration terminée',
};
