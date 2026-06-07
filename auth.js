// 1. Configurações do seu projeto Supabase
const SUPABASE_URL = "https://sykxvatnzlewhsnkpmri.supabase.co";
const SUPABASE_KEY = "sb_publishable_U_0A502RJVpMicdn9-RZpw_05nxsVvU";

// 2. Criação do cliente usando o escopo global direto fornecido pela CDN
// O objeto global injetado pela CDN se chama 'supabase', e a função é 'createClient'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. Captura dos elementos HTML da tela de login
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

// 4. Escutador do evento de clique no botão "Entrar"
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Impede o recarregamento automático da página
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Reseta o estado do alerta de erro visual
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';

    try {
        // Realiza a chamada de autenticação para o banco de dados
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Caso o e-mail ou a senha estejam incorretos no banco
            errorMessage.textContent = "Login inválido: " + error.message;
            errorMessage.classList.remove('hidden');
        } else {
            // Caso as credenciais estejam 100% corretas
            console.log('Usuário autenticado!', data.user);
            window.location.href = 'painel.html';
        }
    } catch (err) {
        // Exibe no console o erro técnico real para debug
        console.error('Erro de execução:', err);
        errorMessage.textContent = 'Erro ao tentar se comunicar com o servidor de autenticação.';
        errorMessage.classList.remove('hidden');
    }
});