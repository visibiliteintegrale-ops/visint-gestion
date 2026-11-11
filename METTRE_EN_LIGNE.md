# Mettre l'application VISINT en ligne (accès par simple lien, sans rien installer)

But : héberger l'application sur Internet une seule fois. Ensuite, vous et vos
collègues l'utilisez depuis n'importe quel navigateur (ordinateur ou téléphone)
via une adresse web, **sans rien installer**, en voyant tous les mêmes données.

Le dossier contient déjà tout le nécessaire pour un hébergeur :
`Dockerfile`, `entrypoint.sh`, `render.yaml`. La base `visint.db` (vos données)
est recopiée automatiquement sur un disque permanent au premier démarrage.

> Cette mise en ligne demande environ 15 minutes et quelques étapes
> techniques (création d'un compte d'hébergement). Si vous n'êtes pas à l'aise,
> confiez ce dossier à votre prestataire web / informaticien : pour lui c'est
> immédiat. Les instructions ci-dessous lui suffiront.

---

## Option 1 — Hébergeur Render.com (interface web, recommandée)

1. Mettre ce dossier dans un dépôt GitHub (compte gratuit sur github.com).
2. Sur **render.com**, créer un compte, puis **New › Blueprint** et sélectionner
   le dépôt. Render lit automatiquement le fichier `render.yaml`.
3. Valider. Render construit l'image (Docker) et met l'appli en ligne.
4. Render fournit une adresse du type `https://visint-gestion.onrender.com`.
   C'est le lien à partager. Connexion : `admin` / `admin`.

Le fichier `render.yaml` réserve déjà un **disque permanent de 1 Go** (`/data`)
pour que les données ne soient jamais perdues au redémarrage. Comptez un petit
abonnement mensuel pour conserver ce disque (le plan gratuit efface les données
à chaque redémarrage : à éviter pour un usage réel).

## Option 2 — Votre propre serveur / VPS avec Docker

```bash
docker build -t visint .
docker run -d --name visint -p 80:8000 \
  -v /opt/visint-data:/data visint
```

L'appli est accessible sur l'adresse du serveur. Les données sont stockées dans
`/opt/visint-data/visint.db` (à sauvegarder régulièrement). Placez idéalement un
reverse proxy Nginx + HTTPS devant (voir `README.md`).

## Option 3 — Chez votre hébergeur actuel (agence VISINT)

Si vous avez déjà un hébergement pour le site de l'agence, votre prestataire
peut déployer ce même `Dockerfile`, ou lancer l'appli Python
(voir `README.md`, section « Mise en ligne » : gunicorn + Nginx + HTTPS).

---

## Après la mise en ligne (important)

1. Connectez-vous avec `admin` / `admin`.
2. Créez votre vrai compte administrateur avec un mot de passe solide.
3. Supprimez le compte `admin` par défaut.
4. Créez un compte pour chaque collaborateur (rôle « utilisateur » pour la saisie).
5. Assurez-vous que l'adresse est bien en **https://** (connexion sécurisée).
