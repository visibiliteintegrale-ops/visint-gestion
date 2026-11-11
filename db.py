import sqlite3, os, hashlib, secrets

DB_PATH = os.environ.get('VISINT_DB', os.path.join(os.path.dirname(__file__), 'visint.db'))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000)
    return f'{salt}${h.hex()}'


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split('$', 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER,
    source TEXT,
    nom TEXT NOT NULL,
    telephone TEXT,
    date_arrivee TEXT,
    service TEXT,
    code_parrain TEXT,
    action TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_achat TEXT,
    service TEXT,
    commercial TEXT,
    client TEXT NOT NULL,
    montant REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL,
    objectif_mensuel REAL DEFAULT 0,
    ordre INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS commerciaux (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
    cle TEXT PRIMARY KEY,
    valeur TEXT
);

CREATE TABLE IF NOT EXISTS historique_ca (
    annee INTEGER NOT NULL,
    mois INTEGER NOT NULL,
    montant REAL DEFAULT 0,
    PRIMARY KEY (annee, mois)
);
'''


def init_schema():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def ensure_admin():
    conn = get_conn()
    n = conn.execute('SELECT COUNT(*) c FROM users').fetchone()['c']
    if n == 0:
        conn.execute('INSERT INTO users(username,password,role) VALUES(?,?,?)',
                     ('admin', hash_password('admin'), 'admin'))
        conn.commit()
    conn.close()
