// Configurações do Supabase (Substitua com os dados do seu projeto)
const SUPABASE_URL = "SUA_SUPABASE_URL_AQUI";
const SUPABASE_KEY = "SUA_SUPABASE_ANON_KEY_AQUI";

// Inicializa o cliente do Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Captura os elementos da tela
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

// Evento de envio do formulário
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que a página recarregue
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Limpa mensagens de erro anteriores
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';

    try {
        // Tenta fazer o login usando a API do Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Se o Supabase retornar erro (senha errada, usuário não existe, etc)
            errorMessage.textContent = "Login inválido: " + error.message;
            errorMessage.classList.remove('hidden');
        } else {
            // Sucesso! Usuário autenticado com sucesso
            console.log('Usuário logado:', data.user);
            
            // Redireciona para a tela do painel principal (que vamos criar a seguir)
            window.location.href = 'painel.html';
        }
    } catch (err) {
        console.error('Erro inesperado:', err);
        errorMessage.textContent = 'Ocorreu um erro ao tentar conectar.';
        errorMessage.classList.remove('hidden');
    }
});