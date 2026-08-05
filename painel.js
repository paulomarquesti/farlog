// 1. Configurações do seu projeto Supabase
const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CONFIGURAÇÕES OPERACIONAIS
const CIDADE_PADRAO = "Rio de Janeiro, RJ, Brasil"; 
const TEMPO_ATENDIMENTO_MIN = 5; // Tempo extra por cliente (portaria, elevador, pagamento)

// COORDENADAS EXATAS DA SUA FARMÁCIA
const LAT_FARMACIA = -22.959762324312493; 
const LNG_FARMACIA = -43.20180502821368; 

// PALETA COM 15 CORES VIBRANTES PARA ENTREGADORES
const CORES_ENTREGADORES = [
    '#ef4444', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#ea580c', '#84cc16', '#14b8a6', 
    '#6366f1', '#d946ef', '#0284c7', '#b45309', '#4b5563'
];

const mapaCoresEntregador = {};

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

const pagamentoSeletor = document.getElementById('pagamento-entrega');
const groupTroco = document.getElementById('group-troco');
const trocoInput = document.getElementById('troco-para');

// Variáveis de controle globais
let mapaHome = null;
let camadaMarcadores = null;
let legendaControl = null;
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

// CONTROLE DO CAMPO AUTONOMIA NO CADASTRO DE ENTREGADOR
if (veiculoSeletor) {
    veiculoSeletor.addEventListener('change', () => {
        if (veiculoSeletor.value === 'Bicicleta') {
            groupAutonomia.classList.add('hidden');
        } else {
            groupAutonomia.classList.remove('hidden');
        }
    });
}

// ITEM 3: EXIBE CAMPO DE TROCO APENAS SE FOR DINHEIRO
if (pagamentoSeletor) {
    pagamentoSeletor.addEventListener('change', () => {
        if (pagamentoSeletor.value === 'Dinheiro') {
            groupTroco.classList.remove('hidden');
        } else {
            groupTroco.classList.add('hidden');
            trocoInput.value = '';
        }
    });
}

btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

// --- ATUALIZAÇÃO DAS MÉTRICAS FLASH DA HOME ---
async function carregarMetricasHome() {
    try {
        const { count: countNaRua } = await supabaseClient
            .from('entregas')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Em Rota');

        const { count: countLivres } = await supabaseClient
            .from('entregadores')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Disponível');

        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);

        const { count: countTotalDia } = await supabaseClient
            .from('entregas')
            .select('*', { count: 'exact', head: true })
            .gte('horario_saida', inicioHoje.toISOString());

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

function limparEndereco(enderecoBruto) {
    return enderecoBruto
        .replace(/(apto|apt|apartamento|bloco|bl|casa|fundos|sobrado|loja|prox|próximo|ao lado).*/gi, '')
        .replace(/-.*/g, '')
        .trim();
}

function obterCorEntregador(entregadorId) {
    if (!mapaCoresEntregador[entregadorId]) {
        const indiceCor = Object.keys(mapaCoresEntregador).length % CORES_ENTREGADORES.length;
        mapaCoresEntregador[entregadorId] = CORES_ENTREGADORES[indiceCor];
    }
    return mapaCoresEntregador[entregadorId];
}

function criarIconeColorido(corHex, numeroOrdem = null) {
    const rotulo = numeroOrdem ? `<text x="12" y="16" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">${numeroOrdem}</text>` : `<circle cx="12" cy="12" r="4" fill="#ffffff" />`;

    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="42">
            <path fill="${corHex}" stroke="#ffffff" stroke-width="2" d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z"/>
            ${rotulo}
        </svg>
    `;

    return L.divIcon({
        className: 'custom-pin',
        html: svgIcon,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -38]
    });
}

// --- LÓGICA DO MAPA COM TEMPOS INDIVIDUAIS POR PARADA ---
async function inicializarMapa() {
    const latLoja = LAT_FARMACIA;
    const lngLoja = LNG_FARMACIA;

    if (!mapaHome) {
        mapaHome = L.map('map').setView([latLoja, lngLoja], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaHome);

        L.marker([latLoja, lngLoja], { icon: criarIconeColorido('#1e1b4b') })
            .addTo(mapaHome)
            .bindPopup('<b>FarLog Base 🏪</b><br>Sua Farmácia')
            .openPopup();

        camadaMarcadores = L.layerGroup().addTo(mapaHome);
    } else {
        camadaMarcadores.clearLayers();
    }

    setTimeout(() => { if (mapaHome) mapaHome.invalidateSize(); }, 200);

    const { data: entregasAtivas, error } = await supabaseClient
        .from('entregas')
        .select('id, endereco_destino, forma_pagamento, entregador_id, veiculo_utilizado, entregadores(nome, veiculo_padrao)')
        .eq('status', 'Em Rota');

    if (error) return console.error('Erro ao buscar rotas para o mapa:', error);

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    const entregasPorEntregador = {};

    for (const entrega of entregasAtivas) {
        try {
            const enderecoTratado = limparEndereco(entrega.endereco_destino);
            const buscaCompleta = `${enderecoTratado}, ${CIDADE_PADRAO}`;

            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(buscaCompleta)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                const eId = entrega.entregador_id || 'sem_id';
                const veiculoReal = entrega.entregadores ? entrega.entregadores.veiculo_padrao : (entrega.veiculo_utilizado || 'Moto');

                if (!entregasPorEntregador[eId]) {
                    entregasPorEntregador[eId] = {
                        nome: entrega.entregadores ? entrega.entregadores.nome : 'Sem Nome',
                        veiculo: veiculoReal,
                        cor: obterCorEntregador(eId),
                        pontos: []
                    };
                }

                entregasPorEntregador[eId].pontos.push({
                    id: entrega.id,
                    endereco: entrega.endereco_destino,
                    pagamento: entrega.forma_pagamento,
                    lat: lat,
                    lon: lon
                });
            }
        } catch (err) {
            console.error('Erro na geocodificação:', err);
        }
        await delay(1000);
    }

    const estilosLinha = [
        { weight: 5, opacity: 0.85, dashArray: null },
        { weight: 5, opacity: 0.85, dashArray: '8, 8' },
        { weight: 5, opacity: 0.85, dashArray: '3, 6' },
        { weight: 4, opacity: 0.9, dashArray: '12, 6, 3, 6' }
    ];

    const dadosLegenda = {};
    let indiceEntregador = 0;

    for (const eId in entregasPorEntregador) {
        const grupo = entregasPorEntregador[eId];
        if (grupo.pontos.length === 0) continue;

        const perfilOSRM = grupo.veiculo === 'Bicicleta' ? 'bike' : 'driving';

        let stringCoordsIda = `${lngLoja},${latLoja}`;
        grupo.pontos.forEach(pt => { stringCoordsIda += `;${pt.lon},${pt.lat}`; });

        const ultimoPonto = grupo.pontos[grupo.pontos.length - 1];
        let stringCoordsVolta = `${ultimoPonto.lon},${ultimoPonto.lat};${lngLoja},${latLoja}`;

        try {
            const urlIda = `https://router.project-osrm.org/route/v1/${perfilOSRM}/${stringCoordsIda}?overview=full&geometries=geojson`;
            const respIda = await fetch(urlIda);
            const dataIda = await respIda.json();

            const urlVolta = `https://router.project-osrm.org/route/v1/${perfilOSRM}/${stringCoordsVolta}?overview=false`;
            const respVolta = await fetch(urlVolta);
            const dataVolta = await respVolta.json();

            let distanciaIdaMetros = 0;
            let tempoIdaSegundos = 0;
            let tempoVoltaSegundos = 0;

            if (dataIda.routes && dataIda.routes.length > 0) {
                const rotaIda = dataIda.routes[0];
                distanciaIdaMetros = rotaIda.distance;
                tempoIdaSegundos = rotaIda.duration;

                const estiloAtual = estilosLinha[indiceEntregador % estilosLinha.length];
                const coordenadasRota = rotaIda.geometry.coordinates.map(coord => [coord[1], coord[0]]);

                const linhaRota = L.polyline(coordenadasRota, {
                    color: grupo.cor,
                    weight: estiloAtual.weight,
                    opacity: estiloAtual.opacity,
                    dashArray: estiloAtual.dashArray
                }).addTo(camadaMarcadores);

                linhaRota.on('mouseover', function () {
                    this.bringToFront();
                    this.setStyle({ weight: 8, opacity: 1 });
                });
                linhaRota.on('mouseout', function () {
                    this.setStyle({ weight: estiloAtual.weight, opacity: estiloAtual.opacity });
                });

                // ITEM 4: CALCULA O TEMPO ACUMULADO INDIVIDUAL DE CADA PARADA
                let tempoAcumuladoSegundos = 0;

                grupo.pontos.forEach((pt, idx) => {
                    const ordem = idx + 1;
                    const leg = rotaIda.legs[idx];
                    
                    if (leg) {
                        tempoAcumuladoSegundos += leg.duration;
                    }

                    let tempoParadaMin = Math.round(tempoAcumuladoSegundos / 60);
                    if (grupo.veiculo === 'Bicicleta') tempoParadaMin = Math.round(tempoParadaMin * 1.5);
                    
                    // Soma 5 min de atendimento por parada anterior
                    tempoParadaMin += (ordem * TEMPO_ATENDIMENTO_MIN);

                    const iconeVeiculo = grupo.veiculo === 'Bicicleta' ? '🚲' : '🏍️';

                    // ITEM 1: TROCADO "Motoboy" POR "Entregador" NO POPUP
                    L.marker([pt.lat, pt.lon], { icon: criarIconeColorido(grupo.cor, ordem) })
                        .addTo(camadaMarcadores)
                        .bindPopup(`
                            <div style="border-left: 4px solid ${grupo.cor}; padding-left: 8px;">
                                <b>📍 Parada nº ${ordem}:</b> ${pt.endereco}<br>
                                <b>${iconeVeiculo} Entregador:</b> <span style="color:${grupo.cor}; font-weight:bold;">${grupo.nome}</span> (${grupo.veiculo})<br>
                                <b>⏱️ Previsão de Chegada:</b> ~${tempoParadaMin} min<br>
                                <b>💳 Pagamento:</b> ${pt.pagamento}
                            </div>
                        `);
                });
            }

            if (dataVolta.routes && dataVolta.routes.length > 0) {
                tempoVoltaSegundos = dataVolta.routes[0].duration;
            }

            if (grupo.veiculo === 'Bicicleta') {
                tempoIdaSegundos *= 1.5;
                tempoVoltaSegundos *= 1.5;
            }

            const tempoEntregasMin = Math.round(tempoIdaSegundos / 60) + (grupo.pontos.length * TEMPO_ATENDIMENTO_MIN);
            const tempoVoltaApenasMin = Math.round(tempoVoltaSegundos / 60);
            const tempoTotalRetornoLojaMin = tempoEntregasMin + tempoVoltaApenasMin;

            dadosLegenda[eId] = {
                nome: grupo.nome,
                veiculo: grupo.veiculo,
                cor: grupo.cor,
                qtdEntregas: grupo.pontos.length,
                km: (distanciaIdaMetros / 1000).toFixed(1),
                tempoEntregasMin: tempoEntregasMin,
                tempoTotalRetornoLojaMin: tempoTotalRetornoLojaMin
            };

            indiceEntregador++;

        } catch (err) {
            console.error('Erro ao traçar rotas OSRM:', err);
        }
    }

    desenharLegendaMapa(dadosLegenda);
}

// 2. LEGENDA DA HOME (ITEM 1: "Entregador" em vez de "Motoboy")
function desenharLegendaMapa(dadosLegenda) {
    if (legendaControl) {
        mapaHome.removeControl(legendaControl);
    }

    const entregadoresAtivos = Object.values(dadosLegenda);
    if (entregadoresAtivos.length === 0) return;

    legendaControl = L.control({ position: 'bottomright' });

    legendaControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.style.backgroundColor = 'white';
        div.style.padding = '10px 14px';
        div.style.borderRadius = '8px';
        div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        div.style.fontSize = '0.85rem';

        let html = '<strong style="display:block; margin-bottom:6px; color:#1e3a8a;">🚴 Monitor de Entregadores</strong>';

        entregadoresAtivos.forEach(item => {
            const iconeVeiculo = item.veiculo === 'Bicicleta' ? '🚲' : '🏍️';
            html += `
                <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
                    <span style="background:${item.cor}; width:12px; height:12px; border-radius:50%; display:inline-block; margin-top:3px;"></span>
                    <div>
                        <b>${item.nome}</b> ${iconeVeiculo} <small style="color:#666;">(${item.qtdEntregas} p. | ${item.km} km)</small><br>
                        <span style="color:#059669; font-size:0.78rem;">📦 Conclusão das entregas: <b>~${item.tempoEntregasMin} min</b></span><br>
                        <span style="color:#4f46e5; font-size:0.78rem;">🏪 De volta à farmácia: <b>~${item.tempoTotalRetornoLojaMin} min</b></span>
                    </div>
                </div>
            `;
        });

        div.innerHTML = html;
        return div;
    };

    legendaControl.addTo(mapaHome);
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

    if (error) { alert('Erro: ' + error.message); } else { formEntregador.reset(); carregarEntregadores(); carregarMetricasHome(); }
});

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

        // Guarda o veículo no atributo data-veiculo
        seletorEntregador.innerHTML += `
            <option value="${entregador.id}" data-whatsapp="${entregador.whatsapp}" data-veiculo="${entregador.veiculo_padrao}">
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
    
    // ITEM 2: HERDA O VEÍCULO AUTOMATICAMENTE DO ENTREGADOR SELECIONADO
    const opcaoSelecionada = seletor.options[seletor.selectedIndex];
    const veiculo = opcaoSelecionada.getAttribute('data-veiculo') || 'Moto';

    // ITEM 3: TRATAMENTO DA FORMA DE PAGAMENTO E TROCO
    let pagamento = pagamentoSeletor.value;
    if (pagamento === 'Dinheiro' && trocoInput.value) {
        pagamento = `Dinheiro (Troco p/ R$ ${trocoInput.value})`;
    }

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
        }
        
        idEntregaEmEdicao = null;
        formEntrega.querySelector('button[type="submit"]').textContent = "Despachar Entrega";
        formEntrega.querySelector('button[type="submit"]').className = "btn-primary";
        
    } else {
        const { data: novaEntrega, error: errorEntrega } = await supabaseClient
            .from('entregas')
            .insert([{ 
                entregador_id: entregadorId, 
                endereco_destino: endereco, 
                veiculo_utilizado: veiculo, 
                forma_pagamento: pagamento, 
                status: 'Em Rota', 
                horario_saida: new Date().toISOString() 
            }])
            .select().single();

        if (errorEntrega) { alert('Erro ao despachar: ' + errorEntrega.message); return; }

        await supabaseClient.from('entregadores').update({ status: 'Em Rota' }).eq('id', entregadorId);
    }

    formEntrega.reset();
    groupTroco.classList.add('hidden');
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
                    <button onclick="prepararEdicao('${entrega.id}', '${entrega.endereco_destino}', '${entrega.entregador_id}', '${entrega.forma_pagamento}')" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;">Editar</button>
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

window.prepararEdicao = (id, endereco, entregadorId, pagamento) => {
    idEntregaEmEdicao = id;
    
    document.getElementById('endereco-entrega').value = endereco;
    seletorEntregador.value = entregadorId;

    if (pagamento.includes('Dinheiro')) {
        pagamentoSeletor.value = 'Dinheiro';
        groupTroco.classList.remove('hidden');
        const match = pagamento.match(/R\$\s*([\d.]+)/);
        if (match) trocoInput.value = match[1];
    } else {
        pagamentoSeletor.value = pagamento;
        groupTroco.classList.add('hidden');
    }

    const btnSubmit = formEntrega.querySelector('button[type="submit"]');
    btnSubmit.textContent = "Salvar Alterações";
    btnSubmit.className = "btn-success"; 
};

verificarSessao();