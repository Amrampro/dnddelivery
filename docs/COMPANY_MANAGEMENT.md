# Gestion des entreprises — Bloc 5

Une entreprise possède un UUID technique et une référence métier unique, normalisée en majuscules à la création et immuable. Les autres données acceptées sont nom officiel/commercial, e-mail, téléphone, adresse, ville, pays ISO à deux lettres, immatriculation et description. L’e-mail d’entreprise n’est volontairement pas unique : plusieurs sociétés peuvent partager un contact. Les réponses ne transmettent ni hash de jeton ni chemin du stockage.

Création : entreprise et responsable existant (affiliation company_admin) ou invitation principale sont enregistrés dans une transaction. Un échec annule l’ensemble des écritures SQL. Aucun abonnement ni société de démonstration n’est créé au démarrage.

## États et responsables

ACTIVE autorise les accès selon les autres droits; INACTIVE et SUSPENDED bloquent les accès au contexte entreprise. L’état commercial futur reste distinct. Toute transition demande un motif et conserve auteur, date et audit. Les entreprises archivées sont exclues des modifications ordinaires.

Un utilisateur peut être administrateur de plusieurs entreprises sans duplication de son compte ni modification de son mot de passe. Le responsable principal doit appartenir à l’entreprise. Retirer un responsable retire seulement son affiliation à cette entreprise. Le dernier administrateur actif ne peut pas être retiré. Le principal est remplacé par un autre administrateur actif si nécessaire. Une invitation principale encore seule ne peut pas être révoquée sans autre responsable ou invitation principale valide.

Les modifications portent une version entière. Une version périmée renvoie 409 : recharger la fiche avant de recommencer. Les transactions sérialisables et le verrou de la ligne entreprise empêchent deux retraits concurrents de laisser une entreprise sans administrateur. L’audit conserve les actions et identifiants d’auteur côté serveur.

## Logos

PNG, JPEG et WebP uniquement, maximum 2 Mo et 16 millions de pixels, image non animée. Sharp décode effectivement le fichier, vérifie son format, corrige l’orientation, redimensionne dans 512×512 et réencode en WebP sans métadonnées. Les SVG et faux types sont refusés. Le nom UUID est généré par le serveur.

`COMPANY_LOGO_DIR` désigne un dossier privé persistant (défaut `storage/company-logos`, relatif au dossier de lancement API). Donner l’écriture au compte API uniquement et sauvegarder ce dossier avec MySQL. Aucune exposition statique publique : lecture par endpoint global authentifié. Un nouveau fichier est supprimé si la transaction échoue. Les versions précédentes sont conservées pour récupération; prévoir une purge opérateur des fichiers sans référence après sauvegarde. Le logo officiel DND est inchangé.

Dans le formulaire Web, le logo est transféré après l’enregistrement de l’entreprise. Si le transfert échoue, l’entreprise demeure enregistrée et le message le précise; reprendre le logo depuis Modifier. La création n’est pas répétée.

## Migrations

- `20261021090000_company_administration` : champs de gestion et version sur Company, invitation persistante, contraintes et index.
- `20261021100000_admin_query_indexes` : index des listes et du journal.

La clé étrangère composée Company(id, primaryAdminUserId) → CompanyMembership(companyId, userId) est définie en SQL. Elle est volontairement absente des relations Prisma : une relation optionnelle partageant l’UUID primaire empêchait sa génération lors de Company.create. Conserver cette FK lors des migrations futures et examiner toute proposition de suppression générée automatiquement. Les migrations antérieures sont inchangées.
