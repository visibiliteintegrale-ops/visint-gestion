#!/bin/sh
# Au premier demarrage sur l'hebergeur, on copie la base pre-remplie
# vers le disque persistant si elle n'y est pas encore.
if [ -n "$VISINT_DB" ] && [ ! -f "$VISINT_DB" ]; then
  mkdir -p "$(dirname "$VISINT_DB")"
  cp /app/visint.db "$VISINT_DB"
fi
exec gunicorn app:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:${PORT:-8000}
