#!/bin/bash
# ============================================================
# MedDoc AI — Script de Setup Automático
# Uso: bash setup.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}→${NC} $1"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       MedDoc AI — Setup Inicial      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Verificar pré-requisitos ──────────────────────────────
info "Verificando pré-requisitos..."

command -v node >/dev/null 2>&1 || err "Node.js não encontrado. Instale em https://nodejs.org"
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] || err "Node.js 20+ necessário. Versão atual: $(node -v)"
ok "Node.js $(node -v)"

command -v docker >/dev/null 2>&1 || err "Docker não encontrado. Instale em https://docker.com/products/docker-desktop"
docker info >/dev/null 2>&1 || err "Docker Desktop não está rodando. Inicie-o antes de continuar."
ok "Docker $(docker -v | cut -d' ' -f3 | tr -d ',')"

# ── 2. Gerar .env ─────────────────────────────────────────────
info "Configurando variáveis de ambiente..."

if [ -f ".env" ]; then
  warn ".env já existe — pulando geração automática"
else
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cp .env.example .env

  # Substituir valores gerados
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|"          .env
    sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  else
    sed -i  "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|"          .env
    sed -i  "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  fi

  ok ".env criado com chaves geradas automaticamente"
  echo ""
  warn "IMPORTANTE: Abra .env e adicione suas chaves de API:"
  echo "    OPENAI_API_KEY=sk-...         (https://platform.openai.com)"
  echo "    ANTHROPIC_API_KEY=sk-ant-...  (https://console.anthropic.com)"
  echo ""
fi

# ── 3. Subir bancos de dados ──────────────────────────────────
info "Iniciando bancos de dados (Docker)..."
docker-compose up postgres mongodb redis -d

info "Aguardando PostgreSQL ficar pronto..."
for i in $(seq 1 30); do
  if docker-compose exec -T postgres pg_isready -U meddoc >/dev/null 2>&1; then
    ok "PostgreSQL pronto"
    break
  fi
  if [ $i -eq 30 ]; then
    err "PostgreSQL não iniciou em 30s. Verifique: docker-compose logs postgres"
  fi
  sleep 1
done

info "Aguardando MongoDB ficar pronto..."
for i in $(seq 1 20); do
  if docker-compose exec -T mongodb mongosh --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
    ok "MongoDB pronto"
    break
  fi
  if [ $i -eq 20 ]; then
    warn "MongoDB demorou mais que o esperado — continuando mesmo assim"
    break
  fi
  sleep 1
done

ok "Redis iniciado"

# ── 4. Instalar dependências ──────────────────────────────────
info "Instalando dependências do backend..."
cd backend && npm install --silent
ok "Backend: $(npm list 2>/dev/null | head -1)"
cd ..

info "Instalando dependências do frontend..."
cd frontend && npm install --silent
ok "Frontend: $(npm list 2>/dev/null | head -1)"
cd ..

# ── 5. Verificar se o schema foi aplicado ─────────────────────
info "Verificando schema do banco..."
sleep 3
TABLE_COUNT=$(docker-compose exec -T postgres psql -U meddoc -d meddoc -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ')

if [ "${TABLE_COUNT:-0}" -ge 5 ]; then
  ok "Schema aplicado — ${TABLE_COUNT} tabelas encontradas"
else
  warn "Schema pode não ter sido aplicado. Aplicando manualmente..."
  docker-compose exec -T postgres psql -U meddoc -d meddoc -f /docker-entrypoint-initdb.d/01_schema.sql 2>/dev/null || true
fi

# ── 6. Resumo ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup concluído com sucesso!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Para iniciar o sistema, abra 2 terminais:"
echo ""
echo -e "  ${BLUE}Terminal 1 — Backend:${NC}"
echo "    cd backend && npm run dev"
echo ""
echo -e "  ${BLUE}Terminal 2 — Frontend:${NC}"
echo "    cd frontend && npm run dev"
echo ""
echo -e "  ${BLUE}Acesse:${NC} http://localhost:3000"
echo ""

if grep -q "OPENAI_API_KEY=sk-\.\.\." .env 2>/dev/null || \
   grep -q "^OPENAI_API_KEY=$" .env 2>/dev/null || \
   ! grep -q "^OPENAI_API_KEY=sk-" .env 2>/dev/null; then
  echo -e "${YELLOW}⚠  Lembre-se: adicione OPENAI_API_KEY e ANTHROPIC_API_KEY no .env${NC}"
  echo "   para que transcrição e geração de prontuário funcionem."
  echo ""
fi
