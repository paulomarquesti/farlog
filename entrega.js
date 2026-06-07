const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Pega o ID da entrega direto da URL (?id=xxxx-xxxx-xxxx)
const urlParams = new URLSearchParams(window.location.search);
const entregaId = urlParams.get('id');

// Elementos da tela
const loadingDiv = document.getElementById('loading');
const conteudoDiv = document.getElementById('conteudo-entrega');
const txtEndereco = document.getElementById('txt-endereco');
const txtPagamento = document.getElementById('txt-pagamento');
const btnCheguei = document.getElementById('btn-cheguei');
const btnConcluido = document.getElementById('btn-concluido');
const feedbackSucesso = document.getElementById('feedback-sucesso');

let entregaDados = null;

async function buscarDadosEntrega() {
    if (!entregaId) {
        loadingDiv.textContent = "Erro: Nenhuma entrega foi selecionada.";
        return;
    }

    // Busca os dados da entrega atual no Supabase
    const { data: entrega, error } = await supabaseClient
        .from('entregas')
        .select('*')
        .eq('id', entregaId)
        .single();

    if (error || !entrega) {
        loadingDiv.textContent = "Entrega não encontrada ou já arquivada.";
        return;
    }

    entregaDados = entrega;

    // Se a entrega já foi finalizada antes, pula direto pro sucesso
    if (entrega.status === 'Entregue') {
        mostrarSucesso();
        return;
    }

    // Preenche a tela do entregador
    txtEndereco.textContent = entrega.endereco_destino;
    txtPagamento.textContent = entrega.forma_pagamento;

    // Controla quais botões aparecem com base no estado salvo
    if (entrega.status === 'Pendente') {
        // Se mudou o fluxo, ajusta botões
        btnCheguei.classList.remove('hidden');
    }

    loadingDiv.classList.add('hidden');
    conteudoDiv.classList.remove('hidden');
}

// Clique no botão "Cheguei ao Local" (Check-in opcional para auditoria de tempo)
btnCheguei.addEventListener('click', async () => {
    btnCheguei.classList.add('hidden');
    btnConcluido.classList.remove('hidden');
    // Aqui você poderia registrar no banco o momento exato que ele estacionou a moto
});

// Clique no botão definitivo "Finalizar Entrega"
btnConcluido.addEventListener('click', async () => {
    btnConcluido.classList.add('hidden');

    // 1. Atualiza o status da entrega para 'Entregue' e joga o horário final
    await supabaseClient
        .from('entregas')
        .update({ 
            status: 'Entregue',
            horario_entrega: new Date().toISOString()
        })
        .eq('id', entregaId);

    // 2. Libera o entregador no banco, mudando ele de volta para 'Disponível'
    await supabaseClient
        .from('entregadores')
        .update({ status: 'Disponível' })
        .eq('id', entregaDados.entregador_id);

    mostrarSucesso();
});

function mostrarSucesso() {
    loadingDiv.classList.add('hidden');
    conteudoDiv.classList.remove('hidden');
    txtEndereco.parentElement.classList.add('hidden'); // Esconde caixa de info
    btnCheguei.classList.add('hidden');
    btnConcluido.classList.add('hidden');
    feedbackSucesso.classList.remove('hidden');
}

// Inicia o processo de busca
buscarDadosEntrega();