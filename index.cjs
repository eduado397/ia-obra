// index.cjs -- Bot de Obra avançado com EXPORTAÇÃO XLSX + QR PNG + proteção
const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

// Configs do .env
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MEU_NUMERO = process.env.MEU_NUMERO; // ex: 55119XXXXXXXX@c.us
const BOT_SESSION = process.env.BOT_SESSION || 'bot-obra-novo';
const DAILY_HOUR = process.env.DAILY_SUMMARY_HOUR || "18"; // hora local para resumo diário
const QR_PATH = path.join(__dirname, 'qrcode.png');

if (!GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY não encontrada no .env");
  // não encerra totalmente, pois o bot pode funcionar sem IA (fallback)
}

// Pastas
const DATA_DIR = path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR);

// DB
const dbPath = path.join(DATA_DIR, 'obra.db');
const db = new Database(dbPath);

// Inicializa tabelas
db.exec(`
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT,
  descricao TEXT,
  valor REAL
);
CREATE TABLE IF NOT EXISTS materiais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  quantidade REAL,
  unidade TEXT,
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  data TEXT,
  entrada TEXT,
  saida TEXT,
  atividade TEXT
);
CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT,
  conteudo TEXT,
  criado_em TEXT
);
`);

// Preparados
const insertGasto = db.prepare(`INSERT INTO gastos (data, descricao, valor) VALUES (?, ?, ?)`);
const insertMaterial = db.prepare(`INSERT INTO materiais (nome, quantidade, unidade, atualizado_em) VALUES (?, ?, ?, ?)`);
const insertFuncionario = db.prepare(`INSERT INTO funcionarios (nome, data, entrada, saida, atividade) VALUES (?, ?, ?, ?, ?)`);
const insertRelatorio = db.prepare(`INSERT INTO relatorios (tipo, conteudo, criado_em) VALUES (?, ?, ?)`);

const upsertMaterial = (nome, quantidade, unidade) => {
  const now = new Date().toISOString();
  const row = db.prepare(`SELECT * FROM materiais WHERE nome = ?`).get(nome);
  if (row) {
    db.prepare(`UPDATE materiais SET quantidade = ?, unidade = ?, atualizado_em = ? WHERE id = ?`)
      .run(row.quantidade + Number(quantidade), unidade || row.unidade, now, row.id);
  } else {
    insertMaterial.run(nome, Number(quantidade), unidade || '', now);
  }
};

// System prompt IA
const SYSTEM_PROMPT = `
Você é um assistente especialista em gestão de obras (PT-BR).
Seja objetivo e prático; forneça passos acionáveis. Use listas e resumos.
Se pedirem relatório, entregue em formato claro com título, itens e ações sugeridas.
`;

// Resumos
function resumoMateriais() {
  const rows = db.prepare(`SELECT * FROM materiais`).all();
  if (!rows.length) return "📦 Nenhum material cadastrado.";
  let txt = "📦 Estoque de Materiais:\n";
  for (const r of rows) {
    txt += `- ${r.nome}: ${r.quantidade} ${r.unidade || ''} (at ${new Date(r.atualizado_em).toLocaleString()})\n`;
  }
  return txt;
}
function resumoGastos() {
  const rows = db.prepare(`SELECT * FROM gastos ORDER BY data DESC LIMIT 50`).all();
  if (!rows.length) return "💰 Nenhum gasto registrado.";
  let total = 0;
  let txt = "💰 Gastos recentes:\n";
  for (const r of rows) {
    txt += `- ${r.data}: ${r.descricao} — R$ ${Number(r.valor).toFixed(2)}\n`;
    total += Number(r.valor);
  }
  txt += `\nTotal mostrado: R$ ${total.toFixed(2)}`;
  return txt;
}
function resumoFuncionariosHoje() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const rows = db.prepare(`SELECT * FROM funcionarios WHERE data = ?`).all(hoje);
  if (!rows.length) return "👷 Nenhum registro de funcionários hoje.";
  let txt = `👷 Registros de hoje (${hoje}):\n`;
  for (const r of rows) {
    txt += `- ${r.nome}: entrada ${r.entrada || '-'}, saída ${r.saida || '-'}, atividade: ${r.atividade || '-'}\n`;
  }
  return txt;
}

// Agendamento diário
function agendarResumoDiario(client) {
  try {
    cron.schedule(`0 ${DAILY_HOUR} * * *`, async () => {
      try {
        console.log('⏰ Gerando resumo diário...');
        const resumo = `🕒 Resumo diário automático (${new Date().toLocaleDateString()}):\n\n` +
          resumoFuncionariosHoje() + '\n\n' +
          resumoMateriais() + '\n\n' +
          resumoGastos();
        if (MEU_NUMERO) {
          await client.sendText(MEU_NUMERO, resumo);
          console.log('✅ Resumo diário enviado para dono.');
        } else {
          console.log('⚠️ MEU_NUMERO não configurado: resumo diário não enviado por WhatsApp.');
        }
      } catch (err) {
        console.error('Erro no resumo diário:', err);
      }
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });
  } catch (e) {
    console.error('Erro ao agendar resumo diário:', e);
  }
}

// EXPORTAÇÃO XLSX: gera arquivo e retorna caminho
function exportarTudoParaXLSX() {
  const workbook = XLSX.utils.book_new();

  // GASTOS
  const gastos = db.prepare(`SELECT * FROM gastos ORDER BY data DESC`).all();
  const wsGastos = XLSX.utils.json_to_sheet(gastos.map(r => ({
    id: r.id, data: r.data, descricao: r.descricao, valor: r.valor
  })));
  XLSX.utils.book_append_sheet(workbook, wsGastos, 'gastos');

  // MATERIAIS
  const materiais = db.prepare(`SELECT * FROM materiais`).all();
  const wsMat = XLSX.utils.json_to_sheet(materiais.map(r => ({
    id: r.id, nome: r.nome, quantidade: r.quantidade, unidade: r.unidade, atualizado_em: r.atualizado_em
  })));
  XLSX.utils.book_append_sheet(workbook, wsMat, 'materiais');

  // FUNCIONÁRIOS
  const funcionarios = db.prepare(`SELECT * FROM funcionarios ORDER BY data DESC`).all();
  const wsFunc = XLSX.utils.json_to_sheet(funcionarios.map(r => ({
    id: r.id, nome: r.nome, data: r.data, entrada: r.entrada, saida: r.saida, atividade: r.atividade
  })));
  XLSX.utils.book_append_sheet(workbook, wsFunc, 'funcionarios');

  // RELATÓRIOS
  const rels = db.prepare(`SELECT * FROM relatorios ORDER BY criado_em DESC`).all();
  const wsR = XLSX.utils.json_to_sheet(rels.map(r => ({
    id: r.id, tipo: r.tipo, conteudo: r.conteudo, criado_em: r.criado_em
  })));
  XLSX.utils.book_append_sheet(workbook, wsR, 'relatorios');

  // salva arquivo
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
  const outPath = path.join(EXPORTS_DIR, `relatorios-${timestamp}.xlsx`);
  XLSX.writeFile(workbook, outPath);
  return outPath;
}

// Proteção global contra crashes e limpeza
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('SIGINT', () => {
  console.log('SIGINT recebido: encerrando...');
  process.exit();
});

// --- Função IA com retry e timeout ---
async function gerarRespostaIA(systemPrompt, userText, retries = 2) {
  if (!GROQ_API_KEY) return "⚠️ IA indisponível (GROQ_API_KEY não configurada).";
  try {
    const resp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt || SYSTEM_PROMPT },
          { role: "user", content: userText }
        ],
        max_tokens: 800
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );
    const choice = resp?.data?.choices?.[0]?.message?.content;
    return choice || "⚠️ A IA retornou vazio.";
  } catch (e) {
    console.warn('Erro ao chamar GROQ IA:', e?.response?.data || e.message || e);
    if (retries > 0) {
      console.log(`Tentando novamente... (${retries} tentativa(s) restante)`);
      return gerarRespostaIA(systemPrompt, userText, retries - 1);
    }
    return "⚠️ A IA encontrou um erro ao gerar a resposta.";
  }
}

// --- Criação de sessão (WPPConnect) com QR em PNG e ASCII ---
wppconnect.create({
  session: BOT_SESSION,
  logLevel: "info",
  browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
  // callback para QR (depende da versão do wppconnect - caso não funcione, o ASCII QR já aparece no console)
  qr: (base64Qr, asciiQr) => {
    try {
      if (asciiQr) console.log(asciiQr);
      if (base64Qr) {
        // base64Qr vem normalmente como 'data:image/png;base64,...' ou só base64 dependendo da versão
        let b64 = base64Qr;
        if (b64.startsWith('data:image')) {
          b64 = b64.split(',')[1];
        }
        const imageBuffer = Buffer.from(b64, 'base64');
        fs.writeFileSync(QR_PATH, imageBuffer);
        console.log('📷 QR salvo em:', QR_PATH);
      }
    } catch (e) {
      console.warn('Falha ao salvar QR:', e);
    }
  },
  // showBrowser: true // se quiser visualizar o navegador (não recomendado em servidor)
})
.then(async (client) => {
  console.log(`🤖 IA da Obra iniciada (sessão=${BOT_SESSION}).`);
  // agenda resumo diário
  agendarResumoDiario(client);

  // envia mensagem de boas-vindas para o dono (se configurado) quando pareado
  if (MEU_NUMERO) {
    setTimeout(async () => {
      try {
        await client.sendText(MEU_NUMERO, `🤖 Bot iniciado e pronto. (sessão=${BOT_SESSION})`);
      } catch (e) {}
    }, 5000);
  }

  // Mensagens de ajuda / menu
  const MENU_TXT = `🤖 *Bot de Obra* — comandos disponíveis:
1. gasto <valor> <descrição>      — Registrar gasto (ex: gasto 1500 Raspa de terreno)
2. material <nome> <qtd> [unid]   — Atualiza/insere material (ex: material cimento 50 sacos)
3. funcionario <nome> entrada [atividade] — Registra entrada
4. funcionario <nome> saida [atividade]    — Registra saída
5. resumo materiais | resumo gastos | resumo funcionarios
6. resumo relatorios                — Lista últimos relatórios
7. exportar relatorios              — Gera e envia XLSX
Envie fotos/arquivos para registrar mídia.
`;

  // onMessage
  client.onMessage(async (message) => {
    try {
      // Permissão modo dono: se MEU_NUMERO definido, responde somente a ele (e a grupos)
      if (MEU_NUMERO && !message.isGroupMsg && message.from !== MEU_NUMERO) {
        // permitir grupos (se quiser bloquear grupos tirar esta linha)
        // return;
      }

      // Mídia
      if (message.mimetype && message.mimetype !== "text/plain") {
        const meta = { from: message.from, mimetype: message.mimetype, filename: message.filename || null, timestamp: message.timestamp };
        insertRelatorio.run('midia', JSON.stringify(meta), new Date().toISOString());
        await client.sendText(message.from, "📸 Recebi sua imagem/arquivo. Para que eu organize, envie também uma descrição em texto.");
        return;
      }

      if (!message.body || message.body.trim() === "") {
        await client.sendText(message.from, "⚠️ Não recebi texto. Envie novamente, por favor.");
        return;
      }

      const texto = message.body.trim();
      console.log("📩 Mensagem recebida:", texto);
      const lower = texto.toLowerCase();

      // Ajuda / menu
      if (lower === 'menu' || lower === 'ajuda' || lower === 'help') {
        await client.sendText(message.from, MENU_TXT);
        return;
      }

      // GASTO
      if (lower.startsWith("gasto ")) {
        const parts = texto.split(" ");
        const valorStr = parts[1].replace(",", ".").replace(/[^0-9.]/g, "");
        const descricao = parts.slice(2).join(" ") || 'Sem descrição';
        const data = new Date().toLocaleDateString('pt-BR');
        insertGasto.run(data, descricao, parseFloat(valorStr) || 0);
        insertRelatorio.run('gasto', `${data} | R$ ${valorStr} | ${descricao}`, new Date().toISOString());
        await client.sendText(message.from, `💰 Gasto registrado: R$ ${parseFloat(valorStr).toFixed(2)} — ${descricao}`);
        return;
      }

      // MATERIAL
      if (lower.startsWith("material ")) {
        const parts = texto.split(" ");
        const nome = parts[1];
        const quantidade = Number(parts[2]) || 0;
        const unidade = parts[3] || "";
        upsertMaterial(nome, quantidade, unidade);
        insertRelatorio.run('material', `${nome} | ${quantidade} ${unidade}`, new Date().toISOString());
        await client.sendText(message.from, `📦 Material atualizado: ${nome} → ${quantidade} ${unidade}`);
        return;
      }

      // FUNCIONÁRIO
      if (lower.startsWith("funcionario ")) {
        const tokens = texto.split(" ");
        const nome = tokens[1];
        const acao = tokens[2] ? tokens[2].toLowerCase() : '';
        const atividade = tokens.slice(3).join(" ") || "";
        const hoje = new Date().toLocaleDateString('pt-BR');
        if (acao === 'entrada') {
          insertFuncionario.run(nome, hoje, new Date().toLocaleTimeString('pt-BR'), null, atividade);
          insertRelatorio.run('funcionario', `${nome} entrada ${atividade}`, new Date().toISOString());
          await client.sendText(message.from, `👷 Entrada registrada: ${nome} às ${new Date().toLocaleTimeString('pt-BR')}`);
          return;
        } else if (acao === 'saida' || acao === 'saída') {
          const row = db.prepare(`SELECT * FROM funcionarios WHERE nome = ? AND data = ? AND saida IS NULL ORDER BY id DESC LIMIT 1`).get(nome, hoje);
          if (row) {
            db.prepare(`UPDATE funcionarios SET saida = ?, atividade = ? WHERE id = ?`).run(new Date().toLocaleTimeString('pt-BR'), atividade || row.atividade, row.id);
            insertRelatorio.run('funcionario', `${nome} saida ${atividade}`, new Date().toISOString());
            await client.sendText(message.from, `👷 Saída registrada: ${nome} às ${new Date().toLocaleTimeString('pt-BR')}`);
          } else {
            await client.sendText(message.from, `⚠️ Não encontrei entrada registrada hoje para ${nome}. Use: funcionario ${nome} entrada`);
          }
          return;
        } else {
          await client.sendText(message.from, `⚠️ Comando funcionário inválido. Use: funcionario <nome> entrada|saida [atividade]`);
          return;
        }
      }

      // RESUMOS
      if (lower === 'resumo relatorios') {
        const rows = db.prepare(`SELECT * FROM relatorios ORDER BY criado_em DESC LIMIT 100`).all();
        if (!rows.length) return await client.sendText(message.from, "⚠️ Nenhum relatório encontrado.");
        let txt = "📄 Relatórios recentes:\n";
        rows.forEach((r,i) => { txt += `${i+1}. [${r.tipo}] ${r.conteudo} (${new Date(r.criado_em).toLocaleString()})\n`; });
        await client.sendText(message.from, txt);
        return;
      }
      if (lower === 'resumo materiais') { await client.sendText(message.from, resumoMateriais()); return; }
      if (lower === 'resumo gastos') { await client.sendText(message.from, resumoGastos()); return; }
      if (lower === 'resumo funcionarios' || lower === 'resumo funcionarios hoje') { await client.sendText(message.from, resumoFuncionariosHoje()); return; }

      // EXPORTAR XLSX: comando
      if (lower === 'exportar relatorios' || lower === 'exportar relatórios') {
        try {
          const arquivo = exportarTudoParaXLSX();
          await client.sendFile(message.from, arquivo, path.basename(arquivo), "📁 Aqui está o arquivo com os relatórios e tabelas.");
          return;
        } catch (err) {
          console.error("Erro exportar XLSX:", err);
          await client.sendText(message.from, "⚠️ Falha ao exportar relatórios. Veja o console.");
          return;
        }
      }

      // fallback: IA (apenas se a chave existir)
      if (GROQ_API_KEY) {
        const respostaIA = await gerarRespostaIA(SYSTEM_PROMPT, texto);
        insertRelatorio.run('ia_reply', respostaIA.slice(0, 300), new Date().toISOString());
        await client.sendText(message.from, respostaIA);
      } else {
        // sem IA: resposta simples padrão
        insertRelatorio.run('fallback_reply', texto.slice(0,300), new Date().toISOString());
        await client.sendText(message.from, "🤖 (Modo offline) Comando recebido. Use 'menu' para ver os comandos disponíveis.");
      }

    } catch (err) {
      console.error('Erro onMessage:', err);
      try { await client.sendText(message.from, "⚠️ Ocorreu um erro interno. Verifique o console."); } catch(e){}
    }
  });

})
.catch(err => {
  console.error("Erro criar sessão:", err);
  console.error("Verifique dependências e se o Node tem permissão para abrir um navegador headless.");
});
