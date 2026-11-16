# API et sessions mobiles — Bloc 14

L’URL est compilée depuis `EXPO_PUBLIC_API_URL`. HTTPS est requis pour l’exploitation réelle ; `localhost` désigne le téléphone lui-même, pas le poste de développement. Le simulateur Android peut utiliser `adb reverse` ou l’adresse du poste accessible depuis le simulateur. Ne jamais placer mot de passe, clé de signature ou secret serveur dans une variable `EXPO_PUBLIC_*`.

## Transport commun

`src/auth/client.ts` expose le transport utilisé par tous les modules. En-tête `X-DND-Client: mobile`, bearer courant et MIME explicite pour les octets photographiques. Les chemins sont relatifs à l’API ; un chemin absolu ou commençant par `//` ne peut pas recevoir de bearer. Les corps JSON, y compris erreurs, sont contrôlés ; une réponse illisible n’est pas présentée comme un succès nul. Les contrats de jetons, profil et workspace sont vérifiés avant d’autoriser la navigation.

Chaque requête a un délai de quinze secondes, lecture du corps comprise, et accepte l’annulation de son appelant. Délai dépassé, interruption et erreur réseau sont distingués. Une opération sensible sans réponse reste non confirmée. Les lectures identiques simultanées sans option de requête sont regroupées pendant leur exécution, sans réutiliser une ancienne réponse comme cache ultérieur.

Un 401 peut provoquer un seul rafraîchissement partagé puis un seul réessai avec le même corps et la même clé métier. Un ancien 401 arrivé après une rotation utilise le nouveau jeton sans refaire une rotation. Un second 401 révoque l’état local ; aucun cycle de redirection/refresh. Une panne réseau du refresh conserve la session récupérable. Aucun réessai automatique d’une écriture après erreur réseau, timeout, conflit ou refus métier.

## Persistance et changements d’environnement

Sur natif : SecureStore, clé `dnd.session.v1`, protection `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Aucune session sensible dans AsyncStorage. L’aperçu Expo Web garde ses jetons uniquement en mémoire et les perd au rechargement complet. Cette prévisualisation ne remplace pas le client Web officiel et ses cookies HttpOnly.

Un changement de contexte passe par `/auth/switch-organization`. Il est refusé pendant une écriture non confirmée. La sélection masque l’ancien espace, annule ses lectures et rejette ses réponses tardives. Les états de module et données sont séparés par contexte. Une sélection dont le résultat est ambigu impose une vérification de la session ; elle ne réaffiche pas arbitrairement les anciennes permissions. Aucun rôle ne peut être choisi indépendamment de ceux retournés par l’API.

Au retour au premier plan, le profil est revérifié. Une panne transitoire conserve les saisies de la session déjà établie avec un message ; une réponse de sécurité invalide bloque l’espace. Les lectures opérationnelles sont actualisées toutes les trente secondes lorsque l’écran est actif ; les minuteurs sont retirés lorsque l’écran perd le focus. Rechargement manuel disponible. Aucun mécanisme de synchronisation hors ligne des fonds ou stocks n’est ajouté.

La déconnexion désactive l’enregistrement push local lorsqu’il existe puis révoque la famille de session au serveur avant d’effacer SecureStore. En cas de panne empêchant cette révocation, elle signale l’échec et ne prétend pas avoir fermé la session distante. Les révocations/manipulations de sessions existantes restent celles du Bloc 3.

## Domaines REST réutilisés

| Domaine | Principaux préfixes |
| --- | --- |
| Identité et accès | `/auth`, `/driver/profile`, `/driver/availability` |
| Organisation et partenaires | `/company`, `/partners` |
| Catalogue et stock | `/products`, `/stocks`, `/stock-deposits`, `/stock-withdrawals`, `/stock-reservations`, `/stock-transfers`, `/inventories` |
| Commandes | `/orders`, `/recipients` |
| Missions et preuves | `/deliveries`, `/driver/missions`, `/delivery-evidence` |
| Fonds documentaires | `/collections`, `/cash-remittances`, `/financial-*` |
| Abonnement | `/company/subscription` et `/payments` |

Chaque opération garde les règles, versions optimistes, clés d’idempotence et contrôles d’abonnement/affiliation existants. Le verrou d’interface ne remplace pas ces gardes serveur. Les corrections backend du Bloc 14 sont limitées aux avis de confirmation filtrés selon l’accès actuel et au raccordement optionnel de l’adaptateur push au travailleur financier.
