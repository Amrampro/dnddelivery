# Rapport Bloc 4 — Interfaces professionnelles Web et Expo

## Résultat

Le projet existant est conservé. Le Bloc 4 ajoute un design system et des espaces de travail authentifiés pour Super Administrateur, administrateur d’entreprise, responsable d’agence, gestionnaire de stock, boutique partenaire et livreur. Aucun workflow métier complet n’est activé, aucune statistique fictive n’est présentée comme réelle et aucune publication n’a été effectuée.

Les logos officiels, les assets mobiles, la landing et les anciennes migrations ont été comparés par SHA-256 : zéro modification. Le schéma Prisma est inchangé. Aucun compte réel, rôle réel ou privilège réel n’a été créé pour les vérifications.

## Écrans et navigation

Web : layout public conservé, cadre commun de compte/authentification, sidebar repliable, header avec entreprise et agence actives, menu de profil, breadcrumbs, drawer sur petit écran, six accueils professionnels et écrans préparés des modules autorisés. Le gestionnaire de stock dispose aussi d’une structure de tableau d’inventaire et de saisies désactivées pour les futurs mouvements. La bibliothèque de composants est accessible uniquement avec une session et un contexte professionnel valide.

Expo : accueil adapté au portail réel, cinq onglets maximum, navigation secondaire en bottom sheet, contexte actif et changement d’organisation, profil existant, paramètres personnels, notifications et historiques préparés, écrans de commandes/courses/stock en attente, composants de listes et de détails. L’administration SaaS complète reste principalement Web.

L’identité, le rôle, les affiliations et les permissions viennent du Bloc 3. Le catalogue `shared/workspace.ts` ne distribue pas de droits ; il filtre les modules selon les permissions effectives. Une URL de rôle erroné redirige vers le portail autorisé. Un module interdit affiche un accès refusé. Le backend accepte désormais une permission supplémentaire optionnelle, validée et contrôlée, sur GET /api/auth/workspace. Les futurs endpoints métier devront garder leurs propres contrôles et filtres de tenant.

## Composants et bibliothèques

Tokens communs dans shared/tokens.ts : couleurs, espacements, rayons, typographie, ombre et transitions. Le Web applique ces tokens par variables CSS, avec Tailwind 4 et les styles spécifiques isolés ; Expo les utilise dans StyleSheet.

Web : boutons, champs, select, checkbox/radio, textarea, badges, cartes, tableaux, dialogues, confirmation, drawer, popover/menu, vues sélectionnables, pagination, recherche/filtres, toast, skeletons, états vides/erreurs/refus, statistiques, graphique et commandes d’import/export préparées. La bibliothèque interactive indique clairement que ses interactions sont des exemples UI sans enregistrement.

Native : boutons, champs, cartes, badges, lignes de listes, détails, résumés, erreurs, états vides, chargement, skeletons, sélecteur, Modal et bottom sheet, confirmation et navigation. Le profil demande une confirmation avant de fermer toutes les sessions. La réduction des mouvements est respectée sur les deux plateformes.

Aucune bibliothèque ajoutée. Réutilisation de React, React Router, Tailwind, Lucide et Motion sur Web ; React Native, Expo Router, Feather et Reanimated sur Expo. Les dépendances restent celles du SDK 57. Le nouveau dossier partagé contient uniquement des métadonnées et constantes TypeScript, sans composants DOM ni dépendances Web importées dans le mobile.

## Tests réellement exécutés

| Vérification | Résultat |
| --- | --- |
| API : typecheck, génération Prisma, build, lint | Réussite |
| API : suite complète avec le contrôle supplémentaire de permission | 28 réussis, 0 échec |
| Navigation commune : tests des six profils, retrait de permissions, route inconnue, raccourcis mobiles | 8 réussis, 0 échec |
| Web : build TypeScript/Vite et lint | Réussite |
| Expo : typecheck et lint | Réussite après adaptation ciblée de la configuration CommonJS Metro |
| Expo Doctor | 21/21 |
| Contrôle Expo des versions | Dépendances compatibles et à jour pour SDK 57 |
| Exports Expo iOS, Android, Web | Réussite ; 12 routes Web |
| Web : six comptes de test isolés | Les six portails affichent la composition du profil attendu |
| Web : changement d’entreprise | Passage du contexte agence A à entreprise B, contenu et navigation adaptés |
| Web : sécurité de navigation | Session absente vers connexion, mauvais rôle vers le portail autorisé, module stocks refusé au compte sans stocks.read |
| Web : responsive | Formats 1440, 1280, 768 et 390 px contrôlés ; largeur du document inférieure ou égale au viewport |
| Web : composants | Sidebar repliable, drawer mobile, dialogue et Escape/focus, panneau, toast, pagination et filtre vérifiés |
| Expo démarré dans le navigateur | Connexion et accueils entreprise/agence/stock/boutique/livreur, onglets principaux, commandes, courses et nouvelle commande préparée vérifiés |
| Expo : compte et navigation | Profil, paramètres, menu secondaire, confirmation et annulation de déconnexion globale, changement A vers B, retour à connexion après logout et accès privé vérifiés |
| Conservation des originaux | Zéro différence SHA-256 sur les fichiers protégés |

Les tests de navigation sont exécutés sur le catalogue commun utilisé par les deux clients. Ils ne sont pas présentés comme des tests de composants React rendus ; les vérifications d’écran ont été réalisées séparément dans le navigateur.

Les parcours visuels utilisent exclusivement `api/tests/serve-auth-preview.ts`, activé explicitement, lié à 127.0.0.1 et jamais importé par le runtime API. Les comptes example.invalid et les affiliations sont des fixtures en mémoire, avec le véritable service d’authentification et ses vérifications. Aucun utilisateur réel ne reçoit artificiellement un rôle Super Administrateur. Les captures docs/previews/bloc4-* illustrent uniquement cet environnement de test.

## Problèmes corrigés et limites

Metro ne résolvait initialement pas le nouveau dossier partagé : ajout d’un watchFolder explicite. La configuration CommonJS de Metro a une règle lint ciblée autorisant seulement ses imports expo/metro-config et node:path ; les vérifications des applications et de compatibilité SDK ne sont pas désactivées. Les exports utilisent toujours Hermes et les versions SDK 57 existantes.

Pas de MySQL de test configuré dans cette session : aucun test d’intégration MySQL, seed, migration ou bootstrap réel exécuté. Aucun SMTP externe sollicité. Les protections d’authentification sont couvertes par les tests du service et de ses routes, avec un stockage de test isolé, sans prétendre valider la base réelle.

Pas de téléphone ni simulateur natif connecté. Les exports et l’exécution Expo Web ne certifient pas le moteur natif, SecureStore après arrêt, VoiceOver/TalkBack, le clavier et les zones de sécurité sur appareils. Une recette Android/iOS réelle reste nécessaire.

Les 29 avis de sécurité transitifs mobiles signalés au Bloc 3 restent un point connu : aucune dépendance n’a été ajoutée ou forcée dans ce bloc. Aucun nouvel audit npm n’est revendiqué ici. Ne pas rétrograder Expo ni mélanger des SDK pour masquer ces avis.

Les statistiques, notifications, historiques, imports/exports et modules métier restent volontairement en attente. Les composants n’indiquent ni zéro résultat réel ni succès d’une opération non implémentée.

## Reproduire et compléter la recette

Dans api : npm run typecheck, npm run build, npm run lint, npm test. Les tests HTTP et SMTP ont besoin de ports locaux temporaires.

Dans webapp : npm run build, npm run lint, npm test puis npm run dev. Les tests du catalogue utilisent la prise en charge TypeScript expérimentale intégrée à Node 22, avec un avertissement explicite, sans transpileur supplémentaire.

Dans mobileapp : npm run typecheck, npm run lint, npm run doctor, npm run check:dependencies, npm run build puis npm start.

Pour la recette avec de vrais comptes, configurer une nouvelle base et les secrets conformément à AUTHENTICATION.md, exécuter les opérations manuelles de mise en service du Bloc 3, puis vérifier les affiliations réellement attribuées depuis Web et téléphone. Ne pas utiliser les comptes example.invalid du serveur de tests comme comptes d’exploitation. Les .env privés n’ont pas été remplacés.

## Suite recommandée pour le Bloc 5

Définir les contrats API et permissions détaillées du premier module métier, les contrôles de tenant et les transactions MySQL ; connecter ensuite les listes, formulaires et compteurs aux données réelles. Prévoir pagination serveur, états de chargement/erreur et tests d’isolation. Lever les réserves MySQL, appareils natifs et dépendances avant publication. Le Bloc 5 n’a pas été commencé.

Documentation de référence : [Design system](DESIGN_SYSTEM.md), [navigation Web](WEB_NAVIGATION.md), [navigation mobile](MOBILE_NAVIGATION.md), [tableaux de bord par rôle](ROLE_DASHBOARDS.md).
