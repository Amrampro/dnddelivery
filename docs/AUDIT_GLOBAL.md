# Audit global du Bloc 16

Express et Prisma/MySQL constituent l’API. React/Vite sert le portail, Expo SDK 57 sert le mobile et `shared/` porte des contrats communs. Les contextes et permissions sont recalculés côté serveur. Les dispositifs testés incluent l’isolation des entreprises, agences, boutiques et coursiers, le stock transactionnel, l’idempotence des écritures financières et le stockage privé des preuves.

| Bloc | Fonctions inspectées | Couverture et suite |
| --- | --- | --- |
| 1 | Structure API, Web, Expo, scripts et Node | Builds, santé et démarrage. Vérifier l’hôte Plesk. |
| 2 | Schéma, relations composites, DECIMAL et migrations | Tests MySQL. Les déclencheurs demandent des droits de maintenance avec le journal binaire. |
| 3 | Connexion, cookies, jetons mobiles, CSRF, rôles, révocation | Tests HTTP et MySQL, cas hostiles et changement de contexte. Valider les cookies derrière le proxy réel. |
| 4 | Composants, navigation et identités visuelles | Build Web et exports Expo. Matrice navigateurs et appareils dans le plan de tests. |
| 5 | Super admin, invitations, cycle de vie des entreprises | Test MySQL et parcours d’invitation via SMTP local. |
| 6 | Abonnement, paiement déclaré, approbation et expiration | Tests MySQL, cohérence du montant et notifications. Tarif réel à fournir. |
| 7 | Agences, employés, livreurs et périmètres | Tests MySQL sur invitations, disponibilités et droits. |
| 8 | Inscription boutique, collaboration et partage d’agences | Tests MySQL et recette sur deux entreprises. |
| 9 | Catalogue, stocks, dépôts, retraits, transferts et inventaire | Tests MySQL sur réservation concurrente, mouvements et isolation. |
| 10 | Commandes, destinataires, articles, brouillons et annulations | Tests d’intégration, commandes ponctuelles et sur stock. |
| 11 | Affectation, enlèvement, acheminement, retours et incidents | Tests MySQL et recette de remise. Tester sur appareils et réseaux réels. |
| 12 | Encaissement, remise, écarts et contestation | Tests MySQL sur montants, autorisations, rejeu et concurrence. |
| 13 | Suivi, OTP, photo privée et notifications | Tests MySQL/HTTP, SMTP local. Relais réel, APNs/FCM et récupération des fichiers à valider. |
| 14 | Harmonisation Web et mobile, réseaux dégradés | Bundles et tests Expo, recette physique complémentaire. |
| 15 | Tableaux, agrégations, rapports, exports et journal | Tests des rôles, montants, formats et isolation. Rejouer à volumétrie représentative. |

Consulter le [rapport final](RAPPORT_FINAL_DND_DELIVERY.md), le [plan de tests](TEST_PLAN.md) et la [liste des problèmes ouverts](KNOWN_ISSUES.md) pour les résultats d’exécution et les portes de lancement.
