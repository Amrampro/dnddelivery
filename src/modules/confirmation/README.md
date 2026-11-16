# Confirmation et suivi personnel

Ce module étend les services de commande, livraison et encaissement existants. `ConfirmationService.complete` est le seul chemin de remise réussie : garde et affectation courantes, OTP ou exception indépendante, photos privées et contrôle financier. La transaction conserve une preuve immuable et ne déplace aucun fonds ni stock.

Lire les guides à la racine : [confirmation](../../../../docs/DELIVERY_CONFIRMATION.md), [OTP](../../../../docs/DELIVERY_OTP.md), [preuves](../../../../docs/DELIVERY_PROOFS.md), [suivi](../../../../docs/PUBLIC_TRACKING.md), [notifications](../../../../docs/DELIVERY_NOTIFICATIONS.md). Les garanties réellement testées et les limites matérielles figurent dans le [rapport Bloc 13](../../../../docs/BLOC-13-RAPPORT.md).

Exécuter les migrations avant les travailleurs, configurer une clé `DELIVERY_SECRET` aléatoire de 32 caractères minimum et un dossier de preuves privé sauvegardé. Ne jamais exposer les secrets ou les fichiers via un serveur statique. Le nettoyage est une simulation sans `--apply`. Les tests MySQL s’exécutent uniquement sur la base dédiée, sans reset.
