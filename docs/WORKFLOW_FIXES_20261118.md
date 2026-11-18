# Corrections des workflows du 18 novembre 2026

Exécutions examinées dans GitHub et Edge

- [added Logs](https://github.com/Amrampro/dnddelivery/actions/runs/44330633161), commit `2da4c50`
- [Reorganised user experience](https://github.com/Amrampro/dnddelivery/actions/runs/43899878998), commit `cb8559d`

## Tests de base de données

Les tests HTTP clients utilisaient `getAuthSettings()` sans clé d’authentification dans une installation CI vierge. Ils échouaient avec `AUTH_NOT_CONFIGURED`. Le serveur HTTP était déjà ouvert avant cette vérification et n’était donc pas fermé en cas d’échec, ce qui laissait le processus actif jusqu’au délai de quinze minutes.

Le lanceur des tests génère désormais ses propres clés aléatoires de livraison et d’authentification, avec une configuration de cookies et une origine locale déterministes. Ces valeurs restent confinées aux processus de tests. Les connexions de production ne changent pas. La création du service d’authentification précède l’ouverture du serveur. Le serveur et les clients de base de données sont fermés même en cas d’erreur.

La recette locale a également rencontré `P2028` pendant l’initialisation des permissions. Le délai transactionnel par défaut de cinq secondes était trop court sur une machine chargée. L’initialisation conserve une transaction atomique et dispose désormais d’un délai maximal de soixante secondes. Le délai des requêtes métier n’est pas modifié.

Les journaux techniques des prochaines exécutions de tests sont isolés dans un dossier temporaire privé. Le lanceur le nettoie à la fin, y compris lorsqu’un sous-processus échoue, sans remplacer le statut d’échec par un succès.

La suite complète sur une base réutilisée a également révélé une hypothèse incorrecte du test SMTP d’abonnements. La file globale pouvait dépasser cent messages alors que le test ne traitait qu’un seul lot. Le test fait désormais échouer d’abord les notifications de sa propre entreprise, parcourt un nombre fini de lots calculé sur la file initiale, exige l’absence d’échec SMTP et vérifie la livraison puis l’absence de nouvel envoi. Le traitement de production reste borné à la taille de lot demandée.

## Versions Expo

Expo `~58.0.26` et Expo Router `~58.0.32` remplacent les deux versions signalées par `expo install --check`. La matrice de compatibilité et Expo Doctor restent activés.

## Alerte de sécurité picomatch

L’alerte [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) touche picomatch jusqu’à 4.0.7. Au moment du diagnostic, npm publie 4.0.7 comme dernière version et l’avis ne propose aucune version corrigée.

Une protection temporaire est appliquée après installation dans API et Web. Elle utilise le mécanisme existant du parseur pour traiter littéralement les extglobs répétés à branche unique contenant `*`, au lieu de produire une expression régulière susceptible de bloquer le processus. Cela restreint intentionnellement ces motifs inhabituels. Les globs ordinaires et les alternatives littérales restent disponibles. Un test isolé avec délai maximal vérifie les motifs signalés et les motifs courants.

Le fichier amont est contrôlé par SHA-256 avant chaque application et vérification. Toute modification inattendue exige une révision du correctif. Le packaging Plesk inclut ce script pour conserver la protection lors de l’installation des dépendances.

`npm run audit:security` accepte uniquement cette alerte précise et ses dépendances indirectes après vérification du correctif. Toute autre alerte élevée ou critique, une réponse d’audit invalide ou un correctif absent bloque les contrôles. `npm audit` brut continue à signaler l’alerte amont. Cette exception expire le 18 décembre 2026 et doit être remplacée par une version corrigée officielle dès sa disponibilité.

Ne pas supprimer les contrôles de sécurité ni masquer globalement les alertes pour rendre le workflow vert.

## Point restant dans les outils mobiles

L’audit npm mobile remonte 39 alertes élevées issues du même avis picomatch, avec les versions 4.0.7 et 2.3.2 dans sa chaîne d’outils. Les deux versions Expo ont été corrigées pour la compatibilité, mais cette mise à jour ne supprime pas ces alertes. Le correctif temporaire décrit plus haut couvre API et Web. L’audit de sécurité mobile n’est pas une étape du workflow existant et reste un point distinct à traiter, sans considérer les exports réussis comme une preuve d’absence de vulnérabilité.

## Vérifications locales

- API, 89 tests réussis, compilation, types et lint validés.
- Web, 51 tests réussis, compilation et lint validés.
- Mobile, 35 tests réussis, types applicatifs et tests, lint et compatibilité des dépendances validés.
- Expo Doctor, 20 contrôles sur 20 réussis.
- Exports Android, iOS et Web réussis, avec 15 routes Web statiques.
- Tests du correctif picomatch et du blocage des autres alertes réussis dans API et Web. Audits ciblés API et Web réussis.
- YAML du workflow, commandes npm et versions verrouillées vérifiés.
- Paquet Plesk construit dans un dossier de recette distinct. Script de protection présent et exécutable, fichier privé `.env` absent.
- Panne de base provoquée sur un port local réservé puis libéré. Le lanceur conserve le code d’échec et nettoie son dossier temporaire.
- Test de journaux avec un répertoire privé isolé réussi.
- MySQL 8.4.13, première suite avec 315 validations sur 317, ayant révélé le test SMTP à corriger. Relance complète réussie après correction, 317 validations sur 317. Parcours intégré final MySQL et SMTP local réussi, de l’inscription à la livraison, l’encaissement et la remise, avec un statut de sortie global égal à zéro.

Les traces locales sont conservées dans `.local-preserved/workflow-20261118-*`. Aucun push ni déploiement effectué. Les jobs GitHub et le service MariaDB 10.11 du workflow ne sont pas relancés depuis ce poste.
