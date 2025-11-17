// State
let screens = [];
let connections = [];
let selectedScreen = null;
let connectionMode = false;
let connectionSource = null;
let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let viewportX = 0;
let viewportY = 0;
let scale = 1;

const canvas = document.getElementById('canvas');
const screensGroup = document.getElementById('screens');
const connectionsGroup = document.getElementById('connections');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const modeIndicator = document.getElementById('mode-indicator');

// Initialize
async function init() {
    await loadScreens();
    await loadConnections();
    setupEventListeners();
    render();
}

// Load screens from API
async function loadScreens() {
    try {
        const response = await axios.get('/api/screens');
        screens = response.data.screens || [];
    } catch (error) {
        console.error('Failed to load screens:', error);
    }
}

// Load connections from API
async function loadConnections() {
    try {
        const response = await axios.get('/api/connections');
        connections = response.data.connections || [];
    } catch (error) {
        console.error('Failed to load connections:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // File input
    fileInput.addEventListener('change', handleFileSelect);
    
    // Canvas drag & drop
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragleave', handleDragLeave);
    
    // Canvas panning
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mouseleave', handleCanvasMouseUp);
    
    // Zoom
    canvas.addEventListener('wheel', handleWheel);
    
    // Drag and drop from outside
    document.addEventListener('dragenter', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            dropzone.classList.add('active');
        }
    });
    
    document.addEventListener('dragleave', (e) => {
        if (e.target === dropzone) {
            dropzone.classList.remove('active');
        }
    });
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        uploadImage(file);
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('active');
}

// Handle drag leave
function handleDragLeave(e) {
    if (e.target === canvas) {
        dropzone.classList.remove('active');
    }
}

// Handle drop
async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('active');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - viewportX) / scale;
        const y = (e.clientY - rect.top - viewportY) / scale;
        await uploadImage(files[0], x, y);
    }
}

// Upload image
async function uploadImage(file, x = 100, y = 100) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const response = await axios.post('/api/upload', arrayBuffer, {
            headers: {
                'Content-Type': file.type
            }
        });
        
        const imageUrl = response.data.url;
        await createScreen('新規画面', imageUrl, x, y);
    } catch (error) {
        console.error('Failed to upload image:', error);
        alert('画像のアップロードに失敗しました');
    }
}

// Create screen
async function createScreen(name, imageUrl, x, y) {
    try {
        const response = await axios.post('/api/screens', {
            name,
            image_url: imageUrl,
            position_x: x,
            position_y: y,
            width: 300,
            height: 400
        });
        
        screens.push({
            id: response.data.id,
            name,
            image_url: imageUrl,
            position_x: x,
            position_y: y,
            width: 300,
            height: 400
        });
        
        render();
    } catch (error) {
        console.error('Failed to create screen:', error);
        alert('画面の作成に失敗しました');
    }
}

// Update screen
async function updateScreen(id, updates) {
    try {
        await axios.put(`/api/screens/${id}`, updates);
        const screen = screens.find(s => s.id === id);
        if (screen) {
            Object.assign(screen, updates);
        }
    } catch (error) {
        console.error('Failed to update screen:', error);
    }
}

// Delete screen
async function deleteScreen(id) {
    if (!confirm('この画面を削除しますか？')) return;
    
    try {
        await axios.delete(`/api/screens/${id}`);
        screens = screens.filter(s => s.id !== id);
        connections = connections.filter(c => c.source_screen_id !== id && c.target_screen_id !== id);
        render();
    } catch (error) {
        console.error('Failed to delete screen:', error);
        alert('画面の削除に失敗しました');
    }
}

// Create connection
async function createConnection(sourceId, targetId) {
    try {
        const label = prompt('接続のラベルを入力してください（省略可）', '');
        
        const response = await axios.post('/api/connections', {
            source_screen_id: sourceId,
            target_screen_id: targetId,
            label: label || ''
        });
        
        connections.push({
            id: response.data.id,
            source_screen_id: sourceId,
            target_screen_id: targetId,
            label: label || ''
        });
        
        render();
    } catch (error) {
        console.error('Failed to create connection:', error);
        alert('接続の作成に失敗しました');
    }
}

// Delete connection
async function deleteConnection(id) {
    try {
        await axios.delete(`/api/connections/${id}`);
        connections = connections.filter(c => c.id !== id);
        render();
    } catch (error) {
        console.error('Failed to delete connection:', error);
    }
}

// Render everything
function render() {
    renderConnections();
    renderScreens();
}

// Render connections
function renderConnections() {
    connectionsGroup.innerHTML = '';
    
    connections.forEach(conn => {
        const source = screens.find(s => s.id === conn.source_screen_id);
        const target = screens.find(s => s.id === conn.target_screen_id);
        
        if (!source || !target) return;
        
        const x1 = source.position_x + source.width / 2;
        const y1 = source.position_y + source.height / 2;
        const x2 = target.position_x + target.width / 2;
        const y2 = target.position_y + target.height / 2;
        
        // Draw line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2} ${x2} ${y2}`;
        line.setAttribute('d', d);
        line.setAttribute('class', 'connection-line');
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('この接続を削除しますか？')) {
                deleteConnection(conn.id);
            }
        });
        connectionsGroup.appendChild(line);
        
        // Draw label if exists
        if (conn.label) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', (x1 + x2) / 2);
            text.setAttribute('y', (y1 + y2) / 2);
            text.setAttribute('class', 'connection-label');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = conn.label;
            connectionsGroup.appendChild(text);
        }
    });
}

// Render screens
function renderScreens() {
    screensGroup.innerHTML = '';
    
    screens.forEach(screen => {
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('x', screen.position_x);
        foreignObject.setAttribute('y', screen.position_y);
        foreignObject.setAttribute('width', screen.width);
        foreignObject.setAttribute('height', screen.height);
        
        const div = document.createElement('div');
        div.className = 'screen-node';
        div.style.width = '100%';
        div.style.height = '100%';
        div.dataset.screenId = screen.id;
        
        const img = document.createElement('img');
        img.src = screen.image_url;
        img.alt = screen.name;
        
        const nameLabel = document.createElement('div');
        nameLabel.className = 'screen-name';
        nameLabel.textContent = screen.name;
        nameLabel.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const newName = prompt('画面名を入力してください', screen.name);
            if (newName && newName !== screen.name) {
                updateScreen(screen.id, {
                    name: newName,
                    position_x: screen.position_x,
                    position_y: screen.position_y,
                    width: screen.width,
                    height: screen.height
                });
                screen.name = newName;
                render();
            }
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteScreen(screen.id);
        });
        
        div.appendChild(img);
        div.appendChild(nameLabel);
        div.appendChild(deleteBtn);
        
        div.addEventListener('mousedown', (e) => handleScreenMouseDown(e, screen));
        div.addEventListener('click', (e) => handleScreenClick(e, screen));
        
        foreignObject.appendChild(div);
        screensGroup.appendChild(foreignObject);
    });
}

// Handle screen mouse down
function handleScreenMouseDown(e, screen) {
    if (connectionMode) return;
    
    e.stopPropagation();
    isDragging = true;
    dragTarget = screen;
    
    const rect = canvas.getBoundingClientRect();
    dragOffsetX = (e.clientX - rect.left - viewportX) / scale - screen.position_x;
    dragOffsetY = (e.clientY - rect.top - viewportY) / scale - screen.position_y;
}

// Handle screen click
function handleScreenClick(e, screen) {
    e.stopPropagation();
    
    if (connectionMode) {
        if (!connectionSource) {
            connectionSource = screen;
            modeIndicator.textContent = '接続モード: 終点を選択してください';
        } else {
            if (connectionSource.id !== screen.id) {
                createConnection(connectionSource.id, screen.id);
            }
            connectionSource = null;
            connectionMode = false;
            modeIndicator.style.display = 'none';
            document.getElementById('connection-btn-text').textContent = '接続モード';
        }
    } else {
        selectedScreen = screen;
    }
}

// Handle canvas mouse down
function handleCanvasMouseDown(e) {
    if (e.target === canvas && !isDragging) {
        isPanning = true;
        panStartX = e.clientX - viewportX;
        panStartY = e.clientY - viewportY;
    }
}

// Handle canvas mouse move
function handleCanvasMouseMove(e) {
    if (isDragging && dragTarget) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - viewportX) / scale - dragOffsetX;
        const y = (e.clientY - rect.top - viewportY) / scale - dragOffsetY;
        
        dragTarget.position_x = x;
        dragTarget.position_y = y;
        render();
    } else if (isPanning) {
        viewportX = e.clientX - panStartX;
        viewportY = e.clientY - panStartY;
        applyTransform();
    }
}

// Handle canvas mouse up
function handleCanvasMouseUp(e) {
    if (isDragging && dragTarget) {
        updateScreen(dragTarget.id, {
            position_x: dragTarget.position_x,
            position_y: dragTarget.position_y,
            name: dragTarget.name,
            width: dragTarget.width,
            height: dragTarget.height
        });
        isDragging = false;
        dragTarget = null;
    }
    isPanning = false;
}

// Handle wheel (zoom)
function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale *= delta;
    scale = Math.max(0.1, Math.min(5, scale));
    applyTransform();
}

// Apply transform
function applyTransform() {
    screensGroup.setAttribute('transform', `translate(${viewportX}, ${viewportY}) scale(${scale})`);
    connectionsGroup.setAttribute('transform', `translate(${viewportX}, ${viewportY}) scale(${scale})`);
}

// UI Functions
function addScreenFromFile() {
    fileInput.click();
}

function toggleConnectionMode() {
    connectionMode = !connectionMode;
    connectionSource = null;
    
    if (connectionMode) {
        modeIndicator.style.display = 'block';
        modeIndicator.textContent = '接続モード: 始点を選択してください';
        document.getElementById('connection-btn-text').textContent = '接続モード終了';
    } else {
        modeIndicator.style.display = 'none';
        document.getElementById('connection-btn-text').textContent = '接続モード';
    }
}

function fitToView() {
    if (screens.length === 0) return;
    
    const padding = 50;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    screens.forEach(screen => {
        minX = Math.min(minX, screen.position_x);
        minY = Math.min(minY, screen.position_y);
        maxX = Math.max(maxX, screen.position_x + screen.width);
        maxY = Math.max(maxY, screen.position_y + screen.height);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    const scaleX = (canvasWidth - padding * 2) / contentWidth;
    const scaleY = (canvasHeight - padding * 2) / contentHeight;
    scale = Math.min(scaleX, scaleY, 1);
    
    viewportX = (canvasWidth - contentWidth * scale) / 2 - minX * scale;
    viewportY = (canvasHeight - contentHeight * scale) / 2 - minY * scale;
    
    applyTransform();
}

async function clearAll() {
    if (!confirm('すべての画面と接続を削除しますか？この操作は取り消せません。')) return;
    
    try {
        for (const screen of screens) {
            await axios.delete(`/api/screens/${screen.id}`);
        }
        screens = [];
        connections = [];
        render();
    } catch (error) {
        console.error('Failed to clear all:', error);
        alert('クリアに失敗しました');
    }
}

// Initialize on load
window.addEventListener('load', init);
