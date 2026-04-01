const state = require('./state')

function showAuthInfo(msg, type = '') {
    const el = document.getElementById('authInfo')
    el.textContent = msg
    el.className   = 'info-box visible ' + type
}
function clearAuthInfo() {
    const el = document.getElementById('authInfo')
    el.className   = 'info-box'
    el.textContent = ''
}
function setAuthLoading(loading) {
    const btn = document.getElementById('authSubmitBtn')
    btn.disabled    = loading
    btn.textContent = loading
        ? (state.isLoginMode ? 'Entrando...' : 'Criando conta...')
        : (state.isLoginMode ? 'Entrar na Taverna' : 'Criar Conta')
}

function usernameToEmail(username) {
    return `${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}@rpglobby.internal`
}

function translateAuthError(msg) {
    if (msg.includes('Invalid login credentials'))  return 'Usuário ou senha incorretos.'
    if (msg.includes('Email not confirmed'))         return 'Confirme seu e-mail antes de entrar.'
    if (msg.includes('User already registered'))     return 'Este usuário já possui uma conta.'
    if (msg.includes('Password should be'))          return 'A senha deve ter pelo menos 6 caracteres.'
    if (msg.includes('Unable to validate'))          return 'Usuário inválido.'
    if (msg.includes('rate limit'))                  return 'Muitas tentativas. Aguarde alguns segundos.'
    if (msg.includes('fetch'))                       return 'Erro de rede. Verifique sua conexão.'
    return msg
}

function enterLobby(name) {
    state.playerName = name
    document.getElementById('connectSubtitle').textContent = `Bem-vindo, ${name}`
    document.getElementById('authScreen').style.display    = 'none'
    document.getElementById('connectScreen').style.display = 'flex'
}

async function handleLogin(username, password) {
    const { data, error } = await state.supabase.auth.signInWithPassword({
        email: usernameToEmail(username), password
    })
    if (error) { showAuthInfo(translateAuthError(error.message), 'error'); return }
    state.currentUserId = data.user.id
    try {
        const { data: profile } = await state.supabase.from('profiles').select('user').eq('id', data.user.id).single()
        state.playerName = profile?.user || username
    } catch (e) { state.playerName = username }
    localStorage.setItem('playerName', state.playerName)
    enterLobby(state.playerName)
}

async function handleRegister(username, password) {
    const { data, error } = await state.supabase.auth.signUp({
        email: usernameToEmail(username), password
    })
    if (error) { showAuthInfo(translateAuthError(error.message), 'error'); return }
    if (data.user) {
        state.currentUserId = data.user.id
        try {
            await state.supabase.from('profiles').upsert({
                id: data.user.id, user: username, role: 'player',
                created_at: new Date().toISOString()
            })
        } catch (e) { console.warn('[Auth] Erro ao salvar perfil:', e) }
    }
    if (!data.session) { showAuthInfo('Conta criada!\nConfirme seu e-mail para entrar.', 'success'); return }
    state.playerName = username
    localStorage.setItem('playerName', state.playerName)
    enterLobby(state.playerName)
}

async function checkSession() {
    if (!state.supabase) return
    try {
        const { data: { session }, error } = await state.supabase.auth.getSession()
        if (error || !session) return
        state.currentUserId = session.user.id
        try {
            const { data: profile } = await state.supabase.from('profiles').select('user').eq('id', session.user.id).single()
            if (profile?.user) { state.playerName = profile.user; localStorage.setItem('playerName', state.playerName) }
        } catch (e) {}
        enterLobby(state.playerName)
    } catch (e) { console.error('[Session] Erro:', e) }
}

function initAuth() {
    const tabLogin    = document.getElementById('tabLogin')
    const tabRegister = document.getElementById('tabRegister')
    const authSubmit  = document.getElementById('authSubmitBtn')
    const logoutBtn   = document.getElementById('logoutBtn')

    tabLogin.addEventListener('click', () => {
        state.isLoginMode = true
        tabLogin.classList.add('active'); tabRegister.classList.remove('active')
        document.getElementById('loginFields').style.display    = 'flex'
        document.getElementById('registerFields').style.display = 'none'
        authSubmit.textContent = 'Entrar na Taverna'
        clearAuthInfo()
    })

    tabRegister.addEventListener('click', () => {
        state.isLoginMode = false
        tabRegister.classList.add('active'); tabLogin.classList.remove('active')
        document.getElementById('loginFields').style.display    = 'none'
        document.getElementById('registerFields').style.display = 'flex'
        authSubmit.textContent = 'Criar Conta'
        clearAuthInfo()
    })

    ;['usernameLoginInput','passwordInput','usernameRegisterInput','passwordRegisterInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit.click() })
    })

    authSubmit.addEventListener('click', async () => {
        const username = state.isLoginMode
            ? document.getElementById('usernameLoginInput').value.trim()
            : document.getElementById('usernameRegisterInput').value.trim()
        const password = state.isLoginMode
            ? document.getElementById('passwordInput').value
            : document.getElementById('passwordRegisterInput').value

        if (!username || !password)  { showAuthInfo('Preencha usuário e senha.', 'error'); return }
        if (username.length < 3)     { showAuthInfo('Usuário deve ter pelo menos 3 caracteres.', 'error'); return }
        if (!state.supabase)         { showAuthInfo('Erro interno: Supabase não inicializado.', 'error'); return }

        setAuthLoading(true); clearAuthInfo()
        try {
            if (state.isLoginMode) await handleLogin(username, password)
            else                   await handleRegister(username, password)
        } catch (e) {
            showAuthInfo(`Erro inesperado: ${e.message || e}`, 'error')
        } finally {
            setAuthLoading(false)
        }
    })

    logoutBtn.addEventListener('click', async () => {
        try { await state.supabase.auth.signOut() } catch (e) {}
        state.currentUserId     = null
        state.playerCharacters  = []
        if (state.socket) { state.socket.disconnect(); state.socket = null }

        const characterBar = document.getElementById('characterBar')
        characterBar.style.display = 'none'; characterBar.innerHTML = ''

        document.getElementById('connectScreen').style.display = 'none'
        document.getElementById('authScreen').style.display    = 'flex'
        ;['usernameLoginInput','passwordInput','usernameRegisterInput','passwordRegisterInput'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = ''
        })
        tabLogin.click(); clearAuthInfo()
    })
}

module.exports = { initAuth, checkSession, enterLobby }
