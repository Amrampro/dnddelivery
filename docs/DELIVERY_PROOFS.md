# Photographies privées et preuve de remise — Bloc 13

Les photographies sont envoyées séparément, prévisualisées, puis sélectionnées lors de la clôture. La présence d’un fichier envoyé ne constitue pas une livraison terminée.

## Validation et stockage

`POST /api/deliveries/:id/proofs?kind=HANDOVER|FAILURE&operationKey=…` accepte le corps binaire JPEG, PNG ou WebP, limité à 5 Mo. Le serveur contrôle le contenu avec Sharp, refuse un type trompeur et les images multipages, limite le décodage à 16 millions de pixels, corrige l’orientation, réduit au besoin à 1 920 pixels et produit un WebP sans EXIF. La date de preuve est celle du serveur ; les métadonnées du téléphone ne font pas foi.

`FileAsset` conserve nom interne aléatoire, type réel, taille, SHA-256 et confidentialité. `DeliveryEvidence` conserve entreprise, livraison, affectation, auteur, nature et horodatage. Les octets sont vérifiés à nouveau lors de la clôture. L’exception sans OTP exige deux images dont les empreintes canoniques diffèrent.

L’interface `ProofStorage` sépare le domaine du support de stockage. L’adaptateur fourni écrit dans `DELIVERY_PROOF_DIR` (défaut `storage/delivery-proofs`), hors racines Web publiques connues. Noms UUID, création exclusive, contrôle de chemin et refus de lien symbolique. Il n’existe pas de route statique publique pour ce dossier. Sous Windows, les bits POSIX ne remplacent pas les droits NTFS : réserver le dossier au compte de service et aux sauvegardes autorisées.

## États et accès

| État | Sens |
| --- | --- |
| `READY` | Image reçue pour la tentative courante, pas encore preuve finale |
| `ATTACHED` | Image retenue par une `DeliveryProof` immuable |
| `RETIRED` | Image d’une tentative terminée ou d’une ancienne garde, inutilisable pour une nouvelle remise |

Les échecs, changements de garde et fermetures retirent les anciennes images en attente. Une reprise de livraison exige donc de nouvelles preuves. Les images historiques sont conservées. L’upload est idempotent pour un même contenu et une même clé ; huit images en attente au maximum sont autorisées. La clôture sélectionne entre une et cinq images courantes.

`GET /api/delivery-evidence/:id/file` sert les octets après authentification et contrôle de périmètre. `/preview` sert une prévisualisation JSON authentifiée aux clients Web/Expo. Ces demandes d’accès sont auditées. Les boutiques ne lisent que les photos attachées de leurs propres commandes avec le transporteur sélectionné ; elles ne lisent ni les brouillons photographiques du livreur ni les fichiers d’un autre partenaire. Les agents internes restent limités à leur entreprise/agence ; le livreur à ses missions.

Les contraintes MySQL empêchent la modification des métadonnées de fichiers liés à une preuve, des liens `ProofPhoto` et des preuves consommées. Aucune suppression de preuve n’est proposée.

## Interruptions et entretien

L’application conserve la sélection et la clé après une panne réseau et permet le réessai. Une erreur transactionnelle supprime seulement le fichier non retenu créé par cette requête. Un arrêt brutal entre écriture et transaction peut laisser un fichier orphelin.

`npm run confirmation:cleanup` effectue une simulation. `npm run confirmation:cleanup -- --apply` retire uniquement les fichiers UUID non référencés en base, âgés de plus de 24 heures, au premier niveau du dossier privé. Aucune récursion et aucune suppression de fichier référencé, même retiré ou historique. Sauvegarder base et fichiers ensemble ; définir la politique de conservation avant exploitation réelle.
