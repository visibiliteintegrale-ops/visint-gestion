# VISINT COMMUNICATION — Application de gestion commerciale

Application web qui reprend **à l'identique** les fonctionnalités de votre
fichier Excel « Fiche de pilotage VISINT » : prospects, ventes, clients,
tableau de bord mensuel, évolution annuelle et paramètres. Les calculs
(conversion, code de parrainage, état client, chiffre d'affaires, objectifs,
fidélisation…) sont reproduits côté serveur et **recalculés automatiquement**
à chaque modification, comme les formules Excel.

Vos **données existantes sont déjà chargées** dans l'application (227 prospects,
457 ventes, 7 services, objectifs, commerciaux, sources, historique du CA).

---

## 1. Contenu

```
backend/
  app.py              API + service des pages (FastAPI)
  db.py               base SQLite + schéma + mots de passe
  compute.py          calculs prospects / clients (formules Excel)
  analytics.py        tableau de bord mensuel + évolution annuelle
  seed_from_excel.py  (ré)import des données depuis un fichier Excel
  requirements.txt
  visint.db           ⬅ VOS DONNÉES (déjà importées)
  static/             interface web (HTML / CSS / JS)
```

---

## 2. Démarrage rapide (test en local)

Pré-requis : Python 3.10 ou plus.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Ouvrez ensuite http://127.0.0.1:8000 dans votre navigateur.

**Connexion par défaut :** identifiant `admin` / mot de passe `admin`
➡ Changez-le immédiatement (menu Paramètres › Utilisateurs : créez votre compte
admin puis supprimez le compte `admin` par défaut).

---

## 3. Mise en ligne (accès multi-utilisateurs)

L'application est multi-utilisateurs : chaque personne a son identifiant et son
mot de passe (rôle **admin** = tous les droits, rôle **user** = saisie des
prospects/ventes sans modifier les paramètres).

### a) Serveur de production (Linux) avec systemd + Nginx

Installez le serveur applicatif :

```bash
cd /opt/visint/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt gunicorn
```

Service systemd `/etc/systemd/system/visint.service` :

```ini
[Unit]
Description=VISINT Gestion commerciale
After=network.target

[Service]
WorkingDirectory=/opt/visint/backend
Environment="VISINT_DB=/opt/visint/backend/visint.db"
ExecStart=/opt/visint/backend/.venv/bin/gunicorn app:app \
  -k uvicorn.workers.UvicornWorker -w 2 -b 127.0.0.1:8000
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now visint
```

Reverse proxy Nginx (`/etc/nginx/sites-available/visint`) :

```nginx
server {
    listen 80;
    server_name gestion.votre-domaine.com;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activez le HTTPS (fortement recommandé, les mots de passe transitent par le
réseau) :

```bash
sudo certbot --nginx -d gestion.votre-domaine.com
```

### b) Hébergement simplifié

L'application fonctionne telle quelle sur un hébergeur Python (Render, Railway,
Fly.io, un VPS…). Commande de démarrage :
`gunicorn app:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT`.
Pensez à conserver le fichier `visint.db` sur un disque persistant.

---

## 4. Sauvegarde des données

Toutes les données sont dans le fichier **`backend/visint.db`**. Pour sauvegarder,
il suffit de copier ce fichier régulièrement :

```bash
cp backend/visint.db sauvegardes/visint-$(date +%F).db
```

---

## 5. Réimporter depuis Excel (optionnel)

Si vous voulez repartir d'un fichier Excel à jour (⚠ cela **remplace** les
données de l'application) :

```bash
cd backend
python seed_from_excel.py chemin/vers/fiche.xlsx
```

---

## 6. Correspondance avec le fichier Excel

| Feuille Excel            | Dans l'application                              |
|--------------------------|-------------------------------------------------|
| Prospects                | Onglet **Prospects** (saisie + calculs auto)    |
| Ventes                   | Onglet **Ventes** (+ totaux par commercial)     |
| Clients                  | Onglet **Clients** (calculé automatiquement)    |
| statistique du mois /    | Onglet **Tableau de bord** (objectifs du mois)  |
| Evolution_Mois           |                                                 |
| Evolution_Annuelle       | Onglet **Évolution annuelle**                   |
| Parametres               | Onglet **Paramètres**                           |

Champs recalculés automatiquement, exactement comme dans Excel : état du
prospect (Converti / En cours / Perdu), code de parrainage généré, nom du
parrain, date et durée d'achat, ordre client, état client (Actif / Inactif /
Perdu), chiffre d'affaires généré, rang, nombre de filleuls, objectifs réalisés
et taux d'atteinte, évolution mensuelle et cumul annuel.
