import os, secrets
from datetime import date
from fastapi import FastAPI, Request, HTTPException, Depends, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

import db as DB
import compute
import analytics

BASE = os.path.dirname(__file__)
STATIC = os.path.join(BASE, 'static')

DB.init_schema()
DB.ensure_admin()

app = FastAPI(title='VISINT - Gestion commerciale')


# ---------------- Auth ----------------
def current_user(request: Request):
    token = request.cookies.get('session')
    if not token:
        raise HTTPException(401, 'Non authentifié')
    conn = DB.get_conn()
    row = conn.execute(
        'SELECT u.id,u.username,u.role FROM sessions s '
        'JOIN users u ON u.id=s.user_id WHERE s.token=?', (token,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(401, 'Session expirée')
    return dict(row)


def require_admin(user=Depends(current_user)):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Réservé à l administrateur')
    return user


class Login(BaseModel):
    username: str
    password: str


@app.post('/api/login')
def login(data: Login, response: Response):
    conn = DB.get_conn()
    row = conn.execute('SELECT * FROM users WHERE username=?',
                       (data.username,)).fetchone()
    if not row or not DB.verify_password(data.password, row['password']):
        conn.close()
        raise HTTPException(401, 'Identifiants invalides')
    token = secrets.token_urlsafe(32)
    conn.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',
                 (token, row['id']))
    conn.commit()
    conn.close()
    response.set_cookie('session', token, httponly=True, samesite='lax',
                        max_age=60 * 60 * 24 * 7)
    return {'username': row['username'], 'role': row['role']}


@app.post('/api/logout')
def logout(request: Request, response: Response):
    token = request.cookies.get('session')
    if token:
        conn = DB.get_conn()
        conn.execute('DELETE FROM sessions WHERE token=?', (token,))
        conn.commit()
        conn.close()
    response.delete_cookie('session')
    return {'ok': True}


@app.get('/api/me')
def me(user=Depends(current_user)):
    return user


# ---------------- Helpers ----------------
def _all(table):
    conn = DB.get_conn()
    rows = [dict(r) for r in conn.execute(f'SELECT * FROM {table}').fetchall()]
    conn.close()
    return rows


def _cfg():
    conn = DB.get_conn()
    rows = conn.execute('SELECT * FROM config').fetchall()
    conn.close()
    d = {r['cle']: r['valeur'] for r in rows}
    return d


def _cycle():
    try:
        return int(float(_cfg().get('cycle_vente', '30')))
    except Exception:
        return 30


# ---------------- Prospects ----------------
class ProspectIn(BaseModel):
    source: Optional[str] = None
    nom: str
    telephone: Optional[str] = None
    date_arrivee: Optional[str] = None
    service: Optional[str] = None
    code_parrain: Optional[str] = None
    action: Optional[str] = None


@app.get('/api/prospects')
def list_prospects(user=Depends(current_user)):
    prospects = _all('prospects')
    ventes = _all('ventes')
    return compute.enrich_prospects(prospects, ventes, _cycle())


@app.post('/api/prospects')
def add_prospect(p: ProspectIn, user=Depends(current_user)):
    conn = DB.get_conn()
    nxt = conn.execute('SELECT COALESCE(MAX(numero),0)+1 n FROM prospects').fetchone()['n']
    conn.execute(
        'INSERT INTO prospects(numero,source,nom,telephone,date_arrivee,service,'
        'code_parrain,action) VALUES(?,?,?,?,?,?,?,?)',
        (nxt, p.source, p.nom, p.telephone, p.date_arrivee, p.service,
         p.code_parrain, p.action))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.put('/api/prospects/{pid}')
def edit_prospect(pid: int, p: ProspectIn, user=Depends(current_user)):
    conn = DB.get_conn()
    conn.execute(
        "UPDATE prospects SET source=?,nom=?,telephone=?,date_arrivee=?,"
        "service=?,code_parrain=?,action=?,updated_at=datetime('now') WHERE id=?",
        (p.source, p.nom, p.telephone, p.date_arrivee, p.service,
         p.code_parrain, p.action, pid))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.delete('/api/prospects/{pid}')
def del_prospect(pid: int, user=Depends(current_user)):
    conn = DB.get_conn()
    conn.execute('DELETE FROM prospects WHERE id=?', (pid,))
    conn.commit()
    conn.close()
    return {'ok': True}


# ---------------- Ventes ----------------
class VenteIn(BaseModel):
    date_achat: Optional[str] = None
    service: Optional[str] = None
    commercial: Optional[str] = None
    client: str
    montant: float = 0


@app.get('/api/ventes')
def list_ventes(user=Depends(current_user)):
    conn = DB.get_conn()
    rows = [dict(r) for r in conn.execute(
        'SELECT * FROM ventes ORDER BY date_achat DESC, id DESC').fetchall()]
    conn.close()
    return rows


@app.get('/api/ventes/par-commercial')
def ventes_commercial(user=Depends(current_user)):
    ventes = _all('ventes')
    agg = {}
    for v in ventes:
        c = v.get('commercial') or '(non attribué)'
        agg[c] = agg.get(c, 0) + (v.get('montant') or 0)
    return [{'commercial': k, 'total': v} for k, v in
            sorted(agg.items(), key=lambda x: -x[1])]


@app.post('/api/ventes')
def add_vente(v: VenteIn, user=Depends(current_user)):
    conn = DB.get_conn()
    conn.execute('INSERT INTO ventes(date_achat,service,commercial,client,montant)'
                 ' VALUES(?,?,?,?,?)',
                 (v.date_achat, v.service, v.commercial, v.client, v.montant))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.put('/api/ventes/{vid}')
def edit_vente(vid: int, v: VenteIn, user=Depends(current_user)):
    conn = DB.get_conn()
    conn.execute('UPDATE ventes SET date_achat=?,service=?,commercial=?,client=?,'
                 'montant=? WHERE id=?',
                 (v.date_achat, v.service, v.commercial, v.client, v.montant, vid))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.delete('/api/ventes/{vid}')
def del_vente(vid: int, user=Depends(current_user)):
    conn = DB.get_conn()
    conn.execute('DELETE FROM ventes WHERE id=?', (vid,))
    conn.commit()
    conn.close()
    return {'ok': True}


# ---------------- Clients (derive) ----------------
@app.get('/api/clients')
def list_clients(user=Depends(current_user)):
    prospects = compute.enrich_prospects(_all('prospects'), _all('ventes'), _cycle())
    clients = compute.compute_clients(prospects, _all('ventes'))
    # stats segments
    seg = {'Actif': 0, 'Inactif': 0, 'Perdu': 0}
    src = {}
    for c in clients:
        if c['etat'] in seg:
            seg[c['etat']] += 1
        s = c.get('source') or '(inconnu)'
        src[s] = src.get(s, 0) + 1
    fidelises = seg['Actif'] + seg['Inactif']
    perdus = seg['Perdu']
    taux = fidelises / (fidelises + perdus) if (fidelises + perdus) else 0
    return {
        'clients': clients,
        'segments': seg,
        'sources': [{'source': k, 'nombre': v} for k, v in
                    sorted(src.items(), key=lambda x: -x[1])],
        'fidelises': fidelises, 'perdus': perdus, 'taux_fidelisation': taux,
    }


# ---------------- Tableaux de bord ----------------
@app.get('/api/dashboard/mois')
def dashboard_mois(annee: Optional[int] = None, mois: Optional[int] = None,
                   user=Depends(current_user)):
    services = sorted(_all('services'), key=lambda s: s.get('ordre') or 0)
    return analytics.stats_mois(services, _all('ventes'), annee, mois)


@app.get('/api/dashboard/annuel')
def dashboard_annuel(annee: Optional[int] = None, user=Depends(current_user)):
    services = _all('services')
    obj_mens = sum((s.get('objectif_mensuel') or 0) for s in services)
    cfg = _cfg()
    try:
        obj_an = float(cfg.get('objectif_annuel', '0') or 0)
    except Exception:
        obj_an = 0
    return analytics.evolution_annuelle(_all('ventes'), _all('historique_ca'),
                                        obj_mens, obj_an, annee)


@app.get('/api/dashboard/synthese')
def synthese(user=Depends(current_user)):
    prospects = compute.enrich_prospects(_all('prospects'), _all('ventes'), _cycle())
    clients = compute.compute_clients(prospects, _all('ventes'))
    ventes = _all('ventes')
    today = date.today()
    ca_mois = sum((v.get('montant') or 0) for v in ventes
                  if (v.get('date_achat') or '')[:7] == today.strftime('%Y-%m'))
    etats = {'Converti': 0, 'En cours': 0, 'Perdu': 0}
    for p in prospects:
        etats[p['etat']] = etats.get(p['etat'], 0) + 1
    conv = etats['Converti']
    taux_conv = conv / len(prospects) if prospects else 0
    return {
        'nb_prospects': len(prospects), 'nb_clients': len(clients),
        'nb_ventes': len(ventes),
        'ca_total': sum((v.get('montant') or 0) for v in ventes),
        'ca_mois': ca_mois, 'etats_prospects': etats,
        'taux_conversion': taux_conv,
    }


# ---------------- Parametres ----------------
@app.get('/api/parametres')
def get_parametres(user=Depends(current_user)):
    return {
        'services': sorted(_all('services'), key=lambda s: s.get('ordre') or 0),
        'commerciaux': _all('commerciaux'),
        'sources': _all('sources'),
        'actions': _all('actions'),
        'config': _cfg(),
    }


class ServiceIn(BaseModel):
    nom: str
    objectif_mensuel: float = 0


@app.post('/api/parametres/services')
def add_service(s: ServiceIn, user=Depends(require_admin)):
    conn = DB.get_conn()
    o = conn.execute('SELECT COALESCE(MAX(ordre),0)+1 n FROM services').fetchone()['n']
    conn.execute('INSERT OR IGNORE INTO services(nom,objectif_mensuel,ordre) VALUES(?,?,?)',
                 (s.nom, s.objectif_mensuel, o))
    conn.execute('UPDATE services SET objectif_mensuel=? WHERE nom=?',
                 (s.objectif_mensuel, s.nom))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.delete('/api/parametres/services/{sid}')
def del_service(sid: int, user=Depends(require_admin)):
    conn = DB.get_conn()
    conn.execute('DELETE FROM services WHERE id=?', (sid,))
    conn.commit()
    conn.close()
    return {'ok': True}


class NomIn(BaseModel):
    nom: str


@app.post('/api/parametres/{kind}')
def add_liste(kind: str, data: NomIn, user=Depends(require_admin)):
    if kind not in ('commerciaux', 'sources', 'actions'):
        raise HTTPException(404, 'inconnu')
    conn = DB.get_conn()
    conn.execute(f'INSERT OR IGNORE INTO {kind}(nom) VALUES(?)', (data.nom,))
    conn.commit()
    conn.close()
    return {'ok': True}


@app.delete('/api/parametres/{kind}/{iid}')
def del_liste(kind: str, iid: int, user=Depends(require_admin)):
    if kind not in ('commerciaux', 'sources', 'actions'):
        raise HTTPException(404, 'inconnu')
    conn = DB.get_conn()
    conn.execute(f'DELETE FROM {kind} WHERE id=?', (iid,))
    conn.commit()
    conn.close()
    return {'ok': True}


class ConfigIn(BaseModel):
    cle: str
    valeur: str


@app.post('/api/parametres/config')
def set_config(c: ConfigIn, user=Depends(require_admin)):
    conn = DB.get_conn()
    conn.execute('INSERT INTO config(cle,valeur) VALUES(?,?) '
                 'ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur',
                 (c.cle, c.valeur))
    conn.commit()
    conn.close()
    return {'ok': True}


class HistIn(BaseModel):
    annee: int
    mois: int
    montant: float


@app.get('/api/parametres/historique')
def get_hist(user=Depends(current_user)):
    conn = DB.get_conn()
    rows = [dict(r) for r in conn.execute(
        'SELECT * FROM historique_ca ORDER BY annee,mois').fetchall()]
    conn.close()
    return rows


@app.post('/api/parametres/historique')
def set_hist(h: HistIn, user=Depends(require_admin)):
    conn = DB.get_conn()
    conn.execute('INSERT INTO historique_ca(annee,mois,montant) VALUES(?,?,?) '
                 'ON CONFLICT(annee,mois) DO UPDATE SET montant=excluded.montant',
                 (h.annee, h.mois, h.montant))
    conn.commit()
    conn.close()
    return {'ok': True}


# ---------------- Utilisateurs ----------------
@app.get('/api/users')
def list_users(user=Depends(require_admin)):
    conn = DB.get_conn()
    rows = [dict(r) for r in conn.execute(
        'SELECT id,username,role,created_at FROM users').fetchall()]
    conn.close()
    return rows


class UserIn(BaseModel):
    username: str
    password: str
    role: str = 'user'


@app.post('/api/users')
def add_user(u: UserIn, user=Depends(require_admin)):
    conn = DB.get_conn()
    try:
        conn.execute('INSERT INTO users(username,password,role) VALUES(?,?,?)',
                     (u.username, DB.hash_password(u.password), u.role))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(400, 'Utilisateur existant')
    conn.close()
    return {'ok': True}


@app.delete('/api/users/{uid}')
def del_user(uid: int, user=Depends(require_admin)):
    if uid == user['id']:
        raise HTTPException(400, 'Impossible de se supprimer soi-même')
    conn = DB.get_conn()
    conn.execute('DELETE FROM users WHERE id=?', (uid,))
    conn.commit()
    conn.close()
    return {'ok': True}


# ---------------- Frontend ----------------
@app.get('/')
def index():
    return FileResponse(os.path.join(STATIC, 'index.html'))


app.mount('/', StaticFiles(directory=STATIC), name='static')
