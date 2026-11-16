# Problèmes et validations ouverts

| Priorité | Point ouvert | Fermeture attendue |
| --- | --- | --- |
| Bloquant | Paramètres d’exploitation hérités et hôte Plesk non vérifié | Configurer la cible, valider Node, droits DBA, cookies et TLS, répertoires et journaux, démarrer les jobs puis rejouer la recette. |
| Bloquant | Sauvegarde réelle et restauration sur la cible à homologuer | Restaurer hors production une copie chiffrée de la cible et vérifier l’alignement MySQL et fichiers privés. |
| Élevée | Historique Git non accessible dans le dossier courant | Scanner le dépôt réel, qualifier et remplacer tout secret exposé, confirmer l’activation des protections. |
| Élevée | CI et artefact à exécuter sur GitHub | Pousser le candidat via le processus de l’équipe et contrôler les résultats ainsi que les archives générées. |
| Élevée pour la diffusion mobile | Aucun binaire de diffusion signé ou validé sur appareil physique | Contrôler les comptes EAS et stores, faire une préversion Android/iOS, valider sur appareils et configurer le push si requis. |
| Moyenne | Expo Router, query-string et son décodeur encore signalés malgré le correctif local | Suivre le [rapport de sécurité](SECURITY_AUDIT.md), réauditer à chaque mise à jour et supprimer le patch après un correctif officiel compatible et vérifié. |
| Moyenne | Limiteurs par processus et performances à la volumétrie locale | Valider la stratégie de limitation avant plusieurs instances et mesurer sur données représentatives. |
| Moyenne | Validation métier et juridique | Valider tarifs, conservation, RGPD ou obligations locales applicables, sous-traitants et demandes des personnes. |
