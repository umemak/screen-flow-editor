import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API Routes

// Get all screens
app.get('/api/screens', async (c) => {
  const { DB } = c.env
  
  try {
    const result = await DB.prepare(
      'SELECT * FROM screens ORDER BY created_at DESC'
    ).all()
    
    return c.json({ screens: result.results })
  } catch (error) {
    return c.json({ error: 'Failed to fetch screens' }, 500)
  }
})

// Create new screen
app.post('/api/screens', async (c) => {
  const { DB } = c.env
  
  try {
    const { name, image_url, position_x, position_y, width, height } = await c.req.json()
    
    const result = await DB.prepare(
      'INSERT INTO screens (name, image_url, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(name, image_url, position_x || 0, position_y || 0, width || 300, height || 400).run()
    
    return c.json({ id: result.meta.last_row_id, name, image_url, position_x, position_y, width, height })
  } catch (error) {
    return c.json({ error: 'Failed to create screen' }, 500)
  }
})

// Update screen position
app.put('/api/screens/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  try {
    const { position_x, position_y, name, width, height } = await c.req.json()
    
    await DB.prepare(
      'UPDATE screens SET position_x = ?, position_y = ?, name = ?, width = ?, height = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(position_x, position_y, name, width, height, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update screen' }, 500)
  }
})

// Delete screen
app.delete('/api/screens/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  try {
    await DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to delete screen' }, 500)
  }
})

// Get all connections
app.get('/api/connections', async (c) => {
  const { DB } = c.env
  
  try {
    const result = await DB.prepare(
      'SELECT * FROM connections ORDER BY created_at DESC'
    ).all()
    
    return c.json({ connections: result.results })
  } catch (error) {
    return c.json({ error: 'Failed to fetch connections' }, 500)
  }
})

// Create connection
app.post('/api/connections', async (c) => {
  const { DB } = c.env
  
  try {
    const { source_screen_id, target_screen_id, label } = await c.req.json()
    
    const result = await DB.prepare(
      'INSERT INTO connections (source_screen_id, target_screen_id, label) VALUES (?, ?, ?)'
    ).bind(source_screen_id, target_screen_id, label || '').run()
    
    return c.json({ id: result.meta.last_row_id, source_screen_id, target_screen_id, label })
  } catch (error) {
    return c.json({ error: 'Failed to create connection' }, 500)
  }
})

// Update connection label
app.put('/api/connections/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  try {
    const { label } = await c.req.json()
    
    await DB.prepare(
      'UPDATE connections SET label = ? WHERE id = ?'
    ).bind(label, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update connection' }, 500)
  }
})

// Delete connection
app.delete('/api/connections/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  try {
    await DB.prepare('DELETE FROM connections WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to delete connection' }, 500)
  }
})

// Upload image to R2
app.post('/api/upload', async (c) => {
  const { R2 } = c.env
  
  try {
    const body = await c.req.arrayBuffer()
    const contentType = c.req.header('content-type') || 'image/png'
    const key = `screens/${Date.now()}-${Math.random().toString(36).substring(7)}.png`
    
    await R2.put(key, body, {
      httpMetadata: {
        contentType: contentType
      }
    })
    
    // Return the key which will be used to fetch the image
    return c.json({ url: `/api/images/${key}` })
  } catch (error) {
    return c.json({ error: 'Failed to upload image' }, 500)
  }
})

// Get image from R2
app.get('/api/images/*', async (c) => {
  const { R2 } = c.env
  const key = c.req.path.replace('/api/images/', '')
  
  try {
    const object = await R2.get(key)
    
    if (!object) {
      return c.notFound()
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      }
    })
  } catch (error) {
    return c.json({ error: 'Failed to fetch image' }, 500)
  }
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>画面遷移図エディタ</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            body, html {
                margin: 0;
                padding: 0;
                overflow: hidden;
                width: 100%;
                height: 100vh;
            }
            #canvas {
                cursor: grab;
                background: linear-gradient(0deg, rgba(0,0,0,.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px);
                background-size: 20px 20px;
            }
            #canvas:active {
                cursor: grabbing;
            }
            .screen-node {
                position: absolute;
                border: 2px solid #3b82f6;
                border-radius: 8px;
                background: white;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                cursor: move;
                overflow: hidden;
            }
            .screen-node:hover {
                border-color: #2563eb;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
            }
            .screen-node.selected {
                border-color: #ef4444;
                border-width: 3px;
            }
            .screen-node img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                pointer-events: none;
            }
            .screen-name {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(59, 130, 246, 0.9);
                color: white;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
            }
            .delete-btn {
                position: absolute;
                top: 4px;
                right: 4px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 4px;
                width: 24px;
                height: 24px;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
            }
            .screen-node:hover .delete-btn {
                opacity: 1;
            }
            .connection-line {
                stroke: #3b82f6;
                stroke-width: 2;
                fill: none;
                marker-end: url(#arrowhead);
            }
            .connection-line.selected {
                stroke: #ef4444;
                stroke-width: 3;
            }
            .connection-label {
                font-size: 12px;
                fill: #1f2937;
                background: white;
                padding: 2px 4px;
            }
            .toolbar {
                position: fixed;
                top: 20px;
                left: 20px;
                background: white;
                padding: 12px;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                z-index: 1000;
            }
            .toolbar button {
                margin: 0 4px;
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            .toolbar button:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .btn-primary {
                background: #3b82f6;
                color: white;
            }
            .btn-secondary {
                background: #6b7280;
                color: white;
            }
            .btn-danger {
                background: #ef4444;
                color: white;
            }
            .mode-indicator {
                position: fixed;
                top: 80px;
                left: 20px;
                background: white;
                padding: 8px 12px;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                font-size: 12px;
                font-weight: 600;
                z-index: 1000;
            }
            #dropzone {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(59, 130, 246, 0.1);
                border: 4px dashed #3b82f6;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                pointer-events: none;
            }
            #dropzone.active {
                display: flex;
            }
        </style>
    </head>
    <body>
        <div class="toolbar">
            <button class="btn-primary" onclick="addScreenFromFile()">
                <i class="fas fa-plus"></i> 画面追加
            </button>
            <button class="btn-secondary" onclick="toggleConnectionMode()">
                <i class="fas fa-link"></i> <span id="connection-btn-text">接続モード</span>
            </button>
            <button class="btn-secondary" onclick="fitToView()">
                <i class="fas fa-expand"></i> 全体表示
            </button>
            <button class="btn-danger" onclick="clearAll()">
                <i class="fas fa-trash"></i> クリア
            </button>
        </div>
        
        <div class="mode-indicator" id="mode-indicator" style="display: none;">
            <i class="fas fa-link"></i> 接続モード: 始点を選択してください
        </div>
        
        <div id="dropzone">
            <div style="text-align: center; color: #3b82f6; font-size: 24px; font-weight: bold;">
                <i class="fas fa-cloud-upload-alt" style="font-size: 48px;"></i>
                <div style="margin-top: 16px;">画像をドロップして画面を追加</div>
            </div>
        </div>
        
        <input type="file" id="fileInput" accept="image/*" style="display: none;">
        
        <svg id="canvas" width="100%" height="100%">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                </marker>
            </defs>
            <g id="connections"></g>
            <g id="screens"></g>
        </svg>
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
