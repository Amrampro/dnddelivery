# Architecture mobile — Bloc 14

Une application Expo Router unique, identifiants Android et iOS `com.goulbam.dnddelivery`, dans `mobileapp`. Les identités, logos et tokens graphiques existants sont conservés. Le mobile communique exclusivement avec l’API REST ; aucune connexion MySQL et aucun moteur métier parallèle.

## Organisation

`app/` définit les routes. `src/auth` porte SecureStore, le transport, les contrats de session et Guard. `src/workspace/WorkspaceScreen.tsx` vérifie le contexte et compose le module autorisé. Les domaines `organization`, `partners`, `stocks`, `orders`, `deliveries`, `finance`, `confirmation` et `subscriptions` consomment les mêmes services que le Web. `shared/` contient contrats, libellés, permissions de navigation et règles de présentation, sans dépendance Web dans le mobile.

Le transport injectable `auth/transport.ts` est testé sans dépendance native. `auth/client.ts` le relie à l’URL et au stockage réels. `useApiData` centralise chargement, annulation, erreurs et séparation utilisateur/contexte/ressource. Les hooks métier existants délèguent à ce composant, sans nouveau cache persistant. Les données d’une organisation précédente ne servent jamais de secours à une autre. Les réponses 401/403/404 ne conservent pas les anciennes données à l’écran.

## Interface et performance

Les tokens sont dans `shared/tokens.ts`, les primitives natives dans `src/design/ui.tsx`. Button, Input, CurrencyInput, OtpInput, Checkbox, Card, Badge, ListRow, Sheet, Confirm, Selector et états de chargement/erreur/vide sont réutilisés. `DateField` utilise le sélecteur système sur Android/iOS ; l’aperçu Web accepte une date textuelle explicite. Les montants restent des chaînes décimales avec devise, sans conversion flottante.

Les écrans et panneaux gèrent clavier et zones sécurisées. Les sélecteurs proposent une recherche et une FlatList virtualisée. Les formulaires volumineux de comptage/réception affichent vingt articles par page, en conservant l’ensemble des valeurs saisies pour l’envoi. Les listes de commandes, stocks, finances et missions gardent leur pagination API ; aucun chargement de toutes les opérations d’une entreprise. Les images de preuve sont normalisées par le serveur. Les transitions respectent le mouvement réduit.

Les tableaux de bord entreprise/agence utilisent les synthèses des endpoints existants de commandes et livraisons, limitées à leur périmètre ; aucun indicateur statistique fictif ni rapport du Bloc 15. Le stock et les boutiques conservent leurs accueils métier déjà connectés. Les actions prioritaires sont aussi dans le menu et au maximum cinq onglets filtrés par permissions.

## Native et responsabilités

SDK 58 et matrice `bundledNativeModules.json` vérifiée par `expo install --check`, pas par choix arbitraire de versions. DateTimePicker et SystemUI complètent les modules image-picker/notifications/SecureStore existants. SystemUI applique le thème clair Android déclaré. Le dossier Android de recette est généré par Expo CNG et ignoré en versionnement ; `app.json` et les plugins restent la source de configuration.

L’OTP et la clôture sont décidés exclusivement par le serveur. Caméra sur action explicite, galerie non alimentée automatiquement, aperçu et réessai sans succès local anticipé. Les photos restent privées et horodatées au serveur. Voir [preuves](DELIVERY_PROOFS.md) et [confirmation](DELIVERY_CONFIRMATION.md).

Voir [navigation](MOBILE_NAVIGATION.md), [API et sessions](MOBILE_API_INTEGRATION.md), [notifications](MOBILE_NOTIFICATIONS.md), [tests](MOBILE_TESTING.md) et [préparation de livraison](MOBILE_RELEASE_PREPARATION.md).
