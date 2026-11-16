# Tableaux de bord par profil

Les portails viennent du backend du Bloc 3. Le frontend ne reconstruit pas les affiliations ni les règles d’attribution des rôles. Le catalogue shared/workspace.ts fournit seulement la composition de présentation et les permissions nécessaires. Un utilisateur sans accès actif ne peut pas entrer dans ces espaces.

| Portail | Composition et outils préparés |
| --- | --- |
| Super Administrateur | Entreprises totales/actives/suspendues, abonnements actifs/expirés, évolution des inscriptions, priorités ; entreprises, abonnements, paiements déclarés, utilisateurs, rapports, journal et paramètres |
| Entreprise | Supervision des commandes et livraisons, livreurs, stock, encaissements ; agences, partenaires, employés, produits, commandes, remises, rapports, abonnement et paramètres |
| Agence | Priorités quotidiennes, commandes et livraisons, encaissements ; affectations, équipe, stock, incidents et historique ; nom de l’agence toujours visible |
| Stock | Produits, disponibilité, mouvements et alertes ; tableau d’inventaire préparé, entrées/sorties/transferts ; import/export désactivés |
| Boutique | Commandes, expéditions et stocks déposés ; transporteur sélectionné, accès à la sélection de collaboration ; nouvelle commande, suivi et catalogue préparés |
| Livreur | Courses à venir/en cours/terminées ; mes courses, historique, notifications personnelles et profil ; parcours mobile prioritaire |

Chaque Web dashboard comprend un titre propre au profil, le contexte actif, des emplacements d’indicateurs sans chiffres, une zone de tendance vide, une zone de priorités et une recherche dans les modules autorisés. Les composants Stat et Chart attendent explicitement de vraies valeurs. Un tiret signifie que les données ne sont pas encore disponibles, jamais une mesure de zéro.

Les accueils mobiles reprennent les mêmes conventions, avec une synthèse limitée aux quatre premiers emplacements, des cartes de navigation et les onglets spécifiques au profil. Le Web expose davantage de navigation ; le mobile conserve les opérations principales à portée du pouce.

Les écrans de modules présentent un état d’attente, les colonnes de tableau utiles lorsqu’elles sont connues et des actions désactivées. Aucun ordre, livraison, encaissement, mouvement de stock, rapport ou abonnement n’est créé par le Bloc 4. Les notifications n’indiquent pas à tort qu’il n’existe aucune alerte : le texte explique que le service n’est pas encore activé.

Pour le Bloc 5, définir les contrats métier et permissions détaillées, connecter les composants aux endpoints autorisés, gérer pagination/filtrage serveur et conserver les états chargement/vide/erreur. Effectuer les tests d’isolation MySQL et une recette native réelle avant activation. Aucune publication en production n’a été effectuée dans ce bloc.
