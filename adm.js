// adm.js

const API_BASE_URL = "http://localhost:3000/api";

function $(id) {
    return document.getElementById(id);
}

function atualizarStatusConexao(texto, conectado) {
    const el = $("statusConexao");
    if (!el) return;
    el.innerText = texto;
    el.style.color = conectado ? "var(--green-color)" : "var(--accent-color)";
}

function setStatusEnvio(texto, ok) {
    const el = $("statusEnvio");
    if (!el) return;
    el.innerText = texto || "";
    el.style.color = ok ? "var(--green-color)" : "var(--red-color)";
}

function normalizarLinha(valor) {
    if (valor === undefined || valor === null) return "";
    const texto = String(valor).trim().toUpperCase();
    if (!texto) return "";
    if (/^\d+$/.test(texto)) return `IMC${texto.padStart(2, "0")}`;
    return texto;
}

function buildPayload() {
    const idMedidor = String($("idMedidor")?.value || "").trim();
    const linha = normalizarLinha($("linhaNova")?.value || "");
    const baia = String($("baiaNova")?.value || "").trim();
    const bancada = String($("bancadaNova")?.value || "").trim();

    // O servidor espera 'id_medidor'
    return { id_medidor: idMedidor, linha, baia, bancada };
}

function validarPayload(payload) {
    if (!payload.id_medidor) return "Informe o ID do dispositivo.";
    if (!payload.linha) return "Informe a linha.";
    if (!payload.baia) return "Informe a baia.";
    if (!payload.bancada) return "Informe a bancada.";
    return null;
}

async function enviarAtualizacao() {
    setStatusEnvio("", true);

    const payload = buildPayload();
    const erro = validarPayload(payload);
    if (erro) {
        setStatusEnvio(erro, false);
        return;
    }

    setStatusEnvio("Enviando...", true);

    try {
        const response = await fetch(`${API_BASE_URL}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok) {
            setStatusEnvio(result.message || "Salvo com sucesso!", true);
        } else {
            throw new Error(result.message || "Erro desconhecido do servidor.");
        }
    } catch (error) {
        console.error("Falha ao enviar atualização:", error);
        setStatusEnvio(`Falha ao enviar: ${error.message}`, false);
        // Verifica a conexão novamente em caso de falha de rede
        verificarConexaoServidor();
    }
}

async function verificarConexaoServidor() {
    try {
        const response = await fetch("http://localhost:3000");
        if (response.ok) {
            atualizarStatusConexao("Servidor: conectado", true);
            return true;
        } else {
            throw new Error(`Status: ${response.status}`);
        }
    } catch (error) {
        console.error("Erro ao conectar com o servidor:", error);
        atualizarStatusConexao("Servidor: desconectado (verifique se está rodando)", false);
        return false;
    }
}


function configurarUI() {
    $("btnAtualizar")?.addEventListener("click", () => {
        enviarAtualizacao();
    });

    ["idMedidor", "linhaNova", "baiaNova"].forEach((id) => {
        $(id)?.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") enviarAtualizacao();
        });
    });
}

// Inicia a UI e verifica a conexão com o servidor
configurarUI();
verificarConexaoServidor();
setInterval(verificarConexaoServidor, 10000); // Verifica a cada 10s
