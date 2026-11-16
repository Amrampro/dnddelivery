# Catalogue des produits — Bloc 9

Le catalogue appartient à la boutique, indépendamment de ses transporteurs. Un même Product peut être déposé chez plusieurs entreprises et agences sans duplication du produit ni du compte utilisateur.

## Identité et unités

Champs : id, shopId immuable, nom, SKU facultatif, description, catégorie facultative, image privée facultative, unité, activité/archivage, version, dates serveur. Un SKU non vide est unique dans la boutique; une chaîne vide devient NULL. La même référence peut exister dans une autre boutique. Les anciens SKU et unités sont conservés.

Toutes les quantités sont des nombres entiers d'articles, jamais des fractions ou des conversions implicites. Le libellé d'unité peut rester piece, paire, boite, carton, colis ou une ancienne valeur métier (30 caractères maximum). Il n'existe aucun moteur de conversion. Modifier ce libellé est refusé dès qu'un mouvement ou une ligne de commande historique référence le produit : créer une autre référence pour une autre unité.

Archiver ne supprime pas les stocks ni les mouvements. L'archivage interdit les nouvelles réceptions du produit; les marchandises déjà détenues restent visibles et peuvent être traitées selon leurs droits. La réactivation est explicite et versionnée. Les mouvements gardent l'identité Product; les changements commerciaux sont audités avec leurs anciennes/nouvelles valeurs utiles.

## Droits et interfaces

shop_owner et shop_manager : shop.products.read/manage; shop_employee : shop.products.read. Le transporteur et les agents autorisés peuvent lire les produits utiles à leurs stocks (stocks.read), sans modifier le catalogue. Une agence ne peut sélectionner que les catalogues des collaborations actives qui la partagent; les produits déjà présents dans son historique de stock restent consultables après fin de collaboration. Aucun accès aux autres boutiques par simple modification de shopId.

Le catalogue propre à la boutique reste administrable depuis shop-home ou un contexte de transporteur, même si ce transporteur expire. Les nouvelles opérations physiques du transporteur gardent leurs propres gardes d'abonnement.

Web : liste paginée/recherche/statut, création, fiche/modification, archivage/réactivation et image. Expo : liste, recherche, création, édition et archivage; le téléversement de l'image est sur le Web. Les formulaires de dépôt/transfert sélectionnent des produits existants et ne créent pas un catalogue de transporteur.

## API et images

/api/products : GET / (q, shopId, status=ACTIVE|ARCHIVED, page, size≤50); POST /; GET/PATCH /:id; GET/PUT /:id/image. La boutique est dérivée de la session, jamais d'un shopId d'écriture. PATCH transmet les champs commerciaux et version. Les corps sont stricts, les conflits de version et de SKU renvoient 409.

L'image est envoyée brute (PNG/JPEG/WebP, 2 Mo maximum), avec X-Product-Version. Le serveur décode, vérifie format et nombre de pixels/pages, réoriente et réencode en WebP sans métadonnées. GET renvoie {mime,image} en base64 après autorisation. PRODUCT_IMAGE_DIR est facultatif (storage/product-images par défaut); les images ne sont pas publiées comme fichiers statiques. Le helper sécurisé du Bloc 5 est réutilisé avec un dossier facultatif, sans changer le comportement des anciens logos. Les fichiers officiels sont préservés.

Code : api/src/modules/products/{service,validation,routes}.ts, shared/stocks.ts, webapp/src/stocks/ProductCatalogue.tsx, mobileapp/src/stocks/CatalogScreen.tsx. Voir STOCK_MANAGEMENT.md et le rapport Bloc 9 pour les migrations et vérifications.

PATCH conserve les champs omis, notamment SKU, unité et état archivé. Une édition du nom d'un produit archivé ne le réactive pas; active:true doit être transmis explicitement pour cette décision.
