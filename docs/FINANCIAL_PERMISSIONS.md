# Permissions financières — Bloc 12

Les rôles et périmètres existants sont réutilisés. Le serveur relit les appartenances et permissions ; masquer un bouton n’est pas un contrôle d’accès. Les filtres ne permettent pas de sortir du contexte autorisé.

| Acteur | Accès |
| --- | --- |
| Administrateur entreprise | Supervision des agences autorisées, réception de fonds, gestion des écarts, demandes et approbations distinctes de corrections, correction exceptionnelle de l’attendu après prise en charge |
| Responsable agence | Supervision et réception dans ses agences, écarts, demandes de corrections ; aucune approbation de correction d’entreprise |
| Livreur | Obligations de ses missions courantes, ses encaissements historiques et soldes dans l’agence sélectionnée, déclaration sous garde physique, ses remises et demandes de correction |
| Boutique propriétaire/responsable/employé | Suivi financier des propres commandes et du transporteur sélectionné ; attendu, net déclaré, reste client et événements pertinents |
| Personnel sans droit financier | Aucun accès financier nouveau |

Les boutiques ne voient ni identités internes des livreurs, ni soldes de responsabilité, ni remises, réceptions agence, corrections de réception ou avis internes. Leurs événements de correction sont limités aux encaissements et remboursements concernant leurs commandes. Les droits de stock n’accordent pas de droits financiers.

## Permissions explicites

Supervision : `collections.read`, `financial.supervise.read`, `remittances.read`, `remittances.confirm`, `financial.discrepancies.manage`, `financial.corrections.request`, `collections.expected.request`, `financial.history.read`.

Administration distincte : `financial.corrections.approve`, `collections.expected.exception`.

Livreur : `collections.self.read`, `collections.declare`, `remittances.self.read`, `remittances.declare`, `financial.corrections.self.request`, `financial.history.self.read`.

Boutique : `shop.collections.read`. Les permissions sont ajoutées par migration et maintenues dans le seed, sans élargir les rôles généraux.

## Séparation et abonnement

Un livreur ne confirme jamais sa propre remise. Une correction ne peut être approuvée par son demandeur ni par le livreur de la source. Le remboursement depuis les fonds déjà reçus par l’agence et la correction de réception sont réservés aux opérateurs autorisés. Les montants, agences et devises de responsabilité restent attachés à leur source originale.

L’abonnement expiré ne doit pas immobiliser des fonds déjà reçus : lecture, remise, réception, traitement d’écart et régularisation existante restent possibles dans les droits de l’acteur. La déclaration client n’est possible après expiration que pour une mission prise en charge avant l’échéance. La correction EXPECTED exige un abonnement valide. Aucun nouveau commerce ni contournement global de la politique d’abonnement n’est introduit.

Un profil livreur suspendu conserve seulement les droits financiers nécessaires à sa régularisation existante, sans nouvelle déclaration d’encaissement. Une désaffiliation ou suppression d’agence/lien qui abandonnerait une responsabilité financière est bloquée ; le règlement historique reste possible dans le périmètre conservé.

Les tests couvrent contextes falsifiés, autre entreprise/agence/boutique/livreur, cumul de rôles, droits révoqués, double confirmation et concurrence. Authentification et protections HTTP existantes sont appliquées à toutes les routes financières, avec clé d’idempotence et version pour les décisions.
