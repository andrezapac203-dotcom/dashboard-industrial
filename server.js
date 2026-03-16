const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Configurações WebSocket Node-RED
const WS_URL = process.env.WS_URL || 'ws://localhost:1880/ws/painel';
const WS_RECONNECT_MS = 5000;

let wsStatus = { conectado: false, ultimaMensagem: null, erro: null };
let wsClient = null;

// Rastreia última vez que cada dispositivo enviou dado: { id_medidor: { timestamp, linha, baia, bancada } }
const dispositivosAtivos = new Map();
const TIMEOUT_SEMCOM_MS = 30000; // 30 segundos sem mensagem → semcom

// Verifica periodicamente se algum dispositivo ficou offline
setInterval(() => {
    const agora = Date.now();
    dispositivosAtivos.forEach((info, id) => {
        if (agora - info.timestamp > TIMEOUT_SEMCOM_MS) {
            const db = readDb();
            const { linha, baia, bancada } = info;
            if (db.dashboardState[linha]?.[baia]?.[bancada]) {
                db.dashboardState[linha][baia][bancada] = {
                    1: { status: 'semcom', tipo: '' },
                    2: { status: 'semcom', tipo: '' }
                };
                writeDb(db);
                console.log(`Timeout: id_medidor=${id} linha=${linha} baia=${baia} bancada=${bancada} → semcom`);
            }
            dispositivosAtivos.delete(id);
        }
    });
}, 5000);

// Função para ler o banco de dados
const readDb = () => {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao ler db.json:", error);
        return { config: [], dashboardState: {}, productionEvents: [] };
    }
};

// Função para escrever no banco de dados
const writeDb = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Erro ao escrever em db.json:", error);
    }
};

// Normaliza nome da linha: 4 → "IMC04", "imc10" → "IMC10"
function normalizarLinha(valor) {
    const texto = String(valor).trim().toUpperCase();
    if (/^\d+$/.test(texto)) return `IMC${texto.padStart(2, '0')}`;
    return texto;
}

// Normaliza status vindo do Node-RED para o formato interno
function normalizarStatus(valor) {
    const s = String(valor || '').trim().toUpperCase();
    if (s === 'OK') return 'ok';
    if (s === 'FALHA' || s === 'FAIL' || s === 'ERROR' || s === 'ERR') return 'falha';
    if (s === 'ALERTA' || s === 'WARN' || s === 'WARNING') return 'alerta';
    return 'semcom';
}

// Processa a atualização de status e persiste no db.json
// Aceita dois formatos:
//   Novo (intuitivo):  { linha, baia, bancada(1-2), jig(1-2), status }
//   Antigo (legado):   { linha, baia, jig(1-4), status }  → converte automaticamente
function processarAtualizacao(db, linha, baia, bancadaParam, jigParam, status, tipo) {
    const bancada = String(bancadaParam);
    const dispositivo = String(jigParam);
    const tipoFinal = tipo || (status === 'falha' ? 'Falha' : status === 'alerta' ? 'Alerta' : 'Info');

    if (!db.dashboardState[linha]) db.dashboardState[linha] = {};
    if (!db.dashboardState[linha][baia]) db.dashboardState[linha][baia] = {};
    if (!db.dashboardState[linha][baia][bancada]) db.dashboardState[linha][baia][bancada] = {};
    // Armazena status e tipo juntos para o frontend exibir a descrição da falha
    db.dashboardState[linha][baia][bancada][dispositivo] = { status, tipo: tipoFinal };

    const now = new Date();
    const horario = now.toLocaleTimeString('pt-BR', { hour12: false });
    const evento = {
        linha,
        baia: `BAIA ${baia}`,
        bancada: `BANCADA ${bancada}`,
        equipamento: `DISP${dispositivo}`,
        dispositivo: `DISPOSITIVO ${dispositivo}`,
        tipo: tipoFinal,
        status,
        horario,
        horaFalha: status === 'falha' ? horario : '-',
        ultimaAtualizacao: horario
    };

    const chaveEvento = `${linha}|BAIA ${baia}|BANCADA ${bancada}|DISP${dispositivo}|DISPOSITIVO ${dispositivo}`;
    const indexEvento = db.productionEvents.findIndex(
        e => `${e.linha}|${e.baia}|${e.bancada}|${e.equipamento}|${e.dispositivo}` === chaveEvento
    );

    if (indexEvento !== -1) {
        const horaFalhaOriginal = db.productionEvents[indexEvento].status === 'falha'
            ? db.productionEvents[indexEvento].horaFalha
            : evento.horaFalha;
        db.productionEvents[indexEvento] = { ...evento, horaFalha: horaFalhaOriginal };
    } else {
        db.productionEvents.push(evento);
    }

    return { bancada, dispositivo };
}

// Cliente WebSocket - conecta ao Node-RED
function conectarWebSocket() {
    if (wsClient) {
        try { wsClient.terminate(); } catch (_) {}
    }

    wsClient = new WebSocket(WS_URL);

    wsClient.on('open', () => {
        wsStatus.conectado = true;
        wsStatus.erro = null;
        console.log(`WS: conectado ao Node-RED em ${WS_URL}`);
    });

    wsClient.on('error', (err) => {
        wsStatus.conectado = false;
        wsStatus.erro = err.message;
        console.error('WS: erro de conexão:', err.message);
    });

    wsClient.on('close', () => {
        wsStatus.conectado = false;
        console.warn(`WS: conexão encerrada, reconectando em ${WS_RECONNECT_MS / 1000}s...`);
        setTimeout(conectarWebSocket, WS_RECONNECT_MS);
    });

    wsClient.on('message', (message) => {
        const rawMsg = message.toString();
        console.log(`WS: mensagem recebida: ${rawMsg}`);

        try {
            let data = JSON.parse(rawMsg);

            // Node-RED às vezes envolve o payload em { payload: { ... } }
            if (data.payload && typeof data.payload === 'object') {
                data = data.payload;
            }

            wsStatus.ultimaMensagem = { data, hora: new Date().toLocaleTimeString('pt-BR') };

            const { id_medidor, linha, baia, jig1, jig2 } = data;

            if (!linha || !baia || (!jig1 && !jig2)) {
                console.error('WS: campos obrigatórios ausentes. Esperado: { linha, baia, jig1, jig2 }. Recebido:', data);
                return;
            }

            const linhaNome = normalizarLinha(linha);
            const db = readDb();

            // Bancada: tenta buscar no config pelo id_medidor
            // Se não encontrar, deriva automaticamente: id par → bancada 2, ímpar → bancada 1
            let bancada = '1';
            if (id_medidor !== undefined) {
                const config = db.config.find(c => String(c.id_medidor) === String(id_medidor));
                if (config && config.bancada) {
                    bancada = String(config.bancada);
                } else {
                    bancada = Number(id_medidor) % 2 === 0 ? '2' : '1';
                    console.log(`WS: id_medidor=${id_medidor} não no config, bancada derivada: ${bancada}`);
                }
            }

            if (jig1) {
                processarAtualizacao(db, linhaNome, String(baia), bancada, '1', normalizarStatus(jig1.status), jig1.canal || null);
            }
            if (jig2) {
                processarAtualizacao(db, linhaNome, String(baia), bancada, '2', normalizarStatus(jig2.status), jig2.canal || null);
            }

            writeDb(db);

            // Atualiza timestamp do dispositivo para o watchdog de timeout
            if (id_medidor !== undefined) {
                dispositivosAtivos.set(String(id_medidor), { timestamp: Date.now(), linha: linhaNome, baia: String(baia), bancada });
            }

            console.log(`WS: id_medidor=${id_medidor} linha=${linhaNome} baia=${baia} bancada=${bancada} jig1=${jig1?.status} jig2=${jig2?.status}`);
        } catch (error) {
            console.error('WS: erro ao processar mensagem:', error.message, '| raw:', rawMsg);
        }
    });
}

conectarWebSocket();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Rota principal
app.get('/', (_req, res) => {
    res.send('Servidor do Dashboard Industrial está no ar!');
});

// Diagnóstico WebSocket - mostra estado da conexão e última mensagem recebida
app.get('/api/ws-status', (_req, res) => {
    res.json({
        url: WS_URL,
        ...wsStatus
    });
});

// Dados do painel principal (dashboard.html, linha.html)
app.get('/api/data', (_req, res) => {
    const db = readDb();
    res.json(db.dashboardState || {});
});

// Dados de produção (producao.html)
app.get('/api/producao', (_req, res) => {
    const db = readDb();
    res.json(db.productionEvents || []);
});

// Configuração do dispositivo (adm.html)
app.post('/api/config', (req, res) => {
    const { id_medidor, linha, baia, bancada } = req.body;

    if (!id_medidor || !linha || !baia || !bancada) {
        return res.status(400).json({ ok: false, message: 'Dados incompletos.' });
    }

    const db = readDb();
    const existingIndex = db.config.findIndex(c => c.id_medidor === id_medidor);
    if (existingIndex !== -1) {
        db.config[existingIndex] = { id_medidor, linha, baia, bancada };
    } else {
        db.config.push({ id_medidor, linha, baia, bancada });
    }

    writeDb(db);
    console.log('Config salva:', { id_medidor, linha, baia, bancada });
    res.json({ ok: true, message: 'Configuração salva com sucesso!' });
});

// Atualização manual de status (para testes)
// Aceita: { linha, baia, bancada(1-2), jig(1-2), status }
//      ou: { linha, baia, jig(1-4), status }  (legado)
app.post('/api/update', (req, res) => {
    const { linha, baia, status } = req.body;

    if (!linha || !baia || !status) {
        return res.status(400).json({ message: 'Dados incompletos: linha, baia e status são obrigatórios.' });
    }

    let bancada, jig;
    if (req.body.bancada) {
        bancada = Number(req.body.bancada);
        jig = Number(req.body.jig);
    } else if (req.body.jig) {
        const jigGlobal = Number(req.body.jig);
        bancada = jigGlobal <= 2 ? 1 : 2;
        jig = jigGlobal % 2 === 1 ? 1 : 2;
    } else {
        return res.status(400).json({ message: 'Informe bancada+jig ou jig(1-4).' });
    }

    const db = readDb();
    const { bancada: b, dispositivo } = processarAtualizacao(db, linha, String(baia), bancada, jig, status);
    writeDb(db);
    console.log(`API update: linha=${linha} baia=${baia} bancada=${b} jig=${dispositivo} status=${status}`);
    res.json({ message: 'Status atualizado com sucesso' });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
