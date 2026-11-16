# DND Delivery — Rapport du Bloc 1

Date : 20 octobre 2026. Travail effectué directement dans `C:\codes\DND delivery`. Aucun déploiement. Aucun module du Bloc 2 développé.

## Réalisation

| Partie | Résultat |
| --- | --- |
| API | Express 5/TypeScript strict, CORS configurable, Helmet, validation Zod, journalisation Pino avec masquage des identifiants et cookies, gestion centralisée des erreurs, limite JSON, routes /api et /api/v1, santé, arrêt SIGINT/SIGTERM avec délai de fermeture. Démarrage sans MySQL. |
| Web | Nouvelle landing complète : header responsive, hero et réseau logistique SVG animé, six avantages, parcours en six étapes, présentation Web/mobile, suivi préparatoire, CTA et footer. Logos officiels, palette #033173/#0BB058/#FFFFFF. |
| Portails | Un layout réutilisable décliné pour super administrateur, entreprise, agence, stock et boutique. Aperçus publics explicitement sans session ni données, sans prétendre fournir un contrôle d’accès. |
| Mobile | Expo Router, accueil natif distinct du Web, écran connexion préparatoire, suivi avec message honnête, aperçu des futurs espaces. Zones sécurisées, prise en compte clavier, composants tactiles, Reanimated, Linear Gradient, icône et splash dérivés des ressources officielles. |
| Qualité | TypeScript strict, ESLint dans chaque dossier, builds indépendants, lockfiles synchronisés, workflow GitHub Actions, documentation des environnements et du futur déploiement. |

Les chiffres de maquettes sont fictifs et étiquetés. Aucun compte, suivi réel, formulaire de collecte, témoignage, client ou coordonnée commerciale inventés. Les rubriques légales sont explicitement en préparation.

## Remplacements et préservation

Sources remplacées : `api/src`, `webapp/src`, `mobileapp/src`, anciens `mobileapp/App.tsx` et `index.ts`. Les anciennes migrations et scripts ont quitté les emplacements actifs ; leurs répertoires sont désormais prêts pour les futurs ajouts.

Configurations réécrites : package.json et lockfiles des trois applications, tsconfig API/mobile et configuration stricte Web, Vite, index.html Web, app.json et eas.json mobiles, exemples et configurations publiques .env, règles gitignore et README Web. L’ancien app.config.js a été retiré pour supprimer les références à l’ancien produit et au projet EAS antérieur. Le fichier API .env privé n’a pas été modifié.

L’inventaire détaillé est dans `docs/replaced-files.json`. Une sauvegarde privée est disponible dans `.local-preserved/legacy-source.zip`. Les anciens .env Web/mobile et notes structure.md y sont conservés séparément. Ce dossier est ignoré par Git. Les fichiers SQL locaux, uploads, clés de signature, certificat PEM, PDF et paramètres personnels sont restés intacts. Aucun SQL exécuté, aucune base supprimée, aucun répertoire .git modifié.

## Logos officiels

Empreintes SHA-256 identiques avant/après pour les sept fichiers :

- `webapp/public/logo long.jpg`
- `webapp/public/logo square.jpg`
- `mobileapp/assets/adaptive-icon.png`
- `mobileapp/assets/favicon.png`
- `mobileapp/assets/icon.png`
- `mobileapp/assets/logo phone - Copie (4).png`
- `mobileapp/assets/splash-icon.png`

Voir `docs/assets-before.json`. Les cinq assets mobiles sont en réalité des JPEG basse résolution malgré leur extension .png. Les originaux sont conservés. `mobileapp/assets/generated/icon.png` fournit une dérivation PNG carrée 1024 × 1024 sur fond blanc pour l’icône, le splash et le favicon. Aucun logo de remplacement inventé. Obtenir un master haute définition avant la publication en store.

## Architecture et bibliothèques

- API : Express, cors, dotenv, Helmet, Pino/pino-http, Zod ; développement avec tsx, TypeScript, ESLint et typescript-eslint. Controllers/routes/middlewares sont actifs ; services/repositories/validators et prisma/migrations/scripts sont préparés, sans faux modèles métier.
- Web : React 19, Vite 8, TypeScript 6, Tailwind CSS 4 et son plugin Vite, React Router, Motion, Lucide. Composition 2D SVG/CSS pour éviter le coût d’une scène 3D sans utilité. Composants, données, pages et layouts séparés.
- Mobile : Expo SDK 54, React 19.1, React Native 0.81.5, Expo Router 6, Reanimated 4, Worklets, Linear Gradient, Splash Screen, Safe Area, Screens, Feather via @expo/vector-icons, modules Expo requis et React Native Web pour l’aperçu/export. Versions natives alignées sur la matrice fournie par Expo.

Les dépendances réellement installées et leurs versions résolues sont consignées dans les package-lock.json de chaque dossier. Les manifestes et lockfiles ont été comparés et sont synchronisés.

## Lancement

Dans chacun des dossiers, installer avec `npm ci`.

| Dossier | Développement | Contrôles | Build |
| --- | --- | --- | --- |
| api | `npm run dev` | `npm run lint`, `npm run typecheck`, `npm test` | `npm run build`, puis `npm start` |
| webapp | `npm run dev` | `npm run lint` | `npm run build`, `npm run preview` |
| mobileapp | `npm start` | `npm run lint`, `npm run typecheck`, `npx.cmd expo install --check` | `npm run build` |

Le README racine explique Plesk, les réécritures SPA, les futurs builds EAS et l’adresse réseau à utiliser sur téléphone physique. Les valeurs localhost publiques sont adaptées au développement local et doivent être remplacées par l’adresse réellement accessible depuis le téléphone.

## Vérifications réalisées

| Vérification | Résultat |
| --- | --- |
| Logos | 7/7 SHA-256 identiques |
| API compilation et ESLint | Succès |
| API démarrage développement | Succès |
| API compilée, lancement direct | Succès sur port 3001, réponse JSON de santé 200 |
| Tests HTTP API | Succès : santé /api et /api/v1, CORS autorisé/non autorisé, Helmet, route inconnue 404, JSON malformé 400 |
| Web build et ESLint | Succès ; JS environ 386 Ko, 124 Ko gzip ; CSS environ 26 Ko |
| Web responsive | Inspection navigateur ordinateur, tablette 768 px et smartphone 390 px ; absence de débordement horizontal aux tailles contrôlées |
| Navigation Web | Menu mobile, ancres, page connexion et aperçu responsable d’agence contrôlés |
| Suivi Web | Soumission test : message d’indisponibilité, aucun faux résultat ni appel métier |
| Console Web | Aucune erreur constatée pendant les contrôles |
| Expo TypeScript et ESLint | Succès |
| Expo démarrage | Metro démarré, écoute sur 8081 |
| Expo compatibilité | expo install --check : dépendances cohérentes avec la matrice SDK locale ; validation distante indisponible en mode hors ligne |
| Expo export | Export Android, iOS et Web réussi, y compris bundles Hermes et six routes statiques |
| Expo aperçu visuel | Accueil et navigation vers le suivi contrôlés dans l’export Web à taille smartphone ; soumission de référence et message d’indisponibilité validés ; aucune erreur de console constatée |
| Identifiants natifs | Android package et iOS bundleIdentifier : com.goulbam.dnddelivery, nom DND Delivery, schéma d’URL dnddelivery |
| Environnements publics | Seulement VITE_API_URL et EXPO_PUBLIC_API_URL, aucun secret recopié |
| Exclusions | API .env, archives privées, SQL, clés de signature et PEM exclus ; configurations publiques explicitement autorisées |

Les restrictions réseau du bac à sable ont empêché les premières installations/tests locaux. Ils ont été relancés avec l’accès nécessaire. L’export initial Hermes ne pouvait pas écrire ses fichiers temporaires ; l’export hors isolation a réussi. L’erreur initiale de syntaxe mobile et l’import d’icône Web manquant ont été corrigés. Aucun de ces échecs initiaux n’est retenu comme une validation réussie.

Captures : `docs/previews/web.jpg` et `docs/previews/mobile.jpg`.

## Limites et vérifications manuelles

- Aucun dépôt Git n’a été détecté dans le dossier fourni : impossible de certifier l’absence de secrets dans l’index ou l’historique Git. Les règles et fichiers publics sont vérifiés, mais contrôler `git status` et les fichiers suivis dès que le dépôt sera rattaché. Les règles ignore ne retirent pas un secret déjà suivi.
- Aucun appareil Android/iOS physique ni simulateur natif contrôlé. Le rendu natif, clavier, rotation tablette, safe areas et splash réel restent à valider sur les deux plateformes. L’export des bundles ne remplace pas un build natif signé ni une installation sur appareil.
- Ni Xcode/iOS ni build EAS signé lancés. Il faut associer un nouveau projet EAS au compte propriétaire et confirmer la disponibilité des identifiants avant publication.
- La compatibilité Expo a été vérifiée localement ; la validation distante hors ligne n’est pas une preuve d’approbation par les stores.
- Les informations légales et les assets de marque haute définition restent à fournir avant lancement commercial.
- Les en-têtes Plesk/proxy, HTTPS, réécritures SPA et règles de pare-feu devront être validés sur l’hébergement cible. Aucun déploiement réalisé.

Aucune erreur applicative bloquante connue à l’issue des contrôles disponibles. Authentification, base de données et fonctionnalités métier restent volontairement hors périmètre.
