# Sécurité des sessions

## Secrets et durées

Access token JWT HS256, durée par défaut 600 secondes (configurable entre 60 et 1800). Refresh de 32 octets aléatoires, durée absolue de famille de 30 jours par défaut (1–90). La rotation n’étend pas indéfiniment cette date. Chaque token est hashé en SHA-256 avant stockage ; avec cette entropie, le hash n’est pas réutilisable comme credential. Les mots de passe utilisent Argon2id avec sel généré par la bibliothèque.

Le serveur exige un secret d’accès privé d’au moins 32 octets, sans valeur de repli. Pour l’alimenter, générer une valeur cryptographique dans votre gestionnaire de secrets ou votre environnement privé ; ne pas reprendre une chaîne exemple. Le .env API n’a pas été modifié par cette intervention et aucun secret de production n’a été imprimé.

## Navigateur

Deux cookies HttpOnly : dnd_access, chemin /api ; dnd_refresh, chemin /api/auth. Host-only, Secure en production, SameSite=Lax par défaut. Pour un déploiement réellement cross-site, SameSite=None exige HTTPS ; les politiques de cookies tiers des navigateurs peuvent imposer un déploiement Web/API sous un même site. Les réponses d’authentification portent Cache-Control:no-store.

Les requêtes Web utilisent credentials:include, X-DND-Client:web et un jeton CSRF pour les mutations authentifiées. Le jeton est lié à la famille par HMAC et son hash est vérifié en base. Il n’est pas persisté dans localStorage. GET csrf permet de le restaurer avec le cookie de refresh ; le navigateur conserve uniquement ce jeton en mémoire.

Les mutations exigent aussi une origine/referrer autorisés. Les connexions et récupérations publiques sont protégées par cette vérification et le header personnalisé. Les corps sont validés par Zod, sans champs d’auto-promotion. Les requêtes natives utilisent des bearer tokens et ne prennent pas implicitement les cookies Web.

Le refresh est mutualisé dans un onglet ; lorsque Web Locks est disponible, il est aussi sérialisé entre onglets du même site. Sans cette API, des rafraîchissements simultanés de plusieurs onglets peuvent entraîner une reconnexion : le serveur conserve une détection stricte de réutilisation plutôt qu’une fenêtre permissive. Les gardes attendent la restauration et la vérification workspace avant l’affichage d’un portail. Une session invalidée ferme l’état d’accès côté client.

## Expo

Un enregistrement SecureStore unique dnd.session.v1 contient accessToken et refreshToken. Il est écrit en une opération pour éviter une paire incohérente. Keychain AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY sur iOS ; aucun AsyncStorage ou localStorage pour les credentials. Le compte est rechargé au démarrage et au retour au premier plan. Les 401 déclenchent une seule rotation partagée puis une seule répétition de requête ; un refus efface l’état local.

L’aperçu Expo dans un navigateur utilise uniquement une mémoire éphémère, car SecureStore est natif : il ne prétend pas tester la persistance Keychain/Keystore. Les essais sur appareil réel restent indispensables. Un nouveau build natif avec SecureStore est requis pour un ancien client qui n’incluait pas ce module. Les identifiants Android/iOS et le schéma dnddelivery sont conservés.

## Révocation et appareils

Une famille représente la connexion d’un appareil. La liste publique des sessions ne révèle ni hash, ni user agent complet, ni adresse IP, ni token. Logout révoque cette famille ; logout-all, changement et reset du mot de passe révoquent toutes les sessions. DELETE sessions/:id vérifie qu’elle appartient au compte connecté. La rotation crée une nouvelle ligne et conserve le nom d’appareil et le contexte sélectionné.

Un token de refresh déjà remplacé/révoqué provoque la révocation de sa famille, y compris le successeur. Un compte désactivé est refusé sur toute requête et au refresh. Un JWT valide ne suffit jamais à contourner la base. La révocation ne peut pas annuler une réponse qui était déjà en cours de traitement au moment de l’opération.

## Tentatives et exploitation

Limites IP réellement raccordées : login 12/15 min, refresh 60/15 min, récupération 5/h, reset 8/15 min, changement 5/15 min, enveloppe globale 240/15 min ; limite supplémentaire par adresse normalisée/hashée pour connexion/récupération. Le stockage de ces compteurs est en mémoire de processus : un déploiement multi-instance exigera un store partagé ou une limite équivalente au proxy. Il ne faut pas prétendre à une protection distribuée sans cette configuration.

TRUST_PROXY_HOPS vaut 0 par défaut. Configurer uniquement le nombre réel de proxies maîtrisés sur Plesk ; ne pas activer une confiance générale aux headers IP. CORS est limité à la liste d’origines et autorise les credentials. Les cookies, headers Authorization/CSRF et corps d’erreur sensibles sont masqués ; les erreurs publiques ne contiennent pas les diagnostics Prisma/SMTP ni des credentials.

## Audit des dépendances pendant le bloc

API : deux avis transitifs proxy-addr/qs ont été corrigés par mises à jour compatibles ; audit final à zéro vulnérabilité.

Expo : l’audit npm signale encore 29 avis transitifs (18 élevés, 11 modérés), notamment braces, node-forge, decode-uri-component et uuid et leurs dépendants. Les mises à jour compatibles ont été appliquées, sans résoudre ces avis. Les remédiations force proposées changent le SDK (dont un retour vers Expo 44) et n’ont pas été exécutées. Expo Doctor 21/21 et les builds ne signifient donc pas un audit de dépendances sans avis. Ce point doit être suivi avant une publication, sans mélanger les SDK.
