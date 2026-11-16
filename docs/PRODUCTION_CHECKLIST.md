# Portes de lancement

| Contrôle | Preuve attendue |
| --- | --- |
| Candidat immuable, dépendances et migrations | CI verte, archives et empreintes associées au commit, compte de maintenance validé sur MySQL cible |
| Failles et isolation | Campagnes HTTP/MySQL vertes, alertes restantes qualifiées, historique Git scanné et secrets exposés remplacés |
| API et Web publics | Paramètres actifs, précontrôle vert, santé et disponibilité 200, TLS, CORS, cookies, SPA, fichiers privés inaccessibles |
| Stock, finance et preuve | Recette négative et nominale sur deux entreprises, échantillons de stock et de rapprochement, preuve exigée par règle |
| Sauvegarde | Copie chiffrée et restaurée avec MySQL, photos, logos et clés correspondantes, durée et pertes mesurées |
| Android et iOS | Versions, signatures, retour d’essai sur appareils et push si activé |
| Exploitation | Jobs, alertes et propriétaires identifiés, politique de conservation validée, scénario de rollback exercé |
| Autorisation | Signatures métier et exploitation pour le candidat identifié et la cible |

Un accès interentreprises, une auth contournable, une perte de stock, une double comptabilisation, une clôture sans preuve, une migration non validée, une sauvegarde inutilisable ou un secret exposé bloque la diffusion. Conserver la preuve liée au candidat pour chaque ligne et décider des anomalies résiduelles avant approbation.
