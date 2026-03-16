const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Middlewares
app.use(cors()); // Permite requisições de qualquer origem, útil para file://
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Serve arquivos estáticos

// Função para ler o banco de dados
const readDb = () => {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao ler db.json:", error);
        // Retorna uma estrutura padrão em caso de erro ou arquivo inexistente
        return {
            config: [],
            dashboardState: {},
            productionEvents: []
        };
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

// Rota principal
app.get('/', (req, res) => {
    res.send('Servidor do Dashboard Industrial está no ar!');
});

// Rota para obter dados do painel principal (linha.html, dashboard.html)
app.get('/api/data', (req, res) => {
    const db = readDb();
    res.json(db.dashboardState || {});
});

// Rota para obter dados de produção (producao.html)
app.get('/api/producao', (req, res) => {
    const db = readDb();
    res.json(db.productionEvents || []);
});

// Rota para salvar a configuração do ADM
app.post('/api/config', (req, res) => {
    const { id_medidor, linha, baia } = req.body;

    if (!id_medidor || !linha || !baia) {
        return res.status(400).json({ ok: false, message: 'Dados incompletos.' });
    }

    const db = readDb();
    
    // Evita duplicatas
    const existingIndex = db.config.findIndex(c => c.id_medidor === id_medidor);
    if (existingIndex !== -1) {
        db.config[existingIndex] = { id_medidor, linha, baia };
    } else {
        db.config.push({ id_medidor, linha, baia });
    }

    writeDb(db);

    console.log('Configuração salva:', { id_medidor, linha, baia });
    res.json({ ok: true, message: 'Configuração salva com sucesso!' });
});

// Rota para forçar uma atualização de status (para teste)
app.post('/api/update', (req, res) => {
    console.log('Recebida requisição POST /api/update:', req.body);
    const { linha, baia, jig, status } = req.body;

    if (!linha || !baia || !jig || !status) {
        console.error('Dados incompletos:', { linha, baia, jig, status });
        return res.status(400).json({ message: 'Dados incompletos para atualização.' });
    }

    const db = readDb();

    // Atualiza o dashboardState
    if (!db.dashboardState[linha]) db.dashboardState[linha] = {};
    if (!db.dashboardState[linha][baia]) db.dashboardState[linha][baia] = {};
    db.dashboardState[linha][baia][jig] = status;

    // Atualiza/Adiciona um evento em productionEvents
    const now = new Date();
    const horario = now.toLocaleTimeString('pt-BR', { hour12: false });
    const evento = {
        linha: linha,
        baia: `BAIA ${baia}`,
        equipamento: `J${jig}`,
        dispositivo: `JIG ${jig}`,
        tipo: status === 'falha' ? 'Falha Manual' : 'Info',
        status: status,
        horario: horario,
        horaFalha: status === 'falha' ? horario : '-',
        ultimaAtualizacao: horario
    };

    const chaveEvento = `${linha}|BAIA ${baia}|J${jig}|JIG ${jig}`;
    const indexEvento = db.productionEvents.findIndex(e => `${e.linha}|${e.baia}|${e.equipamento}|${e.dispositivo}` === chaveEvento);

    if (indexEvento !== -1) {
        // Mantém a hora da falha original se já estava em falha
        const horaFalhaOriginal = db.productionEvents[indexEvento].status === 'falha' 
            ? db.productionEvents[indexEvento].horaFalha 
            : evento.horaFalha;
        
        db.productionEvents[indexEvento] = {
            ...evento,
            horaFalha: horaFalhaOriginal
        };
    } else {
        db.productionEvents.push(evento);
    }
    
    writeDb(db);
    console.log('Status atualizado:', { linha, baia, jig, status });
    res.json({ message: 'Status atualizado com sucesso' });
});


// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
