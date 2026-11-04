#!/usr/bin/env bash
# Publica o site: envia para o GitHub e deixa o Render construir sozinho.
# (NÃO chamar a API de deploy: isso faria um segundo restart seguido.)
set -euo pipefail

GITHUB_TOKEN="${GITHUB_TOKEN:?defina GITHUB_TOKEN}"
OWNER="${OWNER:-rodrigorribeirosilva-create}"
REPO="${REPO:-pratica-sabores}"
URL="${URL:-https://loja-digital.onrender.com}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITHUB_TOKEN="$GITHUB_TOKEN" OWNER="$OWNER" REPO="$REPO" bash "$DIR/scripts/push-github.sh"

echo "> aguardando o Render publicar (máx. 6 min)…"
for i in $(seq 1 36); do
  sleep 10
  status=$(curl -s --max-time 20 "$URL/healthz" | grep -o '"uptime":[0-9]*' | cut -d: -f2 || true)
  if [ -n "$status" ] && [ "$status" -lt 180 ]; then
    echo "> servidor no ar com a versão nova (uptime ${status}s)"
    exit 0
  fi
done
echo "> não confirmei a publicação; confira em https://dashboard.render.com"
