#!/data/data/com.termux/files/usr/bin/bash

echo "🔧 Iniciando instalação do BOT DE OBRA no Termux..."
sleep 1

termux-wake-lock

echo "📦 Atualizando pacotes..."
pkg update -y && pkg upgrade -y

echo "📦 Instalando dependências..."
pkg install -y nodejs git wget

echo "📁 Baixando bot..."
rm -rf ia-obra
git clone https://github.com/eduado397/ia-obra.git
cd ia-obra

echo "📁 Criando pastas internas..."
mkdir -p tokens
mkdir -p data

echo "📝 Criando .env automático..."
cat <<EOF > .env
BOT_SESSION=bot-termux
GROQ_API_KEY=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
OWNER_NUMBER=55NUMERO_DO_CLIENTE_AQUI
DAILY_SUMMARY_HOUR=18
EOF

echo "📦 Instalando dependências Node..."
npm install

echo "🚀 Iniciando o bot..."
node index.cjs
