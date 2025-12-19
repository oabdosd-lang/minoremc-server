const { createServer } = require('bedrock-protocol');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const compression = require('compression');

class MinoreMCServer {
    constructor() {
        this.config = {
            serverName: "MinoreMC",
            version: "1.21.130.02",
            motd: "✨ MinoreMC Official Server",
            maxPlayers: 20,
            gamemode: "survival",
            difficulty: "normal",
            port: 19132,
            worldName: "MinoreWorld",
            enableCheats: true
        };

        this.players = new Map();
        this.serverStats = {
            uptime: Date.now(),
            totalConnections: 0,
            totalChats: 0
        };

        this.initWebServer();
        this.initMinecraftServer();
    }

    initWebServer() {
        this.app = express();
        this.app.use(compression());
        this.app.use(express.json());
        
        this.httpServer = http.createServer(this.app);
        this.io = new Server(this.httpServer);
        
        this.setupRoutes();
        this.setupSocketIO();
        
        const webPort = process.env.PORT || 3000;
        this.httpServer.listen(webPort, '0.0.0.0', () => {
            console.log(`🌐 MinoreMC Web Panel: http://0.0.0.0:${webPort}`);
        });
    }

    initMinecraftServer() {
        console.log(`🚀 Starting MinoreMC Server ${this.config.version}...`);
        
        this.mcServer = createServer({
            host: '0.0.0.0',
            port: this.config.port,
            version: this.config.version,
            maxPlayers: this.config.maxPlayers,
            motd: {
                motd: this.config.motd,
                levelName: this.config.worldName,
                gameMode: this.config.gamemode
            },
            onlineMode: true,
            compressionLevel: 6,
            viewDistance: 16,
            playerIdleTimeout: 30
        });

        this.setupMinecraftEvents();
    }

    setupMinecraftEvents() {
        // عند اتصال لاعب
        this.mcServer.on('connect', (client) => {
            this.handlePlayerJoin(client);
        });

        // عند خطأ
        this.mcServer.on('error', (error) => {
            console.error('❌ Server Error:', error);
        });

        // عند إغلاق السيرفر
        this.mcServer.on('close', () => {
            console.log('🛑 MinoreMC Server stopped');
        });

        console.log(`✅ MinoreMC Bedrock Server ready on port ${this.config.port}`);
    }

    async handlePlayerJoin(client) {
        const playerId = `${client.address}:${client.port}`;
        const playerData = {
            id: playerId,
            username: client.username,
            xuid: client.xuid || 'Unknown',
            address: client.address,
            entityId: this.players.size + 1,
            joinedAt: new Date(),
            gamemode: 1,
            position: { x: 100, y: 70, z: 100 },
            health: 20,
            hunger: 20
        };

        this.players.set(playerId, playerData);
        this.serverStats.totalConnections++;

        console.log(`👤 ${client.username} joined MinoreMC`);

        // إرسال رسالة ترحيب خاصة
        client.queue('text', {
            type: 'chat',
            source_name: 'SERVER',
            message: `§6✨ Welcome to §lMinoreMC§r§6! §e${this.config.version}`
        });

        client.queue('text', {
            type: 'chat',
            source_name: 'SERVER',
            message: '§7Type §a/help §7for commands'
        });

        // إرسال بيانات بدء اللعبة
        client.queue('start_game', {
            entity_id: BigInt(playerData.entityId),
            runtime_entity_id: BigInt(playerData.entityId),
            player_gamemode: playerData.gamemode,
            position: playerData.position,
            rotation: { x: 0, y: 0 },
            seed: 0xDEADBEEFn,
            dimension: 0,
            generator: 1,
            world_gamemode: 1,
            difficulty: 2,
            spawn_position: { x: 100, y: 70, z: 100 },
            achievements_disabled: true,
            day_cycle_stop_time: 0,
            edu_offer: 0,
            edu_features_enabled: false,
            edu_product_uuid: '',
            rain_level: 0,
            lightning_level: 0,
            has_confirmed_platform_locked_content: false,
            is_multiplayer: true,
            broadcast_to_lan: true,
            xbox_live_broadcast_mode: 4,
            platform_broadcast_mode: 4,
            enable_commands: true,
            is_texturepacks_required: false,
            gamerules: [],
            experiments: [],
            experiments_previously_used: false,
            bonus_chest: false,
            map_enabled: false,
            permission_level: 1,
            server_chunk_tick_range: 4,
            has_locked_behavior_pack: false,
            has_locked_resource_pack: false,
            is_from_locked_world_template: false,
            msa_gamertags_only: false,
            is_from_world_template: false,
            is_world_template_option_locked: false,
            only_spawn_v1_villagers: false,
            persona_disabled: false,
            custom_skins_disabled: false,
            emotes_chat_disabled: false,
            game_version: this.config.version,
            limited_world_width: 16,
            limited_world_length: 16,
            is_new_nether: true,
            edu_resource_uri: {
                button_name: '',
                link_uri: ''
            },
            experimental_gameplay_override: false,
            chat_mode: 0,
            chat_signing: false,
            marketplace_world_template: {
                template_id: ''
            },
            server_authoritative_sound: false,
            frame_predictor: false,
            predicted_vehicle: false,
            player_move_prediction: false,
            hide_damage: false,
            disable_player_interaction: false
        });

        // إرسال بيانات العالم
        client.queue('set_time', {
            time: 6000
        });

        // الاستماع للدردشة
        client.on('text', (packet) => {
            this.handleChatMessage(client, packet);
        });

        // الاستماع للأوامر
        client.on('command_request', (packet) => {
            this.handleCommand(client, packet);
        });

        // عند الخروج
        client.on('close', () => {
            this.handlePlayerLeave(client, playerId);
        });

        // تحديث لوحة التحكم
        this.io.emit('player-joined', {
            username: client.username,
            total: this.players.size,
            onlinePlayers: Array.from(this.players.values()).map(p => p.username)
        });
    }

    handleChatMessage(client, packet) {
        const message = packet.message;
        const username = client.username;
        
        this.serverStats.totalChats++;
        
        console.log(`💬 ${username}: ${message}`);
        
        // بث الرسالة لجميع اللاعبين
        this.mcServer.broadcast('text', {
            type: 'chat',
            source_name: username,
            message: message,
            parameters: [],
            needs_translation: false,
            xuid: client.xuid || '',
            platform_chat_id: ''
        });

        // إرسال للويب
        this.io.emit('chat-message', {
            player: username,
            message: message,
            time: new Date().toLocaleTimeString()
        });

        // أوامر خاصة
        if (message.startsWith('/')) {
            this.handleChatCommand(client, message);
        }
    }

    handleChatCommand(client, command) {
        const args = command.slice(1).split(' ');
        const cmd = args[0].toLowerCase();

        switch(cmd) {
            case 'help':
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: '§6--- MinoreMC Commands ---'
                });
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: '§a/help §7- Show this menu'
                });
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: '§a/players §7- Show online players'
                });
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: '§a/version §7- Show server version'
                });
                break;

            case 'players':
                const playersList = Array.from(this.players.values())
                    .map(p => p.username)
                    .join(', ');
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: `§7Online players (§a${this.players.size}§7): §e${playersList || 'None'}`
                });
                break;

            case 'version':
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: `§7MinoreMC §e${this.config.version} §7- Hosted on Render.com`
                });
                break;

            case 'discord':
                client.queue('text', {
                    type: 'chat',
                    source_name: 'SERVER',
                    message: '§9Join our Discord: §bhttps://discord.gg/example'
                });
                break;
        }
    }

    handleCommand(client, packet) {
        // معالجة الأوامر هنا
        console.log(`Command from ${client.username}:`, packet);
    }

    handlePlayerLeave(client, playerId) {
        const player = this.players.get(playerId);
        if (player) {
            console.log(`👋 ${player.username} left MinoreMC`);
            
            // إعلام اللاعبين الآخرين
            this.mcServer.broadcast('text', {
                type: 'chat',
                source_name: 'SERVER',
                message: `§7${player.username} left the game`
            });

            this.players.delete(playerId);
            
            // تحديث الويب
            this.io.emit('player-left', {
                username: player.username,
                total: this.players.size
            });
        }
    }

    setupRoutes() {
        // الصفحة الرئيسية
        this.app.get('/', (req, res) => {
            res.send(this.getDashboardHTML());
        });

        // API للإحصائيات
        this.app.get('/api/stats', (req, res) => {
            res.json({
                serverName: this.config.serverName,
                version: this.config.version,
                onlinePlayers: this.players.size,
                maxPlayers: this.config.maxPlayers,
                uptime: Math.floor((Date.now() - this.serverStats.uptime) / 1000),
                totalConnections: this.serverStats.totalConnections,
                totalChats: this.serverStats.totalChats,
                players: Array.from(this.players.values()).map(p => ({
                    username: p.username,
                    joinedAt: p.joinedAt
                }))
            });
        });

        // API للتحكم
        this.app.post('/api/broadcast', (req, res) => {
            const { message } = req.body;
            if (message) {
                this.mcServer.broadcast('text', {
                    type: 'chat',
                    source_name: 'CONSOLE',
                    message: `[Broadcast] ${message}`
                });
                res.json({ success: true });
            } else {
                res.status(400).json({ error: 'Message required' });
            }
        });

        // لمنع النوم
        this.app.get('/ping', (req, res) => {
            res.json({ 
                status: 'online', 
                server: 'MinoreMC',
                version: this.config.version,
                timestamp: new Date().toISOString()
            });
        });

        // جلب IP السيرفر
        this.app.get('/get-ip', (req, res) => {
            const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || req.headers.host.split(':')[0];
            res.json({
                ip: hostname,
                port: this.config.port,
                connectString: `${hostname}:${this.config.port}`
            });
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('📡 Web client connected');
            
            // إرسال بيانات أولية
            socket.emit('server-info', {
                name: this.config.serverName,
                version: this.config.version,
                motd: this.config.motd
            });

            socket.on('disconnect', () => {
                console.log('📡 Web client disconnected');
            });
        });

        // تحديث دوري للإحصائيات
        setInterval(() => {
            this.io.emit('stats-update', {
                onlinePlayers: this.players.size,
                uptime: Math.floor((Date.now() - this.serverStats.uptime) / 1000)
            });
        }, 5000);
    }

    getDashboardHTML() {
        return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎮 MinoreMC - سيرفر ماينكرافت</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                :root {
                    --primary: #8a2be2;
                    --secondary: #4b0082;
                    --accent: #9370db;
                    --dark: #1a1a2e;
                    --light: #f8f9fa;
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', 'Tahoma', sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, var(--dark) 0%, var(--secondary) 100%);
                    color: var(--light);
                    min-height: 100vh;
                    padding: 20px;
                    line-height: 1.6;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                
                header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 20px;
                    border: 2px solid var(--accent);
                }
                
                .logo {
                    font-size: 3.5em;
                    background: linear-gradient(45deg, var(--primary), var(--accent));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 10px;
                    text-shadow: 0 0 20px rgba(138, 43, 226, 0.5);
                }
                
                .tagline {
                    color: #d0b3ff;
                    font-size: 1.2em;
                }
                
                .server-info {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    transition: transform 0.3s;
                }
                
                .card:hover {
                    transform: translateY(-5px);
                }
                
                .card h3 {
                    color: var(--accent);
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-weight: bold;
                    margin: 10px 0;
                }
                
                .online { background: #28a745; }
                
                .ip-box {
                    background: rgba(0,0,0,0.5);
                    padding: 15px;
                    border-radius: 10px;
                    font-family: monospace;
                    font-size: 1.2em;
                    text-align: center;
                    margin: 15px 0;
                    border: 2px solid var(--primary);
                }
                
                .players-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                    margin-top: 15px;
                }
                
                .player-card {
                    background: rgba(255,255,255,0.1);
                    padding: 15px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .player-avatar {
                    width: 40px;
                    height: 40px;
                    background: var(--accent);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .chat-box {
                    height: 300px;
                    overflow-y: auto;
                    background: rgba(0,0,0,0.3);
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 15px;
                }
                
                .chat-message {
                    padding: 8px;
                    margin-bottom: 8px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 8px;
                }
                
                .chat-message .player {
                    color: var(--accent);
                    font-weight: bold;
                }
                
                .controls {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                
                input, button {
                    padding: 12px 20px;
                    border-radius: 8px;
                    border: none;
                    font-size: 16px;
                }
                
                input {
                    flex: 1;
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                
                button {
                    background: var(--primary);
                    color: white;
                    cursor: pointer;
                    transition: background 0.3s;
                }
                
                button:hover {
                    background: var(--secondary);
                }
                
                footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    color: #aaa;
                }
                
                   @media (max-width: 768px) {
                    .server-info {
                        grid-template-columns: 1fr;
                    }
                    .logo {
                        font-size: 2.5em;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1 class="logo">🎮 MinoreMC</h1>
                    <p class="tagline">سيرفر ماينكرافت Bedrock 1.21.130 - مستضاف على Render.com</p>
                </header>
                
                <div class="server-info">
                    <div class="card">
                        <h3><i class="fas fa-server"></i> حالة السيرفر</h3>
                        <p><strong>الاسم:</strong> MinoreMC</p>
                        <p><strong>الإصدار:</strong> <span id="version">1.21.130.02</span></p>
                        <p><strong>الحالة:</strong> <span class="status-badge online" id="serverStatus">🟢 يعمل</span></p>
                        <p><strong>وقت التشغيل:</strong> <span id="uptime">0 ثانية</span></p>
                    </div>
                    
                    <div class="card">
                        <h3><i class="fas fa-users"></i> اللاعبون</h3>
                        <p><strong>المتصلون:</strong> <span id="playerCount">0</span>/20</p>
                        <p><strong>إجمالي الاتصالات:</strong> <span id="totalConnections">0</span></p>
                        <div id="playersList" class="players-grid">
                            <!-- اللاعبون يظهرون هنا -->
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3><i class="fas fa-plug"></i> كيفية الاتصال</h3>
                        <p>1. افتح Minecraft Bedrock</p>
                        <p>2. اضغط على "Play" ثم "Servers"</p>
                        <p>3. اضغط "Add Server"</p>
                        <div class="ip-box">
                            <div id="ipAddress">جاري التحميل...</div>
                            <div>Port: <strong>19132</strong></div>
                        </div>
                        <button onclick="copyIP()"><i class="fas fa-copy"></i> نسخ العنوان</button>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-comments"></i> الدردشة المباشرة</h3>
                    <div id="chatMessages" class="chat-box">
                        <!-- الرسائل تظهر هنا -->
                    </div>
                    <div class="controls">
                        <input type="text" id="messageInput" placeholder="اكتب رسالة بث...">
                        <button onclick="sendBroadcast()"><i class="fas fa-paper-plane"></i> إرسال</button>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-chart-line"></i> الإحصائيات</h3>
                    <p><strong>إجمالي الرسائل:</strong> <span id="totalChats">0</span></p>
                    <p><strong>آخر تحديث:</strong> <span id="lastUpdate">--:--:--</span></p>
                </div>
                
                <footer>
                    <p>⚡ MinoreMC - سيرفر مجاني يعمل 24/7</p>
                    <p>📱 يدعم إصدار 1.21.130 | 🛡️ مضاد للغش | ✨ تجربة سلسة</p>
                    <p>© 2024 MinoreMC - جميع الحقوق محفوظة</p>
                </footer>
            </div>
            
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let players = [];
                
                // تحديث كل 10 ثواني
                async function updateStats() {
                    try {
                        const res = await fetch('/api/stats');
                        const data = await res.json();
                        
                        document.getElementById('version').textContent = data.version;
                        document.getElementById('playerCount').textContent = \`\${data.onlinePlayers}/\${data.maxPlayers}\`;
                        document.getElementById('totalConnections').textContent = data.totalConnections;
                        document.getElementById('totalChats').textContent = data.totalChats;
                        document.getElementById('uptime').textContent = formatTime(data.uptime);
                        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                        
                        // تحديث قائمة اللاعبين
                        updatePlayersList(data.players);
                    } catch (error) {
                        console.error('Error updating stats:', error);
                    }
                }
                
                // جلب IP السيرفر
                async function getServerIP() {
                    try {
                        const res = await fetch('/get-ip');
                        const data = await res.json();
                        document.getElementById('ipAddress').innerHTML = \`
                            <strong>\${data.ip}</strong><br>
                            <small>\${data.connectString}</small>
                        \`;
                    } catch (error) {
                        document.getElementById('ipAddress').textContent = window.location.hostname;
                    }
                }
                
                function updatePlayersList(playersData) {
                    const container = document.getElementById('playersList');
                    if (playersData.length === 0) {
                        container.innerHTML = '<p style="text-align:center;width:100%;">لا يوجد لاعبون متصلون</p>';
                        return;
                    }
                    
                    container.innerHTML = playersData.map(player => \`
                        <div class="player-card">
                            <div class="player-avatar">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <strong>\${player.username}</strong><br>
                                <small>\${new Date(player.joinedAt).toLocaleTimeString()}</small>
                            </div>
                        </div>
                    \`).join('');
                }
                
                function formatTime(seconds) {
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    const secs = seconds % 60;
                    return \`\${hours}س \${minutes}د \${secs}ث\`;
                }
                
                function copyIP() {
                    const ipElement = document.getElementById('ipAddress');
                    const ip = ipElement.querySelector('strong')?.textContent || ipElement.textContent;
                    navigator.clipboard.writeText(ip + ':19132');
                    alert('✓ تم نسخ العنوان: ' + ip + ':19132');
                }
                
                function sendBroadcast() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    
                    if (message) {
                        fetch('/api/broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message })
                        });
                        
                        input.value = '';
                    }
                }
                
                // Socket.IO events
                socket.on('connect', () => {
                    console.log('Connected to server');
                });
                
                socket.on('server-info', (data) => {
                    console.log('Server info:', data);
                });
                
                socket.on('player-joined', (data) => {
                    console.log('Player joined:', data);
                    updateStats();

                         // إضافة رسالة للدردشة
                    const chatBox = document.getElementById('chatMessages');
                    const msg = document.createElement('div');
                    msg.className = 'chat-message';
                    msg.innerHTML = \`<span style="color:#4CAF50;">✨ <strong>\${data.username}</strong> انضم للسيرفر</span>\`;
                    chatBox.appendChild(msg);
                    chatBox.scrollTop = chatBox.scrollHeight;
                });
                
                socket.on('player-left', (data) => {
                    console.log('Player left:', data);
                    updateStats();
                    
                    const chatBox = document.getElementById('chatMessages');
                    const msg = document.createElement('div');
                    msg.className = 'chat-message';
                    msg.innerHTML = \`<span style="color:#f44336;">👋 <strong>\${data.username}</strong> غادر السيرفر</span>\`;
                    chatBox.appendChild(msg);
                    chatBox.scrollTop = chatBox.scrollHeight;
                });
                
                socket.on('chat-message', (data) => {
                    console.log('Chat message:', data);
                    
                    const chatBox = document.getElementById('chatMessages');
                    const msg = document.createElement('div');
                    msg.className = 'chat-message';
                    msg.innerHTML = \`
                        <span class="player">\${data.player}:</span>
                        <span>\${data.message}</span>
                        <small style="color:#aaa;margin-right:10px;">\${data.time}</small>
                    \`;
                    chatBox.appendChild(msg);
                    chatBox.scrollTop = chatBox.scrollHeight;
                });
                
                socket.on('stats-update', (data) => {
                    document.getElementById('playerCount').textContent = \`\${data.onlinePlayers}/20\`;
                    document.getElementById('uptime').textContent = formatTime(data.uptime);
                });
                
                // تهيئة الصفحة
                document.addEventListener('DOMContentLoaded', () => {
                    getServerIP();
                    updateStats();
                    setInterval(updateStats, 10000); // تحديث كل 10 ثواني
                    
                    // تحديث لمنع نوم Render
                    setInterval(() => fetch('/ping'), 30000);
                    
                    // السماح بالإرسال بالإنتر
                    document.getElementById('messageInput').addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') sendBroadcast();
                    });
                });
            </script>
        </body>
        </html>
        `;
    }
}

// تشغيل السيرفر
const server = new MinoreMCServer();

// معالجة الإغلاق النظيف
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down MinoreMC gracefully...');
    server.mcServer.close();
    process.exit(0);
});

module.exports = server;
```
