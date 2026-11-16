# Demandes d’accès des entreprises de livraison

## Parcours public

« Demander un accès » ouvre `/acces` avec deux choix explicites :

- **Je suis une entreprise de livraison** : formulaire `/acces/entreprise-livraison` réservé aux organisations qui assurent les livraisons. Le responsable renseigne les coordonnées de l’entreprise et confirme ce profil.
- **Je suis une boutique** : formulaire existant `/inscription-boutique`, conservant sa vérification par invitation.

La page de connexion présente les deux liens. Chaque formulaire permet aussi de rejoindre l’autre parcours si le visiteur s’est trompé de profil.

Une demande d’entreprise est enregistrée sans créer de compte, d’entreprise ou d’abonnement. Une seule demande en attente est conservée par adresse e-mail normalisée ; un nouvel envoi ne remplace pas ses coordonnées. Le formulaire public ne permet ni de consulter les demandes, ni de choisir un rôle ou un statut administratif.

## Administration globale

Le menu **Demandes d’accès entreprises** présente les coordonnées, la date, le statut et les décisions. Les compteurs en attente/acceptées/refusées sont également disponibles sur la vue d’ensemble. La liste est filtrable et paginée.

L’administrateur vérifie l’activité et l’identité du responsable puis confirme sa décision avec un motif :

- **Accepter** crée une entreprise active avec une référence générée. Si l’adresse appartient à un compte existant actif, ce compte devient administrateur principal de la nouvelle entreprise. Sinon, une invitation est créée et envoyée ; le responsable doit l’accepter pour définir son mot de passe et accéder à son espace.
- **Refuser** clôt la demande sans créer d’accès. Le motif reste dans l’administration ; aucun e-mail de refus n’est envoyé automatiquement.

L’acceptation, la création de l’entreprise et la décision sont atomiques. Une demande déjà traitée ne peut pas être acceptée une seconde fois. Les décisions sont journalisées. Les routes de traitement exigent une session globale autorisée et une protection CSRF. Le formulaire public vérifie l’origine et limite les envois.

Un échec SMTP ne supprime pas l’entreprise ni l’invitation : un message explique comment ouvrir la fiche de l’entreprise et renvoyer l’invitation. L’activation ne crée pas d’abonnement et ne contourne pas ses règles.

## Déploiement et recette

La migration `20261116170000_company_access_requests` crée la table des demandes. Le déploiement Plesk habituel génère le client Prisma et applique cette migration ; aucune modification manuelle de la base n’est nécessaire.

La recette HTTP sur la base locale de test couvre le refus du profil boutique et d’une origine étrangère, la déduplication, l’absence d’accès avant validation, les droits globaux/CSRF, l’acceptation puis l’activation du compte invité, la décision répétée, le refus, l’association à un compte existant, les compteurs et l’échec SMTP.
