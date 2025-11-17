#!/data/data/com.termux/files/usr/bin/bash

echo "🔧 Instalando BOT DE OBRA (cliente_04)..."
sleep 1

termux-wake-lock

echo "📦 Atualizando pacotes..."
pkg update -y && pkg upgrade -y

echo "📦 Instalando Node, Git e dependências..."
pkg install -y nodejs git wget

echo "📁 Baixando código do bot..."
rm -rf ia-obra
git clone https://github.com/eduado397/ia-obra.git
cd ia-obra

echo "📁 Criando pastas internas..."
mkdir -p tokens
mkdir -p data

echo "📝 Criando .env para cliente_04..."
cat <<EOF > .env
BOT_SESSION=cliente_04
GROQ_API_KEY=SUA_CHAVE_API_AQUI
OWNER_NUMBER=55NUMERO_DO_CLIENTE_AQUI
DAILY_SUMMARY_HOUR=18
EOF

echo "📦 Instalando dependências..."
npm install

echo "🚀 Iniciando o bot (cliente_04)..."
node index.cjs
