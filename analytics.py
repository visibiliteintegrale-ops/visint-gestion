"""Tableaux de bord : statistique du mois et evolution annuelle."""
from datetime import date, datetime
import calendar

MOIS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
           'août', 'septembre', 'octobre', 'novembre', 'décembre']


def _d(s):
    if not s:
        return None
    if isinstance(s, (date, datetime)):
        return s.date() if isinstance(s, datetime) else s
    try:
        return datetime.strptime(str(s)[:10], '%Y-%m-%d').date()
    except Exception:
        return None


def stats_mois(services, ventes, annee=None, mois=None, today=None):
    today = today or date.today()
    annee = annee or today.year
    mois = mois or today.month
    realise = {s['nom']: 0 for s in services}
    for v in ventes:
        d = _d(v.get('date_achat'))
        if d and d.year == annee and d.month == mois:
            s = v.get('service')
            if s in realise:
                realise[s] += (v.get('montant') or 0)
            else:
                realise[s] = (v.get('montant') or 0)
    lignes = []
    for s in services:
        obj = s.get('objectif_mensuel') or 0
        rea = realise.get(s['nom'], 0)
        lignes.append({
            'service': s['nom'], 'objectif': obj, 'realise': rea,
            'reste': obj - rea, 'taux': (rea / obj) if obj else 0,
        })
    tot_obj = sum(l['objectif'] for l in lignes)
    tot_rea = sum(l['realise'] for l in lignes)
    return {
        'annee': annee, 'mois': mois, 'mois_nom': MOIS_FR[mois],
        'lignes': lignes,
        'total': {'objectif': tot_obj, 'realise': tot_rea,
                  'reste': tot_obj - tot_rea,
                  'taux': (tot_rea / tot_obj) if tot_obj else 0},
    }


def evolution_annuelle(ventes, historique, objectif_mensuel_global,
                       objectif_annuel, annee=None):
    annee = annee or date.today().year
    # CA par mois a partir des ventes
    ca_ventes = {m: 0 for m in range(1, 13)}
    for v in ventes:
        d = _d(v.get('date_achat'))
        if d and d.year == annee:
            ca_ventes[d.month] += (v.get('montant') or 0)
    hist = {int(h['mois']): (h['montant'] or 0) for h in historique
            if int(h['annee']) == annee}
    mois_data = []
    prev = None
    for m in range(1, 13):
        # priorite a l'historique saisi, sinon ventes
        ca = hist[m] if m in hist and hist[m] else ca_ventes[m]
        evo = None
        if prev not in (None, 0):
            evo = (ca / prev) - 1
        taux = (ca / objectif_mensuel_global) if objectif_mensuel_global else 0
        mois_data.append({'mois': m, 'mois_nom': MOIS_FR[m], 'ca': ca,
                          'evolution': evo, 'taux_objectif': taux})
        prev = ca
    cumul = sum(x['ca'] for x in mois_data)
    reste = max(objectif_annuel - cumul, 0)
    return {
        'annee': annee, 'mois': mois_data, 'ca_cumule': cumul,
        'objectif_annuel': objectif_annuel, 'reste_annuel': reste,
        'taux_annuel': (cumul / objectif_annuel) if objectif_annuel else 0,
    }
