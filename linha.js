const linhas = window.MONITOR_CONFIG.linhas;
const monitorService = new window.MonitorDataService();
const params = new URLSearchParams(window.location.search);
let linhaAtual = params.get("linha") || "IMC10";
let ultimoSnapshot = null;

if (!linhas.includes(linhaAtual)) {
    linhaAtual = linhas[0];
}

function atualizarURL() {
    const novaURL = `${window.location.pathname}?linha=${encodeURIComponent(linhaAtual)}`;
    window.history.replaceState({}, "", novaURL);
}

function renderListaLinhas() {
    const lista = document.getElementById("listaLinhas");
    lista.innerHTML = "";

    linhas.forEach((linha) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `linha-item${linha === linhaAtual ? " active" : ""}`;
        botao.innerText = linha;
        botao.addEventListener("click", () => {
            linhaAtual = linha;
            atualizarURL();
            gerarLinha();
            renderListaLinhas();
        });
        lista.appendChild(botao);
    });
}

function atualizarStatusGeral(falha, alerta, offline, conectado) {
    const statusLinha = document.getElementById("statusLinha");
    let texto = "Status geral: OK - Funcionando";
    let classe = "ok";

    if (!conectado) {
        texto = "Status geral: SEM CONEXAO - Aguardando dados";
        classe = "alerta";
    } else if (falha > 0) {
        texto = "Status geral: FALHA - Nao funcionando";
        classe = "falha";
    } else if (alerta > 0 || offline > 0) {
        texto = "Status geral: ALERTA - Verificar";
        classe = "alerta";
    }

    statusLinha.innerText = texto;
    statusLinha.className = `linha-indicador ${classe}`;
}

function gerarLinha() {
    if (!ultimoSnapshot) return;

    document.getElementById("nomeLinha").innerText = linhaAtual;

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

        const jigs = document.createElement("div");
        jigs.className = "jigs";

        for (let j = 1; j <= 4; j++) {
            const jig = document.createElement("div");
            // Mapear jig para bancada e dispositivo
            const bancada = j <= 2 ? 1 : 2;
            const dispositivo = j % 2 === 1 ? 1 : 2;
            const status = ultimoSnapshot.estado[linhaAtual][b]?.[bancada]?.[dispositivo] || "semcom";

            jig.className = "jig " + status;
            jig.innerText = "J" + j;

            if (status === "ok") ok++;
            if (status === "falha") falha++;
            if (status === "alerta") alerta++;
            if (status === "semcom") offline++;

            jigs.appendChild(jig);
        }

        baia.appendChild(jigs);
        container.appendChild(baia);
    }

    document.getElementById("countOk").innerText = ok;
    document.getElementById("countFalha").innerText = falha;
    document.getElementById("countAlerta").innerText = alerta;
    document.getElementById("countOffline").innerText = offline;

    atualizarStatusGeral(falha, alerta, offline, ultimoSnapshot.conectado);
}

function configurarNavegacao() {
    document.getElementById("btnVoltar").addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = "dashboard.html";
    });

    document.getElementById("btnPainel").addEventListener("click", () => {
        window.location.href = "producao.html";
    });

    document.getElementById("btnDashboard").addEventListener("click", () => {
        window.location.href = "dashboard.html";
    });
}

atualizarURL();
configurarNavegacao();
renderListaLinhas();
monitorService.subscribe((snapshot) => {
    ultimoSnapshot = snapshot;
    gerarLinha();
});
