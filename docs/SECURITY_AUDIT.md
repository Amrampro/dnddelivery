# Audit de sécurité du Bloc 16

| Gravité | Constat | Correction et contrôle |
| --- | --- | --- |
| Élevée, dépendances | Nouvelles alertes npm dans les arbres de construction. `minimatch` vulnérable lors du traitement de motifs hostiles. `glob` et `node-forge` également signalés côté Expo. | Versions corrigées `minimatch` 11.0.1 pour la branche 7+, `glob` 14.0.6 pour la branche 9+ et `node-forge` 1.4.3. Mise à niveau corrective au sein d’Expo 57. API et Web ressortent à zéro alerte, Expo à trois entrées liées au même décodeur déjà patché. |
| Élevée, configuration | Les valeurs historiques du fichier local API ne suffisent pas à configurer la connexion MySQL et l’authentification actuelles. Le processus pouvait afficher un message de disponibilité malgré ce décalage. | `GET /api/ready` vérifie MySQL et la configuration auth, renvoie 503 générique en cas d’échec et mutualise les sondes simultanées. Le précontrôle de production couvre aussi les origines, les clés, SMTP et les répertoires. Appliquer la configuration de l’environnement cible avant installation. |
| Moyenne, stockage | Le nettoyage des preuves pouvait lire un répertoire redirigé vers un espace public et masquer des erreurs du système de fichiers. Les logos et images du catalogue ne vérifiaient pas leur emplacement réel à la lecture et à l’écriture. | Vérification du chemin réel avant parcours, suppression et accès aux médias, refus des fichiers symboliques et fichiers anormalement gros pour les logos et le catalogue. Création privée des nouveaux médias. Régression sur jonction ou lien vers une racine publique. |
| Moyenne, distribution | Un build distribué avec une URL locale ou HTTP peut livrer une configuration inutilisable ou non chiffrée. | Profils EAS séparés et validation des deux URLs HTTPS pour les profils distribués. Candidat Web construit avec une URL HTTPS explicite. |

## Contrôles applicatifs

Les suites HTTP et MySQL vérifient privilèges et changement de rôle, accès directs à des identifiants étrangers, validation de filtres et de fichiers, origine/CSRF, rejeu de jetons et d’opérations, expiration, injection par paramètres, journalisation ciblée, OTP et preuve privée. Les sondes publiques ne renvoient que le statut. La procédure Plesk doit vérifier le proxy, le refus d’accès direct aux fichiers et l’absence de chemins et secrets dans les réponses et journaux publics. Pour une instance unique, les limiteurs en mémoire restent propres à chaque processus. Avant plusieurs instances, valider une limite partagée ou appliquée en frontal.

Les clés lues dans les fichiers Web et mobile ont des préfixes publics. Le fichier API est ignoré par Git selon `.gitignore`. L’historique Git est indisponible dans ce dossier. Scanner l’historique du dépôt source, traiter chaque résultat et faire tourner les valeurs confirmées exposées avant publication. Conserver une clé par environnement. La rotation de `DELIVERY_SECRET` invalide le suivi et les OTP associés. Examiner les notes historiques dans [la campagne d’intrusion](PENTEST_LOCAL_2026-10-29.md).

## Alertes Expo restantes

- `decode-uri-component` est signalé par version malgré le patch local. Le chemin de remplacement a été modifié pour éviter les substitutions successives et le traitement des octets invalides évite le rescannage quadratique. Maintenir le patch et ses tests après `npm ci`. [Avis GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) et [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).

La mise à jour compatible Expo 57 a retiré `deepmerge` de l’arbre et éliminé l’alerte Zod de la CLI. Le patch `deepmerge` et son test ont été retirés avec le package.

Les tests locaux couvrent les protections accessibles dans ce workspace. La configuration publique, les services externes et les politiques de confidentialité restent à vérifier auprès du responsable de l’exploitation.
