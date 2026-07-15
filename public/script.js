const form = document.getElementById('task-form');
const taskIdInput = document.getElementById('task-id');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const statusInput = document.getElementById('status');
const attachmentInput = document.getElementById('attachment');
const tasksList = document.getElementById('tasks-list');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');

const API_URL = '/api/tasks';

async function fetchTasks() {
  tasksList.innerHTML = '<p class="empty-state">Loading tasks...</p>';
  try {
    const res = await fetch(API_URL);
    const tasks = await res.json();
    renderTasks(tasks);
  } catch (err) {
    tasksList.innerHTML = '<p class="empty-state">Failed to load tasks. Is the server running?</p>';
    console.error(err);
  }
}

function renderTasks(tasks) {
  if (!tasks.length) {
    tasksList.innerHTML = '<p class="empty-state">No tasks yet. Create one above!</p>';
    return;
  }

  tasksList.innerHTML = tasks.map(task => `
    <div class="task-item" data-id="${task.id}">
      <div class="task-main">
        <h3>${escapeHtml(task.title)}</h3>
        ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
        <span class="badge ${task.status}">${task.status.replace('_', ' ')}</span>
        ${task.attachment_url ? `<div class="task-attachment"><a href="${task.attachment_url}" target="_blank" rel="noopener">📎 View attachment</a></div>` : ''}
      </div>
      <div class="task-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    </div>
  `).join('');

  tasksList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.task-item').dataset.id;
      const task = tasks.find(t => t.id == id);
      startEdit(task);
    });
  });

  tasksList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.task-item').dataset.id;
      if (confirm('Delete this task?')) {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        fetchTasks();
      }
    });
  });
}

function startEdit(task) {
  taskIdInput.value = task.id;
  titleInput.value = task.title;
  descriptionInput.value = task.description || '';
  statusInput.value = task.status;
  formTitle.textContent = 'Edit task';
  submitBtn.textContent = 'Update Task';
  cancelBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  form.reset();
  taskIdInput.value = '';
  formTitle.textContent = 'Add a new task';
  submitBtn.textContent = 'Create Task';
  cancelBtn.classList.add('hidden');
}

cancelBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('title', titleInput.value);
  formData.append('description', descriptionInput.value);
  formData.append('status', statusInput.value);
  if (attachmentInput.files[0]) {
    formData.append('attachment', attachmentInput.files[0]);
  }

  const id = taskIdInput.value;
  const url = id ? `${API_URL}/${id}` : API_URL;
  const method = id ? 'PUT' : 'POST';

  submitBtn.disabled = true;
  submitBtn.textContent = id ? 'Updating...' : 'Creating...';

  try {
    await fetch(url, { method, body: formData });
    resetForm();
    fetchTasks();
  } catch (err) {
    alert('Something went wrong. Check the console.');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

fetchTasks();
