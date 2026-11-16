# Confirmation finale — Bloc 13

`ConfirmationService.complete` est l’unique service de remise réussie. Les anciennes actions de progression ne peuvent pas produire une livraison réussie en évitant cette procédure. Le verrouillage de l’entreprise, les transactions sérialisables, la version de mission et les clés d’opération protègent les requêtes concurrentes et les doubles clics.

## Conditions cumulatives

1. Mission en cours, livreur actif autorisé, affectation courante et garde physique du colis établies ; aucune transmission, aucun acheminement ou incident bloquant restant à traiter.
2. OTP vérifié par ce livreur pour cette affectation et encore valide, **ou** exception OTP approuvée et encore valide par une autre personne autorisée.
3. Au moins une photo privée `READY/HANDOVER` de la tentative courante ; deux photos canoniquement différentes pour une exception OTP. Fichiers présents et empreintes intactes.
4. Encaissement net attendu couvert pour la commande, ou exception financière du Bloc 12 approuvée sur un instantané toujours valide. Une correction financière en attente bloque la remise.

Une exception OTP ne dispense jamais des contrôles financiers. Une exception financière ne dispense jamais du code ou de son exception, ni des photographies. Les anciens encaissements non rapprochés sont traités explicitement, sans inventer de solde.

La transaction crée `DeliveryProof` et ses `ProofPhoto`, attache les images, consomme le code ou l’exception, termine l’affectation, passe commande et livraison à `DELIVERED` avec garde `RECIPIENT`, puis enregistre événement, audit et notifications. **Aucun mouvement de stock, encaissement, réception d’agence ou règlement de boutique n’est créé par cette remise.** Les fonds détenus par le livreur restent dus jusqu’à leur remise effective selon le Bloc 12.

## Exception sans OTP

Le livreur demande l’exception avec un motif. Elle passe en attente de preuve pendant une heure au maximum. Le responsable d’agence ou l’administrateur entreprise peut approuver ou refuser avec motif, dans son périmètre, après examen d’au moins deux photos distinctes. Le demandeur et le livreur source ne peuvent pas approuver leur propre demande. Changement d’affectation/garde ou fin de tentative révoquent l’autorisation ; les décisions et leur auteur restent conservés. L’écran affiche aussi les demandes refusées, expirées ou révoquées.

Une tentative échouée utilise les actions d’échec du Bloc 11, peut joindre une photo `FAILURE` et ne demande pas d’OTP. Elle ne devient jamais une remise réussie par ce seul justificatif.

## Permissions et interfaces

| Acteur | Permissions principales |
| --- | --- |
| Administrateur entreprise / responsable agence | `delivery.proofs.read`, `delivery.otp.manage`, `delivery.exceptions.approve`, `tracking.manage`, `delivery.notifications.read`, avec périmètre existant |
| Livreur | `delivery.proofs.self.read`, `delivery.otp.verify`, `delivery.proofs.upload`, `delivery.complete`, `delivery.exceptions.request`, uniquement mission affectée et gardée |
| Propriétaire / gestionnaire / employé boutique | `shop.delivery.proofs.read`, `shop.delivery.notifications.read`, uniquement ses commandes chez le transporteur choisi |

Web : panneau « Confirmation et preuves » dans la mission, file « Confirmations et preuves » filtrée sur l’attente de preuve, photos privées, décisions, état technique des notifications. Expo : écran « Confirmation et preuves de remise », saisie OTP, renouvellement, caméra ou sélection, aperçu et réessai, récapitulatif financier et choix des photos, demande/décision d’exception. La navigation et les boutons restent filtrés par les permissions du profil courant.

## API authentifiée

Préfixe `/api/deliveries/:id` :

| Méthode et suffixe | Fonction |
| --- | --- |
| GET `confirmation`, `proofs` | Résumé et preuves dans le périmètre autorisé |
| POST `otp/verify`, `otp/resend` | Vérifier / renouveler sans exposer le code interne |
| POST `proofs` | Envoyer une image privée |
| POST `otp-exceptions` | Demander une procédure exceptionnelle |
| POST `otp-exceptions/:exceptionId/decision` | Approuver ou refuser avec autre intervenant |
| POST `complete` | Appliquer toutes les conditions et confirmer la remise |
| POST `tracking/renew` | Révoquer et renouveler le suivi personnel et les OTP actifs |
| GET `communications` | Lire les états techniques sans secrets ni adresse destinataire |

Authentification, appartenance active, abonnement, garde, origine/CSRF selon le client, version et idempotence sont contrôlés au serveur. Une limite HTTP de mutations complète les quotas métier. Les contraintes SQL apportent une seconde protection contre une clôture sans preuve tracée.
