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

// Variável de controle para saber se estamos editando uma entrega
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
        if (entregador.status === 'Disponível') {
            seletorEntregador.innerHTML += `
                <option value="${entregador.id}" data-whatsapp="${entregador.whatsapp}">${entregador.nome} (${entregador.veiculo_padrao})</option>
            `;
        }
    });
}

// --- OPERAÇÕES DE ENTREGAS (DESPACHO, EDIÇÃO, CANCELAMENTO) ---

formEntrega.addEventListener('submit', async (e) => {
    e.preventDefault();

    const endereco = document.getElementById('endereco-entrega').value;
    const seletor = document.getElementById('seletor-entregador');
    const entregadorId = seletor.value;
    const veiculo = document.getElementById('veiculo-entrega').value;
    const pagamento = document.getElementById('pagamento-entrega').value;

    if (idEntregaEmEdicao) {
        // --- MODO EDIÇÃO ---
        
        // Antes de atualizar, buscamos quem era o entregador antigo no banco
        const { data: entregaAntiga } = await supabaseClient
            .from('entregas')
            .select('entregador_id')
            .eq('id', idEntregaEmEdicao)
            .single();

        // Atualiza a entrega com os novos dados
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
        
        // Se o entregador mudou, precisamos fazer a troca de status e mandar o WhatsApp
        if (entregaAntiga && entregaAntiga.entregador_id !== entregadorId) {
            // 1. Libera o entregador antigo
            await supabaseClient.from('entregadores').update({ status: 'Disponível' }).eq('id', entregaAntiga.entregador_id);
            
            // 2. Ocupa o entregador novo
            await supabaseClient.from('entregadores').update({ status: 'Em Rota' }).eq('id', entregadorId);
            
            // 3. Dispara o WhatsApp para o novo entregador
            const whatsappEntregador = seletor.options[seletor.selectedIndex].getAttribute('data-whatsapp');
            const linkEntregador = `http://127.0.0.1:5500/entrega.html?id=${idEntregaEmEdicao}`;
            const textoMensagem = `*ENTREGA ATUALIZADA / REDIRECIONADA FARLOG*%0A%0A📍 *Destino:* ${endereco}%0A💳 *Pagamento:* ${pagamento}%0A%0A👉 Novo Link:%0A${linkEntregador}`;
            window.open(`https://web.whatsapp.com/send?phone=${whatsappEntregador}&text=${textoMensagem}`, '_blank');
        }
        
        // Reseta o estado de edição
        idEntregaEmEdicao = null;
        formEntrega.querySelector('button[type="submit"]').textContent = "Despachar e Enviar WhatsApp";
        formEntrega.querySelector('button[type="submit"]').className = "btn-primary";
        
    } else {
        // --- MODO NOVO DESPACHO (Continua igual) ---
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
});

async function carregarEntregasAtivas() {
    const { data: entregas, error } = await supabaseClient
        .from('entregas')
        .select(`id, endereco_destino, forma_pagamento, status, entregador_id, veiculo_utilizado, entregadores ( nome )`)
        .eq('status', 'Em Rota');

    if (error) return console.error(error);
    tabelaEntregasAtivas.innerHTML = '';
    
    entregas.forEach(entrega => {
        // Criamos os botões com funções onclick passando o ID da entrega e do entregador
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

// --- FUNÇÕES DE AÇÃO DA TABELA (GLOBAIS PARA O HTML ENXERGAR) ---

window.forcarFinalizar = async (entregaId, entregadorId) => {
    if(!confirm("Deseja mesmo finalizar essa entrega pelo balcão?")) return;
    
    await supabaseClient.from('entregas').update({ status: 'Entregue', horario_entrega: new Date().toISOString() }).eq('id', entregaId);
    await supabaseClient.from('entregadores').update({ status: 'Disponível' }).eq('id', entregadorId);
    
    carregarEntregadores();
    carregarEntregasAtivas();
};

window.cancelarEntrega = async (entregaId, entregadorId) => {
    if(!confirm("Tem certeza que deseja CANCELAR essa entrega? O motoboy ficará livre.")) return;
    
    await supabaseClient.from('entregas').update({ status: 'Cancelado' }).eq('id', entregaId);
    await supabaseClient.from('entregadores').update({ status: 'Disponível' }).eq('id', entregadorId);
    
    carregarEntregadores();
    carregarEntregasAtivas();
};

window.prepararEdicao = (id, endereco, entregadorId, veiculo, pagamento) => {
    idEntregaEmEdicao = id;
    
    // Alimenta o formulário com os dados atuais
    document.getElementById('endereco-entrega').value = endereco;
    document.getElementById('veiculo-entrega').value = veiculo;
    document.getElementById('pagamento-entrega').value = pagamento;
    
    // Força a exibição do entregador atual no seletor (mesmo ele estando ocupado)
    seletorEntregador.innerHTML += `<option value="${entregadorId}" selected>Mantido na edição</option>`;

    // Transforma o botão visualmente para modo de salvamento
    const btnSubmit = formEntrega.querySelector('button[type="submit"]');
    btnSubmit.textContent = "Salvar Alterações";
    btnSubmit.className = "btn-success"; 
};

verificarSessao();