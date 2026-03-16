// data-service.js

const API_BASE_URL = "http://localhost:3000/api";

const MONITOR_CONFIG = {
    linhas: ["IMC04", "IMC05", "IMC06", "IMC08", "IMC10", "IMC12"],
    totalBaias: 10,
    totalJigs: 4,
    totalBancadas: 2,
    totalDispositivos: 2
};

function criarEstruturaLinha() {
    const linha = {};
    for (let baia = 1; baia <= MONITOR_CONFIG.totalBaias; baia++) {
        linha[baia] = {};
        for (let bancada = 1; bancada <= MONITOR_CONFIG.totalBancadas; bancada++) {
            linha[baia][bancada] = {
                1: { status: "semcom", tipo: "" },
                2: { status: "semcom", tipo: "" }
            };
        }
    }
    return linha;
}

function criarEstadoInicial() {
    const estado = {};
    MONITOR_CONFIG.linhas.forEach(l => { estado[l] = criarEstruturaLinha(); });
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

        // Mescla dados reais do servidor sobre o estado base (semcom)
        // Linhas com dado real atualizam; linhas sem dado ficam como semcom
        Object.entries(novoEstado).forEach(([linha, baias]) => {
            if (!this.estado[linha]) this.estado[linha] = criarEstruturaLinha();
            Object.entries(baias).forEach(([baia, bancadas]) => {
                if (!this.estado[linha][baia]) this.estado[linha][baia] = {};
                Object.entries(bancadas).forEach(([bancada, jigs]) => {
                    if (!this.estado[linha][baia][bancada]) this.estado[linha][baia][bancada] = {};
                    Object.assign(this.estado[linha][baia][bancada], jigs);
                });
            });
            if (!MONITOR_CONFIG.linhas.includes(linha)) MONITOR_CONFIG.linhas.push(linha);
        });

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
