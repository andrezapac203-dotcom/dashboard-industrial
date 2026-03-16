// producao.js

const API_BASE_URL = "http://localhost:3000/api";
const estadosEquipamentos = new Map();
let pollInterval = null;
let renderAgendado = false;
const CACHE_KEY = "producao_estado_cache_v1";

function gerarChave(dado) {
    // Garante que os componentes da chave existam
    const linha = dado.linha || "sem-linha";
    const baia = dado.baia || "sem-baia";
    const equipamento = dado.equipamento || "sem-equipamento";
    const dispositivo = dado.dispositivo || ""; // Dispositivo pode ser opcional
    return [linha, baia, equipamento, dispositivo].join("|");
}

function processarEventos(eventos) {
    if (!Array.isArray(eventos)) return;
    
    // Limpa o mapa para refletir o estado mais recente do servidor
    estadosEquipamentos.clear();

    eventos.forEach((evento) => {
        const chave = gerarChave(evento);
        estadosEquipamentos.set(chave, evento);
    });

    salvarCacheLocal();
    agendarRender();
}

async function buscarDados() {
    try {
        const response = await fetch(`${API_BASE_URL}/producao`);
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.statusText}`);
        }
        const eventos = await response.json();
        processarEventos(eventos);
        atualizarStatusConexao(true);
    } catch (error) {
        console.error("Falha ao buscar dados de produção:", error);
        atualizarStatusConexao(false);
    }
}

function agendarRender() {
    if (renderAgendado) return;
    renderAgendado = true;
    window.requestAnimationFrame(() => {
        renderAgendado = false;
        atualizarTela();
    });
}

function salvarCacheLocal() {
    try {
        const lista = Array.from(estadosEquipamentos.values());
        localStorage.setItem(CACHE_KEY, JSON.stringify(lista));
    } catch (_) {
        console.warn("Não foi possível salvar o cache local.");
    }
}

function carregarCacheLocal() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return;
        const lista = JSON.parse(raw);
        if (!Array.isArray(lista)) return;

        lista.forEach((item) => {
            if (!item || typeof item !== "object") return;
            const chave = gerarChave(item);
            if (!chave) return;
            estadosEquipamentos.set(chave, item);
        });
    } catch (_) {
        console.warn("Não foi possível carregar o cache local.");
    }
}

function atualizarGauge(valorAtual) {
    const minimoMaximo = 10;
    const maximo = Math.max(minimoMaximo, valorAtual);
    const razao = Math.min(valorAtual / maximo, 1);
    const angulo = -90 + razao * 180;

    document.getElementById("contadorFalhas").innerText = valorAtual;
    document.getElementById("gaugeMax").innerText = maximo;

    const ponteiro = document.getElementById("gaugeNeedle");
    ponteiro.style.transform = `rotate(${angulo}deg)`;
}

function classeStatus(status) {
    if (status === "falha") return "status-falha";
    if (status === "alerta") return "status-alerta";
    return "status-ok";
}

function textoStatus(item) {
    if (item.status === "falha") return `FALHA - ${item.tipo}`;
    if (item.status === "alerta") return `ALERTA - ${item.tipo}`;
    return "OK";
}

function classeLinha(status) {
    if (status === "falha") return "row-falha row-blink";
    if (status === "alerta") return "row-alerta";
    return "row-ok";
}

function prioridadeStatus(status) {
    if (status === "falha") return 0;
    if (status === "alerta") return 1;
    return 2;
}

function atualizarTabela() {
    const tabela = document.getElementById("tabelaFalhas");
    tabela.innerHTML = "";

    if (estadosEquipamentos.size === 0) {
        const row = document.createElement("tr");
        row.innerHTML = '<td class="vazio" colspan="6">Sem dados de produção. Aguardando servidor...</td>';
        tabela.appendChild(row);
        return;
    }

    const lista = Array.from(estadosEquipamentos.values()).sort((a, b) => {
        const s = prioridadeStatus(a.status) - prioridadeStatus(b.status);
        if (s !== 0) return s;
        if (a.linha !== b.linha) return a.linha.localeCompare(b.linha);
        if (a.baia !== b.baia) return a.baia.localeCompare(b.baia);
        return (a.equipamento || "").localeCompare(b.equipamento || "");
    });

    lista.forEach((item) => {
        const row = document.createElement("tr");
        row.className = classeLinha(item.status);
        row.innerHTML = `
            <td>${item.linha}</td>
            <td>${item.baia}</td>
            <td>${item.equipamento}${item.dispositivo ? " - " + item.dispositivo : ""}</td>
            <td class="${classeStatus(item.status)}">${textoStatus(item)}</td>
            <td>${item.horaFalha || "-"}</td>
            <td>${item.ultimaAtualizacao || item.horario || "-"}</td>
        `;
        tabela.appendChild(row);
    });
}

function atualizarTela() {
    const alarmesAtivos = Array.from(estadosEquipamentos.values())
        .filter((item) => item.status === "falha" || item.status === "alerta").length;
    atualizarGauge(alarmesAtivos);
    atualizarTabela();
}

function atualizarStatusConexao(conectado) {
    const el = document.getElementById("statusConexao");
    if (conectado) {
        el.innerText = "Servidor: conectado";
        el.className = "status-conexao online";
    } else {
        el.innerText = "Servidor: desconectado (tentando reconectar...)";
        el.className = "status-conexao offline";
    }
}

function iniciarPolling() {
    buscarDados(); // Busca inicial
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(buscarDados, 2000); // Polling a cada 2 segundos
}

function configurarBotoes() {
    document.getElementById("btnLimparHistorico").addEventListener("click", () => {
        // Esta função agora limpa apenas a visualização, os dados voltarão no próximo poll.
        // Para uma limpeza real, seria necessário um endpoint na API.
        estadosEquipamentos.clear();
        salvarCacheLocal();
        atualizarTela();
        console.warn("O histórico foi limpo localmente, mas será recarregado do servidor.");
    });

    document.getElementById("btnDashboard").addEventListener("click", () => {
        window.location.href = "dashboard.html";
    });

    document.getElementById("btnPainel").addEventListener("click", () => {
        window.location.href = "linha.html";
    });

    const btnAdm = document.getElementById("btnAdm");
    if (btnAdm) {
        btnAdm.addEventListener("click", () => {
            window.location.href = "adm.html";
        });
    }
}

// Rotina de inicialização
configurarBotoes();
carregarCacheLocal(); // Carrega o cache para uma exibição inicial rápida
atualizarTela();
atualizarStatusConexao(false);
iniciarPolling(); // Inicia a busca de dados do servidor
