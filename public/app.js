const state = { token: localStorage.getItem('todo_token'), user: JSON.parse(localStorage.getItem('todo_user') || 'null') };
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginMessage = document.querySelector('#login-message');
const todoMessage = document.querySelector('#todo-message');
const todoList = document.querySelector('#todo-list');
const emptyState = document.querySelector('#empty-state');

function showApp() {
  loginView.classList.toggle('hidden', Boolean(state.token));
  appView.classList.toggle('hidden', !state.token);
  if (state.user) document.querySelector('#user-email').textContent = state.user.email;
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...(options.headers || {}) } });
  if (response.status === 401) logout();
  if (!response.ok) throw new Error((await response.json()).error || 'Request failed');
  return response.status === 204 ? null : response.json();
}

function renderTodos(todos) {
  todoList.innerHTML = '';
  emptyState.classList.toggle('hidden', todos.length > 0);
  todos.forEach((todo) => {
    const item = document.createElement('article');
    item.className = 'todo-item';
    item.innerHTML = `<input type="checkbox" ${todo.completed ? 'checked' : ''} aria-label="Mark todo complete"><span class="todo-title ${todo.completed ? 'completed' : ''}"></span><div class="item-actions"><button class="edit" type="button">Edit</button><button class="delete" type="button">Delete</button></div>`;
    item.querySelector('.todo-title').textContent = todo.title;
    item.querySelector('input').addEventListener('change', () => updateTodo(todo, todo.title, !todo.completed));
    item.querySelector('.edit').addEventListener('click', () => {
      const title = window.prompt('Edit todo', todo.title);
      if (title && title.trim()) updateTodo(todo, title.trim(), todo.completed);
    });
    item.querySelector('.delete').addEventListener('click', () => deleteTodo(todo.id));
    todoList.appendChild(item);
  });
}

async function loadTodos() { try { renderTodos(await request('/api/todos')); } catch (error) { todoMessage.textContent = error.message; } }
async function updateTodo(todo, title, completed) { try { await request(`/api/todos/${todo.id}`, { method: 'PUT', body: JSON.stringify({ title, completed }) }); await loadTodos(); } catch (error) { todoMessage.textContent = error.message; } }
async function deleteTodo(id) { try { await request(`/api/todos/${id}`, { method: 'DELETE' }); await loadTodos(); } catch (error) { todoMessage.textContent = error.message; } }
function logout() { state.token = null; state.user = null; localStorage.removeItem('todo_token'); localStorage.removeItem('todo_user'); showApp(); }

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); loginMessage.textContent = '';
  const email = document.querySelector('#email').value; const otp = document.querySelector('#otp').value;
  try { const result = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp }) }); const data = await result.json(); if (!result.ok) throw new Error(data.error); state.token = data.token; state.user = data.user; localStorage.setItem('todo_token', state.token); localStorage.setItem('todo_user', JSON.stringify(state.user)); showApp(); await loadTodos(); } catch (error) { loginMessage.textContent = error.message; }
});
document.querySelector('#todo-form').addEventListener('submit', async (event) => { event.preventDefault(); todoMessage.textContent = ''; const input = document.querySelector('#todo-title'); try { await request('/api/todos', { method: 'POST', body: JSON.stringify({ title: input.value }) }); input.value = ''; await loadTodos(); } catch (error) { todoMessage.textContent = error.message; } });
document.querySelector('#logout-button').addEventListener('click', logout);
showApp(); if (state.token) loadTodos();
