// 1. Configurações do seu projeto Supabase
const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CONFIGURAÇÕES OPERACIONAIS
const CIDADE_PADRAO = "Rio de Janeiro, RJ, Brasil"; 
const TEMPO_ATENDIMENTO_MIN = 5;

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
const formEntrega = document.getElementById('form-entrega');
const tabelaEntregasAtivas = document.getElementById('tabela-entregas-ativas');
const tabelaPedidosPendentes = document.getElementById('tabela-pedidos-pendentes');
const veiculoSeletor = document.getElementById('veiculo-entregador');
const groupAutonomia = document.getElementById('group-autonomia');

const pagamentoSeletor = document.getElementById('pagamento-entrega');
const groupTroco = document.getElementById('group-troco');
const trocoInput = document.getElementById('troco-para');

let mapaHome = null;
let camadaMarcadores = null;
let legendaControl = null;
let idEntregaEmEdicao = null;
let listaEntregadoresCache = [];

// --- PROTETOR DE TELA E USUÁRIO ---
async function verificarSessao() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
    } else {
        userEmailSpan.textContent = session.user.email;
        await carregarEntregadores();
        carregarFilaEEntregas();
        carregarMetricasHome();
        carregarDashboardMetricas();
        inicializarMapa();
    }
}

if (veiculoSeletor) {
    veiculoSeletor.addEventListener('change', () => {
        if (veiculoSeletor.value === 'Bicicleta') {
            groupAutonomia.classList.add('hidden');
        } else {
            groupAutonomia.classList.remove('hidden');
        }
    });
}

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
            .gte('created_at', inicioHoje.toISOString());

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

// Formata exibição visual completa do endereço
function formatarEnderecoCompleto(entrega) {
    if (entrega.logradouro) {
        const comp = entrega.complemento ? ` - ${entrega.complemento}` : '';
        return `${entrega.logradouro}, ${entrega.numero || 'S/N'}${comp}, ${entrega.bairro || ''}`;
    }
    return entrega.endereco_destino || 'Endereço não informado';
}

// Monta query limpa para busca no mapa (sem complementos que quebram a busca)
function obterQueryBuscaMapa(entrega) {
    if (entrega.logradouro) {
        return `${entrega.logradouro}, ${entrega.numero || ''}, ${entrega.bairro || ''}, ${entrega.cidade || 'Rio de Janeiro'}`;
    }
    return entrega.endereco_destino
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

// --- LÓGICA DO MAPA ---
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
        .select('id, endereco_destino, logradouro, numero, complemento, bairro, cidade, nome_cliente, forma_pagamento, entregador_id, veiculo_utilizado, entregadores(nome, veiculo_padrao)')
        .eq('status', 'Em Rota');

    if (error) return console.error('Erro ao buscar rotas para o mapa:', error);

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    const entregasPorEntregador = {};

    for (const entrega of entregasAtivas) {
        try {
            const buscaCompleta = obterQueryBuscaMapa(entrega);

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
                    endereco: formatarEnderecoCompleto(entrega),
                    cliente: entrega.nome_cliente,
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

                let tempoAcumuladoSegundos = 0;

                grupo.pontos.forEach((pt, idx) => {
                    const ordem = idx + 1;
                    const leg = rotaIda.legs[idx];
                    
                    if (leg) {
                        tempoAcumuladoSegundos += leg.duration;
                    }

                    let tempoParadaMin = Math.round(tempoAcumuladoSegundos / 60);
                    if (grupo.veiculo === 'Bicicleta') tempoParadaMin = Math.round(tempoParadaMin * 1.5);
                    
                    tempoParadaMin += (ordem * TEMPO_ATENDIMENTO_MIN);

                    const iconeVeiculo = grupo.veiculo === 'Bicicleta' ? '🚲' : '🏍️';
                    const clienteTxt = pt.cliente ? `<b>👤 Cliente:</b> ${pt.cliente}<br>` : '';

                    L.marker([pt.lat, pt.lon], { icon: criarIconeColorido(grupo.cor, ordem) })
                        .addTo(camadaMarcadores)
                        .bindPopup(`
                            <div style="border-left: 4px solid ${grupo.cor}; padding-left: 8px;">
                                <b>📍 Parada nº ${ordem}:</b> ${pt.endereco}<br>
                                ${clienteTxt}
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

// --- CARREGAR E GERENCIAR ENTREGADORES ---
formEntregador.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('nome-entregador').value;
    const whatsapp = document.getElementById('whatsapp-entregador').value;
    const veiculo = document.getElementById('veiculo-entregador').value;
    const autonomia = document.getElementById('autonomia-moto').value;

    const { error } = await supabaseClient.from('entregadores').insert([
        { nome, whatsapp, veiculo_padrao: veiculo, autonomia_moto: veiculo === 'Moto' ? parseFloat(autonomia) : 0 }
    ]);

    if (error) { alert('Erro: ' + error.message); } else { formEntregador.reset(); await carregarEntregadores(); carregarMetricasHome(); }
});

async function carregarEntregadores() {
    const { data: entregadores, error } = await supabaseClient.from('entregadores').select('*').order('nome', { ascending: true });
    if (error) return console.error(error);

    listaEntregadoresCache = entregadores || [];

    tabelaEntregadores.innerHTML = '';

    listaEntregadoresCache.forEach(entregador => {
        const classeStatus = entregador.status === 'Disponível' ? 'status-disponivel' : 'status-rota';
        
        tabelaEntregadores.innerHTML += `
            <tr>
                <td><strong>${entregador.nome}</strong></td>
                <td>${entregador.veiculo_padrao}</td>
                <td><span class="status-badge ${classeStatus}">${entregador.status}</span></td>
            </tr>
        `;
    });
}

// --- SALVA PEDIDO DIRETO NA FILA PENDENTE COM CAMPOS NORMALIZADOS ---
formEntrega.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome_cliente = document.getElementById('nome-cliente').value.trim();
    const telefone_cliente = document.getElementById('telefone-cliente').value.trim();
    const logradouro = document.getElementById('logradouro-entrega').value.trim();
    const numero = document.getElementById('numero-entrega').value.trim();
    const complemento = document.getElementById('complemento-entrega').value.trim();
    const bairro = document.getElementById('bairro-entrega').value.trim();
    const cep = document.getElementById('cep-entrega').value.trim();

    // Mantém endereco_destino montado para compatibilidade total
    const compTexto = complemento ? ` - ${complemento}` : '';
    const endereco_destino = `${logradouro}, ${numero}${compTexto}, ${bairro}`;

    let pagamento = pagamentoSeletor.value;
    if (pagamento === 'Dinheiro' && trocoInput.value) {
        pagamento = `Dinheiro (Troco p/ R$ ${trocoInput.value})`;
    }

    const payload = {
        nome_cliente: nome_cliente || null,
        telefone_cliente: telefone_cliente || null,
        logradouro,
        numero,
        complemento: complemento || null,
        bairro,
        cidade: 'Rio de Janeiro',
        cep: cep || null,
        endereco_destino,
        forma_pagamento: pagamento,
        status: 'Pendente',
        created_at: new Date().toISOString()
    };

    if (idEntregaEmEdicao) {
        const { error } = await supabaseClient
            .from('entregas')
            .update(payload)
            .eq('id', idEntregaEmEdicao);

        if (error) { alert('Erro ao atualizar: ' + error.message); return; }
        
        idEntregaEmEdicao = null;
        formEntrega.querySelector('button[type="submit"]').textContent = "➕ Salvar Pedido na Fila";
        
    } else {
        const { error: errorEntrega } = await supabaseClient.from('entregas').insert([payload]);

        if (errorEntrega) { alert('Erro ao cadastrar pedido: ' + errorEntrega.message); return; }
    }

    formEntrega.reset();
    groupTroco.classList.add('hidden');
    carregarFilaEEntregas();
    carregarMetricasHome();
});

// --- CARREGAR TABELAS COM BADGES COLORIDOS E ESPAÇAMENTO ---
async function carregarFilaEEntregas() {
    function formatarBadgePagamento(pagamento) {
        if (!pagamento) return '<span class="badge-pay">--</span>';
        if (pagamento.includes('Pix')) return `<span class="badge-pay badge-pix">💸 ${pagamento}</span>`;
        if (pagamento.includes('Dinheiro')) return `<span class="badge-pay badge-money">💵 ${pagamento}</span>`;
        return `<span class="badge-pay badge-card">💳 ${pagamento}</span>`;
    }

    // 1. CARREGAR FILA DE PENDENTES
    const { data: pendentes } = await supabaseClient
        .from('entregas')
        .select('*')
        .eq('status', 'Pendente')
        .order('created_at', { ascending: true });

    tabelaPedidosPendentes.innerHTML = '';
    const elCountPendentes = document.getElementById('count-pendentes');
    if (elCountPendentes) elCountPendentes.textContent = pendentes ? pendentes.length : 0;

    if (pendentes && pendentes.length > 0) {
        pendentes.forEach(p => {
            const horaFormatada = p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const enderecoFormatado = formatarEnderecoCompleto(p);
            const clienteInfo = p.nome_cliente ? `<br><small style="color:#64748b;">👤 ${p.nome_cliente}</small>` : '';

            let optionsEntregadores = '<option value="">Escolha um Entregador...</option>';
            listaEntregadoresCache.forEach(ent => {
                optionsEntregadores += `<option value="${ent.id}" data-veiculo="${ent.veiculo_padrao}">${ent.nome} (${ent.veiculo_padrao})</option>`;
            });

            tabelaPedidosPendentes.innerHTML += `
                <tr>
                    <td><strong>${enderecoFormatado}</strong>${clienteInfo}</td>
                    <td>${formatarBadgePagamento(p.forma_pagamento)}</td>
                    <td><span class="badge-time">⏰ ${horaFormatada}</span></td>
                    <td>
                        <select id="select-despacho-${p.id}" class="select-inline">${optionsEntregadores}</select>
                    </td>
                    <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 8px; justify-content: flex-end;">
                            <button onclick="despacharPedidoPendente('${p.id}')" class="btn-sm btn-primary-sm">Despachar</button>
                            <button onclick="cancelarEntrega('${p.id}', null)" class="btn-sm btn-danger-sm">Cancelar</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    } else {
        tabelaPedidosPendentes.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 20px;">Nenhum pedido aguardando na fila.</td></tr>`;
    }

    // 2. CARREGAR ENTREGAS EM ROTA
    const { data: emRota } = await supabaseClient
        .from('entregas')
        .select(`id, endereco_destino, logradouro, numero, complemento, bairro, nome_cliente, forma_pagamento, status, entregador_id, veiculo_utilizado, entregadores ( nome )`)
        .eq('status', 'Em Rota');

    tabelaEntregasAtivas.innerHTML = '';
    const elCountEmRota = document.getElementById('count-em-rota');
    if (elCountEmRota) elCountEmRota.textContent = emRota ? emRota.length : 0;

    if (emRota && emRota.length > 0) {
        emRota.forEach(entrega => {
            const enderecoFormatado = formatarEnderecoCompleto(entrega);
            const clienteInfo = entrega.nome_cliente ? `<br><small style="color:#64748b;">👤 ${entrega.nome_cliente}</small>` : '';

            tabelaEntregasAtivas.innerHTML += `
                <tr>
                    <td><strong>${enderecoFormatado}</strong>${clienteInfo}</td>
                    <td><strong>${entrega.entregadores ? entrega.entregadores.nome : 'Sem Nome'}</strong></td>
                    <td>${formatarBadgePagamento(entrega.forma_pagamento)}</td>
                    <td style="text-align: right;">
                        <button onclick="forcarFinalizar('${entrega.id}', '${entrega.entregador_id}')" class="btn-sm btn-success-sm" style="margin-right: 4px;">Concluir</button>
                        <button onclick="cancelarEntrega('${entrega.id}', '${entrega.entregador_id}')" class="btn-sm btn-danger-sm">Cancelar</button>
                    </td>
                </tr>
            `;
        });
    } else {
        tabelaEntregasAtivas.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 20px;">Nenhuma entrega em rota no momento.</td></tr>`;
    }
}

// --- DESPACHA PEDIDO DA FILA PARA O ENTREGADOR ---
window.despacharPedidoPendente = async (pedidoId) => {
    const seletor = document.getElementById(`select-despacho-${pedidoId}`);
    const entregadorId = seletor.value;

    if (!entregadorId) {
        alert("Por favor, selecione qual entregador vai levar esse pedido!");
        return;
    }

    const opcaoSelecionada = seletor.options[seletor.selectedIndex];
    const veiculo = opcaoSelecionada.getAttribute('data-veiculo') || 'Moto';

    const { error } = await supabaseClient
        .from('entregas')
        .update({
            entregador_id: entregadorId,
            veiculo_utilizado: veiculo,
            status: 'Em Rota',
            horario_saida: new Date().toISOString()
        })
        .eq('id', pedidoId);

    if (error) {
        alert("Erro ao despachar pedido: " + error.message);
        return;
    }

    await supabaseClient.from('entregadores').update({ status: 'Em Rota' }).eq('id', entregadorId);

    await carregarEntregadores();
    carregarFilaEEntregas();
    carregarMetricasHome();
    inicializarMapa();
};

async function checarELiberarEntregador(entregadorId) {
    if (!entregadorId) return;

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
    
    await carregarEntregadores();
    carregarFilaEEntregas();
    carregarMetricasHome();
    carregarDashboardMetricas();
    inicializarMapa();
};

window.cancelarEntrega = async (entregaId, entregadorId) => {
    if(!confirm("Tem certeza que deseja CANCELAR essa entrega?")) return;
    
    await supabaseClient.from('entregas').update({ status: 'Cancelado' }).eq('id', entregaId);
    if (entregadorId) await checarELiberarEntregador(entregadorId);
    
    await carregarEntregadores();
    carregarFilaEEntregas();
    carregarMetricasHome();
    carregarDashboardMetricas();
    inicializarMapa();
};

// --- SIMULADOR RÁPIDO DE TEMPO ---
const btnSimular = document.getElementById('btn-simular');
const inputSimular = document.getElementById('simular-endereco');
const divResultado = document.getElementById('resultado-simulacao');

if (btnSimular) {
    btnSimular.addEventListener('click', async () => {
        const endereco = inputSimular.value.trim();
        if (!endereco) {
            alert('Digite um endereço para simular!');
            return;
        }

        btnSimular.textContent = 'Calculando...';
        btnSimular.disabled = true;

        try {
            const enderecoTratado = endereco
                .replace(/(apto|apt|apartamento|bloco|bl|casa|fundos|sobrado|loja|prox|próximo|ao lado).*/gi, '')
                .replace(/-.*/g, '')
                .trim();
            const busca = `${enderecoTratado}, ${CIDADE_PADRAO}`;
            
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(busca)}`);
            const data = await resp.json();

            if (!data || data.length === 0) {
                alert('Endereço não encontrado no mapa.');
                return;
            }

            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);

            const url = `https://router.project-osrm.org/route/v1/driving/${LNG_FARMACIA},${LAT_FARMACIA};${lon},${lat}?overview=false`;
            const respRota = await fetch(url);
            const dataRota = await respRota.json();

            if (!dataRota.routes || dataRota.routes.length === 0) {
                alert('Não foi possível calcular a rota para este endereço.');
                return;
            }

            const distanciaKm = (dataRota.routes[0].distance / 1000).toFixed(1);
            const tempoTrajetoMin = Math.round(dataRota.routes[0].duration / 60);

            const { count: qtdPendentes } = await supabaseClient
                .from('entregas')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Pendente');

            const { count: qtdEmRota } = await supabaseClient
                .from('entregas')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Em Rota');

            const totalPedidosFila = (qtdPendentes || 0) + (qtdEmRota || 0);
            const qtdEntregadoresDisponiveis = Math.max(listaEntregadoresCache.length, 1);
            const tempoEsperaFilaMin = Math.round((totalPedidosFila * 12) / qtdEntregadoresDisponiveis);

            const tempoTotalEst = tempoTrajetoMin + TEMPO_ATENDIMENTO_MIN + tempoEsperaFilaMin;

            divResultado.style.display = 'block';
            divResultado.innerHTML = `
                <strong>📍 Estimativa para o Cliente:</strong><br>
                • Distância da farmácia: <strong>${distanciaKm} km</strong><br>
                • Tempo de deslocamento direto: <strong>~${tempoTrajetoMin} min</strong><br>
                • Pedidos na fila atual: <strong>${totalPedidosFila} pedido(s)</strong> (Espera est.: ~${tempoEsperaFilaMin} min)<br>
                • <span style="font-size:0.95rem; color:#15803d;"><strong>⏱️ Previsão Total de Entrega: ~${tempoTotalEst} min</strong></span>
            `;

        } catch (err) {
            console.error(err);
            alert('Erro ao realizar simulação.');
        } finally {
            btnSimular.textContent = 'Simular Tempo';
            btnSimular.disabled = false;
        }
    });
}

// --- DASHBOARD E KPIS ---
async function carregarDashboardMetricas() {
    try {
        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);

        const { data: entregasHoje, error } = await supabaseClient
            .from('entregas')
            .select(`
                id, 
                status, 
                created_at, 
                horario_saida, 
                horario_entrega, 
                forma_pagamento, 
                entregador_id, 
                entregadores ( nome, veiculo_padrao )
            `)
            .gte('created_at', inicioHoje.toISOString());

        if (error) throw error;

        const concluidas = entregasHoje.filter(e => e.status === 'Entregue');

        const elTotal = document.getElementById('kpi-total-concluidas');
        if (elTotal) elTotal.textContent = concluidas.length;

        let somaMinutosGeral = 0;
        let qtdComHorario = 0;

        concluidas.forEach(e => {
            if (e.created_at && e.horario_entrega) {
                const inicio = new Date(e.created_at);
                const fim = new Date(e.horario_entrega);
                const diffMinutos = Math.max(0, Math.round((fim - inicio) / (1000 * 60)));
                somaMinutosGeral += diffMinutos;
                qtdComHorario++;
            }
        });

        const tempoMedioGeral = qtdComHorario > 0 ? Math.round(somaMinutosGeral / qtdComHorario) : 0;
        const elTempo = document.getElementById('kpi-tempo-medio');
        if (elTempo) elTempo.textContent = `${tempoMedioGeral} min`;

        const statsEntregadores = {};
        const contagemPagamentos = { Pix: 0, Cartao: 0, Dinheiro: 0 };

        concluidas.forEach(e => {
            const eId = e.entregador_id || 'sem_id';
            const nomeNome = e.entregadores ? e.entregadores.nome : 'Não informado';
            const veiculo = e.entregadores ? e.entregadores.veiculo_padrao : 'Moto';

            if (!statsEntregadores[eId]) {
                statsEntregadores[eId] = { nome: nomeNome, veiculo: veiculo, total: 0, somaMinutosRota: 0, qtdRotas: 0 };
            }

            statsEntregadores[eId].total += 1;

            if (e.horario_saida && e.horario_entrega) {
                const tempoRota = Math.max(0, Math.round((new Date(e.horario_entrega) - new Date(e.horario_saida)) / (1000 * 60)));
                statsEntregadores[eId].somaMinutosRota += tempoRota;
                statsEntregadores[eId].qtdRotas += 1;
            }

            const pag = e.forma_pagamento || '';
            if (pag.includes('Pix')) contagemPagamentos.Pix++;
            else if (pag.includes('Dinheiro')) contagemPagamentos.Dinheiro++;
            else contagemPagamentos.Cartao++;
        });

        let melhorEntregador = null;
        let maxEntregas = -1;

        Object.values(statsEntregadores).forEach(ent => {
            if (ent.total > maxEntregas) {
                maxEntregas = ent.total;
                melhorEntregador = ent;
            }
        });

        const elDestaque = document.getElementById('kpi-entregador-destaque');
        const elQtd = document.getElementById('kpi-entregador-qtd');

        if (elDestaque && elQtd) {
            if (melhorEntregador && maxEntregas > 0) {
                elDestaque.textContent = melhorEntregador.nome;
                elQtd.textContent = `${melhorEntregador.total} entrega(s) realizadas hoje`;
            } else {
                elDestaque.textContent = '--';
                elQtd.textContent = 'Nenhuma entrega finalizada';
            }
        }

        const tbodyRanking = document.getElementById('tabela-ranking-entregadores');
        if (tbodyRanking) {
            tbodyRanking.innerHTML = '';
            const listaOrdenada = Object.values(statsEntregadores).sort((a, b) => b.total - a.total);

            if (listaOrdenada.length > 0) {
                listaOrdenada.forEach(ent => {
                    const mediaRota = ent.qtdRotas > 0 ? Math.round(ent.somaMinutosRota / ent.qtdRotas) : 0;
                    tbodyRanking.innerHTML += `
                        <tr>
                            <td><strong>${ent.nome}</strong></td>
                            <td>${ent.veiculo === 'Bicicleta' ? '🚲' : '🏍️'} ${ent.veiculo}</td>
                            <td style="text-align: center;"><span class="badge-time">${ent.total}</span></td>
                            <td style="text-align: right;"><strong>~${mediaRota} min</strong></td>
                        </tr>
                    `;
                });
            } else {
                tbodyRanking.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 15px;">Sem dados de entregas concluídas hoje.</td></tr>`;
            }
        }

        const divPagamentos = document.getElementById('resumo-pagamentos');
        if (divPagamentos) {
            const totalPagos = concluidas.length || 1;
            divPagamentos.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                        <span>💸 Pix</span>
                        <strong>${contagemPagamentos.Pix} (${Math.round((contagemPagamentos.Pix / totalPagos) * 100)}%)</strong>
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                        <span>💳 Cartão</span>
                        <strong>${contagemPagamentos.Cartao} (${Math.round((contagemPagamentos.Cartao / totalPagos) * 100)}%)</strong>
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                        <span>💵 Dinheiro</span>
                        <strong>${contagemPagamentos.Dinheiro} (${Math.round((contagemPagamentos.Dinheiro / totalPagos) * 100)}%)</strong>
                    </div>
                </div>
            `;
        }

    } catch (err) {
        console.error('Erro ao carregar métricas:', err);
    }
}

// Inicializa a aplicação
verificarSessao();