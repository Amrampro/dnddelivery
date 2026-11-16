# Bloc 11 — Dispatching, missions livreurs et suivi logistique

Livré le 28 octobre 2026 dans les applications existantes, avec la même base MySQL de test dédiée. Le journal et les circuits de commandes, réservations et mouvements ont été examinés avant intervention. Aucun déploiement de production, aucune nouvelle base, aucune remise à zéro et aucun Bloc 12 développé.

## Fonctionnalités réalisées

Un colis principal par commande soumise, référence unique, file de dispatching, liste/charge des livreurs éligibles, affectation et réaffectation motivée. La disponibilité déclarée reste distincte du nombre de missions ; plusieurs missions sont permises. Après enlèvement, la réaffectation passe par une remise de garde acceptée par le nouveau livreur. Refus/annulation de proposition conservent l’ancien détenteur.

Prise en charge physique explicite, préparation, départ, arrivée agence, réception, distribution finale, arrivée destinataire et demande de confirmation en attente de preuve. Tentatives et incidents conservés ; décisions de nouvelle tentative, réaffectation, retour ou résolution documentée. Aucune livraison définitive sans preuve.

Trajets inter-agences successifs avec agent de transport, dates et garde, séparés des transferts de marchandises du Bloc 9. Réception à destination ou retour réellement réceptionné à l’origine après incident, avec lieu réel distinct de la destination prévue. Aucune entrée fictive dans le stock de destination.

Retours motivés, trajet physique, réception/condition, quarantaine des colis endommagés, restitution boutique et réintégration explicite des seuls articles intacts effectivement reçus. Première sortie depuis stock via StockService : ISSUE -Q physique et -Q réservé, une seule fois. Échec, affectation et arrivée déclarée ne recréditent rien. Retour contrôlé autorisé : RETURN +Q physique, sans double crédit.

Autorisations relues, périmètres entreprise/agence/boutique/livreur, historique personnel réduit après retrait d’affectation, notes internes masquées aux boutiques et montants protégés. Abonnement expiré : nouvelles opérations bloquées, clôture limitée des colis pris en charge avant échéance pour le livreur actuel ou company_admin ; réception physique possible sans crédit de stock, réintégration après renouvellement. Les anciennes missions sans phase sont conservées en lecture, sans reconstruction fictive de leur garde.

## Pages et écrans

Web : Livraisons, Dispatching, Acheminements inter-agences, Incidents de livraison, Retours de colis, suivi intégré à la commande et Suivi boutique. Fiche complète, historique paginé, filtres, recherche, compteurs réels et formulaires confirmés. Les écrans administratifs sont maintenant chargés à la demande ; le bundle principal final est de 418,29 kB, sans avertissement de taille.

Expo SDK 57 : accueil et Mes missions du livreur, fiche, actions physiques, incidents/tentatives, retour, demandes de garde, historique et avis ; modules opérateur pour dispatching/réception/supervision. Filtres repliables et formulaires en page entière. Aucun module natif ajouté, logos et Design System préservés.

Actualisation toutes les 30 secondes en activité et au retour au premier plan, date de synchronisation et conservation des dernières données en cas d’erreur. Les formulaires conservent leur saisie, version et clé de reprise ; aucune promesse de synchronisation hors ligne. Liens Maps ouverts sur demande, aucun GPS permanent.

## API, modèles et fichiers

Routes sous /api : GET deliveries/options, queue, eligible-drivers, notifications, by-order/:orderId, liste, fiche et historique ; POST deliveries et actions assign/reassign/prepare/receive/retry/cancel ; trajets transfers et dispatch/cancel/receive ; incident et incidents/:id/resolve ; return, return/receive, return/reintegrate, return/shop ; annulation d’une proposition handovers/:id/cancel. Alias personnels driver/missions pour lectures et pickup/events/attempt/incident ; driver/handovers pour lecture et confirmation. La [table exhaustive](DELIVERY_MANAGEMENT.md) précise les chemins et corps.

61 modèles Prisma ; cinq nouveaux : ParcelLeg, ParcelHandover, DeliveryAttempt, DeliveryIncident, DeliveryReturn. Delivery, DeliveryAssignment et DeliveryEvent étendus. Version mission, clés de rejeu et séquence d’événement ; emplacements actifs uniques, références contextuelles et tentatives/événements immuables. Migrations 17 à 19 :

- 20261028170000_delivery_operations ;
- 20261028171000_delivery_event_sequence ;
- 20261028172000_parcel_receipt_location.

Permissions explicites définies dans api/src/modules/deliveries/permissions.ts et détaillées dans [Gestion des livraisons](DELIVERY_MANAGEMENT.md). Aucun droit de dispatching implicite au super administrateur. Sources principales : api/src/modules/deliveries, api/src/jobs/deliveries.ts, shared/deliveries.ts et delivery-actions.ts, webapp/src/deliveries et mobileapp/src/deliveries. Intégrations routeur/seed, navigation commune, fiches commandes, politique de clôture après expiration et protection de désactivation des agences.

Notifications DELIVERY_ persistées dans Notification et job deliveries:notifications via SMTP existant. Bail/reprise différée/tentatives bornées ; une panne ne supprime pas la mission. Adaptateur push préparé, avis visibles dans l’application ; absence d’infrastructure push signalée, aucun push réellement envoyé revendiqué.

## Vérifications réellement exécutées

| Contrôle | Résultat |
|---|---|
| Suite complète MySQL 8.4.13, régressions Blocs 3 à 10 incluses | 178 tests réussis, zéro échec |
| Dont suite logistique | 32 tests TAP, déjà inclus dans les 178 |
| API/Auth/HTTP/SMTP | 32 réussis, zéro échec |
| Formulaires et navigation partagés | 22 réussis, zéro échec |
| Total distinct | **232 réussis, zéro échec** |
| API | typecheck source/tests/outils, lint, build, validation Prisma réussis |
| Web | build et lint réussis |
| Expo SDK 57 | typecheck, lint, matrice locale et expo install --check réussis |
| Exports finaux Expo | Web, Android, iOS ; 12 routes statiques Web |
| Migrations | 19 appliquées, tous les checksums correspondent |
| Fichiers protégés | 27 empreintes vérifiées, zéro modification |

Les 32 tests logistiques couvrent mission unique/brouillon refusé, indisponibilité/suspension/mauvaise agence/entreprise, affectations concurrentes, plusieurs missions, réaffectation avant/après enlèvement, confirmation du nouveau détenteur, droits et données masquées, commande ponctuelle sans stock, sortie exacte/rejeu/rollback de réservations invalides, arrivée sans preuve, protection SQL de DELIVERED, motif d’échec, tentatives conservées et nouvelle tentative autorisée, retour intact/double réception, quarantaine et restitution, réception d’agence sans crédit de catalogue, deux trajets successifs, sortie unique lors du transport, isolation multi-tenant, historique immuable, annulation préalablement autorisée, expiration et clôture limitée, SMTP en échec/reprise et push en attente. Cas complémentaires : retour de transport à l’origine réelle, annulation d’une proposition de garde après expiration pour débloquer le retour, agence avec colis en quarantaine protégée et reprise après incident avant collecte.

Les tests partagés ajoutés vérifient notamment absence de demande DELIVERED, raisons obligatoires, versions distinctes mission/remise/trajet, réception au lieu réel, impossibilité d’envoyer restock=true pour un dommage, décision sur incident ouvert, encodage Maps et menus selon droits explicites. Les rejouages ciblés ne sont pas ajoutés deux fois au total.

Commandes exécutées dans chaque application :

```text
api       npm run typecheck ; npm run lint ; npm run build ; npm run db:validate
api       npm test ; npm run test:db ; npm run db:migrate:status
webapp    npm run build ; npm run lint ; npm test
mobileapp npm run typecheck ; npm run lint ; npm run check:dependencies
mobileapp expo export --platform all --max-workers 2 --output-dir ../.local-preserved/bloc11/mobile-final
```

Logs conservés dans .local-preserved/bloc11 : database-final.log, api-tests.log, shared-tests.log, api-types.log, api-lint.log, api-build.log, web-build.log, web-lint.log, mobile-types.log, mobile-lint.log, mobile-dependencies.log, mobile-exports.log, migrations-status.log, migrations-checksums.log, protected-final.json et preuves de recette. Les identifiants de recette sont privés et ne sont pas reproduits ici.

## Recette réelle Web / Expo Web

API locale, MySQL de test existant, vrais services métier et serveur SMTP intercepté en boucle locale. Le harness tests/serve-delivery-preview.ts est protégé par NODE_ENV=test, DND_ADMIN_TEST_PREVIEW=1 et nom de base dédié ; il réutilise les comptes/commandes lors d’un redémarrage. Il n’est pas chargé au démarrage normal de l’application.

1. Web entreprise : file de deux commandes réelles, création de mission depuis stock et affectation à Samuel, dont la charge est affichée à zéro.
2. Préparation Web : garde agence ; T-shirt bleu physique=12, réservé=2. Aucune sortie à l’affectation ni à la préparation.
3. Expo : connexion livreur, choix Douala, mission personnelle et fiche ; ouverture de l’enlèvement avec observation.
4. Coupure volontaire de l’API : erreur réseau visible, même formulaire et observation conservés. Redémarrage avec les mêmes comptes, reprise du bouton ; un seul enlèvement enregistré.
5. MySQL : WITH_COURIER, garde COURIER, physique=10/réservé=0 ; la sortie de deux articles est unique et l’observation est dans l’historique Web/Expo.
6. Échec motivé Expo : destinataire absent ; garde livreur et physique=10 inchangés. Tentative et incident apparaissent en supervision.
7. Décision de retour Web, départ et arrivée retour Expo. Réception physique GOOD Web sans cocher la réintégration : Order RETURNED, garde agence, physique toujours=10.
8. Réintégration séparée et motivée Web : physique=12/réservé=0. Résolution de l’incident avec observation ; onze événements conservés. Le sac de voyage reste à cinq unités durant tout le parcours.
9. Historique personnel Expo : référence et étape conservées, coordonnées du destinataire masquées après la fin d’affectation. Aucune erreur de rendu remontée dans les journaux Web/Expo consultés.

Preuves : ui-evidence.jsonl, expo-network-error.png, expo-personal-history.png et web-return-complete.png dans .local-preserved/bloc11. Les scénarios inter-agences, de remise entre livreurs et d’attente de preuve sont validés par les tests MySQL ; ils ne sont pas présentés comme une recette manuelle supplémentaire.

## Limites et décisions

Un colis principal et une procédure de retour par mission ; pas d’optimisation de tournée, rapports avancés ni portail public complet. Les écrans généraux hérités qui indiquent encore des indicateurs à venir ne sont pas transformés en statistiques fictives ; les nouveaux modules logistiques disposent de leurs compteurs réels.

Une proposition d’étendre l’annulation à FAILED a été rejetée par le contrôle automatique pour risque de libération de stock au mauvais moment. Cette extension reste absente : les échecs passent par décision responsable, nouvelle tentative ou retour physique contrôlé. Les annulations déjà autorisées avant enlèvement conservent leur circuit sûr.

La validation Expo hors ligne affiche son avertissement habituel de fiabilité limitée ; la matrice installée est inchangée et aucune vérification supprimée. Le premier démarrage d’export avec le nombre de tâches par défaut s’est bloqué ; relance réussie avec deux tâches et dossier temporaire local. Aucune dépendance native changée, donc aucun nouveau passage Expo Doctor revendiqué. Les exports Android/iOS sont des bundles Hermes, pas une application signée/installée. La recette interactive a eu lieu sur Expo Web dans un navigateur de bureau ; aucun appareil physique ni viewport téléphone vérifié n’est revendiqué.

Pas de SMTP de production ni de push effectif validé. Les données de tests sont conservées. Les services de recette sont arrêtés après vérification. Aucun reset, aucun changement de logo ou dépendance native, aucun déploiement.

Bloc 12 reste nécessaire pour déclarations/remises/rapprochements d’argent ; le montant attendu reste une instruction. Bloc 13 reste nécessaire pour OTP/photo et preuve de remise finale ; AWAITING_PROOF n’est pas DELIVERED. Le journal de développement a reçu l’entrée exacte « Bloc 11 — Dispatching, missions livreurs et suivi logistique », sans suppression des blocs antérieurs.
