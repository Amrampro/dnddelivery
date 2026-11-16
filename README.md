# DND Delivery — Blocs 1 à 14

Dernière vérification transversale : [audit de sécurité du 29 octobre 2026](docs/SECURITY_AUDIT_2026-10-29.md). **399 tests distincts réussis**, corrections de dépendances, sessions/contextes Web, appareils push, récupération et stockage privé. Audit npm API/Web : 0 avis connus ; mobile : rétroportages locaux testés et alerte Zod 3 de l’outillage encore ouverte. Lire les limites du rapport avant diffusion ; aucun déploiement de production effectué.

Fondations indépendantes : `api` (Express/TypeScript), `webapp` (React/Vite), `mobileapp` (Expo SDK 57). Node.js **22.23.4** recommandé ; branches corrigées 24.22.1+ et 26.12.1+ également acceptées selon `engines`. MySQL 8 est requis ; la santé API et les interfaces de présentation démarrent sans connexion, avec un runtime autorisé.

Campagne d’intrusion complémentaire : [preuves, corrections et limites](docs/PENTEST_LOCAL_2026-10-29.md). Sur cette machine, `scripts/npm-local.ps1 -App api` (ou `webapp` / `mobileapp`) lance le projet avec le Node portable corrigé sans remplacer la version globale de Windows.

Résultat le plus récent : **418 tests distincts réussis** et 114 requêtes ciblées d’intrusion/contrôle. Erreurs sur faux fichiers et e-mails malformés corrigées, canal temporel d’inscription réduit, pagination bornée et runtime du projet sécurisé. Les nombres des sections suivantes décrivent leurs étapes historiques.

## Installation et démarrage

Ouvrir trois terminaux depuis la racine. Chaque application possède son propre package.json et package-lock.json et se déploie indépendamment.

```powershell
cd api
npm ci
npm run dev
```

```powershell
cd webapp
npm ci
npm run dev
```

```powershell
cd mobileapp
npm ci
npm start
```

Web : http://localhost:5173. API : http://localhost:3000/api/health et /api/v1/health. Expo : scanner le QR avec un environnement compatible SDK 57, ou utiliser un build de développement adapté. Sous PowerShell, utiliser `npm.cmd` et `npx.cmd` si les arguments précédés de `--` sont mal transmis par npm.ps1.

En cas d’erreur de connexion, vérifier `http://localhost:3000/api/ready`. Un statut 503 indique que la configuration de l’authentification ou la connexion MySQL nécessite une vérification. Au démarrage, l’API indique le nom des paramètres d’authentification invalides dans son terminal. Sur Windows, relancer une fois `npm run dev` pour charger le lanceur mis à jour. Il recharge ensuite les modifications du fichier `api/.env` présent au lancement. Sur Linux, redémarrer le processus après une modification de ce fichier.

## Vérifications et compilation

| Dossier | Contrôles | Compilation |
| --- | --- | --- |
| api | `npm run lint`, `npm run typecheck`, `npm test` | `npm run build`, puis `npm start` |
| webapp | `npm run lint` | `npm run build`, puis `npm run preview` |
| mobileapp | `npm run lint`, `npm run typecheck`, `npx.cmd expo install --check` | `npm run build` (export JS Android/iOS/Web) |

L’export Expo n’est pas une compilation binaire native. Les builds Android/iOS signés utilisent EAS après liaison du nouveau projet à votre compte. Aucun ancien identifiant EAS ni certificat de signature n’est réutilisé automatiquement.

## Environnements

`api/.env` est privé, conservé et ignoré. Sur une nouvelle installation, copier `api/.env.example` vers `.env`. Ne jamais copier les secrets API dans le Web ou Expo. Le serveur valide NODE_ENV, PORT, HOST, CORS_ORIGINS et LOG_LEVEL. `CORS_ORIGINS` accepte une liste d’origines séparées par des virgules, sans slash final. L’ancienne variable `CORS_ORIGIN` n’est plus utilisée. Les anciennes variables privées sont préservées mais sans effet pour ce bloc.

`webapp/.env` ne contient que `VITE_API_URL`. `mobileapp/.env` ne contient que `EXPO_PUBLIC_API_URL`. Ces deux fichiers publics sont explicitement autorisés par les gitignore. Les valeurs sont intégrées au build ; les clients utilisent désormais les endpoints d’authentification.

### Téléphone physique

Configurer par exemple `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api` avec l’adresse réelle de l’ordinateur sur le réseau Wi-Fi commun. `localhost` sur le téléphone désigne le téléphone. L’API écoute par défaut sur `0.0.0.0` ; autoriser uniquement le réseau de développement nécessaire dans le pare-feu. Redémarrer Expo après changement. Un serveur HTTPS accessible convient pour une future installation distante. Un tunnel Metro n’expose pas automatiquement l’API.

## Architecture

- `api/src` : configuration validée (Zod), contrôleurs, routes, services, repositories, validators, middlewares et utilitaires. Helmet, CORS, Pino, erreurs centralisées, limites JSON, SIGINT/SIGTERM et délai d’arrêt. Client MySQL/Prisma chargé à la demande, 48 modèles et migrations versionnées sous `api/prisma`. Aucun accès automatique à une ancienne base.
- `webapp/src/components`, `pages`, `layouts`, `data.ts` : landing complète, maquettes originales en CSS/SVG, Motion, Lucide et Tailwind 4. Navigation React Router, pages d’attente honnêtes, états du formulaire de suivi. Pas de 3D lourde.
- Les routes `/portail/:role` sont protégées par une session et un contexte autorisé, contrôlés par l’API. Les modules métier restent réservés aux blocs suivants.
- `mobileapp/app` : Expo Router (accueil, connexion, suivi, espace). `mobileapp/src/components` : écrans à zone sécurisée, clavier et actions tactiles. Reanimated respecte la réduction des animations. Expo Linear Gradient, Feather, Safe Area, splash et icônes officiels.

## Préservation

Les sources actives anciennes ont été sauvegardées dans `.local-preserved/legacy-source.zip`, exclu de Git. Les anciens .env publics ont une copie privée dans ce même dossier. Ne pas publier cette archive. Les fichiers SQL, uploads, clés Android, certificats, documents personnels et paramètres locaux inconnus sont conservés et ne sont jamais exécutés. Aucun répertoire .git n’a été touché ; aucun dépôt Git n’était présent dans le dossier fourni.

Les 7 fichiers officiels sont consignés avec SHA-256 dans `docs/assets-before.json`. Les `.png` mobiles d’origine contiennent des JPEG de 215 × 162 pixels : ils sont préservés octet pour octet. `mobileapp/assets/generated/icon.png` est une dérivation PNG carrée 1024 × 1024 sur fond blanc pour les outils natifs. L’agrandissement ne recrée pas de détails : demander un master haute définition avant publication en store.

## Déploiement ultérieur

API sur Plesk : racine `api`, `npm ci`, `npm run build`, point d’entrée `dist/server.js`, environnement production et port injecté par l’hébergement. Configurer les origines HTTPS réelles ; ni connexion MySQL ni migrations automatiques pour ce bloc. Web : publier `webapp/dist`, réécrire les routes SPA vers index.html. Mobile : lier un nouveau projet EAS DND Delivery, vérifier la propriété des identifiants `com.goulbam.dnddelivery`, puis configurer sa signature. Aucun déploiement ni build signé effectué.

Les rubriques légales doivent être complétées avec des informations validées avant ouverture commerciale. Aucun témoignage, client, résultat réel de suivi, collecte de demande d’accès ou statistique commerciale n’est fabriqué.

Voir `docs/BLOC-1-RAPPORT.md` pour le bilan et les limites de validation.

## État actuel : SDK 57 et Bloc 10

Consulter `docs/MOBILE_SDK_57.md`, `docs/DATABASE_DESIGN.md`, `docs/MIGRATIONS.md` et `docs/BLOC-2-RAPPORT.md`. Générer le client avec `cd api` puis `npm run db:generate`. Les opérations de base de données exigent une nouvelle DATABASE_URL MySQL, jamais une ancienne configuration. Le `.env` privé existant est conservé.

Le Bloc 3 ajoute l’authentification réelle, les sessions révocables et les contextes professionnels sur Web et Expo. Lire [AUTHENTICATION.md](docs/AUTHENTICATION.md) pour configurer MySQL, les secrets, SMTP et lancer le bootstrap manuel sans compte par défaut. Le [rapport Bloc 3](docs/BLOC-3-RAPPORT.md) détaille les contrôles exécutés et les validations encore nécessaires. Les réserves de mise en service y sont explicitées.

Le Bloc 4 ajoute les composants Web et natifs, les tokens communs sous `shared`, les espaces des six profils et la navigation filtrée par permissions. Lire [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) et le [rapport Bloc 4](docs/BLOC-4-RAPPORT.md).

Le Bloc 5 ajoute la gestion réelle des entreprises, responsables, invitations et audits du Super Administrateur avec MySQL. Lire [SUPER_ADMIN.md](docs/SUPER_ADMIN.md), [COMPANY_MANAGEMENT.md](docs/COMPANY_MANAGEMENT.md), [COMPANY_INVITATIONS.md](docs/COMPANY_INVITATIONS.md) et [le rapport Bloc 5](docs/BLOC-5-RAPPORT.md). Les tests ont été exécutés sur une base MySQL 8.4 distincte. Les migrations restent à appliquer à la nouvelle base cible après configuration et sauvegarde. Aucun déploiement et aucun Bloc 6.


Le Bloc 6 ajoute les abonnements mensuels, déclarations de règlements externes, validation humaine, renouvellements calendaires, contrôle immédiat de validité et jobs durables. Point de référence permanent : [JOURNAL_DE_DEVELOPPEMENT.md](docs/JOURNAL_DE_DEVELOPPEMENT.md), à compléter à chaque bloc. Lire [SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md), [SUBSCRIPTION_PAYMENTS.md](docs/SUBSCRIPTION_PAYMENTS.md), [SUBSCRIPTION_EXPIRATION.md](docs/SUBSCRIPTION_EXPIRATION.md), [PLESK_SCHEDULED_JOBS.md](docs/PLESK_SCHEDULED_JOBS.md) et [le rapport Bloc 6](docs/BLOC-6-RAPPORT.md). Aucun montant commercial par défaut, aucune passerelle et aucun déploiement. Les anciennes mentions de périmètre décrivent leurs blocs respectifs.

## Bloc 7 — Organisation interne

Lire [Organisation](docs/COMPANY_ORGANIZATION.md), [Agences](docs/AGENCY_MANAGEMENT.md), [Personnel](docs/EMPLOYEE_MANAGEMENT.md), [Livreurs](docs/DRIVER_MANAGEMENT.md) et [rapport Bloc 7](docs/BLOC-7-RAPPORT.md). Les agences, affiliations et disponibilités sont persistées et protégées par les permissions et abonnements existants. Le journal permanent est complété. Les mentions de périmètre antérieures décrivent leurs blocs respectifs; aucun Bloc 8 ni déploiement.

## Bloc 8 — Boutiques partenaires

Les boutiques disposent d'une identité commune, d'utilisateurs et de collaborations soumises à accord avec plusieurs entreprises. Sélection du transporteur sur Web/Expo, historique et notifications réels; profil boutique accessible sans transporteur. Lire [Gestion des boutiques](docs/PARTNER_MANAGEMENT.md), [Collaborations](docs/PARTNER_COLLABORATIONS.md), [Permissions](docs/PARTNER_PERMISSIONS.md) et [rapport Bloc 8](docs/BLOC-8-RAPPORT.md). Journal permanent complété; 127 tests réussis, aucun Bloc 9 ni déploiement.

## Bloc 9 — Produits et stocks

Catalogue boutique et marchandises par transporteur/agence, dépôts, sorties, réservations, transferts avec incidents, inventaires et alertes sont connectés à MySQL sur Web et Expo. Lire [Catalogue](docs/PRODUCT_CATALOG.md), [Gestion des stocks](docs/STOCK_MANAGEMENT.md), [Mouvements](docs/STOCK_MOVEMENTS.md), [Transferts](docs/STOCK_TRANSFERS.md), [Inventaires](docs/INVENTORY_MANAGEMENT.md) et [rapport Bloc 9](docs/BLOC-9-RAPPORT.md). Journal permanent complété. 160 tests distincts réussis; aucune commande complète, livraison, publication ou Bloc 10.

## Bloc 10 — Commandes et destinataires

Commandes ponctuelles et depuis stock, brouillons, répertoire isolé, réservations atomiques, montants exacts, édition et annulation sont disponibles sur API, Web et Expo. Lire [Gestion des commandes](docs/ORDER_MANAGEMENT.md), [Parcours](docs/ORDER_WORKFLOWS.md), [Destinataires](docs/RECIPIENT_MANAGEMENT.md), [Intégration au stock](docs/ORDER_STOCK_INTEGRATION.md) et [rapport Bloc 10](docs/BLOC-10-RAPPORT.md). 192 tests distincts réussis ; exports Expo Web/Android/iOS réussis. Les anciennes limites décrivent leurs blocs respectifs. Aucun Bloc 11 ni déploiement.

## État livré — Bloc 11

Dispatching, missions personnelles, garde physique, trajets inter-agences de colis, tentatives/incidents et retours contrôlés sont connectés à MySQL, au Web et à Expo SDK 57. Voir [gestion](docs/DELIVERY_MANAGEMENT.md), [affectations](docs/DRIVER_ASSIGNMENTS.md), [états](docs/DELIVERY_STATUS_WORKFLOW.md), [garde](docs/PARCEL_CUSTODY.md), [acheminements](docs/INTER_AGENCY_DELIVERIES.md), [incidents](docs/DELIVERY_INCIDENTS.md), [retours](docs/DELIVERY_RETURNS.md) et [rapport Bloc 11](docs/BLOC-11-RAPPORT.md). Les limites des sections précédentes décrivent leurs étapes historiques. Aucune livraison définitive sans preuve Bloc 13, aucun encaissement Bloc 12 et aucun déploiement de production.
# Bloc 12 — suivi financier opérationnel

Les encaissements, remises partielles et réceptions distinctes sont opérationnels sur Web et Expo SDK 57. Soldes exacts par devise, écarts, corrections à validation indépendante et suivi limité aux propres commandes des boutiques. Aucune transaction monétaire n’est exécutée par la plateforme.

Guides : [encaissements](docs/COLLECTION_MANAGEMENT.md), [remises](docs/CASH_REMITTANCES.md), [écarts](docs/FINANCIAL_DISCREPANCIES.md), [permissions](docs/FINANCIAL_PERMISSIONS.md), [rapport Bloc 12](docs/BLOC-12-RAPPORT.md).


## État livré — Bloc 13

Suivi destinataire sécurisé, OTP serveur, photos privées, exceptions avec approbateur distinct et remise finale contrôlée sont intégrés à MySQL, au Web et à Expo SDK 57. Les encaissements du Bloc 12 restent indépendants. Voir le [rapport et les limites réelles](docs/BLOC-13-RAPPORT.md), le [suivi public](docs/PUBLIC_TRACKING.md), les [OTP](docs/DELIVERY_OTP.md), les [preuves](docs/DELIVERY_PROOFS.md), la [confirmation](docs/DELIVERY_CONFIRMATION.md) et les [notifications](docs/DELIVERY_NOTIFICATIONS.md).

343 tests distincts réussis ; Expo Doctor 21/21 et exports Android/iOS/Web réussis sur la paire Expo 57.0.31 / Router 57.0.29. L’audit npm mobile conserve 11 alertes ; aucune installation physique, livraison SMTP externe ou réception push réelle revendiquée. Les sections antérieures décrivent leur état historique. Aucun déploiement de production ni Bloc 14.

## État actuel — Bloc 14

Application mobile harmonisée sur Expo SDK 57 : transport et sessions renforcés, contexte isolé, navigation par rôle, formulaires natifs, abonnement réel, notifications et préférences push par appareil. Les parcours des cinq rôles ont été exercés dans l’aperçu Expo Web avec l’API et MySQL, dont OTP/photo, encaissement et réception distincte de 5 000 XAF, dépôt, restitution, transfert et inventaire approuvé.

**385 tests distincts réussis**, Expo Doctor **21/21**, contrôles de types/lint et exports Android/iOS/Web réussis. Un APK autonome x86_64 de recette a été compilé, installé et lancé sur l’émulateur Android ; accueil et écran de connexion observés. La saisie du simulateur a empêché de valider la connexion native complète. iOS natif, appareils physiques et réception push externe restent à vérifier. L’audit npm mobile conserve 12 alertes, dont 3 élevées ; aucune diffusion en production.

Lire le [rapport Bloc 14](docs/BLOC-14-RAPPORT.md), l’[architecture](docs/MOBILE_ARCHITECTURE.md), la [navigation](docs/MOBILE_NAVIGATION.md), l’[intégration API](docs/MOBILE_API_INTEGRATION.md), les [notifications](docs/MOBILE_NOTIFICATIONS.md), les [tests](docs/MOBILE_TESTING.md) et la [préparation à la diffusion](docs/MOBILE_RELEASE_PREPARATION.md). Les limites des sections antérieures décrivent leurs étapes historiques.


## Bloc 15 — Rapports et tableaux de bord

Tableaux de bord réels par rôle, périodes/fuseau métier, statistiques logistiques et stocks, finances exactes séparées du SaaS, exports CSV/XLSX/PDF et audit en lecture seule. Intégration Web et Expo SDK 57 dans la navigation existante.

Validation du Bloc 15 : **452 tests distincts réussis** (302 MySQL, 66 API, 48 partagés, 36 mobiles), compilations et exports Android/iOS/Web ; Doctor 21/21. Les résultats des blocs précédents ci-dessus sont historiques.

Voir [rapport Bloc 15](docs/BLOC-15-RAPPORT.md), [reporting](docs/REPORTING.md), [KPI](docs/KPI_DEFINITIONS.md), [exports](docs/REPORT_EXPORTS.md) et [audit](docs/AUDIT_REPORTING.md). Trois migrations additives, sans reset ; aucun déploiement et aucun Bloc 16.
