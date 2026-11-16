# Parcours des commandes — Bloc 10

## Web et Expo

La boutique ouvre Nouvelle commande depuis son contexte autonome ou son transporteur courant. L'opérateur ouvre Commandes reçues puis Nouvelle commande pour une boutique partenaire. Quatre étapes partagent les contrats et validations dans `shared/orders.ts` :

1. Transporteur, boutique, agence partagée, type ponctuel ou depuis stock.
2. Coordonnées du destinataire et recherche paginée dans le répertoire autorisé.
3. Collecte si ponctuelle, recherche paginée de produits, articles/quantités, colis, encaissement et instructions.
4. Récapitulatif puis Enregistrer le brouillon ou Confirmer la commande.

La référence et le créateur proviennent du serveur. Aucun compte du destinataire n'est demandé. L'enregistrement d'une fiche de répertoire est explicite et ne fusionne pas des contacts.

Mes commandes / Commandes reçues permet recherche, filtres, pagination et tri. Les compteurs viennent de MySQL. Brouillons est une entrée dédiée ; le filtre permet de passer entre soumises/brouillons/toutes. La fiche expose coordonnées historiques, collecte, créateur, articles, encaissement attendu, réservations et historique. Les boutons dépendent des permissions et de l'abonnement actuel ; l'API revalide systématiquement l'action.

Une édition soumet le contenu complet et la version lue. La soumission d'un brouillon revalide produits, collaboration, agence, abonnement et disponible à cet instant. Un brouillon ne promet aucune disponibilité future. Les coordonnées d'une commande officiellement soumise restent figées.

L'annulation ouvre un panneau expliquant la libération des réservations, demande un motif puis une confirmation. La fiche annulée reste lisible et ne présente plus d'édition/soumission/annulation préalable.

## Réseau et rejeu

Un formulaire conserve une `clientKey` stable pendant son ouverture. Le serveur associe cette clé à l'entreprise et au créateur, ainsi qu'à une empreinte canonique du contenu initial. Deux validations concurrentes identiques retrouvent la même commande. La réutilisation de cette clé avec un autre contenu produit un conflit. Après une coupure, réessayer le même contenu ou retrouver la demande dans la liste ; ne pas ouvrir volontairement une nouvelle saisie pour la même demande.

Les boutons sont bloqués pendant l'appel et une garde mémoire empêche deux envois immédiats. En cas d'échec, les champs restent présents. Expo remonte vers le début du formulaire lors du changement d'étape ou d'une erreur pour rendre le titre/message accessible. Il ne s'agit pas d'une file de synchronisation hors ligne ; fermer/recharger l'application peut perdre une saisie non enregistrée.

Une soumission répétée ne réserve pas à nouveau. Une annulation répétée avec le même motif ne libère pas à nouveau. Les modifications utilisent les versions ; après un conflit, relire la fiche avant de corriger.

## Notification d'enregistrement

La soumission ajoute une `Notification` `ORDER_SUBMITTED` dans la même transaction, avec une clé unique par commande. Aucun SMTP dans cette transaction. Le worker `npm run orders:notifications`, après `npm run build` dans api, utilise le transport e-mail existant et une taille de lot `ORDER_NOTIFICATION_BATCH` de 1 à 1000 (100 par défaut).

Le worker revendique les avis avec verrou de ligne et `SKIP LOCKED`, bail de cinq minutes, reprise d'un bail abandonné, cinq tentatives maximum et recul exponentiel. Un échec SMTP laisse la commande enregistrée ; le prochain lancement éligible reprend l'avis. Une commande annulée avant l'envoi rend l'avis CANCELLED. Le texte contient seulement la référence et une confirmation d'enregistrement, sans OTP, adresse détaillée, secret ni faux lien de suivi public.

Le message utilise un Message-ID stable. Comme tout transport SMTP, une coupure entre l'envoi et son acquittement en base peut provoquer une répétition ; ce mécanisme ne promet pas un e-mail exactement une fois. Les avis épuisés restent FAILED pour diagnostic opérateur. Aucun worker ni ordonnanceur de production n'est installé par cette réalisation. Le suivi des autres statuts et les avis complets relèvent du Bloc 13.
