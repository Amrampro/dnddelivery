# Exports des rapports

`POST /api/reports/exports`, session authentifiée, origine de confiance et protection CSRF existantes. Corps JSON strict :

```json
{"kind":"orders","format":"xlsx","filters":{"preset":"30d"}}
```

Formats : csv, xlsx, pdf. Même service et même autorisation que GET : changer kind ou un UUID ne donne aucun droit supplémentaire. Réponse JSON `{filename,mime,base64}` consommée par le client Web de session existant ; téléchargement Blob local, URL révoquée après usage. Aucun fichier public, jeton de téléchargement permanent ou répertoire d’exports partagé. Audit REPORT_EXPORTED après génération réussie.

Chaque document contient titre, organisation, période, fuseau, date de génération, filtres effectifs, cartes, séries quotidiennes, comparaison précédente lorsqu’elle existe, tableaux et définitions/limites. Le serveur force page 1 et taille 100, puis refuse tout tableau dont le nombre total dépasse le nombre de lignes présentes. Aucun export silencieusement tronqué. Limite totale 2 000 lignes, période 366 jours, six exports/minute/utilisateur, règles financières de 2 000 encaissements inchangées.

CSV : UTF-8 avec BOM, séparateur point-virgule, guillemets doublés et chaque cellule citée, CRLF. XLSX : ExcelJS, cellules de texte, retours à la ligne et entêtes figés ; les montants restent des chaînes exactes, y compris les 19 chiffres de DECIMAL(19,4). Dates UTC et fuseau explicités, devises en colonnes séparées. PDF : PDFKit, A4 paysage paginé, texte lisible et définitions complètes. Aucun montant ne passe par une conversion flottante pour un calcul d’export.

CSV/XLSX : les valeurs commençant, après espaces, par `=`, `+`, `-` ou `@` reçoivent un préfixe apostrophe. Les contrôles non imprimables sont retirés. Toutes les valeurs XLSX sont du texte, jamais un objet formula/hyperlink fourni par les données. Les tests rouvrent le classeur et vérifient l’absence de cellules Formula.

Les fichiers sont générés en mémoire et ne sont pas des archives comptables signées. Les rapports larges doivent être filtrés ; il n’y a pas de file de génération en arrière-plan ni de planification automatique d’envoi. Journalier = today, hebdomadaire = week ou 7d selon besoin explicite, mensuel = month/previous-month, personnalisé = custom. Aucun e-mail automatique ni transfert d’argent.

Dépendances : ExcelJS/PDFKit/Temporal côté API, Recharts côté Web. L’override ExcelJS → uuid ^11.1.1 corrige l’alerte de bornes de buffer des anciennes versions tout en conservant l’API CommonJS utilisée. Vérification par écriture/réouverture XLSX et audit npm ; aucun ajout natif Expo.
