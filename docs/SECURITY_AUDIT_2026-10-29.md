# Audit de sécurité transversal — 29 octobre 2026

Complément ultérieur : [campagne d’intrusion locale](PENTEST_LOCAL_2026-10-29.md), avec nouvelles requêtes adversariales, corrections de validation/inscription et runtime du projet corrigé. Les nombres ci-dessous décrivent la première passe d’audit.

Périmètre : projet DND Delivery existant, Blocs 1 à 14, API Express/MySQL, Web, mobile Expo SDK 57, règles partagées, fichiers, notifications et chaîne de construction. Audit local autorisé, avec comptes et base de test dédiés ; aucun scan d’un tiers, paiement, envoi externe de notification ni déploiement de production.

Ce document distingue les défauts corrigés, les durcissements et les limites. Il ne constitue pas une certification, un pentest de l’hébergement de production ou une garantie d’absence de vulnérabilité.

## Méthode et couverture

Inventaire statique : 123 fichiers API, 64 fichiers Web, 44 fichiers source mobile et 11 routes mobile, plus 18 fichiers partagés, tests partagés compris. Les 222 déclarations de routes trouvées par l’analyse de syntaxe ne sont pas un décompte des URL finales : certaines sont montées plusieurs fois ou construites par des boucles. Schéma : 70 modèles et 25 migrations, inchangés. Inventaire, traces et preuves de reproduction conservés dans `.local-preserved/security-audit-20261029/`.

Revue des entrées HTTP, authentification, rôles, filtres de tenant/agence/boutique/livreur, transactions, idempotence, montants, preuves, stockage privé, cryptographie et notifications. Recherche des accès SQL non paramétrés, exécution dynamique de code, injections HTML directes et stockage navigateur des jetons : aucun des motifs dangereux recherchés trouvé dans les sources d’application. Une recherche statique négative ne prouve pas l’absence de défaut sémantique.

Les tests HTTP supplémentaires exercent 31 accès en lecture et 7 écritures sans authentification, les corps invalides/trop grands/compressés, les journaux et les changements de contexte/compte entre fenêtres. Les suites métier existantes sont réexécutées sur MySQL, notamment les refus inter-entreprises et inter-agences, doubles opérations, retrait des droits, dépassements de stock, remises indépendantes et preuves.

| Bloc | Périmètre examiné et tests utilisés |
| --- | --- |
| 1 | Configuration, HTTP, erreurs, limites de corps, journalisation, construction et CI |
| 2 | Connexion MySQL, paramètres SQL, contraintes, clés étrangères, transactions et concurrence |
| 3 | Argon2id, JWT bornés, sessions serveur, rotation/réutilisation, CSRF, origine, récupération et révocation |
| 4 | Rendu React, absence de puits HTML directs, garde des portails et séparation des contextes |
| 5 | Privilège global distinct, entreprises, invitations, administrateur restant et logos |
| 6 | Expiration SaaS, tarif serveur, confirmation signée, anti-rejeu et auto-approbation interdite |
| 7 | Agences, personnel, affiliations, livreurs et disponibilité ; droits réévalués côté serveur |
| 8 | Identité boutique, inscriptions/invitations, collaboration et isolement multi-transporteurs |
| 9 | Catalogue, quantités, réservations concurrentes, dépôts, transferts, sorties et inventaires |
| 10 | Commandes, destinataires, modification/annulation, idempotence et réservation atomique |
| 11 | Affectations, garde physique, trajets, incidents, tentatives et retours |
| 12 | Montants exacts, remises réservées, réception indépendante, corrections immuables et périmètres |
| 13 | Suivi à capacité, OTP limité, réaffectation, preuves privées, exceptions et clôture contrôlée |
| 14 | SecureStore, transport mobile, contextes, destinations push, droits des appareils et dépendances SDK 57 |

## Défauts et corrections

Les niveaux applicatifs ci-dessous sont des appréciations de cet audit local. Pour les dépendances, le niveau vient des avis publiés ; une faille d’un outil de développement n’implique pas qu’elle soit exploitable sur le site compilé.

| ID | Niveau / condition | Défaut identifié | Correction et vérification |
| --- | --- | --- | --- |
| SEC-01 | Élevé, dépendance API | `body-parser` vulnérable au déni de service avec des octets après un corps compressé, GHSA-27r3-jxmh-p828. | Résolution vers **2.4.0**. Les parseurs JSON et images refusent aussi la compression (`inflate: false`), inutile aux clients actuels. Réponses 415/413/400 vérifiées, API encore disponible après chaque rejet. |
| SEC-02 | Élevé, serveur/outils Web | Ancien Vite concerné par des avis d’exécution de commandes et de lecture de fichiers du serveur de développement, ainsi que des défauts d’origine. | Mise à jour compatible dans la branche autorisée vers **Vite 8.3.5** ; compilation et lint Web vérifiés. Cela ne transforme pas le serveur de développement en serveur de production. |
| SEC-03 | Élevé, outils Web | `brace-expansion` : récursion/consommation CPU sur des expressions malveillantes. | Résolution **5.0.12** dans la chaîne ESLint/minimatch ; aucun contournement de contrôle. |
| SEC-04 | Élevé, outils Web | `source-map-js` : déni de service via certains offsets de sections. | Résolution **1.2.2**, construction Web vérifiée. |
| SEC-05 | Élevé, outils Web | Zod antérieur à 4.6.6 présent dans la chaîne de lint Web, consommation de mémoire sur de grandes collections invalides. | Résolution **4.6.7** dans le Web ; API déjà sur **4.6.7** lors de l’inventaire. Le cas distinct de Zod 3 dans Expo reste décrit plus bas. |
| SEC-06 | Élevé, décodage mobile | `decode-uri-component@0.2.2`, amené par Expo Router/query-string, comporte les algorithmes vulnérables de décodage malformé. La version corrigée 0.5.1 est ESM, alors que le consommateur installé attend une fonction CommonJS. | Rétroportage de l’algorithme officiel **0.5.1** dans un patch versionné, en conservant CommonJS et le traitement historique de `+`. Tests UTF-8, octets invalides, appel réel de query-string et entrée malformée longue dans un processus borné. Pas de migration forcée vers SDK 58. |
| SEC-07 | Faible, configuration Expo | `deepmerge@4.3.1` peut empoisonner le prototype de l’objet retourné, notamment avec une cible sans prototype ou des clés propres dangereuses. Aucun correctif amont publié au moment de l’audit. | Patch versionné excluant `__proto__`, `constructor` et `prototype` dans les deux boucles de copie, pour l’entrée source et la cible. Points d’entrée `index.js` et `dist/cjs.js` couverts. Tests conservant les champs ordinaires et l’intégrité du prototype. |
| SEC-08 | Moyen, concurrence / token d’appareil partagé | La vérification du propriétaire puis l’upsert d’un appareil push étaient deux opérations séparées. Deux réinscriptions d’un appareil libéré pouvaient toutes deux réussir et réattribuer le même token à des utilisateurs différents. | Transaction sérialisable englobant contrôle de session, propriétaire et upsert. Reproduction MySQL contrôlée : **2 propriétaires acceptés avant, 1 après**, avec `DEVICE_IN_USE` pour l’autre. Tests du token absent, du token révoqué, de l’idempotence et du rejet d’une session révoquée. |
| SEC-09 | Moyen, confidentialité des journaux | La rédaction des cookies/Authorization ne retirait pas les secrets présents dans une query string ou un en-tête Referer. Les sérialiseurs HTTP par défaut pouvaient les conserver. | Journal HTTP réduit à identifiant, méthode, chemin sans query/fragment et statut. En-têtes de requête/réponse exclus. Test HTTP réel avec marqueurs fictifs dans URL, Referer, cookies, bearer, CSRF et Set-Cookie : aucune valeur retrouvée dans la trace. |
| SEC-10 | Moyen, configuration du stockage | Le contrôle lexical des dossiers publics était sensible à la casse sous Windows, dépendait du répertoire courant et ne résolvait pas les liens de dossiers. Une mauvaise configuration pouvait publier les preuves. | Racines publiques ancrées sur le dépôt, comparaison adaptée à Windows et contrôle du chemin réel avant lecture/écriture/suppression. Test des cinq racines publiques et d’une jonction/lien vers `webapp/public` : aucun fichier photo n’y est écrit. |
| SEC-11 | Élevé conditionnel, application malveillante installée | Les e-mails de récupération contenaient un jeton dans `dnddelivery://…`. Un schéma personnalisé n’est pas réservé à une seule application : une autre application pourrait intercepter le lien. | Les nouveaux liens de récupération mobile utilisent l’origine Web configurée et le fragment, comme les liens Web ; HTTPS est déjà requis en production. Le texte de l’e-mail indique l’ouverture dans le navigateur. Aucun domaine ni App Link prétendument vérifié inventé. Les liens déjà émis ne sont pas révoqués sur une base de production inaccessible. |
| SEC-12 | Moyen, fenêtres partageant les cookies | Une autre fenêtre pouvait changer le compte ou le contexte serveur pendant que l’ancienne fenêtre gardait ses libellés/caches. Le cache d’opérations pouvait aussi retenir des données après un refus d’accès. | Le Web envoie `X-DND-User` et `X-DND-Context` pour les opérations métier ; l’API refuse une identité ou un contexte périmé. Ces valeurs sont des préconditions, jamais une source de droits. Les écrans se remontent avec l’utilisateur et le contexte ; l’ancien portail est masqué pendant sélection ; données retirées sur 401/403/404. Tests Web/cookies et mobile/bearer : aucune mutation avec contexte ou compte périmé, y compris deux comptes dans le même environnement. |
| SEC-13 | Moyen, configuration de production | Une URL MySQL distante pouvait être utilisée sans TLS en production ; le chiffrement était auparavant facultatif. | Connexion distante de production refusée sans `ssl=true`, avec vérification de certificat imposée. Exception locale limitée aux hôtes loopback explicitement reconnus ; tests de configuration. Aucun secret ni serveur distant modifié. |

Les avis et correctifs ont été confrontés au registre npm et aux sources publiées le jour de l’audit. Les mises à jour API/Web respectent les plages déclarées ; aucun `audit fix --force`.

## Reproductibilité et durcissements complémentaires

Les deux patches mobile sont dans `mobileapp/patches/`. `postinstall` exécute `patch-package --error-on-fail` : une version ou un contenu devenu incompatible doit faire échouer l’installation, pas retirer silencieusement la protection. Une véritable réinstallation `npm ci` a réappliqué les deux patches. Les tests de dépendances sont désormais exécutés dans la CI mobile, ainsi que le contrôle des types des tests ; auparavant la CI ne lançait pas cette suite. Les droits du jeton GitHub Actions sont limités à `contents: read`.

Les commandes Expo de démarrage, Web et nettoyage utilisent `--localhost` par défaut. Un essai depuis un téléphone sur le réseau local nécessite désormais une ouverture LAN explicite et maîtrisée, par exemple `npx expo start --lan` sur un réseau de confiance. Aucun tunnel ou service externe n’a été ouvert pendant l’audit.

L’ajout des préconditions Web ne remplace aucune autorisation : JWT, session, adhésion, rôle, tenant et permission continuent d’être contrôlés. Les routes d’authentification permettent toujours de relire le profil courant et de se déconnecter quand une autre fenêtre a changé le contexte. Les anciens clients sans ces en-têtes gardent les contrôles de droits existants ; reconstruire et diffuser les clients corrigés pour bénéficier de cette protection d’interface.

## Résultats et traces

**399 tests distincts réussis**, sans compter deux fois les relances :

| Vérification finale | Résultat | Trace privée |
| --- | --- | --- |
| MySQL, tous les modules, 15 tests parents compris | **269/269** | `database-final.log` |
| API/auth/HTTP/configuration/stockage | **49/49** | `api-tests-complete.log` |
| Règles partagées et identité maintenue pendant les réessais | **45/45** | `shared-tests-complete.log` |
| Mobile, transport/contrats/assets/rétroportages | **36/36** | `mobile-tests-final.log` |
| Types API et tests, ESLint API | Réussis | `api-build-complete.log`, `api-test-types-complete.log`, `api-lint-complete.log` |
| Compilation API et types des tests finaux | Réussis ; client Prisma généré, contrôles d’identité présents dans le code compilé | `api-build-complete.log`, `api-test-types-complete.log` |
| Types source/tests et ESLint mobile | Réussis après réinstallation propre | `mobile-types-final.log`, `mobile-test-types-final.log`, `mobile-lint-final.log` |
| ESLint et compilation Web | Réussis après les dernières corrections d’identité | `web-lint-complete.log`, `web-build-complete.log` |
| Expo Doctor et matrice SDK 57 | **21/21**, dépendances à jour | `mobile-doctor.log`, `mobile-dependencies.log` |
| Exports Android/iOS/Web, rendu statique compris | Réussis avec deux workers | `mobile-exports-bounded.log` |
| Audit npm API / Web | **0 / 0 avis connus** | `api-audit-final.json`, `webapp-audit-final.json` |
| Audit npm mobile brut | **12 alertes : 6 faibles, 6 élevées** ; voir les réserves ci-dessous | `mobileapp-audit-final.json` |
| Recherche des secrets serveur configurés dans les sorties Web/mobile | **133 fichiers contrôlés, aucune correspondance** | `artifact-security.json` |
| Fichiers protégés / schéma / migrations | Aucune différence sur les `.env`, EAS, assets originaux et migrations ; 70 modèles / 25 migrations | `source-inventory.json` |

Les tests du contexte vérifient aussi qu’un réessai après renouvellement reste lié à l’utilisateur qui a commencé l’opération : il ne doit jamais adopter silencieusement un compte nouvellement connecté. Un début anonyme reste anonyme lors d’un réessai. Le format de `Headers` est correctement conservé par le client Web. Le contrôle de prototype reproduit l’héritage malveillant avec l’ancien deepmerge et son absence avec le patch.

Le contrôle du compte attendu s’applique aussi aux écritures de profil et aux actions protégées de `/auth`. Le test présente les cookies et le CSRF valides du nouveau compte avec l’identité attendue de l’ancien : la modification de profil est refusée, sans changer le nouveau compte. La lecture du profil courant, la connexion, la récupération et la déconnexion restent utilisables pour retrouver une session cohérente.

Les traces des tentatives intermédiaires sont conservées, notamment l’ancien test de notification et la commande d’export incorrecte. Aucun test échoué n’est présenté comme réussi avant sa correction et sa relance.

Les services locaux de recette ont été arrêtés ; aucun processus de recette ni port d’écoute 33087, 4399, 5183, 8088 ou 8089 ne subsiste. Les données et traces de test sont conservées. Le journal antérieur est conservé intégralement et complété par une section d’audit.

Un premier passage MySQL a échoué sur un test historique qui sélectionnait indifféremment un e-mail destinataire ou livreur, puis interdisait le mot `token`. Depuis le Bloc 13, l’e-mail destinataire contient volontairement son lien personnel. Le test sélectionne maintenant explicitement le livreur, dont le message doit rester générique ; l’assertion de confidentialité n’a pas été supprimée. Les tests des e-mails destinataires et du suivi sécurisé restent séparés.

La première commande d’export via npm a perdu son option de destination dans cet environnement PowerShell ; une invocation directe de la CLI conserve les options. Une tentative d’export trop concurrente a été arrêtée sous pression mémoire puis relancée avec deux workers. Ces tentatives ne sont pas comptées comme des validations.

## Alertes et limites conservées

- L’audit npm brut du mobile reste non nul : il raisonne sur les versions déclarées et ne reconnaît pas les rétroportages. Les alertes du décodeur et de deepmerge restent donc visibles, malgré les tests de leurs corrections locales. Elles ne sont pas masquées par un remplacement artificiel de version.
- **Zod 3.25.76 de la CLI Expo reste sans correctif compatible installé.** L’avis GHSA-mrhx-c7xc-m3w5 concerne les versions antérieures à 4.6.6 ; la CLI SDK 57 demande une API Zod 3. Aucun remplacement aveugle par Zod 4. L’application n’utilise pas cette dépendance comme validateur métier distant ; le serveur API utilise la version corrigée. Ne pas exposer l’outillage Expo/Metro à des entrées ou réseaux non fiables, conserver le démarrage local et suivre le correctif amont. C’est une limite ouverte, pas une faille annoncée comme corrigée.
- Aucun hébergement de production, reverse proxy, pare-feu, gestionnaire de secrets, sauvegarde, configuration DNS/TLS réelle ou déploiement multi-instance n’est accessible dans ce périmètre. Le dimensionnement et le partage des compteurs de limitation entre instances restent à valider lors du déploiement.
- Aucun pentest sur téléphone physique, iOS natif, terminal compromis/rooté, autre application interceptrice, FCM/APNs réel ou réseau mobile n’est revendiqué. Les essais de l’APK du Bloc 14 ne sont pas une nouvelle certification de ces correctifs.
- MFA des comptes privilégiés, protection des sauvegardes et rotation des secrets lors du déploiement restent des mesures d’exploitation à organiser ; aucune modification de comptes réels n’a été effectuée.

## Références

- [Avis body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
- [Avis du décodeur et version corrigée 0.5.1](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) ; le patch conserve son algorithme et la licence du paquet installé.
- [Avis deepmerge, sans version corrigée publiée](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
- [Avis Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- [OWASP — données à exclure des journaux](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- [OWASP — risques des liens mobiles](https://mas.owasp.org/MASTG/knowledge/android/MASVS-PLATFORM/MASTG-KNOW-0019/).
- [Référence officielle Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
