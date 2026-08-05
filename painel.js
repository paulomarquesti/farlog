// 1. Configurações do seu projeto Supabase
const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CONFIGURAÇÃO DA LOJA (Ajuste para seu município/estado para filtrar a busca)
const CIDADE_PADRAO = "Rio de Janeiro, RJ, Brasil"; 

// ELEMENTOS DA TELA
const userEmailSpan = document.getElementById('user-email');
const btnLogout = document.getElementById('btn-logout');
const formEntregador = document.getElementById('form-entregador');
const tabelaEntregadores = document.getElementById('tabela-entregadores');
const seletorEntregador = document.getElementById('seletor-entregador');
const formEntrega = document.getElementById('form-entrega');
const tabelaEntregasAtivas = document.getElementById('tabela-entregas-ativas');
const veiculoSeletor = document.getElementById('veiculo-entregador');
const groupAutonomia = document.getElementById('group-autonomia');

// Variáveis de controle globais
let mapaHome = null;
let camadaMarcadores = null;
let idEntregaEmEdicao = null;

// --- PROTETOR DE TELA E USUÁRIO ---
async function verificarSessao() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
    } else {
        userEmailSpan.textContent = session.user.email;
        carregarEntregadores();
        carregarEntregasAtivas();
        carregarMetricasHome();
        inicializarMapa();
    }
}

veiculoSeletor.addEventListener('change', () => {
    if (veiculoSeletor.value === 'Bicicleta') {
        groupAutonomia.classList.add('hidden');
    } else {
        groupAutonomia.classList.remove('hidden');
    }
});

btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

// FUNÇÃO PARA LIMPAR O ENDEREÇO PARA A API DE MAPAS
function limparEndereco(enderecoBruto) {
    // Remove complementos comuns de entrega que confundem o GPS
    let limpo = enderecoBruto
        .replace(/(apto|apt|apartamento|bloco|bl|casa|fundos|sobrado|loja|fundos|prox|próximo|ao lado).*/gi, '')
        .replace(/-.*/g, '') // Remove o que vem depois de traços (ex: - perto do mercado)
        .trim();
    return limpo;
}

// --- LÓGICA DO MAPA (LEAFLET.JS) ---
async function inicializarMapa() {
    // Coordenadas centrais (Altere para a sua farmácia)
    const latLoja = -22.95993026528827; 
    const lngLoja = -43.20198741665364;

    if (!mapaHome) {
        mapaHome = L.map('map').setView([latLoja, lngLoja], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaHome);

        // Pino base da Farmácia
        L.marker([latLoja, lngLoja])
            .addTo(mapaHome)
            .bindPopup('<b>FarLog Base 🏪</b><br>Sua Farmácia')
            .openPopup();

        camadaMarcadores = L.layerGroup().addTo(mapaHome);
    } else {
        camadaMarcadores.clearLayers();
    }

    setTimeout(() => { if (mapaHome) mapaHome.invalidateSize(); }, 200);

    // Busca entregas ativas no Supabase
    const { data: entregasAtivas, error } = await supabaseClient
        .from('entregas')
        .select('endereco_destino, forma_pagamento, entregadores(nome)')
        .eq('status', 'Em Rota');

    if (error) return console.error('Erro ao buscar rotas para o mapa:', error);

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    for (const entrega of entregasAtivas) {
        try {
            // Limpa o endereço para o geocodificador
            const enderecoTratado = limparEndereco(entrega.endereco_destino);
            const buscaCompleta = `${enderecoTratado}, ${CIDADE_PADRAO}`;
            
            console.log(`🔍 Pesquisando no mapa: "${buscaCompleta}"`);

            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(buscaCompleta)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                L.marker([lat, lon])
                    .addTo(camadaMarcadores)
                    .bindPopup(`
                        <b>📍 Destino:</b> ${entrega.endereco_destino}<br>
                        <b>🏍️ Motoboy:</b> ${entrega.entregadores ? entrega.entregadores.nome : 'N/A'}<br>
                        <b>💳 Pagamento:</b> ${entrega.forma_pagamento}
                    `);
                console.log(`✅ Ponto encontrado para: ${entrega.endereco_destino}`);
            } else {
                console.warn(`⚠️ Endereço não localizado no mapa: "${buscaCompleta}"`);
            }
        } catch (err) {
            console.error('Erro na requisição de mapa:', err);
        }
        // Respeita a cota da API gratuita
        await delay(1200);
    }
}

// --- OPERAÇÕES DE ENTREGADORES ---
formEntregador.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('nome-entregador').value;
    const whatsapp = document.getElementById('whatsapp-entregador').value;
    const veiculo = document.getElementById('veiculo-entregador').value;
    const autonomia = document.getElementById('autonomia-moto').value;

    const { error } = await supabaseClient.from('entregadores').insert([
        { nome, whatsapp, veiculo_padrao: veiculo, autonomia_moto: veiculo === 'Moto' ? parseFloat(autonomia) : 0 }
    ]);

    if (error) { alert('Erro: ' + error.message); } else { formEntregador.reset(); carregarEntregadores(); }
});
// --- ATUALIZAÇÃO DAS MÉTRICAS FLASH DA HOME ---
async function carregarMetricasHome() {
    try {
        // 1. Entregas "Na Rua Agora"
        const { count: countNaRua } = await supabaseClient
            .from('entregas')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Em Rota');

        // 2. Entregadores "Livres" (Disponíveis)
        const { count: countLivres } = await supabaseClient
            .from('entregadores')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Disponível');

        // 3. Total de Entregas do Dia (Criadas a partir de meia-noite de hoje)
        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);

        const { count: countTotalDia } = await supabaseClient
            .from('entregas')
            .select('*', { count: 'exact', head: true })
            .gte('horario_saida', inicioHoje.toISOString());

        // Atualiza os textos no HTML
        const elNaRua = document.getElementById('metric-na-rua');
        const elLivres = document.getElementById('metric-livres');
        const elTotalDia = document.getElementById('metric-total-dia');

        if (elNaRua) elNaRua.textContent = countNaRua || 0;
        if (elLivres) elLivres.textContent = countLivres || 0;
        if (elTotalDia) elTotalDia.textContent = countTotalDia || 0;

    } catch (err) {
        console.error('Erro ao carregar métricas da Home:', err);
    }
}

async function carregarEntregadores() {
    const { data: entregadores, error } = await supabaseClient.from('entregadores').select('*').order('nome', { ascending: true });
    if (error) return console.error(error);

    tabelaEntregadores.innerHTML = '';
    seletorEntregador.innerHTML = '<option value="">Selecione...</option>';

    entregadores.forEach(entregador => {
        const classeStatus = entregador.status === 'Disponível' ? 'status-disponivel' : 'status-rota';
        
        tabelaEntregadores.innerHTML += `
            <tr>
                <td><strong>${entregador.nome}</strong></td>
                <td>${entregador.veiculo_padrao}</td>
                <td><span class="status-badge ${classeStatus}">${entregador.status}</span></td>
            </tr>
        `;

        seletorEntregador.innerHTML += `
            <option value="${entregador.id}" data-whatsapp="${entregador.whatsapp}">
                ${entregador.nome} (${entregador.veiculo_padrao}) - [${entregador.status}]
            </option>
        `;
    });
}

// --- OPERAÇÕES DE ENTREGAS ---
formEntrega.addEventListener('submit', async (e) => {
    e.preventDefault();

    const endereco = document.getElementById('endereco-entrega').value;
    const seletor = document.getElementById('seletor-entregador');
    const entregadorId = seletor.value;
    const veiculo = document.getElementById('veiculo-entrega').value;
    const pagamento = document.getElementById('pagamento-entrega').value;

    if (idEntregaEmEdicao) {
        const { data: entregaAntiga } = await supabaseClient
            .from('entregas')
            .select('entregador_id')
            .eq('id', idEntregaEmEdicao)
            .single();

        const { error } = await supabaseClient
            .from('entregas')
            .update({ 
                endereco_destino: endereco, 
                entregador_id: entregadorId, 
                veiculo_utilizado: veiculo, 
                forma_pagamento: pagamento 
            })
            .eq('id', idEntregaEmEdicao);

        if (error) { alert('Erro ao atualizar: ' + error.message); return; }
        
        if (entregaAntiga && entregaAntiga.entregador_id !== entregadorId) {
            await checarELiberarEntregador(entregaAntiga.entregador_id);
            await supabaseClient.from('entregadores').update({ status: 'Em Rota' }).eq('id', entregadorId);
            
            const whatsappEntregador = seletor.options[seletor.selectedIndex].getAttribute('data-whatsapp');
            const linkEntregador = `http://127.0.0.1:5500/entrega.html?id=${idEntregaEmEdicao}`;
            const textoMensagem = `*ENTREGA ATUALIZADA / REDIRECIONADA FARLOG*%0A%0A📍 *Destino:* ${endereco}%0A💳 *Pagamento:* ${pagamento}%0A%0A👉 Novo Link:%0A${linkEntregador}`;
            window.open(`https://web.whatsapp.com/send?phone=${whatsappEntregador}&text=${textoMensagem}`, '_blank');
        }
        
        idEntregaEmEdicao = null;
        formEntrega.querySelector('button[type="submit"]').textContent = "Despachar e Enviar WhatsApp";
        formEntrega.querySelector('button[type="submit"]').className = "btn-primary";
        
    } else {
        const { data: novaEntrega, error: errorEntrega } = await supabaseClient
            .from('entregas')
            .insert([{ entregador_id: entregadorId, endereco_destino: endereco, veiculo_utilizado: veiculo, forma_pagamento: pagamento, status: 'Em Rota', horario_saida: new Date().toISOString() }])
            .select().single();

        if (errorEntrega) { alert('Erro ao despachar: ' + errorEntrega.message); return; }

        await supabaseClient.from('entregadores').update({ status: 'Em Rota' }).eq('id', entregadorId);

        const whatsappEntregador = seletor.options[seletor.selectedIndex].getAttribute('data-whatsapp');
        const linkEntregador = `http://127.0.0.1:5500/entrega.html?id=${novaEntrega.id}`;
        const textoMensagem = `*NOVA ENTREGA FARLOG*%0A%0A📍 *Destino:* ${endereco}%0A💳 *Pagamento:* ${pagamento}%0A%0A👉 Link:%0A${linkEntregador}`;
        window.open(`https://web.whatsapp.com/send?phone=${whatsappEntregador}&text=${textoMensagem}`, '_blank');
    }

    formEntrega.reset();
    carregarEntregadores();
    carregarEntregasAtivas();
    carregarMetricasHome();
    inicializarMapa();
});

async function carregarEntregasAtivas() {
    const { data: entregas, error } = await supabaseClient
        .from('entregas')
        .select(`id, endereco_destino, forma_pagamento, status, entregador_id, veiculo_utilizado, entregadores ( nome )`)
        .eq('status', 'Em Rota');

    if (error) return console.error(error);
    tabelaEntregasAtivas.innerHTML = '';
    
    entregas.forEach(entrega => {
        tabelaEntregasAtivas.innerHTML += `
            <tr>
                <td>${entrega.endereco_destino}</td>
                <td>${entrega.entregadores ? entrega.entregadores.nome : 'Sem Nome'}</td>
                <td>${entrega.forma_pagamento}</td>
                <td>
                    <button onclick="forcarFinalizar('${entrega.id}', '${entrega.entregador_id}')" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Concluir</button>
                    <button onclick="cancelarEntrega('${entrega.id}', '${entrega.entregador_id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Cancelar</button>
                    <button onclick="prepararEdicao('${entrega.id}', '${entrega.endereco_destino}', '${entrega.entregador_id}', '${entrega.veiculo_utilizado}', '${entrega.forma_pagamento}')" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Editar</button>
                </td>
            </tr>
        `;
    });
}

async function checarELiberarEntregador(entregadorId) {
    const { data: entregasRestantes } = await supabaseClient
        .from('entregas')
        .select('id')
        .eq('entregador_id', entregadorId)
        .eq('status', 'Em Rota');

    if (!entregasRestantes || entregasRestantes.length === 0) {
        await supabaseClient.from('entregadores').update({ status: 'Disponível' }).eq('id', entregadorId);
    }
}

// --- FUNÇÕES DE AÇÃO DA TABELA ---
window.forcarFinalizar = async (entregaId, entregadorId) => {
    if(!confirm("Deseja mesmo finalizar essa entrega pelo balcão?")) return;
    
    await supabaseClient.from('entregas').update({ status: 'Entregue', horario_entrega: new Date().toISOString() }).eq('id', entregaId);
    await checarELiberarEntregador(entregadorId);
    
    carregarEntregadores();
    carregarEntregasAtivas();
    carregarMetricasHome();
    inicializarMapa();
};

window.cancelarEntrega = async (entregaId, entregadorId) => {
    if(!confirm("Tem certeza que deseja CANCELAR essa entrega?")) return;
    
    await supabaseClient.from('entregas').update({ status: 'Cancelado' }).eq('id', entregaId);
    await checarELiberarEntregador(entregadorId);
    
    carregarEntregadores();
    carregarEntregasAtivas();
    carregarMetricasHome();
    inicializarMapa();
};

window.prepararEdicao = (id, endereco, entregadorId, veiculo, pagamento) => {
    idEntregaEmEdicao = id;
    
    document.getElementById('endereco-entrega').value = endereco;
    document.getElementById('veiculo-entrega').value = veiculo;
    document.getElementById('pagamento-entrega').value = pagamento;
    seletorEntregador.value = entregadorId;

    const btnSubmit = formEntrega.querySelector('button[type="submit"]');
    btnSubmit.textContent = "Salvar Alterações";
    btnSubmit.className = "btn-success"; 
};

verificarSessao();