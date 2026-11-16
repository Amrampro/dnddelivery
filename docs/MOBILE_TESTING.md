# Tests mobiles — Bloc 14

Les vérifications distinguent tests automatiques, réponses de l’API réelle, recette Expo Web, recette Android native et essais physiques. Un écran affiché sans réponse serveur vérifiée n’est pas compté comme une opération réussie. Les résultats finaux et captures sont consignés dans `BLOC-14-RAPPORT.md` et le journal de développement.

## Commandes

Depuis `mobileapp` : `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:dependencies`, `npm run doctor`, puis `npx expo export --platform all --max-workers 2`. Les tests du transport et des contrats ne demandent ni téléphone ni compte externe.

Depuis `api` : types sources/tests, lint, build, `npm test` et `npm run test:db`. Le lanceur MySQL refuse une base ne se terminant pas par `_test`. Fournir `TEST_DATABASE_URL` et les réglages locaux nécessaires sans les publier. Les données et migrations de test sont conservées ; aucun reset pour obtenir un succès.

## Scénarios automatiques ciblés

Le transport est exercé avec stockage/fetch injectés : restauration, payload de jetons invalide, refresh concurrent/retardé/révoqué, panne réseau sans double écriture, corps binaire conservé au réessai autorisé, timeout y compris lecture du corps, annulation, chemin externe refusé, réponse JSON invalide, effacement des données après fin de session et changement de contexte avec réponse tardive. Les contrats vérifient les permissions et la navigation issue d’un push, y compris mauvais transporteur et route injectée.

Les tests backend additionnels vérifient la boîte des avis d’exception, le filtrage des champs privés, le changement d’agence et la désaffiliation. L’adaptateur Expo est exercé sans réseau externe : famille révoquée, données génériques de destination, appareil désenregistré et échec fournisseur. Les suites historiques réexercent stock, commandes, garde, OTP/preuves, encaissements, droits et abonnements.

## Recette fonctionnelle

| Profil | Contrôles à effectuer et tracer |
| --- | --- |
| Entreprise | Connexion, deux entreprises distinctes, agences/opérations, abonnement, profil et déconnexion |
| Responsable | Agence autorisée, commandes, affectation, incidents, remise distincte et exception OTP |
| Stock | Produit/recherche, dépôt confirmé, sortie, transfert/réception, inventaire et historique API |
| Boutique | Transporteurs distincts, stock contextualisé, commande ponctuelle et depuis stock, suivi et annulation autorisée |
| Livreur | Disponibilité, mission/enlèvement/étapes, montant déclaré, OTP, caméra/photo, clôture, remise et historique |

Chaque mutation est relue depuis l’API/MySQL ou depuis un autre client. Tester aussi une coupure et un réessai conservant saisie/version/clé, un refus inter-tenant, un abonnement expiré et une permission retirée. Le mobile ne peut pas anticiper le succès du serveur. L’exception OTP ne supprime ni le contrôle financier ni les photos ; remise de colis et remise de fonds restent différentes.

Une compilation native et un simulateur disponibles doivent être essayés. Leur résultat ne doit pas être confondu avec une installation physique ou une publication. Les tests iOS, push externe et matériel non réalisés doivent rester explicitement indiqués dans le rapport final.

## Résultats exécutés — 29 octobre 2026

385 tests distincts réussis : 268 API/MySQL, 42 API hors base, 42 partagés et 33 mobiles (dont trois contrôles de format d’asset et de conservation du logo). Types sources/tests, ESLint, compilation Web, schéma Prisma et 25 migrations contrôlés. Expo Doctor 21/21, matrice des dépendances à jour et exports Android/iOS/Web réussis. Le contrôle statique du texte natif couvre 41 fichiers TSX ; il complète la recette sans constituer un test de rendu natif. Aucun test automatisé React de composant n’est revendiqué.

La recette Expo Web avec l’API et MySQL réels a exercé les cinq profils : changement d’entreprise, abonnement, affectation, dépôt/sortie/transfert/réception/inventaire, séparation des transporteurs, commandes ponctuelle et depuis stock, annulation, prise en charge/distribution, 5 000 XAF déclarés, OTP du suivi sécurisé, photo fictive, clôture et remise confirmée par un responsable distinct. Les statuts et montants de la livraison clôturée ont été relus en base. Les captures et traces de test restent dans `.local-preserved/bloc14/` ; ne pas publier les fichiers de comptes ou de liens personnels.

Le détail final des essais Android, des échecs intermédiaires, des alertes npm et des vérifications physiques restant à effectuer est dans [BLOC-14-RAPPORT.md](BLOC-14-RAPPORT.md). Une compilation, un export, une installation, un démarrage et une recette fonctionnelle sont des résultats différents.
