// data-service.js

const API_BASE_URL = "http://localhost:3000/api";

const MONITOR_CONFIG = {
    // A lista de linhas agora pode ser obtida dinamicamente do servidor
    linhas: ["IMC10", "IMC08", "IMC12", "IMC05", "IMC04", "IMC06"],
    totalBaias: 10,
    totalBancadas: 2,
    totalDispositivos: 2
};

function criarEstruturaLinha() {
    const linha = {};
    for (let baia = 1; baia <= MONITOR_CONFIG.totalBaias; baia++) {
        linha[baia] = {};
        for (let bancada = 1; bancada <= MONITOR_CONFIG.totalBancadas; bancada++) {
            linha[baia][bancada] = {};
            for (let dispositivo = 1; dispositivo <= MONITOR_CONFIG.totalDispositivos; dispositivo++) {
                linha[baia][bancada][dispositivo] = "semcom";
            }
        }
    }
    return linha;
}

function criarEstadoInicial() {
    const estado = {};
    MONITOR_CONFIG.linhas.forEach((linha) => {
        estado[linha] = criarEstruturaLinha();
    });
    return estado;
}

class MonitorDataService {
    constructor() {
        this.estado = criarEstadoInicial();
        this.listeners = [];
        this.conectado = false;
        this.pollInterval = null;
        this.iniciarPolling();
    }

    iniciarPolling() {
        // Busca dados imediatamente na inicialização
        this.buscarDados();

        // Inicia o polling a cada 2 segundos
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.buscarDados(), 2000);
    }

    async buscarDados() {
        try {
            const response = await fetch(`${API_BASE_URL}/data`);
            if (!response.ok) {
                throw new Error(`Erro na requisição: ${response.statusText}`);
            }
            const novoEstado = await response.json();
            
            this.processarNovoEstado(novoEstado);

            if (!this.conectado) {
                this.conectado = true;
                this.notificar();
            }
        } catch (error) {
            console.error("Falha ao buscar dados do servidor:", error);
            if (this.conectado) {
                this.conectado = false;
                this.notificar();
            }
        }
    }

    processarNovoEstado(novoEstado) {
        if (!novoEstado || typeof novoEstado !== 'object') return;

        // Atualiza o estado interno
        this.estado = novoEstado;

        // Atualiza a configuração de linhas se necessário
        const novasLinhas = Object.keys(novoEstado);
        novasLinhas.forEach(linha => {
            if (!MONITOR_CONFIG.linhas.includes(linha)) {
                MONITOR_CONFIG.linhas.push(linha);
            }
        });

        // Notifica os listeners sobre a mudança
        this.notificar();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        listener(this.getSnapshot());
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    getSnapshot() {
        return {
            conectado: this.conectado,
            linhas: MONITOR_CONFIG.linhas.slice(),
            estado: this.estado
        };
    }

    notificar() {
        const snapshot = this.getSnapshot();
        this.listeners.forEach((listener) => listener(snapshot));
    }
}

window.MONITOR_CONFIG = MONITOR_CONFIG;
window.MonitorDataService = MonitorDataService;
