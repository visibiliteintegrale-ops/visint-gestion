"""Importe les donnees existantes du fichier Excel VISINT dans visint.db.
Usage: python seed_from_excel.py <fichier.xlsx>
"""
import sys, os
from datetime import datetime, date
import openpyxl
import db as DB


def iso(v):
    if v is None or v == '':
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def txt(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def main(path):
    DB.init_schema()
    DB.ensure_admin()
    wb = openpyxl.load_workbook(path, data_only=True)
    conn = DB.get_conn()
    c = conn.cursor()
    for t in ('prospects', 'ventes', 'services', 'commerciaux', 'sources',
              'actions', 'config', 'historique_ca'):
        c.execute(f'DELETE FROM {t}')

    # --- Prospects (colonnes sources: B,C,D,E,F,G,K) ---
    ws = wb['Prospects']
    numero = 0
    for r in range(3, ws.max_row + 1):
        nom = ws.cell(r, 3).value
        if nom is None or str(nom).strip() == '':
            continue
        numero += 1
        c.execute('INSERT INTO prospects(numero,source,nom,telephone,date_arrivee,'
                  'service,code_parrain,action) VALUES(?,?,?,?,?,?,?,?)',
                  (numero, txt(ws.cell(r, 2).value), str(nom).strip(),
                   txt(ws.cell(r, 4).value), iso(ws.cell(r, 5).value),
                   txt(ws.cell(r, 6).value), txt(ws.cell(r, 7).value),
                   txt(ws.cell(r, 11).value)))

    # --- Ventes (A,B,C,D,E) ---
    ws = wb['Ventes']
    for r in range(2, ws.max_row + 1):
        client = ws.cell(r, 4).value
        if client is None or str(client).strip() == '':
            continue
        montant = ws.cell(r, 5).value or 0
        try:
            montant = float(montant)
        except Exception:
            montant = 0
        c.execute('INSERT INTO ventes(date_achat,service,commercial,client,montant)'
                  ' VALUES(?,?,?,?,?)',
                  (iso(ws.cell(r, 1).value), txt(ws.cell(r, 2).value),
                   txt(ws.cell(r, 3).value), str(client).strip(), montant))

    # --- Parametres ---
    ws = wb['Parametres']
    ordre = 0
    for r in range(2, 9):
        nom = ws.cell(r, 1).value
        if nom:
            ordre += 1
            obj = ws.cell(r, 2).value or 0
            c.execute('INSERT OR IGNORE INTO services(nom,objectif_mensuel,ordre)'
                      ' VALUES(?,?,?)', (str(nom).strip(), float(obj), ordre))
    cycle = ws.cell(10, 2).value or 30
    obj_an = ws.cell(11, 2).value or 0
    c.execute('INSERT OR REPLACE INTO config(cle,valeur) VALUES(?,?)',
              ('cycle_vente', str(int(float(cycle)))))
    c.execute('INSERT OR REPLACE INTO config(cle,valeur) VALUES(?,?)',
              ('objectif_annuel', str(float(obj_an))))
    for r in range(14, 18):
        v = ws.cell(r, 1).value
        if v:
            c.execute('INSERT OR IGNORE INTO commerciaux(nom) VALUES(?)', (str(v).strip(),))
    for r in range(20, 24):
        v = ws.cell(r, 1).value
        if v:
            c.execute('INSERT OR IGNORE INTO sources(nom) VALUES(?)', (str(v).strip(),))
    for r in range(30, 34):
        v = ws.cell(r, 1).value
        if v:
            c.execute('INSERT OR IGNORE INTO actions(nom) VALUES(?)', (str(v).strip(),))

    # --- Historique CA (Evolution_Annuelle : seulement les mois saisis a la
    #     main, c.-a-d. les cellules B qui ne sont PAS des formules) ---
    wbf = openpyxl.load_workbook(path, data_only=False)
    wsf = wbf['Evolution_Annuelle']
    ws = wb['Evolution_Annuelle']
    annee = date.today().year
    for r in range(4, 16):
        mois = ws.cell(r, 5).value
        raw = wsf.cell(r, 2).value
        val = ws.cell(r, 2).value
        is_formula = isinstance(raw, str) and raw.startswith('=')
        if mois and not is_formula and isinstance(val, (int, float)):
            c.execute('INSERT OR REPLACE INTO historique_ca(annee,mois,montant)'
                      ' VALUES(?,?,?)', (annee, int(mois), float(val)))

    conn.commit()
    conn.close()
    print('Import termine :', path)


def count():
    conn = DB.get_conn()
    for t in ('prospects', 'ventes', 'services', 'commerciaux', 'sources',
              'actions', 'historique_ca', 'users'):
        n = conn.execute(f'SELECT COUNT(*) c FROM {t}').fetchone()['c']
        print(f'  {t}: {n}')
    conn.close()


if __name__ == '__main__':
    p = sys.argv[1] if len(sys.argv) > 1 else 'fiche.xlsx'
    main(p)
    count()
