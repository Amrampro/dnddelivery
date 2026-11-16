# Déclarations de règlements externes

Les paiements sont effectués hors DND Delivery. Aucun checkout, API Mobile Money, encaissement électronique ni transaction bancaire n’est intégré. Le montant déclaré n’est jamais une preuve de règlement. Voir [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md).

## Déclaration

L’administrateur COMPANY autorisé saisit un montant décimal exact, devise, MTN Mobile Money/Orange Money/virement/espèces/autre, référence facultative, date UTC passée et commentaire facultatif. L’API refuse les champs supplémentaires, dont companyId, validatedById ou status. Aucun utilisateur ne peut accorder lui-même une période.

Le justificatif n’est pas ajouté : le stockage existant sait traiter les logos d’entreprise, mais aucun flux générique sécurisé de justificatif n’est exposé. Le Bloc 6 ne détourne pas l’endpoint logo. La référence et le commentaire permettent la vérification humaine hors plateforme.

La déclaration crée Subscription si nécessaire au statut PENDING et SubscriptionPayment en attente. Elle ne crée aucune période valide. Une clé UUID d’idempotence par entreprise protège les réessais réseau; la même clé avec un contenu différent est refusée. Une empreinte unique bloque la réutilisation d’une référence en attente ou confirmée (normalisée, par moyen externe, même entre entreprises); sans référence, l’empreinte porte sur entreprise, montant canonique, devise, moyen et date. Les écritures restent limitées en fréquence. Après rejet, une nouvelle déclaration corrigée peut reprendre la référence avec une nouvelle clé d’idempotence; le paiement rejeté et son motif restent immuables dans l’historique.

## Traitement humain

Le global doté de subscriptions.validate consulte montant, référence, date et commentaire, puis vérifie effectivement le règlement à l’extérieur. Le bouton de précontrôle affiche le paiement et les bornes exactes du mois proposé. Seule sa confirmation signée peut déclencher la validation. Un auteur, même devenu global, ne peut pas valider ou rejeter sa propre déclaration.

Validation : verrou de la ligne entreprise, relecture du paiement et des droits globaux, vérification du tarif courant/de la confirmation, insertion de période, traitement du paiement, mise à jour de l’abonnement, événements et notifications dans une seule transaction MySQL. Deux validations simultanées du même paiement accordent une seule période; un second essai renvoie 409. Deux paiements concurrents sur une même entreprise demandent un nouveau précontrôle au perdant, pour éviter les périodes qui se chevauchent.

Rejet : motif obligatoire, validateur et date serveur conservés, aucune période accordée. Les paiements APPROVED/REJECTED sont immuables en SQL. Les versions de tarif et périodes confirmées restent intactes après toute modification future du prix. Consulter les déclarations filtrées sur Confirmé ou Rejeté pour leur historique et les périodes pour l’historique des renouvellements.

Les notifications sont enregistrées dans la transaction, envoyées plus tard par le job : une panne SMTP ne peut pas annuler une validation métier. Le journal des notifications indique état, destinataire, nombre de tentatives et diagnostic générique, sans secret SMTP. Voir [PLESK_SCHEDULED_JOBS.md](PLESK_SCHEDULED_JOBS.md).
