# Design system — DND Delivery

## Identité et tokens

La source commune est `shared/tokens.ts`. Ce dossier contient uniquement des constantes et métadonnées TypeScript, sans React ni DOM. Le Web applique les tokens aux variables CSS avec `webapp/src/design/tokens.ts` ; `design.css` fournit les valeurs du premier rendu. Expo consomme ces constantes directement dans ses StyleSheet et dans `src/theme.ts`. Metro surveille explicitement `../shared`.

| Usage | Valeur |
| --- | --- |
| Identité, navigation active | Bleu #033173 |
| Accent officiel et confirmations | Vert #0BB058 |
| Fond principal des cartes | Blanc #FFFFFF |
| Bouton principal, texte vert accessible | Vert foncé #087C42 |
| Texte / texte secondaire | #172B45 / #637287 |
| Fond / bordure | #F6F8FB / #E4E9EF |
| Erreur / avertissement | #B42335 / #916114 |
| Espacements | 4, 8, 12, 16, 24, 32, 48 |
| Rayons | 8, 12, 18, arrondi complet |
| Typographie de référence | 12, 15, 18, 28, 36 |
| Transitions | 140 / 220 ms |
| Ombre | #152D48, faible opacité, rayon 16, décalage 4 |

Le blanc reste dominant. Le bleu structure la navigation ; le vert clair officiel sert aux accents. Le vert plus foncé des boutons permet un texte blanc lisible. Police système sur Expo ; Inter si disponible, puis Segoe UI/Arial sur Web, sans téléchargement bloquant. Les compositions utilisent des tailles adaptées à chaque plateforme, sans désactiver la mise à l’échelle native du texte.

Les logos originaux restent dans webapp/public et mobileapp/assets ; aucune retouche des fichiers. Les petites illustrations du dashboard sont des compositions de repères logistiques et d’icônes, jamais un remplacement du logo. L’identifiant natif reste com.goulbam.dnddelivery.

## Composants Web

`webapp/src/design/ui.tsx` contient des composants indépendants, avec des propriétés typées. Les styles spécifiques sont isolés par les préfixes ds- et ws-. Tailwind 4 demeure actif ; les composants s’intègrent aux classes utilitaires et aux composants existants sans modifier la landing.

| Composants | Contrat |
| --- | --- |
| Button | primary, secondary, ghost, danger ; disabled et busy |
| Field, Select, Textarea, Choice | Libellés associés ; erreurs reliées par aria-describedby ; Choice checkbox ou radio |
| Badge, Card | Statuts neutre, succès, alerte, erreur ; titre et action facultatifs |
| SearchInput, Tabs, Pagination | États contrôlés par le parent ; boutons désactivés aux limites ; vues sélectionnées annoncées |
| DataTable | Colonnes, lignes et caption ; région défilable horizontalement au clavier |
| Dialog, Confirm | Dialog natif : focus piégé, fond inerte, fermeture Escape et retour au déclencheur |
| Dialog drawer | Panneau latéral responsive ; même contrat de focus |
| Popover | Disclosure HTML natif, liens/boutons ordinaires, fermeture Escape et clic extérieur |
| Toast | Annonce status, fermeture et expiration ; aucun succès métier inventé |
| Skeleton, EmptyState, ErrorState, AccessDenied | Chargement, absence de données, erreur avec nouvelle tentative et accès refusé |
| Stat, Chart | Valeur absente = tiret ; graphique vide sans série inventée ; données passées explicitement par le parent |
| ImportExport | Désactivé sans module et callbacks réels ; aucune exportation fictive |
| Permission | Rend les enfants uniquement si la permission effective existe ; ne remplace pas le serveur |

Exemple : `<Button busy={saving} disabled={!valid} onClick={save}>Enregistrer</Button>`. Un futur formulaire doit gérer sa validation, ses appels API et les erreurs. Les composants n’accèdent pas eux-mêmes à des données métier.

La bibliothèque interactive protégée `/portail/:role/composants` permet de vérifier boutons, champs, radios, cases à cocher, filtres, pagination, tableaux, dialogues, panneau, confirmations et toast. Son texte indique explicitement qu’il s’agit de démonstrations UI ; aucune écriture API n’est effectuée depuis cette bibliothèque.

## Composants natifs

`mobileapp/src/design/ui.tsx` : Button, Input, Card, Badge, EmptyState, ErrorMessage, Skeleton, Loading, Sheet, Confirm, ListRow, Selector, Summary et Detail. Ces composants utilisent Text, View, Pressable, TextInput, ScrollView et Modal. Les formulaires d’authentification conservent Field avec affichage du mot de passe et erreurs existantes. Screen gère le clavier, le défilement et les zones sécurisées ; Action reste compatible avec les écrans existants.

ListRow accueille un titre, un complément, une icône et une action ; Detail reçoit une liste de libellés/valeurs pour préparer les futurs écrans de détails. Selector ouvre une feuille de choix ; la sélection d’entreprise filtre les seuls environnements fournis par l’API. Sheet peut être centré pour une confirmation ou ancré en bas pour la navigation. Modal gère la fermeture système ; les commandes de fermeture sont nommées et tactiles.

Les listes métier volumineuses futures devront utiliser FlatList avec clés stables et pagination API ; les listes présentes sont de courts menus. Les skeletons natifs restent statiques pour limiter le coût et le mouvement. Aucun composant DOM n’est importé dans Expo.

## Accessibilité et mouvements

Web : focus visible, lien d’évitement, titres hiérarchisés, vrais liens, contrôles nommés, états busy/disabled, annonces d’erreur/succès, tableau défilant sans élargir la page. Les menus ne nécessitent pas de souris. Les vues de sélection restent des boutons de groupe avec aria-pressed, sans simuler un widget d’onglets incomplet.

Native : actions de 46–50 points ou plus, onglets avec état sélectionné, libellés et rôles d’accessibilité, marges de sécurité. Les animations Reanimated utilisent useReducedMotion ; le Web hérite de MotionConfig reducedMotion=user et des règles prefers-reduced-motion. Aucune 3D, aucun son ni animation continue décorative dans les espaces.

Les contrôles navigateur ne certifient pas VoiceOver/TalkBack ni le clavier natif : une recette sur appareil reste requise avant publication.

## Conventions pour les prochains modules

Réutiliser les tokens, le catalogue de navigation et les composants. Une statistique absente n’est jamais zéro ; une requête non implémentée n’est jamais un succès simulé. Ajouter un endpoint métier avec contrôle serveur du tenant et de la permission avant d’activer une action. Ne jamais transférer les cookies ou secrets vers le stockage public. Les appels passent par les clients du Bloc 3.
