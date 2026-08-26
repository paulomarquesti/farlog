const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Pega o ID da entrega da URL (?id=xxxx)
const urlParams = new URLSearchParams(window.location.search);
const entregaId = urlParams.get('id');

// Elementos da interface
const loadingDiv = document.getElementById('loading');
const conteudoDiv = document.getElementById('conteudo-entrega');
const txtCliente = document.getElementById('txt-cliente');
const boxCliente = document.getElementById('box-cliente');
const boxTelefone = document.getElementById('box-telefone');
const linkTelefone = document.getElementById('link-telefone');
const txtTelefone = document.getElementById('txt-telefone');

const txtEndereco = document.getElementById('txt-endereco');
const boxComplemento = document.getElementById('box-complemento');
const txtComplemento = document.getElementById('txt-complemento');
const txtPagamento = document.getElementById('txt-pagamento');

const btnCheguei = document.getElementById('btn-cheguei');
const btnConcluido = document.getElementById('btn-concluido');
const feedbackSucesso = document.getElementById('feedback-sucesso');

let entregaDados = null;

function formatarEndereco(entrega) {
    if (entrega.logradouro) {
        return `${entrega.logradouro}, ${entrega.numero || 'S/N'} - ${entrega.bairro || ''}`;
    }
    return entrega.endereco_destino || 'Endereço não informado';
}

async function buscarDadosEntrega() {
    if (!entregaId) {
        loadingDiv.textContent = "Erro: Nenhuma entrega selecionada.";
        return;
    }

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

    if (entrega.status === 'Entregue') {
        mostrarSucesso();
        return;
    }

    // Preenche cliente e telefone
    if (entrega.nome_cliente) {
        txtCliente.textContent = entrega.nome_cliente;
        boxCliente.classList.remove('hidden');
    }

    if (entrega.telefone_cliente) {
        const telLimpo = entrega.telefone_cliente.replace(/\D/g, '');
        linkTelefone.href = `https://wa.me/55${telLimpo}`;
        txtTelefone.textContent = `Chamar no WhatsApp (${entrega.telefone_cliente})`;
        boxTelefone.classList.remove('hidden');
    }

    // Preenche endereço e complemento
    txtEndereco.textContent = formatarEndereco(entrega);

    if (entrega.complemento) {
        txtComplemento.textContent = entrega.complemento;
        boxComplemento.classList.remove('hidden');
    }

    txtPagamento.textContent = entrega.forma_pagamento || 'Não informado';

    loadingDiv.classList.add('hidden');
    conteudoDiv.classList.remove('hidden');
}

btnCheguei.addEventListener('click', async () => {
    btnCheguei.classList.add('hidden');
    btnConcluido.classList.remove('hidden');
});

btnConcluido.addEventListener('click', async () => {
    btnConcluido.classList.add('hidden');

    // 1. Marca como Entregue
    await supabaseClient
        .from('entregas')
        .update({ 
            status: 'Entregue',
            horario_entrega: new Date().toISOString()
        })
        .eq('id', entregaId);

    // 2. Libera o entregador se ele não tiver outros pedidos em rota
    if (entregaDados.entregador_id) {
        const { data: restantes } = await supabaseClient
            .from('entregas')
            .select('id')
            .eq('entregador_id', entregaDados.entregador_id)
            .eq('status', 'Em Rota');

        if (!restantes || restantes.length === 0) {
            await supabaseClient
                .from('entregadores')
                .update({ status: 'Disponível' })
                .eq('id', entregaDados.entregador_id);
        }
    }

    mostrarSucesso();
});

function mostrarSucesso() {
    loadingDiv.classList.add('hidden');
    conteudoDiv.classList.remove('hidden');
    txtEndereco.parentElement.classList.add('hidden');
    btnCheguei.classList.add('hidden');
    btnConcluido.classList.add('hidden');
    feedbackSucesso.classList.remove('hidden');
}

buscarDadosEntrega();