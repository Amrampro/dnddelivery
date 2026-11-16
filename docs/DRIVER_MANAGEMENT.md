# Livreurs et disponibilité — Bloc 7

Un livreur est un User existant, une CompanyMembership, ses AgencyMembership et un DriverProfile propre à l'entreprise. Le profil conserve matricule facultatif unique dans l'entreprise, moyen de transport, notes internes, état, disponibilité, version et dates. Il ne crée aucune course.

## Administration Web

Inviter la personne au rôle Livreur et sélectionner ses agences. Après acceptation, son profil est ACTIVE et UNAVAILABLE. La fiche Livreur permet matricule, transport, notes et état ACTIVE/SUSPENDED/INACTIVE. Les affectations utilisent les mêmes contrôles que le personnel. L'administrateur ne se rend pas disponible à la place du livreur.

Un profil suspendu/inactif perd ses permissions opérationnelles et devient indisponible. La réactivation d'une affiliation ne réactive pas silencieusement un profil suspendu : l'administrateur doit aussi traiter son état de livreur. Les anciennes affiliations courrier sans DriverProfile n'obtiennent pas les permissions opérationnelles avant régularisation explicite par ce module.

## Expo SDK 57

Le livreur sélectionne une agence autorisée, consulte son profil et ses affectations puis choisit Disponible ou Indisponible. L'identité vient de la session; le client ne fournit pas de userId à modifier. L'application transmet la version, affiche le résultat serveur et permet le rafraîchissement. Profil inactif, affiliation retirée, agence inactive ou abonnement invalide empêchent les changements. La consultation personnelle reste permise selon le contexte encore accessible.

## API

Sous /api/company : GET /drivers, GET/PATCH /drivers/:id, PATCH /drivers/:id/assignments. Filtrage/pagination serveur; le filtre status porte sur DriverProfile et employmentStatus expose séparément l'affiliation.

Sous /api/driver : GET /profile, GET /availability, PATCH /availability. Écriture limitée à AVAILABLE/UNAVAILABLE et version; aucune commande BUSY ni affectation de mission dans ce bloc.

assertDriverAssignable constitue un garde pour les futurs modules : abonnement valide, droits courants, profil actif et disponible, affiliation livreur active dans l'agence active. Il ne remplace pas la future transaction d'affectation et ne crée pas de livraison.

## Validation et limites

Les tests MySQL contrôlent disponibilité personnelle, identité non modifiable, versions, suspension, retrait, multi-agences et isolation. La recette Expo Web a modifié la disponibilité réelle; la liste Web affiche ensuite le même état enregistré en MySQL. Capture : previews/bloc7-expo-disponibilite.png. Aucun téléphone physique, build signé ni publication en store n'est déclaré validé. Les versions des dépendances Expo et les identifiants natifs n'ont pas été modifiés dans le Bloc 7.
