const linhas = window.MONITOR_CONFIG.linhas;
const monitorService = new window.MonitorDataService();
let indiceAtual = 0;
let autoRotacao = true;
let timerRotacao = null;
let ultimoSnapshot = null;

function atualizarStatusGeral(falha, alerta, offline, conectado) {
    const statusGeral = document.getElementById("statusGeral");
    let texto = "Status da linha: OK - Funcionando";
    let classe = "ok";

    if (!conectado) {
        texto = "Status da linha: SEM CONEXAO - Aguardando dados";
        classe = "alerta";
    } else if (falha > 0) {
        texto = "Status da linha: FALHA - Nao funcionando";
        classe = "falha";
    } else if (alerta > 0 || offline > 0) {
        texto = "Status da linha: ALERTA - Verificar";
        classe = "alerta";
    }

    statusGeral.innerText = texto;
    statusGeral.className = `dash-status ${classe}`;
}

function gerarLinha() {
    if (!ultimoSnapshot) return;

    const nomeLinha = linhas[indiceAtual];
    document.getElementById("linhaNome").innerText = nomeLinha;

    const container = document.getElementById("containerBaias");
    container.innerHTML = "";

    let ok = 0;
    let falha = 0;
    let alerta = 0;
    let offline = 0;

    for (let b = 1; b <= window.MONITOR_CONFIG.totalBaias; b++) {
        const baia = document.createElement("div");
        baia.className = "baia";

        const titulo = document.createElement("h3");
        titulo.innerText = "BAIA " + b;
        baia.appendChild(titulo);

        const bancadas = document.createElement("div");
        bancadas.className = "bancadas";

        for (let bancada = 1; bancada <= 2; bancada++) {
            const bancadaCard = document.createElement("div");
            bancadaCard.className = "bancada-card";

            const bancadaLabel = document.createElement("div");
            bancadaLabel.className = "bancada-label";
            bancadaLabel.innerText = `Bancada ${bancada}`;
            bancadaCard.appendChild(bancadaLabel);

            const jigs = document.createElement("div");
            jigs.className = "jigs";

            for (let j = 1; j <= 2; j++) {
                const jig = document.createElement("div");
                const raw = ultimoSnapshot.estado[nomeLinha]?.[b]?.[bancada]?.[j];
                const status = (raw && raw.status) ? raw.status : (raw || "semcom");
                const tipo = (raw && raw.tipo) ? raw.tipo : "";

                jig.className = "jig " + status;
                jig.innerHTML = `<span class="jig-label">J${j}</span>${tipo ? `<span class="jig-tipo">${tipo}</span>` : ""}`;

                if (status === "ok") ok++;
                if (status === "falha") falha++;
                if (status === "alerta") alerta++;
                if (status === "semcom") offline++;

                jigs.appendChild(jig);
            }

            bancadaCard.appendChild(jigs);
            bancadas.appendChild(bancadaCard);
        }

        baia.appendChild(bancadas);
        container.appendChild(baia);
    }

    document.getElementById("countOk").innerText = ok;
    document.getElementById("countFalha").innerText = falha;
    document.getElementById("countAlerta").innerText = alerta;
    document.getElementById("countOffline").innerText = offline;

    atualizarStatusGeral(falha, alerta, offline, ultimoSnapshot.conectado);
    renderListaLinhas();
}

function renderListaLinhas() {
    const lista = document.getElementById("listaLinhasDashboard");
    lista.innerHTML = "";

    linhas.forEach((linha, index) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `linha-item${index === indiceAtual ? " active" : ""}`;
        botao.innerText = linha;
        botao.addEventListener("click", () => {
            indiceAtual = index;
            gerarLinha();
        });
        lista.appendChild(botao);
    });
}

function proximaLinha() {
    indiceAtual = (indiceAtual + 1) % linhas.length;
    gerarLinha();
}

function linhaAnterior() {
    indiceAtual = (indiceAtual - 1 + linhas.length) % linhas.length;
    gerarLinha();
}

function iniciarRotacao() {
    if (timerRotacao) clearInterval(timerRotacao);
    timerRotacao = setInterval(() => {
        if (autoRotacao) proximaLinha();
    }, 15000);
}

function configurarBotoes() {
    const btnAuto = document.getElementById("btnAuto");

    document.getElementById("btnAnterior").addEventListener("click", linhaAnterior);
    document.getElementById("btnProxima").addEventListener("click", proximaLinha);

    btnAuto.addEventListener("click", () => {
        autoRotacao = !autoRotacao;
        btnAuto.innerText = autoRotacao ? "Pausar Rotacao" : "Ativar Rotacao";
    });

    document.getElementById("btnAbrirLinha").addEventListener("click", () => {
        const linha = linhas[indiceAtual];
        window.location.href = `linha.html?linha=${encodeURIComponent(linha)}`;
    });

    document.getElementById("btnPainel").addEventListener("click", () => {
        window.location.href = "producao.html";
    });
}

monitorService.subscribe((snapshot) => {
    ultimoSnapshot = snapshot;
    gerarLinha();
});

configurarBotoes();
iniciarRotacao();
