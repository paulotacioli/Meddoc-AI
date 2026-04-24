# Pronova — Guia de Execução Local

## ✅ Pré-requisitos

| Ferramenta | Versão mínima | Link |
|---|---|---|
| Node.js | 20.x LTS | https://nodejs.org |
| Docker Desktop | qualquer | https://docker.com/products/docker-desktop |
| Git | qualquer | (opcional) |

Verifique antes de começar:
```bash
node -v    # deve mostrar v20.x.x ou superior
docker -v  # deve mostrar Docker version ...
```

---

## Passo 1 — Variáveis de ambiente

Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

Abra `.env` e preencha **no mínimo** estas variáveis:

### Chaves de segurança (obrigatórias)
```bash
# Gerar JWT_SECRET (cole o resultado no .env):
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Gerar ENCRYPTION_KEY (cole o resultado no .env):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Chaves de API (necessárias para IA funcionar)
```env
OPENAI_API_KEY=sk-...        # https://platform.openai.com (Whisper — transcrição)
ANTHROPIC_API_KEY=sk-ant-... # https://console.anthropic.com (Claude — prontuário)
```

### Senhas dos bancos (podem ficar como estão para dev)
```env
POSTGRES_PASSWORD=meddoc123
MONGO_PASSWORD=meddoc123
REDIS_PASSWORD=meddoc123
```

> **Nota:** Stripe, SendGrid, Twilio e AWS são **opcionais** para desenvolvimento.
> O sistema funciona sem eles — billing, e-mail e armazenamento de áudio ficam em modo mock.

---

## Passo 2 — Subir os bancos de dados (Docker)

```bash
# Na raiz do projeto (pasta meddoc/):
docker-compose up postgres mongodb redis -d
```

Aguarde ~20 segundos e verifique:
```bash
docker-compose ps
# Os três serviços devem aparecer como "Up"
```

O banco PostgreSQL é inicializado automaticamente com o schema
(`database/schema.sql`) na primeira vez que sobe.

---

## Passo 3 — Backend

Abra um terminal na pasta `backend/`:
```bash
cd backend
npm install
npm run dev
```

**Resultado esperado:**
```
Pronova Backend na porta 3001
PostgreSQL conectado
MongoDB conectado
Redis conectado
```

---

## Passo 4 — Frontend

Abra **outro** terminal na pasta `frontend/`:
```bash
cd frontend
npm install
npm run dev
```

**Resultado esperado:**
```
  VITE v5.x  ready in Xms
  ➜  Local:   http://localhost:3000/
```

---

## Passo 5 — Acessar o sistema

Abra **http://localhost:3000** no browser.

1. Clique em **"Criar clínica grátis"**
2. Preencha os dados da clínica e seu usuário admin
3. Após o cadastro, você estará no **Dashboard**
4. Cadastre um paciente em **Pacientes → Novo paciente**
   - Marque o consentimento LGPD (obrigatório para iniciar consultas)
5. No Dashboard, clique em **"Nova consulta"**, selecione o paciente e clique em **"Iniciar consulta"**
6. Permita o acesso ao microfone quando o browser pedir
7. Fale normalmente — a transcrição aparece em tempo real
8. Clique em **"Encerrar consulta"** — o prontuário é gerado automaticamente pela IA
9. Revise, edite se necessário e clique em **"Aprovar prontuário"**

---

## Estrutura de terminais recomendada no VS Code

Use o **Split Terminal** (`Ctrl+Shift+5`) para ter 2 painéis simultâneos:

```
┌────────────────────────────┬─────────────────────────────┐
│  Terminal 1 — Backend      │  Terminal 2 — Frontend      │
│                            │                             │
│  cd backend                │  cd frontend                │
│  npm run dev               │  npm run dev                │
│                            │                             │
│  ✓ PostgreSQL conectado    │  ➜ Local: localhost:3000    │
│  ✓ MongoDB conectado       │                             │
│  ✓ Redis conectado         │                             │
│  ✓ Porta 3001              │                             │
└────────────────────────────┴─────────────────────────────┘
```

Os bancos (Docker) ficam rodando em background — não precisam de terminal dedicado.

---

## Comandos úteis

```bash
# Ver logs dos bancos
docker-compose logs postgres
docker-compose logs mongodb

# Parar os bancos
docker-compose down

# Parar e apagar todos os dados (reset completo)
docker-compose down -v

# Reiniciar apenas o PostgreSQL
docker-compose restart postgres

# Ver processos rodando nas portas
lsof -i :3000   # frontend
lsof -i :3001   # backend
lsof -i :5432   # postgres
```

---

## Portas utilizadas

| Serviço | Porta |
|---|---|
| Frontend (React/Vite) | 3000 |
| Backend (Node.js/Express) | 3001 |
| PostgreSQL | 5432 |
| MongoDB | 27017 |
| Redis | 6379 |

---

## Problemas comuns

### "Port 5432 already in use"
Você tem PostgreSQL instalado localmente. Pare-o:
```bash
# Linux/Mac:
sudo service postgresql stop
# ou
sudo brew services stop postgresql

# Windows: Painel de Controle → Serviços → PostgreSQL → Parar
```

### "Cannot find module 'X'"
Rode `npm install` dentro da pasta correta:
```bash
cd backend  && npm install
cd frontend && npm install
```

### "ENCRYPTION_KEY must be 32 bytes"
A chave precisa ter exatamente **64 caracteres hexadecimais** (32 bytes em hex).
Gere corretamente:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Transcrição não funciona / prontuário não é gerado
- Verifique se `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` estão no `.env`
- Confirme que sua conta tem créditos disponíveis
- Veja o log do backend para mensagens de erro detalhadas

### Microfone não funciona
- O browser precisa de permissão de microfone — clique em "Permitir" quando aparecer
- Em Chrome: `chrome://settings/content/microphone` para verificar permissões
- A gravação só funciona em `localhost` ou HTTPS (não em HTTP remoto)

### MongoDB não conecta
```bash
docker-compose restart mongodb
# Aguarde 10 segundos e tente novamente
```

### Banco criado mas tabelas não existem
```bash
# Resetar o banco e recriar do zero:
docker-compose down -v
docker-compose up postgres mongodb redis -d
# Aguarde 30 segundos para o schema ser aplicado automaticamente
```

---

## Funcionalidades disponíveis sem AWS S3

Sem configurar AWS, o áudio **não é salvo permanentemente** — mas o pipeline funciona:

- A transcrição em tempo real (WebSocket) funciona normalmente
- O prontuário é gerado normalmente com o texto transcrito
- O áudio gravado é enviado diretamente via WebSocket sem passar pelo S3
- Para produção, configure o S3 para armazenar os áudios temporariamente

---

## Próximos passos para produção

1. Configure um domínio e certificado SSL (Let's Encrypt)
2. Use `docker-compose up -d` completo (inclui nginx)
3. Configure AWS S3 para armazenamento de áudio
4. Configure SendGrid para e-mails transacionais
5. Configure Stripe para cobrança (webhooks em produção)
6. Configure backups automáticos do PostgreSQL
7. Adicione monitoramento (Sentry, Datadog, ou similar)
