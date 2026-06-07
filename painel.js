// 1. Configurações do seu projeto Supabase
const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

// --- PROTETOR DE TELA E USUÁRIO ---
async function verificarSessao() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        // Se não tiver logado, expulsa para a tela de login
        window.location.href = 'index.html';
    } else {
        userEmailSpan.textContent = session.user.email;
        // Carrega os dados iniciais do banco
        carregarEntregadores();
        carregarEntregasAtivas();
    }
}

// Oculta/Exibe campo de autonomia se for Moto ou Bike
veiculoSeletor.addEventListener('change', () => {
    if (veiculoSeletor.value === 'Bicicleta') {
        groupAutonomia.classList.add('hidden');
    } else {
        groupAutonomia.classList.remove('hidden');
    }
});

// Botão Sair
btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

// --- OPERAÇÕES DE ENTREGADORES ---

// Cadastrar Entregador
formEntregador.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nome = document.getElementById('nome-entregador').value;
    const whatsapp = document.getElementById('whatsapp-entregador').value;
    const veiculo = document.getElementById('veiculo-entregador').value;
    const autonomia = document.getElementById('autonomia-moto').value;

    const { error } = await supabaseClient.from('entregadores').insert([
        { 
            nome: nome, 
            whatsapp: whatsapp, 
            veiculo_padrao: veiculo, 
            autonomia_moto: veiculo === 'Moto' ? parseFloat(autonomia) : 0 
        }
    ]);

    if (error) {
        alert('Erro ao cadastrar entregador: ' + error.message);
    } else {
        formEntregador.reset();
        carregarEntregadores();
    }
});

// Carregar Entregadores nas Tabelas e Seletores
async function carregarEntregadores() {
    const { data: entregadores, error } = await supabaseClient
        .from('entregadores')
        .select('*')
        .order('nome', { ascending: true });

    if (error) return console.error(error);

    // Limpa os campos antigos
    tabelaEntregadores.innerHTML = '';
    seletorEntregador.innerHTML = '<option value="">Selecione...</option>';

    entregadores.forEach(entregador => {
        // Preenche a tabela administrativa
        const classeStatus = entregador.status === 'Disponível' ? 'status-disponivel' : 'status-rota';
        tabelaEntregadores.innerHTML += `
            <tr>
                <td><strong>${entregador.nome}</strong></td>
                <td>${entregador.veiculo_padrao}</td>
                <td><span class="status-badge ${classeStatus}">${entregador.status}</span></td>
            </tr>
        `;

        // Preenche o seletor de entregas apenas se ele estiver Disponível
        if (entregador.status === 'Disponível') {
            seletorEntregador.innerHTML += `
                <option value="${entregador.id}" data-whatsapp="${entregador.whatsapp}">${entregador.nome} (${entregador.veiculo_padrao})</option>
            `;
        }
    });
}

// --- OPERAÇÕES DE ENTREGAS ---

// Despachar Entrega
formEntrega.addEventListener('submit', async (e) => {
    e.preventDefault();

    const endereco = document.getElementById('endereco-entrega').value;
    const seletor = document.getElementById('seletor-entregador');
    const entregadorId = seletor.value;
    const whatsappEntregador = seletor.options[seletor.selectedIndex].getAttribute('data-whatsapp');
    const veiculo = document.getElementById('veiculo-entrega').value;
    const pagamento = document.getElementById('pagamento-entrega').value;

    // 1. Cria a entrega no banco de dados com status 'Em Rota'
    const { data: novaEntrega, error: errorEntrega } = await supabaseClient
        .from('entregas')
        .insert([
            {
                entregador_id: entregadorId,
                endereco_destino: endereco,
                veiculo_utilizado: veiculo,
                forma_pagamento: pagamento,
                status: 'Em Rota',
                horario_saida: new Date().toISOString()
            }
        ])
        .select()
        .single();

    if (errorEntrega) {
        alert('Erro ao despachar entrega: ' + errorEntrega.message);
        return;
    }

    // 2. Atualiza o status do entregador para 'Em Rota'
    await supabaseClient
        .from('entregadores')
        .update({ status: 'Em Rota' })
        .eq('id', entregadorId);

    // 3. Monta o link que o entregador vai clicar (apontando para a futura tela mobile)
    // Usamos o endereço do próprio Live Server para o teste local
    const linkEntregador = `http://127.0.0.1:5500/entrega.html?id=${novaEntrega.id}`;

    // 4. Monta o texto do WhatsApp com quebras de linha corretas (%0A)
    const textoMensagem = `*NOVA ENTREGA FARLOG* 🏍️💨%0A%0A` +
                          `📍 *Destino:* ${endereco}%0A` +
                          `💳 *Pagamento:* ${pagamento}%0A` +
                          `🚲 *Veículo:* ${veiculo}%0A%0A` +
                          `👉 Clique no link abaixo para aceitar e atualizar o status:%0A` +
                          `${linkEntregador}`;

    // 5. Dispara o WhatsApp Web
    window.open(`https://web.whatsapp.com/send?phone=${whatsappEntregador}&text=${textoMensagem}`, '_blank');

    // Reseta o formulário e atualiza o painel
    formEntrega.reset();
    carregarEntregadores();
    carregarEntregasAtivas();
});

// Carregar Monitor de Entregas Ativas
async function carregarEntregasAtivas() {
    const { data: entregas, error } = await supabaseClient
        .from('entregas')
        .select(`
            id,
            endereco_destino,
            forma_pagamento,
            status,
            entregadores ( nome )
        `)
        .eq('status', 'Em Rota');

    if (error) return console.error(error);

    tabelaEntregasAtivas.innerHTML = '';
    
    entregas.forEach(entrega => {
        tabelaEntregasAtivas.innerHTML += `
            <tr>
                <td>${entrega.endereco_destino}</td>
                <td>${entrega.entregadores ? entrega.entregadores.nome : 'Não Atribuído'}</td>
                <td>${entrega.forma_pagamento}</td>
                <td><span class="status-badge status-rota">${entrega.status}</span></td>
            </tr>
        `;
    });
}

// Executa a proteção de sessão logo ao entrar na página
verificarSessao();