# Rapport Bloc 8 — Boutiques partenaires et collaborations

Réalisé le 28 octobre 2026 dans le dépôt existant. Les modèles et modules des Blocs 1 à 7, le journal, les sessions, les permissions, les abonnements et le Design System sont réutilisés.

## Résultat

Une boutique conserve une seule identité et plusieurs utilisateurs, sans créer un compte par transporteur. Inscription vérifiée par e-mail, association sécurisée des comptes existants, profil commercial/logo, utilisateurs invités et rôles propriétaire/gestionnaire/employé. Une entreprise peut inviter une boutique existante ou préparer son inscription, recevoir des demandes, décider, suspendre et terminer une collaboration. Les deux parties conservent leurs historiques.

Les demandes restent en attente de l'autre partie. Les doublons sont refusés; les transitions sont atomiques et versionnées. Refus, suspension ou fin n'entraînent aucune réactivation silencieuse : une nouvelle demande puis un nouvel accord sont requis. Le contexte autonome de la boutique permet de gérer son profil même sans transporteur; le sélecteur propose uniquement ses collaborations autorisées. Un transporteur expiré n'empêche pas les autres partenaires ni la gestion propre de la boutique.

Les profils professionnels et agences explicitement autorisées sont séparés des données internes. Une entreprise ne reçoit pas les autres collaborations d'une boutique ni ses utilisateurs. Les audits privés d'utilisateurs restent privés même lorsqu'un transporteur est sélectionné.

## Pages Web et écrans Expo

Web entreprise : partenaires, recherche/statut/pagination, demandes reçues, invitations envoyées (boutiques existantes et inscriptions préparées), détail/historique, confirmations d'acceptation/refus/suspension/fin, agences accessibles et notifications.

Web boutique : accueil, profil commercial et logo, transporteurs/détails, demandes reçues/envoyées, sélection de transporteur, utilisateurs et invitations, historique, notifications et paramètres. Inscription publique /inscription-boutique, vérification/acceptation /invitation-boutique; lien ajouté à la connexion, landing inchangée.

Expo : accueil boutique, profil modifiable, entreprises partenaires et détails, recherche/filtres/pagination, demandes et décisions acceptation/refus, nouvelle demande, fin de collaboration, sélection du transporteur, statut/historique, avis et paramètres. L'administrateur entreprise consulte partenaires/demandes/invitations/avis. La gestion complexe des comptes et des logos reste sur le Web. Les futurs modules logistiques restent des emplacements explicitement annoncés, sans données simulées.

## API et migrations

Routes propres au contexte SHOP sous /api/partners; routes entreprise sous /api/company/partners, /partner-requests, /partner-invitations, /partner-directory, /partner-history, /partner-notifications. Inscriptions et acceptation sous /api/partner-registration. Liste complète et paramètres dans PARTNER_MANAGEMENT.md et PARTNER_COLLABORATIONS.md; permissions dans PARTNER_PERMISSIONS.md.

Migration additive 20261028140000_partner_collaborations : extensions de Shop, ShopMembership et CompanyShop, nouveau ShopInvitation, contraintes et permissions. Total : 50 modèles et dix migrations. Contrainte unique entreprise/boutique conservée; liens d'invitations protégés par des FK SQL à préserver. Appliquée uniquement sur la base MySQL 8.4.13 dédiée existante, sans remise à zéro ni création d'une autre base. Aucune migration de production.

Fichiers principaux : api/src/modules/partners/{service,routes,validation,permissions,access,notifications}.ts; api/src/jobs/partners.ts; api/tests/database/partners.database.test.ts; shared/partners.ts; webapp/src/partners; mobileapp/src/partners. Intégration limitée aux contextes/sélecteurs, navigation, seed, routeurs et lanceur de tests existants.

## Vérifications réellement exécutées

- 86 tests MySQL réussis, zéro échec dans la suite finale complète, dont 21 tests TAP du nouveau module (20 sous-tests et parent).
- 32 tests API/Auth/HTTP/SMTP réussis, dont les nouveaux contrôles d'espace boutique autonome; 9 tests de navigation réussis. Total : 127 tests réussis.
- Scénarios : vérification avant création, compte existant et mot de passe conservé, invitations sans droit préalable, dernier propriétaire, rôles, multi-entreprises, doublons et concurrence, décision du destinataire, suspension/fin/nouvel accord, historique, refus d'un transporteur arbitraire, expiration et autre partenaire, notifications dédupliquées/reprise, audit sans secret ni fuite des affiliations internes. Les décisions HTTP utilisent aussi les en-têtes/session mobile réels.
- API : typecheck source et tests/outils de recette, lint, build et validation du schéma Prisma réussis.
- Web : build et lint réussis; modules partenaires et inscription chargés séparément (environ 29 Ko et 9 Ko avant gzip).
- Expo SDK 57 : types/lint réussis, matrice locale cohérente avec avertissement explicite du mode hors ligne; export Expo Web réussi. Aucun changement de dépendance native.
- Recette visuelle réelle : une même boutique et ses deux transporteurs sur Web et Expo Web; changement de transporteur sans reconnexion; profil modifié depuis Expo puis relu sur Web après rechargement. Les deux boutiques d'un même compte restent distinctes dans les sélecteurs.
- Une alerte React Native sur des espaces JSX hors Text a été trouvée en recette, corrigée sans masquer les messages, puis vérifiée à nouveau.
- Worker compilé partners:notifications exécuté avec code 0 sur la base de test; aucun avis éligible dans ce passage. Les échecs SMTP/reprises et la déduplication sont vérifiés dans les tests contrôlés, sans prétendre à une délivrabilité externe.
- SHA-256 : anciennes migrations, logos officiels et fichiers de dépendances mobiles protégés inchangés.

Traces de tests et comptes aléatoires de recette restent dans .local-preserved/bloc8 (privé/ignoré). Captures livrées dans docs/previews/bloc8-*.png.

## Commandes

Dans api : npm run typecheck; npm run lint; npm run build; npm run db:validate; npm test; npm run test:db. Le dernier exige TEST_DATABASE_URL vers une base dnd_delivery*_test et NODE_ENV=test; DATABASE_RSA_PUBLIC_KEY_FILE permet la clé publique épinglée du MySQL local si nécessaire. Ne pas l'exécuter sur une base réelle.

Dans webapp : npm run build; npm run lint; npm test. Dans mobileapp : npm run typecheck; npm run lint; npm run check:dependencies; npx expo export --platform web. Le contrôle des dépendances a été exécuté hors ligne avec la matrice installée, pas comme preuve d'un contrôle distant.

Après build de l'API et configuration Auth/SMTP existante : npm run partners:notifications. PARTNER_NOTIFICATION_BATCH est facultatif (100 par défaut, 1–1000). Voir PARTNER_COLLABORATIONS.md pour le futur ordonnanceur Plesk. Aucun ordonnanceur installé.

## Limites et suites

Aucun appareil physique, build natif signé, SMTP externe ni CI distante déclaré validé. Les inscriptions et invitations de comptes se finalisent sur le Web; les décisions courantes de collaboration sont disponibles sur Expo. Une même adresse d'inscription ne crée pas une seconde boutique; une personne autorisée à plusieurs boutiques passe par leurs affiliations. Les invitations d'inscription concurrentes envoyées par plusieurs entreprises n'attribuent pas automatiquement les collaborations restantes après une première création : utiliser ensuite la référence existante.

Les agences partagées sont choisies lors de l'invitation; leur gestion étendue pourra compléter le module lorsque les opérations en agence seront développées. Les compteurs HTTP restent par processus; prévoir un stockage commun avant une exploitation multi-instance. Les conditions d'inscription affichées sont versionnées, les documents juridiques de production restent à faire valider.

Aucun produit, mouvement de stock, transfert, commande, livraison, affectation de livreur, encaissement, OTP ou suivi public développé. Les opérations antérieures sont conservées et signalées; restitution et clôtures devront être implémentées dans leurs blocs, sans faux mouvements. Aucun Bloc 9 commencé, aucun déploiement. JOURNAL_DE_DEVELOPPEMENT.md est complété.

Preuves visuelles finales : [Transporteurs sur Expo](previews/bloc8-transporteurs-expo.png), [Partenaires entreprise sur Web](previews/bloc8-partenaires-entreprise-web.png), [Profil enregistré depuis Expo puis relu sur Web](previews/bloc8-profil-depuis-expo-web.png). Le dernier rechargement de l'écran partenaires ne produit aucun nouveau message d'erreur React Native. Les serveurs temporaires sont arrêtés après recette; fichiers .env privés et données de test préservés.
