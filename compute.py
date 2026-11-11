"""Reproduit les calculs du fichier Excel VISINT (champs derives)."""
from datetime import date, datetime


def _d(s):
    if not s:
        return None
    if isinstance(s, (date, datetime)):
        return s if isinstance(s, date) and not isinstance(s, datetime) else s.date() if isinstance(s, datetime) else s
    try:
        return datetime.strptime(str(s)[:10], '%Y-%m-%d').date()
    except Exception:
        return None


def code_parrainage(numero, nom):
    nom = (nom or '').strip()
    if not nom:
        return ''
    return f"VISINT{numero}{nom[0].upper()}{nom[-1].upper()}"


def enrich_prospects(prospects, ventes, cycle_jours=30, today=None):
    """prospects/ventes: list[dict]. Retourne prospects enrichis."""
    today = today or date.today()
    # premiere date d'achat par nom de client (min date)
    first_sale = {}
    for v in ventes:
        d = _d(v.get('date_achat'))
        c = (v.get('client') or '').strip()
        if not c or d is None:
            continue
        if c not in first_sale or d < first_sale[c]:
            first_sale[c] = d
    # tri par numero pour l'ordre client
    rows = sorted(prospects, key=lambda p: (p.get('numero') or p['id']))
    # index code_parrainage -> nom
    code_to_nom = {}
    for p in rows:
        code = code_parrainage(p.get('numero') or p['id'], p.get('nom'))
        code_to_nom[code] = p.get('nom')
    ordre = 0
    out = []
    for p in rows:
        num = p.get('numero') or p['id']
        nom = (p.get('nom') or '').strip()
        arr = _d(p.get('date_arrivee'))
        code = code_parrainage(num, nom)
        dachat = first_sale.get(nom)
        if dachat is not None:
            etat = 'Converti'
            ordre += 1
            ordre_client = ordre
            duree = (dachat - arr).days if arr else None
        else:
            ordre_client = None
            duree = None
            if arr and (today - arr).days <= cycle_jours:
                etat = 'En cours'
            else:
                etat = 'Perdu'
        cp = (p.get('code_parrain') or '').strip()
        nom_parrain = code_to_nom.get(cp) if cp else None
        if cp and nom_parrain is None:
            nom_parrain = 'Code invalide'
        out.append({
            **p,
            'numero': num,
            'code_parrainage': code,
            'nom_parrain': nom_parrain,
            'date_achat': dachat.isoformat() if dachat else None,
            'etat': etat,
            'duree': duree,
            'ordre_client': ordre_client,
            'mois_arrivee': arr.month if arr else None,
            'annee_arrivee': arr.year if arr else None,
        })
    return out


def compute_clients(prospects_enrichis, ventes, today=None):
    """Clients = prospects convertis, avec agregats de ventes."""
    today = today or date.today()
    # agregats ventes par client
    ca = {}
    last = {}
    for v in ventes:
        c = (v.get('client') or '').strip()
        if not c:
            continue
        ca[c] = ca.get(c, 0) + (v.get('montant') or 0)
        d = _d(v.get('date_achat'))
        if d and (c not in last or d > last[c]):
            last[c] = d
    # nb filleul: nombre de prospects convertis ayant ce code comme code_parrain
    filleuls = {}
    for p in prospects_enrichis:
        cp = (p.get('code_parrain') or '').strip()
        if cp and p.get('etat') == 'Converti':
            filleuls[cp] = filleuls.get(cp, 0) + 1
    clients = []
    for p in prospects_enrichis:
        if p.get('etat') != 'Converti':
            continue
        nom = (p.get('nom') or '').strip()
        dernier = last.get(nom)
        if dernier is None:
            etat = ''
        elif (today - dernier).days <= 30:
            etat = 'Actif'
        elif (today - dernier).days <= 90:
            etat = 'Inactif'
        else:
            etat = 'Perdu'
        clients.append({
            'nom': nom,
            'date_arrivee': p.get('date_arrivee'),
            'telephone': p.get('telephone'),
            'code_parrainage': p.get('code_parrainage'),
            'nb_filleul': filleuls.get(p.get('code_parrainage'), 0),
            'ca_genere': ca.get(nom, 0),
            'dernier_achat': dernier.isoformat() if dernier else None,
            'etat': etat,
            'source': p.get('source'),
        })
    clients.sort(key=lambda c: c['ca_genere'], reverse=True)
    for i, c in enumerate(clients, 1):
        c['rang'] = i
    return clients
