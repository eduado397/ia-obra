#!/data/data/com.termux/files/usr/bin/bash

echo "🔧 Iniciando instalação do BOT DE OBRA no Termux..."
sleep 1

termux-wake-lock

echo "📦 Atualizando pacotes..."
pkg update -y && pkg upgrade -y

echo "📦 Instalando dependências básicas..."
pkg install -y nodejs git wget

echo "📁 Baixando repositório do bot..."
rm -rf ia-obra
git clone https://github.com/eduado397/ia-obra.git
cd ia-obra

echo "📁 Criando pastas internas..."
mkdir -p tokens
mkdir -p data

echo "📝 Criando arquivo .env..."
cat <<EOF > .env
BOT_SESSION=bot-termux
GROQ_API_KEY=COLOQUE_AQUI_SUA_CHAVE
OWNER_NUMBER=55SEUNUMEROAQUI
DAILY_SUMMARY_HOUR=18
EOF

echo "📦 Instalando dependências Node..."
npm install

echo "🚀 Iniciando o bot..."
node index.cjs
