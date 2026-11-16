# Écarts, litiges et régularisations — Bloc 12

Un écart décrit une situation à examiner ; le résoudre ne crédite pas de fonds et n’efface pas de responsabilité. Les écarts et les mouvements qui les motivent restent consultables.

## Détection et suivi

Une déclaration nulle, partielle ou excédentaire ouvre un écart. Une remise insuffisante, excédentaire ou contestée peut en ouvrir un autre. Les responsables peuvent signaler un écart lié à une commande, un encaissement ou une remise dans leur périmètre : erreur de saisie, fonds manquants, contestation ou autre motif documenté.

FinancialDiscrepancy garde référence, entreprise/agence/livreur, sources, nature, montant, devise, description, auteur et date. Son cycle OPEN → REVIEW / RESOLVED → CLOSED conserve le motif de résolution, le décideur, les dates, les versions et les événements. Les sources automatiques ont une clé de déduplication. Aucun effacement physique n’est exposé.

La correction financière passe séparément par FinancialCorrection : demande motivée, contrôle des fonds et des droits, approbation indépendante, événements immuables. Tant qu’une correction source est en attente, les nouvelles remises ou décisions qui l’utilisent sont bloquées. Les ajustements COLLECTION, RECEIPT, REFUND et AGENCY_REFUND sont décrits dans [le guide des encaissements](COLLECTION_MANAGEMENT.md).

Un échec ou retour de livraison laisse les montants encaissés dans le registre. Un remboursement déjà effectué hors plateforme est documenté avec une référence externe et l’acteur qui avait les fonds, puis approuvé par un administrateur distinct. Le statut logistique ne change pas. La dérogation EXCEPTION documente la décision sur des instantanés d’attendu/net ; elle ne vaut ni remise de dette, ni preuve de livraison.

## Interfaces et routes

Web et Expo proposent Écarts et litiges, Corrections et régularisations, Soldes et Historique financier selon les droits. Les fiches affichent le motif, la chronologie, les montants, les décisions et les auteurs ; les formulaires demandent confirmation explicite et conservent les saisies après une erreur.

Sous `/api` :

- GET et POST `/financial-discrepancies`, GET `/financial-discrepancies/:id`.
- POST `/financial-discrepancies/:id/resolve` avec version, nouvel état, motif et clé d’opération.
- GET et POST `/financial-corrections` ; POST `/financial-corrections/:id/decision`.
- GET `/financial-history` et `/financial-notifications`.

## Notifications et audit

Chaque opération écrit dans la même transaction ses événements métier, FinancialEvent, l’audit et les notifications destinées aux acteurs actifs autorisés. Les données restent contextualisées ; une ancienne responsabilité de supervision ne donne pas accès aux nouveaux avis après changement de rôle. Les boutiques ne reçoivent aucun avis financier interne.

Les avis intégrés aux interfaces sont consultables sans fournisseur push. Le traitement différé `npm run collections:notifications` envoie les emails via le transport SMTP configuré. Il prend des lots bornés, utilise des baux de cinq minutes, cinq tentatives avec délai et un Message-ID stable ; il recontrôle les droits avant l’envoi et annule les destinataires devenus non autorisés. Comme tout SMTP, un accusé perdu peut entraîner une nouvelle présentation du même Message-ID : aucune garantie de livraison exactement une fois n’est revendiquée.

Un adaptateur push peut être injecté au service. Sans adaptateur configuré, les notifications PUSH restent en attente sans tentative ; aucune livraison push n’est annoncée. Le job livré utilise SMTP et les avis intégrés. Les tests utilisent un serveur SMTP local ; aucun email réel n’est envoyé par la recette.
