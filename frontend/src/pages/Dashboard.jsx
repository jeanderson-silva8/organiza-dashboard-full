import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  Search, LogOut, Plus, Trash2, Check,
  AlertCircle, LayoutDashboard, ArrowUpRight, Monitor, Moon, Sun, 
  Calendar as CalendarIcon, Clock, Edit2
} from 'lucide-react';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterPriority, setFilterPriority] = useState('Todas');
  
  // Forms & Editing
  const [formData, setFormData] = useState({ title: '', priority: 'Média', dueDate: '' });
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // UI state
  const [toast, setToast] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ show: false, taskId: null });
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  // Toasts
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    setTheme(newTheme);
  };

  // Aplica o tema salvo ao carregar a página e quando altera
  // Fix Safari iOS: forçar repaint completo ao trocar tema
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    // Forçar repaint no Safari mobile: desligar e religar a visibilidade
    // Isso invalida a camada compositing da GPU e previne tela preta/verde
    document.body.style.display = 'none';
    const _unused = document.body.offsetHeight; // trigger reflow
    document.body.style.display = '';
  }, [theme]);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
      if (res.data.length > 0 && !toast) {
         // showToast('Tarefas carregadas com sucesso!', 'success');
      }
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err);
      showToast('Erro ao carregar as tarefas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // CRUD
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!formData.title) return showToast('O título é obrigatório', 'error');
    
    try {
      await api.post('/tasks', { ...formData, status: 'Pendente' });
      setFormData({ title: '', priority: 'Média', dueDate: '' });
      showToast('Tarefa criada com sucesso!', 'success');
      loadTasks();
    } catch {
      showToast('Erro ao criar tarefa', 'error');
    }
  };

  const handleDeleteRequest = (id) => setDeleteModal({ show: true, taskId: id });
  
  const confirmDelete = async () => {
    try {
      await api.delete(`/tasks/${deleteModal.taskId}`);
      showToast('Tarefa excluída!', 'success');
      setDeleteModal({ show: false, taskId: null });
      loadTasks();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/tasks/${id}`, { status });
      showToast(`Status atualizado para ${status}`, 'success');
      loadTasks();
    } catch {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  const startEdit = (task) => {
    setEditingTask(task._id);
    setEditTitle(task.title);
  };

  const saveEdit = async (id) => {
    if (!editTitle.trim()) return setEditingTask(null);
    try {
      await api.put(`/tasks/${id}`, { title: editTitle });
      setEditingTask(null);
      showToast('Título atualizado!', 'success');
      loadTasks();
    } catch {
      showToast('Erro ao atualizar', 'error');
    }
  };

  // Normaliza o status das tarefas vindo do DB (remove emojis ou espaços ocultos)
  const normalizedTasks = tasks.map(t => {
    let raw = t.status || '';
    let norm = raw;
    if (raw.includes('Conclu')) norm = 'Concluída';
    else if (raw.includes('Progresso')) norm = 'Em Progresso';
    else if (raw.includes('Pendente')) norm = 'Pendente';
    return { ...t, status: norm };
  });

  const totalTasks = normalizedTasks.length;
  const doneTasks = normalizedTasks.filter(t => t.status === 'Concluída').length;
  const progressTasks = normalizedTasks.filter(t => t.status === 'Em Progresso').length;
  const pendingTasks = normalizedTasks.filter(t => t.status === 'Pendente').length;

  const filteredTasks = normalizedTasks.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'Todos' || t.status === filterStatus;
    const matchPriority = filterPriority === 'Todas' || t.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const progressPercent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
  const safeProgressPercent = isNaN(progressPercent) ? 0 : progressPercent;

  return (
    <>
      {/* Background gerenciado via CSS no body e .app-frame — SEM camada position:fixed */}

      <div className="app-frame">
        {/* TEXTURE OVERLAY — usa classe CSS ao invés de inline style para estabilidade */}
        <div className={`app-texture-overlay ${theme === 'dark' ? 'app-texture-dark' : ''}`} />

      {/* Toast */}
      {toast && (
        <div className={`toast-container animate-slide-up`}>
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' && <Check size={18} />}
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal-box glass-card animate-fade-in">
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '1rem', fontSize: '1.2rem' }}>Excluir Tarefa?</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Essa ação não pode ser desfeita. Tem certeza?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setDeleteModal({ show: false, taskId: null })}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={confirmDelete}>
                <Trash2 size={16} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon"><Check size={20} color="white" /></div>
          <h2>ORGANIZA</h2>
        </div>

        <nav className="nav-menu">
          <div className="nav-group">
            <span className="nav-title">MENU PRINCIPAL</span>
            <a href="#" className="nav-item active">
              <LayoutDashboard size={18} /> Dashboard
            </a>
          </div>

          <div className="nav-group">
            <span className="nav-title">PREFERÊNCIAS</span>
            <button className="nav-item nav-theme-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} <span>Tema</span>
            </button>
            <button className="nav-item text-danger" onClick={logout}>
              <LogOut size={18} /> Sair
            </button>
          </div>
        </nav>

        {/* User Card */}
        <div className="promo-card">
          <div className="avatar">
            <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user?.username || 'U'}&backgroundColor=fcdab7`} alt="avatar" />
          </div>
          <div className="user-info">
            <div className="user-name">{user?.username}</div>
            <div className="user-email">{user?.email}</div>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <div className="main-wrapper">
        
        {/* Top Header */}
        <header className="top-header">
          <div className="search-bar">
            <Search size={18} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Buscar tarefas na base (⌘F)" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="header-actions">
            <select 
              className="form-input" 
              style={{ width: 'auto', marginBottom: 0, padding: '0.5rem 1rem', borderRadius: 'var(--radius-pill)' }}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="Todos">🌐 Todos Status</option>
              <option value="Pendente">⏳ Pendentes</option>
              <option value="Em Progresso">🚧 Em Progresso</option>
              <option value="Concluída">✅ Concluídas</option>
            </select>
            
            <select 
              className="form-input" 
              style={{ width: 'auto', marginBottom: 0, padding: '0.5rem 1rem', borderRadius: 'var(--radius-pill)' }}
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
            >
              <option value="Todas">Todas Prioridades</option>
              <option value="Alta">Prioridade: Alta</option>
              <option value="Média">Prioridade: Média</option>
              <option value="Baixa">Prioridade: Baixa</option>
            </select>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="page-content">
          <div className="page-title-row">
            <div className="page-title">
              <h1>Seu Dashboard</h1>
              <p>Gerencie, filtre e crie novas tarefas com facilidade.</p>
            </div>
            <div className="title-actions">
              <div className="trend-badge" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', fontSize: '1rem', borderRadius: 'var(--radius-pill)' }}>
                Progresso: {safeProgressPercent}%
              </div>
            </div>
          </div>

          {/* Stat Cards - Clicáveis para filtrar */}
          <div className="stats-grid">
            <div 
              className={`stat-card ${filterStatus === 'Todos' ? 'active' : ''}`} 
              onClick={() => setFilterStatus('Todos')}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 className="stat-card-title" style={{ marginBottom: 0, paddingRight: '0.5rem' }}>Total de Tarefas</h3>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}><ArrowUpRight size={16} /></div>
              </div>
              <div className="stat-card-value">{totalTasks}</div>
            </div>

            <div 
              className={`stat-card ${filterStatus === 'Em Progresso' ? 'active' : ''}`}
              onClick={() => setFilterStatus('Em Progresso')}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 className="stat-card-title" style={{ marginBottom: 0, paddingRight: '0.5rem' }}>Em Progresso</h3>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}><Monitor size={16} /></div>
              </div>
              <div className="stat-card-value">{progressTasks}</div>
            </div>

            <div 
              className={`stat-card ${filterStatus === 'Pendente' ? 'active' : ''}`}
              onClick={() => setFilterStatus('Pendente')}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 className="stat-card-title" style={{ marginBottom: 0, paddingRight: '0.5rem' }}>Pendentes</h3>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}><Clock size={16} /></div>
              </div>
              <div className="stat-card-value">{pendingTasks}</div>
            </div>

            <div 
              className={`stat-card ${filterStatus === 'Concluída' ? 'active' : ''}`}
              onClick={() => setFilterStatus('Concluída')}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 className="stat-card-title" style={{ marginBottom: 0, paddingRight: '0.5rem' }}>Concluídas</h3>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}><Check size={16} /></div>
              </div>
              <div className="stat-card-value">{doneTasks}</div>
            </div>
          </div>

          <div className="bento-grid">
            {/* Create Task Form */}
            <div className="panel animate-slide-up" style={{ animationDelay: '0.1s', marginBottom: 0 }}>
              <h3 className="panel-header">Criar Nova Tarefa</h3>
              <form onSubmit={handleCreateTask}>
                <label className="input-label">Título da Tarefa</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Fazer deploy..." 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  required
                />
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label className="input-label" style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Prioridade</label>
                    <select 
                      className="form-input" 
                      style={{ marginBottom: 0, padding: '0.65rem 1rem', background: 'var(--bg-app)' }}
                      value={formData.priority}
                      onChange={e => setFormData({...formData, priority: e.target.value})}
                    >
                      <option value="Baixa">🟢 Baixa</option>
                      <option value="Média">🟡 Média</option>
                      <option value="Alta">🔴 Alta</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">Data Limite</label>
                    <input 
                      type="date"
                      className="form-input"
                      style={{ marginBottom: 0 }}
                      value={formData.dueDate}
                      onChange={e => setFormData({...formData, dueDate: e.target.value})}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }}>
                  <Plus size={18} /> Adicionar Tarefa
                </button>
              </form>
            </div>

            {/* Circular Progress Chart (Doughnut White Theme) */}
            <div className="panel animate-slide-up" style={{ 
              animationDelay: '0.2s', 
              marginBottom: 0, 
              background: 'var(--bg-card)', /* Fundo Branco */
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <h3 style={{ width: '100%', color: 'var(--text-dark)', fontSize: '1.05rem', fontWeight: 600, marginBottom: '1.5rem' }}>Resumo de Progresso</h3>
              
              <div 
                key={`pie-${theme}-${safeProgressPercent}-${totalTasks}`}
                style={{
                width: '150px', 
                height: '150px',
                borderRadius: '50%',
                /* Gradiente reforçado para compatibilidade com Safari Mobile */
                background: `conic-gradient(from 0deg, var(--primary) 0%, var(--primary) ${safeProgressPercent}%, var(--danger) ${safeProgressPercent}%, var(--danger) 100%)`,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '120px', 
                  height: '120px',
                  background: 'var(--bg-card)', 
                  borderRadius: '50%',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-dark)', lineHeight: 1.1 }}>{safeProgressPercent}%</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Concluídas</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '2rem', width: '100%', justifyContent: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }}></div>
                    <span style={{ color: 'var(--text-dark)', fontSize: '0.85rem', fontWeight: 700 }}>FEITAS ({doneTasks})</span>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)' }}></div>
                    <span style={{ color: 'var(--text-dark)', fontSize: '0.85rem', fontWeight: 700 }}>A FAZER ({totalTasks - doneTasks})</span>
                 </div>
              </div>
            </div>
          </div>

          {/* Task List - Ocupa a largura total na linha inferior e rola internamente */}
          <div className="panel animate-slide-up" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', paddingBottom: '0.5rem' }}>
            <h3 className="panel-header" style={{ flexShrink: 0 }}>Resultados ({filteredTasks.length})</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', paddingRight: '0.5rem', minHeight: 0 }}>
              {loading ? (
                [1, 2, 3].map(i => <div key={i} className="skeleton-row" style={{ height: '70px', borderRadius: 'var(--radius-md)' }}></div>)
              ) : filteredTasks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Nenhuma tarefa encontrada com os filtros atuais.</p>
              ) : (
                filteredTasks.map((t, idx) => (
                  <div key={t._id} className="task-item animate-slide-up" style={{ 
                      animationDelay: `${idx * 0.05}s`, 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border-light)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      padding: '1.25rem', 
                      borderRadius: 'var(--radius-md)' 
                    }}>
                    <div className="task-info">
                      
                      {editingTask === t._id ? (
                        <input 
                          autoFocus
                          className="form-input"
                          style={{ padding: '0.4rem', marginBottom: '0.5rem' }}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => saveEdit(t._id)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(t._id)}
                        />
                      ) : (
                        <div 
                          className="task-title" 
                          style={{ 
                            textDecoration: t.status === 'Concluída' ? 'line-through' : 'none', 
                            opacity: t.status === 'Concluída' ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                          }}
                        >
                          {t.title} 
                          <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={14}/></button>
                        </div>
                      )}

                      <div className="task-meta" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                        {t.dueDate && (
                          <span className="task-due" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CalendarIcon size={12} />
                            {new Date(t.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        
                        <span className={`status-badge priority-${t.priority.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`}>
                          {t.priority}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <select 
                        className={`status-select status-${t.status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase()}`}
                        value={t.status}
                        onChange={(e) => updateStatus(t._id, e.target.value)}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: 'var(--radius-pill)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="Pendente">⏳ Pendente</option>
                        <option value="Em Progresso">🚧 Em Progresso</option>
                        <option value="Concluída">✅ Concluída</option>
                      </select>

                      <button className="icon-btn" style={{ width: 32, height: 32, color: 'var(--danger)' }} onClick={() => handleDeleteRequest(t._id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
      </div>
    </>
  );
};

export default Dashboard;
