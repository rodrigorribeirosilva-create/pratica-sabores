#!/usr/bin/env bash
# ============================================================================
# Envia o projeto Prática Sabores para um repositório do GitHub.
# Uso:  GITHUB_TOKEN=github_pat_xxx OWNER=seuusuario REPO=pratica-sabores \
#         bash scripts/push-github.sh
#
# Executado pelo agente somente quando você fornecer o token na conversa.
# O token NÃO fica salvo em nenhum arquivo do projeto: é usado apenas na URL
# do remote dentro de uma cópia temporária em /tmp, apagada no final.
# ============================================================================
set -euo pipefail

TOKEN="${GITHUB_TOKEN:?defina GITHUB_TOKEN}"
OWNER="${OWNER:?defina OWNER (seu usuário do GitHub)}"
REPO="${REPO:-pratica-sabores}"
BRANCH="${BRANCH:-main}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d /tmp/ps-push-XXXXXX)"

echo "> Preparando copia limpa em $WORK"
tar -C "$SRC_DIR" \
    --exclude=node_modules \
    --exclude=data \
    --exclude=uploads \
    --exclude=tests/shots \
    --exclude=.git \
    --exclude='*.zip' \
    -cf - . | tar -C "$WORK" -xf -

cd "$WORK"
git init -q -b "$BRANCH"
git config user.name "Pratica Sabores Deploy"
git config user.email "deploy@pratica-sabores.local"
git add -A
git commit -qm "Projeto inicial - cardapio digital com painel administrativo" || echo "> nada novo para commitar"
git remote add origin "https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git"

echo "> Enviando para github.com/${OWNER}/${REPO} (branch ${BRANCH})"
git push -u origin "$BRANCH" --force

echo "> Arquivos no repositorio:"
git ls-tree -r --name-only HEAD | sed 's/^/   /'

echo "OK: https://github.com/${OWNER}/${REPO}"
cd /
rm -rf "$WORK"
