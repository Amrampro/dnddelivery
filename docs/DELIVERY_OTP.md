# Code de remise — Bloc 13

Le code OTP est distinct de la référence, du lien personnel et de tout paiement. Il est destiné au destinataire, qui le communique au livreur uniquement lorsque celui-ci présente le colis.

## Cycle de vie

Le serveur génère six chiffres avec `crypto.randomInt`. La génération exige une mission en cours, un colis physiquement détenu par le livreur actif et une phase `FINAL_DISTRIBUTION`, `AT_DESTINATION` ou `AWAITING_PROOF`. Le code est lié à l’entreprise, la livraison et l’affectation. Les contrôles d’abonnement conservent les règles de clôture des missions antérieures à l’expiration.

La comparaison utilise un HMAC avec domaines séparés. Une copie AES-256-GCM avec contexte authentifié est réservée à l’envoi au destinataire. `DELIVERY_SECRET` doit contenir au moins 32 caractères aléatoires ; le conserver hors dépôt et le sauvegarder de manière sécurisée. Une modification improvisée de cette clé rend les secrets chiffrés existants illisibles.

| Règle | Valeur |
| --- | --- |
| Validité du code | 30 minutes maximum |
| Validité après vérification | 10 minutes, sans dépasser l’expiration initiale |
| Mauvais essais | 5 maximum |
| Verrouillage après échec | 15 minutes |
| Délai minimum entre renouvellements | 60 secondes |
| Émissions, code initial inclus | 3 par heure maximum |

Les trois codes précédents sont exclus d’une régénération. Un nouveau code révoque l’ancien. Les changements d’affectation ou de garde, les tentatives échouées, les retours, annulations et fermetures révoquent les codes actifs. Le renouvellement du suivi les révoque également. La consommation est atomique avec la remise finale et interdit leur réutilisation.

## Interfaces et sécurité

- L’e-mail de distribution finale et celui de renouvellement peuvent contenir le code actuel. Les messages de création de commande n’en contiennent pas. Le suivi personnel sécurisé permet également de l’obtenir.
- Le livreur affecté saisit le code via `POST /api/deliveries/:id/otp/verify`. La réponse interne ne renvoie jamais sa valeur. Les mauvais essais sont conservés même si la commande répond par une erreur.
- Une vérification réussie ouvre l’étape de preuves, sans déclarer la livraison terminée. Un code déjà vérifié n’est pas accepté à nouveau comme nouvelle opération. Une validation expirée impose un renouvellement avant clôture.
- `POST /api/deliveries/:id/otp/resend` est réservé au livreur autorisé ou à la gestion opérationnelle autorisée. L’utilisateur reçoit un état d’envoi, jamais le secret.
- Les clés d’opération permettent de répéter une requête perdue sans ajouter un essai ou une action. Réutiliser la même clé avec une autre saisie est refusé.
- `OtpAttempt` conserve les tentatives et leur résultat ; les empreintes de requêtes sensibles sont à clé. `AuditLog` trace émission, vérification, échecs et renouvellement sans code brut.

États persistants : `PENDING`, `VERIFIED`, `LOCKED`, `EXPIRED`, `REVOKED`, `CONSUMED`. Les DTO peuvent aussi signaler une expiration calculée sans réécrire l’histoire.

Une impossibilité d’OTP ne permet pas de contourner le contrôle : elle passe par l’exception à double intervenant décrite dans [DELIVERY_CONFIRMATION.md](DELIVERY_CONFIRMATION.md).
