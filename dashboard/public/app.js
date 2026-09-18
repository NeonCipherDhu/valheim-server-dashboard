// =========================================================
// VALHEIM CYBER OPERATIONS HUD - CLIENT APPLICATION
// =========================================================

let ws = null;
let currentStatus = 'offline';
let rawLogsVisible = true;

// Audio Synthesizer for Cyber Clicks (Web Audio API)
let audioCtx = null;
function playCyberBeep(freq = 880, type = 'sine', duration = 0.04) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio context may be blocked before first user gesture; ignore silently
  }
}

// DOM References
const brandTitle = document.getElementById('brand-title');
const brandRealmTag = document.getElementById('brand-realm-tag');
const brandRealmChip = document.getElementById('brand-realm-chip');
const brandSubtitle = document.getElementById('brand-subtitle');
const brandTextContainer = document.getElementById('brand-text-container');
const statusBadge = document.getElementById('server-status-badge');
const statusText = document.getElementById('server-status-text');
const uptimeVal = document.getElementById('uptime-val');
const sysClockVal = document.getElementById('sys-clock-val');

const detailWorldName = document.getElementById('detail-world-name');
const detailPort = document.getElementById('detail-port');
const serverPidTag = document.getElementById('server-pid-tag');

const btnStart = document.getElementById('btn-start-server');
const btnStop = document.getElementById('btn-stop-server');
const btnRestart = document.getElementById('btn-restart-server');
const btnQuickBackup = document.getElementById('btn-quick-backup');

const metricCpu = document.getElementById('metric-cpu');
const cpuBar = document.getElementById('cpu-bar');
const metricRam = document.getElementById('metric-ram');
const ramBar = document.getElementById('ram-bar');

// Card 1: Vikings
const metricPlayerCount = document.getElementById('metric-player-count');
const metricSessionDeaths = document.getElementById('metric-session-deaths');
const btnResetDeaths = document.getElementById('btn-reset-deaths');
const activeVikingsList = document.getElementById('active-vikings-list');
const historyVikingsList = document.getElementById('history-vikings-list');

// Card 2: Join Code & Security Credentials
const joinCodeDisplay = document.getElementById('join-code-display');
const joinStatusLabel = document.getElementById('join-status-label');
const tokenSubStatus = document.getElementById('token-sub-status');
const btnCopyCode = document.getElementById('btn-copy-code');
const realmPwdDisplay = document.getElementById('realm-pwd-display');
const btnToggleCardPwd = document.getElementById('btn-toggle-card-pwd');
const btnCopyPassword = document.getElementById('btn-copy-password');
const pwdSubStatus = document.getElementById('pwd-sub-status');
const credentialsActiveContainer = document.getElementById('credentials-active-container');
const credentialsUnboundBox = document.getElementById('credentials-unbound-box');
const btnUnboundOpenRealms = document.getElementById('btn-unbound-open-realms');
const specCrossplay = document.getElementById('spec-crossplay');
const specPublic = document.getElementById('spec-public');

let isHeroPwdRevealed = false;
let currentHeroPassword = '';

// Card 3: World Saves
const metricSaveTime = document.getElementById('metric-save-time');
const saveDurationVal = document.getElementById('save-duration-val');
const saveIntervalVal = document.getElementById('save-interval-val');
const saveBackupsVal = document.getElementById('save-backups-val');
const recentSavesList = document.getElementById('recent-saves-list');

// Card 4: Health & Chronicle
const healthPillBadge = document.getElementById('health-pill-badge');
const healthStatusIcon = document.getElementById('health-status-icon');
const anomalyAlertBox = document.getElementById('anomaly-alert-box');
const anomalyTitle = document.getElementById('anomaly-title');
const anomalyDesc = document.getElementById('anomaly-desc');
const btnResolveAnomaly = document.getElementById('btn-resolve-anomaly');
const activityFeedList = document.getElementById('activity-feed-list');

// Collapsible Raw Logs
const btnToggleRawLogs = document.getElementById('btn-toggle-raw-logs');
const rawLogsContainer = document.getElementById('raw-logs-container');
const rawLogsViewport = document.getElementById('raw-logs-viewport');
const rawLogsArrow = document.getElementById('raw-logs-arrow');

// Unified Settings & Operations Hub Modal
const modalSettings = document.getElementById('modal-settings');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const formSettings = document.getElementById('form-settings');
const cfgWorldSelect = document.getElementById('cfg-world-select');
const cfgActiveTag = document.getElementById('cfg-active-tag');
const btnRollCfgPassword = document.getElementById('btn-roll-cfg-password');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnBackToWorlds = document.getElementById('btn-back-to-worlds');
const cfgTargetRealmHeader = document.getElementById('cfg-target-realm-header');
const btnExitDashboard = document.getElementById('btn-exit-dashboard');

// Primary Settings Hub Tabs & Panels (Realms & Worlds | Snapshots)
const tabBtnSettingsRealms = document.getElementById('tab-btn-settings-realms');
const tabBtnSettingsSnapshots = document.getElementById('tab-btn-settings-snapshots');
const panelSettingsRealms = document.getElementById('panel-settings-realms');
const panelSettingsSnapshots = document.getElementById('panel-settings-snapshots');

// Snapshots Tab Elements
const backupsListContainer = document.getElementById('backups-list-container');
const btnCreateBackupModal = document.getElementById('btn-create-backup-modal');

// Realms & Worlds Sub-Tabs & Elements
const worldsSubtabsBar = document.getElementById('worlds-subtabs-bar');
const tabBtnCreateWorld = document.getElementById('tab-btn-create-world');
const tabBtnListWorlds = document.getElementById('tab-btn-list-worlds');
const panelCreateWorld = document.getElementById('panel-create-world');
const panelListWorlds = document.getElementById('panel-list-worlds');
const panelConfigWorld = document.getElementById('panel-config-world');
const formCreateWorld = document.getElementById('form-create-world');
const worldGenName = document.getElementById('world-gen-name');
const worldGenPassword = document.getElementById('world-gen-password');
const btnRollPassword = document.getElementById('btn-roll-password');
const worldGenSeed = document.getElementById('world-gen-seed');
const btnRollSeed = document.getElementById('btn-roll-seed');
const seedHashDisplay = document.getElementById('seed-hash-display');
const worldGenPreset = document.getElementById('world-gen-preset');
const worldGenActive = document.getElementById('world-gen-active');
const worldGenCrossplay = document.getElementById('world-gen-crossplay');
const existingWorldsContainer = document.getElementById('existing-worlds-container');
const worldsCountPill = document.getElementById('worlds-count-pill');
const btnCancelWorld = document.getElementById('btn-cancel-world');
const btnQuickNewWorld = document.getElementById('btn-quick-new-world');

// Top Alert Banner Elements
const bannerNoRealm = document.getElementById('banner-no-realm');
const bannerAlertEyebrow = document.getElementById('banner-alert-eyebrow');
const bannerAlertTitle = document.getElementById('banner-alert-title');
const bannerAlertDesc = document.getElementById('banner-alert-desc');
const btnBannerCreateWorld = document.getElementById('btn-banner-create-world');
const btnBannerImportWorld = document.getElementById('btn-banner-import-world');

// Import Subtab Elements
const tabBtnImportWorld = document.getElementById('tab-btn-import-world');
const panelImportWorld = document.getElementById('panel-import-world');
const localClientWorldsList = document.getElementById('local-client-worlds-list');
const worldDropZone = document.getElementById('world-drop-zone');
const fileUploadInput = document.getElementById('file-upload-input');
const uploadedFilesPreview = document.getElementById('uploaded-files-preview');
const previewFilesList = document.getElementById('preview-files-list');
const importCustomPassword = document.getElementById('import-custom-password');
const importSetActive = document.getElementById('import-set-active');
const btnClearUploadFiles = document.getElementById('btn-clear-upload-files');
const btnSubmitWorldUpload = document.getElementById('btn-submit-world-upload');
const serverWorldsDirDisplay = document.getElementById('server-worlds-dir-display');
const btnCopyWorldsPath = document.getElementById('btn-copy-worlds-path');
const btnRescanImportedWorlds = document.getElementById('btn-rescan-imported-worlds');

let stagedUploadFiles = [];

// =========================================================
// REAL-TIME CLOCK TICKER
// =========================================================
function startSystemClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    if (sysClockVal) {
      sysClockVal.textContent = `${h}:${m}:${s}`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

// Scramble text effect for high-tech hacker decryption
let scrambleInterval = null;
function scrambleDecodeText(element, finalVal, durationMs = 600) {
  if (!element) return;
  clearInterval(scrambleInterval);
  const chars = '0123456789ABCDEF!@#$%&*';
  const startTime = Date.now();
  
  scrambleInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    
    if (progress >= 1) {
      clearInterval(scrambleInterval);
      element.textContent = finalVal;
      return;
    }

    let scrambled = '';
    for (let i = 0; i < finalVal.length; i++) {
      if (Math.random() < progress) {
        scrambled += finalVal[i];
      } else {
        scrambled += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    element.textContent = scrambled;
  }, 40);
}

// =========================================================
// WEBSOCKET LOGIC
// =========================================================
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[SYS_NET] Connected to Valheim Dashboard server.');
    showToast('[SYS_LINK] Connected to server telemetry feed.', 'info');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSocketMessage(msg);
    } catch (e) {
      console.error('[SYS_ERR] Error parsing WS message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[SYS_NET] WebSocket closed. Reconnecting in 2s...');
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error('[SYS_NET] WebSocket error:', err);
    ws.close();
  };
}

function handleSocketMessage(msg) {
  switch (msg.type) {
    case 'init':
      applyServerState(msg.data);
      if (msg.data.history && msg.data.history.length > 0) {
        renderRawLogs(msg.data.history);
      }
      break;

    case 'status':
      applyServerState(msg.data);
      break;

    case 'metrics':
      applyMetrics(msg.data);
      break;

    case 'activity':
      prependActivityItem(msg.data);
      break;

    case 'log':
      appendRawLogLine(msg.data);
      break;
  }
}

// =========================================================
// STATE & UI UPDATE
// =========================================================
let lastKnownJoinCode = '';

function updateActiveRealmDisplay(worldName, serverName) {
  const cleanWorld = (worldName || '').trim();
  const hasActiveRealm = cleanWorld.length > 0 && cleanWorld.toUpperCase() !== 'NONE' && cleanWorld !== '------';

  if (hasActiveRealm) {
    if (brandTitle) {
      brandTitle.className = '';
      brandTitle.textContent = cleanWorld;
    }
    if (brandRealmTag) {
      brandRealmTag.className = '';
      brandRealmTag.textContent = cleanWorld;
    }
    if (brandRealmChip) {
      brandRealmChip.className = 'hud-status-chip chip-active';
      brandRealmChip.textContent = 'REALM_BOUND';
    }
    if (brandSubtitle) {
      brandSubtitle.className = 'subtitle';
      brandSubtitle.innerHTML = `HOSTING: <strong id="brand-server-name">${serverName || cleanWorld + '_DServer'}</strong> // TACTICAL HUD v2.4`;
    }
    if (detailWorldName) {
      detailWorldName.className = '';
      detailWorldName.textContent = cleanWorld;
    }
  } else {
    if (brandTitle) {
      brandTitle.className = 'brand-no-realm';
      brandTitle.textContent = '[NO ACTIVE REALM]';
    }
    if (brandRealmTag) {
      brandRealmTag.className = 'unbound-tag';
      brandRealmTag.textContent = 'UNBOUND';
    }
    if (brandRealmChip) {
      brandRealmChip.className = 'hud-status-chip chip-warning';
      brandRealmChip.textContent = 'NO_REALM_ACTIVE';
    }
    if (brandSubtitle) {
      brandSubtitle.className = 'subtitle subtitle-warning';
      brandSubtitle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>NO REALM BOUND // CLICK TO SELECT IN [REALMS]';
    }
    if (detailWorldName) {
      detailWorldName.className = 'brand-no-realm';
      detailWorldName.textContent = '[NONE // UNBOUND]';
    }
  }
}

if (brandTextContainer) {
  brandTextContainer.addEventListener('click', () => {
    playCyberBeep(900, 'sine', 0.04);
    openWorldsModal('list');
  });
}

function applyServerState(data) {
  const prevStatus = currentStatus;
  currentStatus = data.status || 'offline';

  // Config & Header Titles
  if (data.config) {
    updateActiveRealmDisplay(data.config.worldName, data.config.serverName);
    detailPort.textContent = `UDP ${data.config.serverPort || 2456}`;
    saveIntervalVal.textContent = `${Math.round((data.config.saveInterval || 1800) / 60)} mins`;
    saveBackupsVal.textContent = data.config.backups || 4;
    if (specCrossplay) {
      if (data.config.crossplay) {
        specCrossplay.textContent = 'Enabled (PlayFab Party)';
        specCrossplay.className = 'spec-val spec-green';
        specCrossplay.onclick = null;
        specCrossplay.style.cursor = 'default';
        specCrossplay.title = 'PlayFab cloud gateway active';
      } else {
        specCrossplay.innerHTML = '<span style="color: var(--neon-amber);">Direct IP Only</span> <span style="font-size: 0.72rem; text-decoration: underline; color: var(--neon-matrix); margin-left: 4px;">[SWITCH]</span>';
        specCrossplay.className = 'spec-val';
        specCrossplay.style.cursor = 'pointer';
        specCrossplay.title = 'Click to switch to PlayFab Crossplay';
        specCrossplay.onclick = () => triggerToggleCrossplay(true);
      }
    }
    specPublic.textContent = data.config.isPublic ? 'Visible in Community List' : 'Hidden / Direct Only';
  }

  // Server Status Badge
  statusBadge.className = `status-badge status-${currentStatus}`;
  statusText.textContent = currentStatus.toUpperCase();

  // PID Tag
  serverPidTag.textContent = data.pid ? `PID: ${data.pid}` : 'PID: --';

  // Action Buttons State
  if (currentStatus === 'online') {
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnRestart.disabled = false;
  } else if (currentStatus === 'starting') {
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnRestart.disabled = true;
  } else {
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnRestart.disabled = true;
    uptimeVal.textContent = '--:--:--';
  }

  // CARD 1: VIKINGS
  const count = data.playerCount || 0;
  metricPlayerCount.textContent = count;
  if (metricSessionDeaths) metricSessionDeaths.textContent = data.sessionCasualties || 0;
  renderVikingsRoster(data.players || []);
  renderHistoricalClan(data.playerHistory || []);

  // TOP ALERT BANNER: UNBOUND / NO REALM WARNING
  const detectedCount = (data.detectedWorldsCount !== undefined)
    ? data.detectedWorldsCount
    : (worldsCountPill ? parseInt(worldsCountPill.textContent, 10) || 0 : 0);

  if (worldsCountPill && data.detectedWorldsCount !== undefined) {
    worldsCountPill.textContent = data.detectedWorldsCount;
  }

  const cleanWorld = (data.config && data.config.worldName ? data.config.worldName : '').trim();
  const isRealmInit = Boolean(
    data.isRealmInitialized !== undefined
      ? data.isRealmInitialized
      : (cleanWorld.length > 0 && cleanWorld.toUpperCase() !== 'NONE' && cleanWorld !== '------')
  );

  if (bannerNoRealm) {
    if (isRealmInit) {
      bannerNoRealm.classList.add('hidden');
    } else if (detectedCount === 0) {
      bannerNoRealm.classList.remove('hidden');
      if (bannerAlertEyebrow) bannerAlertEyebrow.textContent = '[STORAGE_SCAN // ZERO_WORLDS_DETECTED]';
      if (bannerAlertTitle) bannerAlertTitle.textContent = 'NO VALHEIM REALMS DETECTED IN ENGINE MATRIX';
      if (bannerAlertDesc) bannerAlertDesc.textContent = 'The dedicated server requires an active realm to generate terrain and accept players. Initialize a new realm or import an existing world to launch the server.';
    } else {
      bannerNoRealm.classList.remove('hidden');
      if (bannerAlertEyebrow) bannerAlertEyebrow.textContent = '[MATRIX_ALERT // ACTIVE_REALM_UNBOUND]';
      if (bannerAlertTitle) bannerAlertTitle.textContent = 'ACTIVE REALM UNBOUND // SELECT OR CREATE REALM';
      if (bannerAlertDesc) bannerAlertDesc.textContent = `${detectedCount} realm(s) detected in storage, but none is currently bound to the server engine. Select an active realm or generate a new one.`;
    }
  }

  // CARD 2: JOIN CODE & SECURITY CREDENTIALS

  if (!isRealmInit) {
    if (credentialsActiveContainer) credentialsActiveContainer.classList.add('hidden');
    if (credentialsUnboundBox) credentialsUnboundBox.classList.remove('hidden');
    joinStatusLabel.textContent = 'UNBOUND';
    joinStatusLabel.className = 'join-status-badge unbound';
    joinCodeDisplay.textContent = '';
    if (realmPwdDisplay) realmPwdDisplay.textContent = '';
    currentHeroPassword = '';
    btnCopyCode.disabled = true;
    if (btnCopyPassword) btnCopyPassword.disabled = true;
  } else {
    if (credentialsActiveContainer) credentialsActiveContainer.classList.remove('hidden');
    if (credentialsUnboundBox) credentialsUnboundBox.classList.add('hidden');

    // Realm Password Display & Copy
    currentHeroPassword = (data.config && data.config.serverPassword) ? data.config.serverPassword : 'amaboys';
    if (realmPwdDisplay) {
      realmPwdDisplay.textContent = isHeroPwdRevealed ? currentHeroPassword : '••••••••';
    }
    if (pwdSubStatus) {
      pwdSubStatus.textContent = `Bound to realm: ${cleanWorld} // Required for clients`;
    }
    if (btnCopyPassword) {
      btnCopyPassword.disabled = !currentHeroPassword;
    }

    // Join Code Display & State
    const isCrossplay = (data.config && data.config.crossplay !== undefined) ? Boolean(data.config.crossplay) : true;

    if (currentStatus === 'online') {
      if (data.joinCode) {
        if (lastKnownJoinCode !== data.joinCode) {
          joinCodeDisplay.className = 'code-value-display';
          scrambleDecodeText(joinCodeDisplay, data.joinCode, 700);
          lastKnownJoinCode = data.joinCode;
        } else {
          joinCodeDisplay.className = 'code-value-display';
          joinCodeDisplay.textContent = data.joinCode;
        }
        joinStatusLabel.textContent = 'ACTIVE // READY';
        joinStatusLabel.className = 'join-status-badge active';
        btnCopyCode.disabled = false;
        if (tokenSubStatus) {
          tokenSubStatus.className = 'token-sub-status';
          tokenSubStatus.innerHTML = '<span style="color: var(--neon-matrix); font-weight: 700;">●</span> Cloud link established &amp; listening';
        }
      } else if (!isCrossplay) {
        joinCodeDisplay.className = 'code-value-display direct-mode';
        joinCodeDisplay.textContent = 'DIRECT_IP';
        joinStatusLabel.textContent = 'STEAM DIRECT';
        joinStatusLabel.className = 'join-status-badge';
        btnCopyCode.disabled = true;
        lastKnownJoinCode = '';
        if (tokenSubStatus) {
          tokenSubStatus.className = 'token-sub-status';
          tokenSubStatus.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <span><span style="color: var(--neon-cyan); font-weight: 700;">●</span> Crossplay disabled. Connect via Direct IP:Port (${(data.config && data.config.serverPort) || 2456})</span>
              <button type="button" class="cyber-btn-ghost btn-xs" id="btn-quick-enable-crossplay" style="color: var(--neon-matrix); border-color: var(--neon-matrix); padding: 2px 8px; font-size: 0.72rem;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
                <span style="margin-left: 4px;">ENABLE PLAYFAB KEY</span>
              </button>
            </div>
          `;
          const btnQuick = document.getElementById('btn-quick-enable-crossplay');
          if (btnQuick) {
            btnQuick.onclick = () => triggerToggleCrossplay(true);
          }
        }
      } else {
        // Online and crossplay enabled, awaiting PlayFab session join code to be registered
        joinCodeDisplay.className = 'code-value-display awaiting';
        joinCodeDisplay.innerHTML = `
          <span class="awaiting-dots" title="Awaiting PlayFab cloud join token...">
            <span class="awaiting-dot"></span>
            <span class="awaiting-dot"></span>
            <span class="awaiting-dot"></span>
            <span class="awaiting-dot"></span>
            <span class="awaiting-dot"></span>
            <span class="awaiting-dot"></span>
          </span>
        `;
        joinStatusLabel.textContent = 'INTERCEPTING_CODE...';
        joinStatusLabel.className = 'join-status-badge awaiting';
        btnCopyCode.disabled = true;
        lastKnownJoinCode = '';
        if (tokenSubStatus) {
          tokenSubStatus.className = 'token-sub-status awaiting';
          tokenSubStatus.innerHTML = '<span class="radar-spinner"></span> Intercepting engine registration stream...';
        }
      }
    } else if (currentStatus === 'starting') {
      joinCodeDisplay.className = 'code-value-display awaiting';
      joinCodeDisplay.innerHTML = `
        <span class="awaiting-dots" title="Awaiting server initialization &amp; join token...">
          <span class="awaiting-dot"></span>
          <span class="awaiting-dot"></span>
          <span class="awaiting-dot"></span>
          <span class="awaiting-dot"></span>
          <span class="awaiting-dot"></span>
          <span class="awaiting-dot"></span>
        </span>
      `;
      joinStatusLabel.textContent = 'INITIALIZING...';
      joinStatusLabel.className = 'join-status-badge awaiting';
      btnCopyCode.disabled = true;
      lastKnownJoinCode = '';
      if (tokenSubStatus) {
        tokenSubStatus.className = 'token-sub-status awaiting';
        tokenSubStatus.innerHTML = '<span class="radar-spinner"></span> Initializing realm &amp; awaiting cloud connection...';
      }
    } else {
      joinCodeDisplay.className = 'code-value-display';
      joinCodeDisplay.textContent = '------';
      joinStatusLabel.textContent = 'OFFLINE';
      joinStatusLabel.className = 'join-status-badge';
      btnCopyCode.disabled = true;
      lastKnownJoinCode = '';
      if (tokenSubStatus) {
        tokenSubStatus.className = 'token-sub-status';
        tokenSubStatus.textContent = 'Server offline. Start server to generate code.';
      }
    }
  }

  // CARD 3: WORLD SAVES
  if (data.lastSaveTime) {
    metricSaveTime.textContent = data.lastSaveTime;
  }
  if (data.lastSaveDuration) {
    saveDurationVal.textContent = data.lastSaveDuration;
  }
  renderSavesHistory(data.saveHistory || []);

  // CARD 4: HEALTH & ALERTS
  renderHealthState(data.errorList || []);
  if (data.activityFeed && data.activityFeed.length > 0) {
    renderActivityFeed(data.activityFeed);
  }

  // Telemetry Metrics
  if (data.metrics) {
    applyMetrics(data.metrics);
  }
}

// Helper: Escape HTML strings safely
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render Vikings Roster
function renderVikingsRoster(players) {
  activeVikingsList.innerHTML = '';
  if (!players || players.length === 0) {
    activeVikingsList.innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 15h8"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        <span>NO WARRIOR SIGNALS DETECTED IN REALM</span>
      </div>
    `;
    return;
  }

  players.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'viking-card-item';
    const initial = p.name ? p.name.charAt(0).toUpperCase() : 'V';
    const deaths = p.deaths || 0;

    item.innerHTML = `
      <div class="viking-left">
        <div class="viking-avatar">${initial}</div>
        <div>
          <div class="viking-name">${escapeHtml(p.name)}</div>
          <div class="viking-sub">${p.steamId ? escapeHtml(p.steamId) : 'JOINED: ' + (p.joinedAt || 'RECENTLY')}</div>
        </div>
      </div>
      <div class="viking-right-stats">
        <div class="viking-combat-chips">
          <span class="combat-chip chip-deaths" title="Deaths in current session">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="12" r="1"/>
              <circle cx="15" cy="12" r="1"/>
              <path d="M8 20v2h8v-2"/>
              <path d="m12.5 17-.5-1-.5 1h1z"/>
              <path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>
            </svg>
            <span class="chip-lbl">DEATHS:</span>
            <strong>${deaths}</strong>
          </span>
        </div>
        <div class="viking-badge-online">
          <span class="pulse-dot"></span> IN_REALM
        </div>
      </div>
    `;
    activeVikingsList.appendChild(item);
  });
}

// Render Historical Clan Members
function renderHistoricalClan(history) {
  historyVikingsList.innerHTML = '';
  if (!history || history.length === 0) {
    historyVikingsList.innerHTML = '<span class="viking-chip-empty">No warriors have visited this realm yet...</span>';
    return;
  }

  history.forEach((h) => {
    const chip = document.createElement('span');
    chip.className = 'viking-chip';
    const deaths = h.deaths || 0;
    chip.title = `${h.name} (${h.steamId || 'Known Viking'}) - Deaths: ${deaths}`;
    chip.innerHTML = `
      <span class="chip-name">${escapeHtml(h.name)}</span>
      <span class="chip-combat-mini">
        <span class="mini-d" title="Session Deaths">D:${deaths}</span>
      </span>
    `;
    historyVikingsList.appendChild(chip);
  });
}

// Render Saves History
function renderSavesHistory(saves) {
  recentSavesList.innerHTML = '';
  if (!saves || saves.length === 0) {
    recentSavesList.innerHTML = '<div class="empty-state-sm">No world saves recorded during this session.</div>';
    return;
  }

  saves.slice(0, 5).forEach((s) => {
    const item = document.createElement('div');
    item.className = 'save-item';
    const badgeLabel = s.isBackup ? 'AUTO_SNAPSHOT' : s.duration;
    item.innerHTML = `
      <div class="save-item-title">SAVE ${s.number ? '#' + s.number : ''} (${s.time})</div>
      <span class="save-item-tag">${badgeLabel}</span>
    `;
    recentSavesList.appendChild(item);
  });
}

// Render Health & Errors
function renderHealthState(errors) {
  // If the server is currently up and running online, benign world load/init logs are auto-resolved
  const activeErrors = (errors || []).filter((err) => {
    if (currentStatus === 'online' && /Failed to load world|LoadError/i.test(err.message)) {
      return false;
    }
    return true;
  });

  if (activeErrors && activeErrors.length > 0) {
    healthPillBadge.className = 'health-pill health-warning';
    healthPillBadge.innerHTML = `<span class="pulse-dot"></span> ${activeErrors.length} ALERT${activeErrors.length > 1 ? 'S' : ''}_DETECTED`;
    healthStatusIcon.className = 'feature-icon icon-red';

    const latest = activeErrors[0];
    anomalyAlertBox.classList.remove('hidden');
    anomalyTitle.textContent = `SYS_WARNING AT ${latest.time}`;
    anomalyDesc.textContent = latest.message;
  } else {
    healthPillBadge.className = 'health-pill health-nominal';
    healthPillBadge.innerHTML = '<span class="pulse-dot"></span> ALL_SYSTEMS_NOMINAL';
    healthStatusIcon.className = 'feature-icon icon-cyan';
    anomalyAlertBox.classList.add('hidden');
  }
}

if (btnResolveAnomaly) {
  btnResolveAnomaly.addEventListener('click', async () => {
    playCyberBeep(950, 'sine', 0.03);
    try {
      await fetch('/api/diagnostics/clear', { method: 'POST' });
      renderHealthState([]);
      showToast('[DIAGNOSTICS] Telemetry anomaly resolved. Systems nominal.', 'info');
    } catch (e) {
      renderHealthState([]);
    }
  });
}

// Render Activity Feed
function renderActivityFeed(feed) {
  activityFeedList.innerHTML = '';
  feed.slice(0, 10).forEach((item) => {
    const el = createActivityElement(item);
    activityFeedList.appendChild(el);
  });
}

function prependActivityItem(item) {
  const el = createActivityElement(item);
  activityFeedList.insertBefore(el, activityFeedList.firstChild);
  if (activityFeedList.children.length > 15) {
    activityFeedList.removeChild(activityFeedList.lastChild);
  }
}

function createActivityElement(item) {
  const div = document.createElement('div');
  div.className = `activity-item type-${item.badge || item.type || 'event'}`;
  div.innerHTML = `
    <span class="activity-dot"></span>
    <div class="activity-text">
      <div class="activity-main">${item.title} — ${item.subtitle || ''}</div>
      <div class="activity-time">${item.time || ''}</div>
    </div>
  `;
  return div;
}

// Telemetry Metrics
function applyMetrics(metrics) {
  if (metrics.uptime && currentStatus !== 'offline') {
    const hours = String(Math.floor(metrics.uptime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((metrics.uptime % 3600) / 60)).padStart(2, '0');
    const seconds = String(metrics.uptime % 60).padStart(2, '0');
    uptimeVal.textContent = `${hours}:${minutes}:${seconds}`;
  }

  const cpu = metrics.cpu || 0;
  metricCpu.textContent = `${cpu.toFixed(1)}%`;
  cpuBar.style.width = `${Math.min(100, cpu)}%`;

  const ram = metrics.ram || 0;
  metricRam.textContent = `${ram.toLocaleString()} MB`;
  const ramPercent = Math.min(100, Math.round((ram / 4096) * 100));
  ramBar.style.width = `${ramPercent}%`;
}

// =========================================================
// RAW LOGS (COLLAPSIBLE / ADVANCED HACKER TERMINAL)
// =========================================================
btnToggleRawLogs.addEventListener('click', () => {
  playCyberBeep(700, 'square', 0.03);
  rawLogsVisible = !rawLogsVisible;
  if (rawLogsVisible) {
    rawLogsContainer.classList.remove('hidden');
    rawLogsArrow.textContent = '▲';
    rawLogsViewport.scrollTop = rawLogsViewport.scrollHeight;
  } else {
    rawLogsContainer.classList.add('hidden');
    rawLogsArrow.textContent = '▼';
  }
});

function renderRawLogs(logs) {
  rawLogsViewport.innerHTML = '';
  logs.forEach((log) => {
    appendRawLogLine(log);
  });
  if (rawLogsVisible) {
    rawLogsViewport.scrollTop = rawLogsViewport.scrollHeight;
  }
}

function appendRawLogLine(log) {
  const row = document.createElement('div');
  row.className = 'log-line';
  row.textContent = log.raw;
  rawLogsViewport.appendChild(row);
  if (rawLogsVisible) {
    rawLogsViewport.scrollTop = rawLogsViewport.scrollHeight;
  }
}

// =========================================================
// CUSTOM TACTICAL CYBER CONFIRMATION MODAL
// =========================================================
function showCyberConfirm({
  title = 'CONFIRM ACTION',
  eyebrow = '[SECURITY_OVERRIDE // EXEC_CONFIRM]',
  message = 'Are you sure you want to proceed?',
  subtext = '',
  confirmText = 'CONFIRM EXECUTION',
  cancelText = 'ABORT',
  type = 'danger'
} = {}) {
  return new Promise((resolve) => {
    playCyberBeep(type === 'danger' ? 420 : 750, 'sawtooth', 0.08);

    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-title');
    const eyebrowEl = document.getElementById('confirm-eyebrow');
    const messageEl = document.getElementById('confirm-message');
    const subtextEl = document.getElementById('confirm-subtext');
    const iconBox = document.getElementById('confirm-icon-box');
    const btnOk = document.getElementById('btn-ok-confirm');
    const btnCancel = document.getElementById('btn-cancel-confirm');
    const btnClose = document.getElementById('btn-close-confirm');

    if (!modal) {
      resolve(window.confirm(`${title}: ${message}`));
      return;
    }

    titleEl.textContent = title;
    eyebrowEl.textContent = eyebrow;
    messageEl.textContent = message;
    if (subtext) {
      subtextEl.textContent = subtext;
      subtextEl.style.display = 'block';
    } else {
      subtextEl.style.display = 'none';
    }

    btnOk.textContent = confirmText;
    btnCancel.textContent = cancelText;

    if (type === 'danger') {
      iconBox.className = 'confirm-icon-box danger';
      btnOk.className = 'cyber-btn btn-danger';
    } else if (type === 'amber') {
      iconBox.className = 'confirm-icon-box amber';
      btnOk.className = 'cyber-btn btn-amber';
    } else {
      iconBox.className = 'confirm-icon-box cyan';
      btnOk.className = 'cyber-btn btn-primary';
    }

    function cleanup(result) {
      playCyberBeep(result ? 900 : 500, 'sine', 0.03);
      modal.classList.remove('open');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      btnClose.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
      else if (e.key === 'Enter') cleanup(true);
    }

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    btnClose.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKey);

    modal.classList.add('open');
    btnOk.focus();
  });
}

// =========================================================
// CONTROLS & API ACTIONS
// =========================================================

// Start Server
btnStart.addEventListener('click', async () => {
  playCyberBeep(920, 'sine', 0.06);
  btnStart.disabled = true;
  showToast('[SYS_EXEC] Initializing Valheim Dedicated Realm...', 'info');
  try {
    const res = await fetch('/api/server/start', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Execution error during realm start.', 'error');
      btnStart.disabled = false;
    }
  } catch (err) {
    showToast('[FAULT] Failed to communicate with dashboard API.', 'error');
    btnStart.disabled = false;
  }
});

// Stop Server
btnStop.addEventListener('click', async () => {
  const confirmed = await showCyberConfirm({
    title: 'CONFIRM TERMINATION',
    eyebrow: '[CRITICAL_OVERRIDE // PROCESS_KILL]',
    message: 'Cease Valheim Dedicated Realm?',
    subtext: 'Active players will be disconnected and server process will terminate immediately.',
    confirmText: 'TERMINATE REALM',
    cancelText: 'ABORT',
    type: 'danger'
  });
  if (!confirmed) return;

  btnStop.disabled = true;
  showToast('[SYS_EXEC] Shutting down Valheim server process...', 'info');
  try {
    const res = await fetch('/api/server/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('[SYS_MSG] Server process terminated.', 'info');
    }
  } catch (err) {
    showToast('[FAULT] Error stopping server process.', 'error');
  }
});

// Restart Server
btnRestart.addEventListener('click', async () => {
  const confirmed = await showCyberConfirm({
    title: 'CONFIRM REBOOT',
    eyebrow: '[SYSTEM_RESTART // REBOOT_SEQUENCE]',
    message: 'Restart Valheim realm node now?',
    subtext: 'World state will auto-save before cycling process and reloading network sockets.',
    confirmText: 'REBOOT REALM',
    cancelText: 'ABORT',
    type: 'amber'
  });
  if (!confirmed) return;

  btnRestart.disabled = true;
  showToast('[SYS_EXEC] Executing realm reboot sequence...', 'info');
  try {
    await fetch('/api/server/restart', { method: 'POST' });
  } catch (err) {
    showToast('[FAULT] Restart command execution failed.', 'error');
  }
});

async function triggerToggleCrossplay(enable = true) {
  playCyberBeep(1100, 'sine', 0.05);
  showToast('[PROTOCOL] Applying PlayFab Crossplay protocol & rebooting realm...', 'info');
  try {
    const res = await fetch('/api/server/toggle-crossplay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crossplay: enable })
    });
    const result = await res.json();
    if (result.success) {
      showToast('[PLAYFAB] Crossplay enabled! Intercepting join token stream...', 'info');
      pollStatus();
    } else {
      showToast(result.message || 'Failed to update protocol.', 'error');
    }
  } catch (err) {
    showToast('[FAULT] Network error toggling crossplay.', 'error');
  }
}

// Copy Join Code
btnCopyCode.addEventListener('click', async () => {
  playCyberBeep(1200, 'sine', 0.05);
  const code = joinCodeDisplay.textContent.trim();
  if (!code || code === '------' || code === '......') return;

  try {
    await navigator.clipboard.writeText(code);
    showToast(`[CRYPTO_KEY] Join Token ${code} copied to clipboard!`, 'info');
  } catch (err) {
    const tempInput = document.createElement('input');
    tempInput.value = code;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast(`[CRYPTO_KEY] Join Token ${code} copied to clipboard!`, 'info');
  }
});

// Copy Realm Password
if (btnCopyPassword) {
  btnCopyPassword.addEventListener('click', async () => {
    playCyberBeep(1200, 'sine', 0.05);
    const pwd = currentHeroPassword.trim();
    if (!pwd) return;

    try {
      await navigator.clipboard.writeText(pwd);
      showToast(`[SECURITY_KEY] Realm Password "${pwd}" copied to clipboard!`, 'info');
    } catch (err) {
      const tempInput = document.createElement('input');
      tempInput.value = pwd;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      showToast(`[SECURITY_KEY] Realm Password "${pwd}" copied to clipboard!`, 'info');
    }
  });
}

// Toggle Realm Password Mask in Hero Card
if (btnToggleCardPwd) {
  btnToggleCardPwd.addEventListener('click', () => {
    playCyberBeep(700, 'sine', 0.03);
    isHeroPwdRevealed = !isHeroPwdRevealed;
    if (realmPwdDisplay) {
      realmPwdDisplay.textContent = isHeroPwdRevealed ? currentHeroPassword : '••••••••';
    }
    btnToggleCardPwd.innerHTML = isHeroPwdRevealed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  });
}

// Open Realm Settings from Unbound Credentials Banner
if (btnUnboundOpenRealms) {
  btnUnboundOpenRealms.addEventListener('click', () => {
    playCyberBeep(900, 'sine', 0.04);
    openSettingsModal('realms');
  });
}

// Quick World Backup
btnQuickBackup.addEventListener('click', async () => {
  playCyberBeep(800, 'sine', 0.05);
  btnQuickBackup.disabled = true;
  showToast('[DB_SYNC] Creating timestamped snapshot archive...', 'info');
  try {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`[SNAPSHOT_SAVED] Archive: ${data.backupName}`, 'info');
    } else {
      showToast(data.message || 'Snapshot creation failed.', 'error');
    }
  } catch (err) {
    showToast('[FAULT] Snapshot trigger communication error.', 'error');
  } finally {
    btnQuickBackup.disabled = false;
  }
});

// Reset Session Deaths Tally
if (btnResetDeaths) {
  btnResetDeaths.addEventListener('click', async (e) => {
    e.stopPropagation();
    playCyberBeep(900, 'sine', 0.04);
    try {
      const res = await fetch('/api/diagnostics/reset-casualties', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (metricSessionDeaths) metricSessionDeaths.textContent = '0';
        showToast('[COMBAT_TALLY] Session casualties and combat deaths reset to 0.', 'info');
      }
    } catch (err) {
      showToast('[FAULT] Failed to communicate casualty reset signal.', 'error');
    }
  });
}

// Exit Dashboard Service
if (btnExitDashboard) {
  btnExitDashboard.addEventListener('click', async () => {
    const confirmed = await showCyberConfirm({
      title: 'EXIT WEB DASHBOARD',
      eyebrow: '[BACKGROUND_SERVICE // SHUTDOWN_SEQUENCE]',
      message: 'Terminate the background dashboard process?',
      subtext: 'This will stop the web dashboard server service (port 8085). Active Valheim game server processes will remain untouched.',
      confirmText: 'SHUTDOWN DASHBOARD',
      cancelText: 'STAY OPEN',
      type: 'danger'
    });
    if (!confirmed) return;

    showToast('[SYS_EXEC] Terminating dashboard service...', 'info');
    try {
      await fetch('/api/dashboard/shutdown', { method: 'POST' });
    } catch (err) {
      // Ignored if socket closes before HTTP response completes
    }

    setTimeout(() => {
      document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#06080c; color:#94a3b8; font-family:'JetBrains Mono',monospace; text-align:center; padding:2rem;">
          <div style="font-size:2.5rem; color:#ef4444; margin-bottom:1rem; text-shadow:0 0 15px rgba(239,68,68,0.5);">[DASHBOARD SERVICE TERMINATED]</div>
          <p style="font-size:1rem; max-width:520px; color:#cbd5e1; margin-bottom:1.5rem; line-height:1.6;">
            The background dashboard server on port 8085 has ceased execution.<br/>You may safely close this browser window.
          </p>
          <div style="padding:0.75rem 1.25rem; border:1px solid #1e293b; background:#0b0f17; border-radius:6px; font-size:0.8rem; color:#64748b;">
            To relaunch anytime: double-click <span style="color:#00f0ff;">start_dashboard.bat</span>
          </div>
        </div>
      `;
    }, 400);
  });
}

// =========================================================
// SETTINGS MODAL
// =========================================================
function generateSecureVikingPassword() {
  const runes = [
    'Odin', 'Thor', 'Freya', 'Loki', 'Valkyrie', 'Ragnar', 'Valhalla', 'Fenrir',
    'Asgard', 'Midgard', 'Berserk', 'Mjolnir', 'Raven', 'Skadi', 'Yggdrasil', 'Heimdall'
  ];
  const prefixes = ['Iron', 'Frost', 'Storm', 'Shadow', 'Blood', 'Rune', 'Fire', 'Thunder'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rune = runes[Math.floor(Math.random() * runes.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${prefix}${rune}${num}`;
}

// Primary Settings Hub Tab Switcher (Realms & Worlds | Snapshots)
function switchSettingsTab(tabName) {
  playCyberBeep(850, 'sine', 0.03);
  if (tabBtnSettingsRealms) tabBtnSettingsRealms.classList.remove('active');
  if (tabBtnSettingsSnapshots) tabBtnSettingsSnapshots.classList.remove('active');

  if (panelSettingsRealms) panelSettingsRealms.classList.add('hidden');
  if (panelSettingsSnapshots) panelSettingsSnapshots.classList.add('hidden');

  if (tabName === 'snapshots') {
    if (tabBtnSettingsSnapshots) tabBtnSettingsSnapshots.classList.add('active');
    if (panelSettingsSnapshots) panelSettingsSnapshots.classList.remove('hidden');
    loadBackupsList();
  } else {
    // Default: Realms & Worlds
    if (tabBtnSettingsRealms) tabBtnSettingsRealms.classList.add('active');
    if (panelSettingsRealms) panelSettingsRealms.classList.remove('hidden');
    if (!panelConfigWorld || panelConfigWorld.classList.contains('hidden')) {
      switchWorldTab('list');
    }
  }
}

if (tabBtnSettingsRealms) tabBtnSettingsRealms.addEventListener('click', () => switchSettingsTab('realms'));
if (tabBtnSettingsSnapshots) tabBtnSettingsSnapshots.addEventListener('click', () => switchSettingsTab('snapshots'));

async function openSettingsModal(defaultTab = 'realms') {
  playCyberBeep(900, 'sine', 0.04);
  switchSettingsTab(defaultTab);
  if (modalSettings) modalSettings.classList.add('open');
}

async function openRealmConfig(targetWorldName) {
  playCyberBeep(900, 'sine', 0.04);
  switchSettingsTab('realms');
  if (modalSettings) modalSettings.classList.add('open');

  if (worldsSubtabsBar) worldsSubtabsBar.classList.add('hidden');
  if (panelCreateWorld) panelCreateWorld.classList.add('hidden');
  if (panelListWorlds) panelListWorlds.classList.add('hidden');
  if (panelConfigWorld) panelConfigWorld.classList.remove('hidden');

  if (cfgTargetRealmHeader) cfgTargetRealmHeader.textContent = targetWorldName;
  await loadSettingsForWorld(targetWorldName);
}

async function loadSettingsForWorld(worldName) {
  try {
    const res = await fetch(`/api/config?world=${encodeURIComponent(worldName)}`);
    const cfg = await res.json();

    const worldNameEl = document.getElementById('cfg-worldName');
    if (worldNameEl) worldNameEl.value = worldName;
    if (cfgWorldSelect) cfgWorldSelect.value = worldName;
    if (cfgTargetRealmHeader) cfgTargetRealmHeader.textContent = worldName;

    document.getElementById('cfg-serverName').value = cfg.serverName || `${worldName}_DServer`;
    document.getElementById('cfg-password').value = cfg.serverPassword || 'amaboys';
    document.getElementById('cfg-port').value = cfg.serverPort || 2456;
    document.getElementById('cfg-dashboardPort').value = cfg.dashboardPort || 8085;
    document.getElementById('cfg-crossplay').checked = !!cfg.crossplay;
    document.getElementById('cfg-isPublic').checked = cfg.isPublic !== 0;
    document.getElementById('cfg-saveInterval').value = cfg.saveInterval || 1800;
    document.getElementById('cfg-backups').value = cfg.backups || 4;
    document.getElementById('cfg-preset').value = cfg.preset || '';
    document.getElementById('cfg-modifier').value = cfg.modifier || '';

    const isCurrentActive = !!cfg.isCurrentActive;
    document.getElementById('cfg-makeActive').checked = isCurrentActive;

    if (cfgActiveTag) {
      if (isCurrentActive) {
        cfgActiveTag.className = 'cfg-realm-status-badge active';
        cfgActiveTag.innerHTML = '<span class="pulse-dot"></span> CURRENT ACTIVE REALM';
      } else {
        cfgActiveTag.className = 'cfg-realm-status-badge';
        cfgActiveTag.innerHTML = 'INACTIVE REALM (TIED CONFIG)';
      }
    }
  } catch (e) {
    showToast('[FAULT] Failed to load configuration for realm.', 'error');
  }
}

if (btnRollCfgPassword) {
  btnRollCfgPassword.addEventListener('click', () => {
    playCyberBeep(1100, 'sine', 0.03);
    document.getElementById('cfg-password').value = generateSecureVikingPassword();
    showToast('[PASSWORD_GEN] Secure Key Generated for Realm', 'info');
  });
}

if (btnOpenSettings) btnOpenSettings.addEventListener('click', () => openSettingsModal('realms'));

function closeSettingsModal() {
  playCyberBeep(600, 'sine', 0.03);
  if (modalSettings) modalSettings.classList.remove('open');
}
if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);
if (btnCancelWorld) btnCancelWorld.addEventListener('click', closeSettingsModal);

if (modalSettings) {
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) {
      closeSettingsModal();
    }
  });
}

formSettings.addEventListener('submit', async (e) => {
  e.preventDefault();
  playCyberBeep(1000, 'sine', 0.05);
  const formData = new FormData(formSettings);
  const targetWorld = formData.get('worldName') || (cfgWorldSelect ? cfgWorldSelect.value : null);
  const makeActive = formData.get('makeActive') !== null;

  const pwd = formData.get('serverPassword');
  if (!pwd || pwd.length < 5) {
    showToast('Realm password must contain at least 5 characters.', 'error');
    return;
  }

  const updated = {
    worldName: targetWorld,
    serverName: formData.get('serverName'),
    serverPassword: pwd,
    serverPort: parseInt(formData.get('serverPort'), 10),
    dashboardPort: parseInt(formData.get('dashboardPort'), 10) || 8085,
    isPublic: formData.get('isPublic') ? 1 : 0,
    crossplay: formData.get('crossplay') !== null,
    saveInterval: parseInt(formData.get('saveInterval'), 10),
    backups: parseInt(formData.get('backups'), 10),
    preset: formData.get('preset') || '',
    modifier: formData.get('modifier') || '',
    makeActive
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`[CONFIG_SYNC] Parameters tied to realm "${targetWorld}" committed!`, 'info');
      if (makeActive) {
        updateActiveRealmDisplay(targetWorld, updated.serverName);
      }
      switchWorldTab('list');
      loadExistingWorldsList();
    } else {
      showToast(result.message || 'Config persistence fault.', 'error');
    }
  } catch (err) {
    showToast('[FAULT] Could not commit server configuration.', 'error');
  }
});

// =========================================================
// SNAPSHOTS (BACKUPS)
// =========================================================
function openBackupsModal() {
  openSettingsModal('snapshots');
}

function closeBackupsModal() {
  closeSettingsModal();
}

async function loadBackupsList() {
  backupsListContainer.innerHTML = '<div class="empty-list">Loading world archives...</div>';
  try {
    const res = await fetch('/api/backups');
    const data = await res.json();
    if (!data.backups || data.backups.length === 0) {
      backupsListContainer.innerHTML = '<div class="empty-list">No world backup archives discovered.</div>';
      return;
    }

    backupsListContainer.innerHTML = '';
    data.backups.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'backup-row';
      const sizeMb = (b.size / (1024 * 1024)).toFixed(2);
      const dateStr = new Date(b.created).toLocaleString();
      const match = b.name.match(/^(.+?)_backup_/);
      const realmName = match ? match[1] : b.name.split('_')[0];
      row.innerHTML = `
        <div class="backup-info-left">
          <div class="backup-name">
            <span>${b.name}</span>
            <span class="backup-realm-badge">[REALM: ${realmName}]</span>
          </div>
          <div class="backup-meta">ARCHIVED: ${dateStr} • PAYLOAD: ${sizeMb} MB</div>
        </div>
        <div class="backup-actions">
          <button class="cyber-btn-ghost btn-restore-backup" data-backup="${b.name}" data-realm="${realmName}" title="Restore realm database from this snapshot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>[RESTORE]</span>
          </button>
        </div>
      `;
      backupsListContainer.appendChild(row);
    });

    backupsListContainer.querySelectorAll('.btn-restore-backup').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const backupName = btn.getAttribute('data-backup');
        const realmName = btn.getAttribute('data-realm');
        await restoreBackup(backupName, realmName, btn);
      });
    });
  } catch (e) {
    backupsListContainer.innerHTML = '<div class="empty-list">[FAULT] Archive registry retrieval failure.</div>';
  }
}

async function restoreBackup(backupName, realmName, btnEl) {
  if (currentStatus !== 'offline') {
    showToast('[FAULT] Cannot restore snapshot while server is active. Terminate server first!', 'error');
    return;
  }

  const confirmed = await showCyberConfirm({
    title: 'CONFIRM RESTORE',
    eyebrow: '[DISASTER_RECOVERY // SNAPSHOT_OVERRIDE]',
    message: `Restore snapshot "${backupName}" into realm "${realmName}"?`,
    subtext: `Existing "${realmName}" world database files will be replaced. An automatic pre-restore safety snapshot will be created before overwriting.`,
    confirmText: 'RESTORE DATABASE',
    cancelText: 'ABORT',
    type: 'amber'
  });

  if (!confirmed) return;

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span>RESTORING...</span>';
  }

  showToast(`[RECOVERY_INIT] Restoring realm "${realmName}" from "${backupName}"...`, 'info');

  try {
    const res = await fetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupName, targetWorld: realmName })
    });
    const result = await res.json();
    if (result.success) {
      playCyberBeep(1200, 'sine', 0.08);
      showToast(`[RESTORE_SUCCESS] Realm "${result.targetWorld}" successfully restored from snapshot!`, 'info');
      await loadBackupsList();
      await loadExistingWorldsList();
    } else {
      showToast(result.message || 'Snapshot restoration failed.', 'error');
    }
  } catch (err) {
    showToast('[FAULT] Network error during snapshot restoration.', 'error');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        <span>[RESTORE]</span>
      `;
    }
  }
}

btnCreateBackupModal.addEventListener('click', async () => {
  playCyberBeep(850, 'sine', 0.05);
  btnCreateBackupModal.disabled = true;
  try {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`[ARCHIVE_CREATED] ${data.backupName}`, 'info');
      loadBackupsList();
    } else {
      showToast(data.message || 'Archive creation fault.', 'error');
    }
  } catch (e) {
    showToast('[FAULT] Snapshot trigger error.', 'error');
  } finally {
    btnCreateBackupModal.disabled = false;
  }
});

// =========================================================
// WORLD MANAGER & SEED GENERATOR
// =========================================================
function calculateStableSeedHash(str) {
  if (!str) return 'Awaiting input...';
  let hash1 = 5381;
  let hash2 = hash1;
  for (let i = 0; i < str.length && str.charCodeAt(i) !== 0; i += 2) {
    hash1 = (((hash1 << 5) + hash1) ^ str.charCodeAt(i)) | 0;
    if (i === str.length - 1 || str.charCodeAt(i + 1) === 0) break;
    hash2 = (((hash2 << 5) + hash2) ^ str.charCodeAt(i + 1)) | 0;
  }
  const result = (hash1 + Math.imul(hash2, 1566083941)) | 0;
  return `${result} (0x${(result >>> 0).toString(16).toUpperCase()})`;
}

const VIKING_SEEDS = [
  'Valhalla99', 'Yggdrasil', 'OdinAllfather', 'MjolnirPeak',
  'FenrirFrost', 'MidgardBorn', 'ValkyrieFlight', 'BifrostGateway',
  'Asgardian', 'RagnarokCore', 'SkadiWinter', 'FreyjaBlessing',
  'AmaboysRealm', 'IronGateViking', 'OdinEyeSpire', 'Hvergelmir',
  'GungnirStrike', 'JotunheimChill', 'NiflheimDeep', 'Muspelheim'
];

function rollVikingSeed() {
  playCyberBeep(1100, 'sine', 0.04);
  const useWord = Math.random() > 0.35;
  let seed = '';
  if (useWord) {
    const word = VIKING_SEEDS[Math.floor(Math.random() * VIKING_SEEDS.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    seed = `${word}_${num}`;
  } else {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 10; i++) {
      seed += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  worldGenSeed.value = seed;
  seedHashDisplay.textContent = calculateStableSeedHash(seed);
}

worldGenSeed.addEventListener('input', () => {
  const val = worldGenSeed.value.trim();
  seedHashDisplay.textContent = val ? calculateStableSeedHash(val) : 'None (Will auto-generate random seed)';
});

btnRollSeed.addEventListener('click', rollVikingSeed);

if (btnRollPassword) {
  btnRollPassword.addEventListener('click', () => {
    playCyberBeep(1100, 'sine', 0.03);
    if (worldGenPassword) {
      worldGenPassword.value = generateSecureVikingPassword();
      showToast('[PASSWORD_GEN] Secure Key Generated for New Realm', 'info');
    }
  });
}

function openWorldsModal(defaultTab = 'create') {
  openSettingsModal('realms');
  switchWorldTab(defaultTab);
}

function closeWorldsModal() {
  closeSettingsModal();
}

if (btnQuickNewWorld) btnQuickNewWorld.addEventListener('click', () => openWorldsModal('create'));

function switchWorldTab(tab) {
  if (worldsSubtabsBar) worldsSubtabsBar.classList.remove('hidden');
  if (panelConfigWorld) panelConfigWorld.classList.add('hidden');

  if (tabBtnCreateWorld) tabBtnCreateWorld.classList.toggle('active', tab === 'create');
  if (tabBtnListWorlds) tabBtnListWorlds.classList.toggle('active', tab === 'list');
  if (tabBtnImportWorld) tabBtnImportWorld.classList.toggle('active', tab === 'import');

  if (panelCreateWorld) panelCreateWorld.classList.toggle('hidden', tab !== 'create');
  if (panelListWorlds) panelListWorlds.classList.toggle('hidden', tab !== 'list');
  if (panelImportWorld) panelImportWorld.classList.toggle('hidden', tab !== 'import');

  if (tab === 'list') {
    loadExistingWorldsList();
  } else if (tab === 'import') {
    loadLocalClientWorlds();
  }
}

tabBtnCreateWorld.addEventListener('click', () => switchWorldTab('create'));
tabBtnListWorlds.addEventListener('click', () => switchWorldTab('list'));
if (tabBtnImportWorld) tabBtnImportWorld.addEventListener('click', () => switchWorldTab('import'));
if (btnBackToWorlds) btnBackToWorlds.addEventListener('click', () => switchWorldTab('list'));
if (btnCancelSettings) btnCancelSettings.addEventListener('click', () => switchWorldTab('list'));

if (btnBannerCreateWorld) {
  btnBannerCreateWorld.addEventListener('click', () => {
    openSettingsModal('realms');
    switchWorldTab('create');
  });
}

if (btnBannerImportWorld) {
  btnBannerImportWorld.addEventListener('click', () => {
    openSettingsModal('realms');
    switchWorldTab('import');
  });
}

async function loadExistingWorldsList() {
  existingWorldsContainer.innerHTML = '<div class="empty-list">Scanning worlds_local...</div>';
  try {
    const res = await fetch('/api/worlds');
    const data = await res.json();
    const worlds = data.worlds || [];
    worldsCountPill.textContent = worlds.length;

    if (worlds.length === 0) {
      existingWorldsContainer.innerHTML = '<div class="empty-list">No worlds found in worlds_local directory. Generate one now!</div>';
      return;
    }

    existingWorldsContainer.innerHTML = '';
    worlds.forEach((w) => {
      const card = document.createElement('div');
      card.className = `world-item-card ${w.isActive ? 'is-active-world' : ''}`;
      const sizeMb = (w.size / (1024 * 1024)).toFixed(2);
      const modDate = new Date(w.modified).toLocaleString();
      const seedLabel = w.seedName && w.seedName !== 'Unknown' ? w.seedName : 'Standard Seed';
      const worldPwd = w.password || 'amaboys';
      const presetBadge = w.preset ? `<span>PRESET: <strong>${w.preset}</strong></span>` : '';

      card.innerHTML = `
        <div class="world-info-left">
          <div class="world-name-title">
            <span>${w.name}</span>
            ${w.isActive ? '<span class="world-active-badge">ACTIVE REALM</span>' : ''}
          </div>
          <div class="world-meta-details">
            <span>SEED: <strong>${seedLabel}</strong></span>
            <span>KEY: <strong class="password-display-tag"><span class="pwd-text" data-pwd="${worldPwd}">••••••••</span> <button type="button" class="btn-toggle-pwd" title="Show/Hide Password"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button></strong></span>
            ${presetBadge}
            <span>STORAGE: <strong>${sizeMb} MB</strong></span>
            <span>MODIFIED: <strong>${modDate}</strong></span>
          </div>
        </div>
        <div class="world-info-right world-action-btns">
          <button class="cyber-btn-ghost btn-config-world" data-world="${w.name}" title="Edit Configuration for ${w.name}">[CONFIG]</button>
          ${!w.isActive ? `<button class="cyber-btn-ghost btn-activate-world" data-world="${w.name}">[ACTIVATE]</button>` : '<span class="text-xs" style="color: var(--neon-matrix); font-weight: 700; white-space: nowrap;">CURRENTLY RUNNING</span>'}
        </div>
      `;
      existingWorldsContainer.appendChild(card);
    });

    existingWorldsContainer.querySelectorAll('.btn-activate-world').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetWorld = btn.getAttribute('data-world');
        await selectActiveWorld(targetWorld);
      });
    });

    existingWorldsContainer.querySelectorAll('.btn-config-world').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetWorld = btn.getAttribute('data-world');
        await openRealmConfig(targetWorld);
      });
    });

    existingWorldsContainer.querySelectorAll('.btn-toggle-pwd').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pwdSpan = btn.previousElementSibling;
        const realPwd = pwdSpan.getAttribute('data-pwd');
        if (pwdSpan.textContent === '••••••••') {
          pwdSpan.textContent = realPwd;
          pwdSpan.classList.add('password-masked');
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>';
        } else {
          pwdSpan.textContent = '••••••••';
          pwdSpan.classList.remove('password-masked');
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        }
      });
    });
  } catch (e) {
    existingWorldsContainer.innerHTML = '<div class="empty-list">[FAULT] Failed to scan worlds directory.</div>';
  }
}

async function loadLocalClientWorlds() {
  if (!localClientWorldsList) return;
  localClientWorldsList.innerHTML = '<div class="empty-list">Scanning host PC for Valheim client saves...</div>';
  try {
    const res = await fetch('/api/worlds/local-client-detect');
    const data = await res.json();
    if (serverWorldsDirDisplay && data.serverWorldsDir) {
      serverWorldsDirDisplay.textContent = data.serverWorldsDir;
    }
    const worlds = data.detectedWorlds || [];
    if (worlds.length === 0) {
      localClientWorldsList.innerHTML = '<div class="empty-list">No local Valheim client saves found in standard directories on this machine. Use file upload or manual folder below.</div>';
      return;
    }

    localClientWorldsList.innerHTML = '';
    worlds.forEach((w) => {
      const item = document.createElement('div');
      item.className = 'local-world-item';
      const sizeMb = (w.size / (1024 * 1024)).toFixed(2);
      const modDate = new Date(w.modified).toLocaleString();
      item.innerHTML = `
        <div class="local-world-meta">
          <div class="local-world-name">${w.name}</div>
          <div class="local-world-sub">
            <span>SEED: <strong>${w.seedName}</strong></span>
            <span>STORAGE: <strong>${sizeMb} MB</strong></span>
            <span>MODIFIED: <strong>${modDate}</strong></span>
          </div>
        </div>
        <button type="button" class="cyber-btn-ghost btn-xs btn-import-local-action" data-world="${w.name}" data-dir="${w.sourceDir}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <span>IMPORT WORLD</span>
        </button>
      `;
      localClientWorldsList.appendChild(item);
    });

    localClientWorldsList.querySelectorAll('.btn-import-local-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetWorld = btn.getAttribute('data-world');
        const sourceDir = btn.getAttribute('data-dir');
        btn.disabled = true;
        showToast(`[IMPORT] Cloning world "${targetWorld}" into dedicated server matrix...`, 'info');
        try {
          const r = await fetch('/api/worlds/import-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worldName: targetWorld,
              sourceDir,
              setAsActive: true
            })
          });
          const result = await r.json();
          if (result.success) {
            showToast(`[IMPORT_SUCCESS] Realm "${targetWorld}" mounted and set as active!`, 'info');
            switchWorldTab('list');
            pollStatus();
          } else {
            showToast(result.message || 'Import failed.', 'error');
            btn.disabled = false;
          }
        } catch (err) {
          showToast('[FAULT] Network error importing world.', 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    localClientWorldsList.innerHTML = '<div class="empty-list">[FAULT] Unable to detect local client worlds.</div>';
  }
}

function initFileUploadZone() {
  if (!worldDropZone || !fileUploadInput) return;

  worldDropZone.addEventListener('click', () => fileUploadInput.click());

  worldDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    worldDropZone.classList.add('dragover');
  });

  worldDropZone.addEventListener('dragleave', () => {
    worldDropZone.classList.remove('dragover');
  });

  worldDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    worldDropZone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) {
      handleSelectedFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileUploadInput.addEventListener('change', () => {
    if (fileUploadInput.files) {
      handleSelectedFiles(Array.from(fileUploadInput.files));
    }
  });

  function handleSelectedFiles(files) {
    const valid = files.filter(f => f.name.endsWith('.fwl') || f.name.endsWith('.db'));
    if (valid.length === 0) {
      showToast('Please select valid Valheim world files (.fwl and/or .db).', 'error');
      return;
    }
    stagedUploadFiles = valid;
    renderUploadedFilesPreview();
  }

  function renderUploadedFilesPreview() {
    if (stagedUploadFiles.length === 0) {
      if (uploadedFilesPreview) uploadedFilesPreview.classList.add('hidden');
      return;
    }
    if (uploadedFilesPreview) uploadedFilesPreview.classList.remove('hidden');
    if (previewFilesList) {
      previewFilesList.innerHTML = stagedUploadFiles.map(f => {
        const sizeMb = (f.size / (1024 * 1024)).toFixed(2);
        return `<div class="preview-file-tag"><span>${f.name}</span> <span>${sizeMb} MB</span></div>`;
      }).join('');
    }
  }

  if (btnClearUploadFiles) {
    btnClearUploadFiles.addEventListener('click', () => {
      stagedUploadFiles = [];
      if (fileUploadInput) fileUploadInput.value = '';
      renderUploadedFilesPreview();
    });
  }

  if (btnSubmitWorldUpload) {
    btnSubmitWorldUpload.addEventListener('click', async () => {
      if (stagedUploadFiles.length === 0) return;
      btnSubmitWorldUpload.disabled = true;
      showToast('[UPLOAD] Streaming world files to server matrix...', 'info');

      const firstFile = stagedUploadFiles[0];
      const baseName = firstFile.name.replace(/\.(fwl|db)$/i, '').trim();

      try {
        for (const file of stagedUploadFiles) {
          const ext = file.name.endsWith('.fwl') ? '.fwl' : '.db';
          const fileBuffer = await file.arrayBuffer();
          const uploadRes = await fetch(`/api/worlds/upload-file?world=${encodeURIComponent(baseName)}&ext=${encodeURIComponent(ext)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: fileBuffer
          });
          const resJson = await uploadRes.json();
          if (!resJson.success) {
            throw new Error(resJson.message || `Failed to upload ${file.name}`);
          }
        }

        const pwd = importCustomPassword ? importCustomPassword.value : 'amaboys';
        const setActive = importSetActive ? importSetActive.checked : true;

        const completeRes = await fetch('/api/worlds/upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worldName: baseName,
            password: pwd,
            setAsActive: setActive
          })
        });
        const completeJson = await completeRes.json();

        if (completeJson.success) {
          showToast(`[MOUNTED] World "${baseName}" successfully uploaded and registered!`, 'info');
          stagedUploadFiles = [];
          if (fileUploadInput) fileUploadInput.value = '';
          renderUploadedFilesPreview();
          switchWorldTab('list');
          pollStatus();
        } else {
          showToast(completeJson.message || 'Upload finalization failed.', 'error');
        }
      } catch (err) {
        showToast(`[FAULT] Upload failed: ${err.message}`, 'error');
      } finally {
        btnSubmitWorldUpload.disabled = false;
      }
    });
  }

  if (btnCopyWorldsPath && serverWorldsDirDisplay) {
    btnCopyWorldsPath.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(serverWorldsDirDisplay.textContent.trim());
        showToast('[CLIPBOARD] Server worlds directory copied to clipboard!', 'info');
      } catch (e) {}
    });
  }

  if (btnRescanImportedWorlds) {
    btnRescanImportedWorlds.addEventListener('click', () => {
      playCyberBeep(900, 'sine', 0.04);
      showToast('[SCAN] Rescanning server worlds directory...', 'info');
      switchWorldTab('list');
      pollStatus();
    });
  }
}

async function selectActiveWorld(worldName) {
  playCyberBeep(950, 'sine', 0.05);
  try {
    const res = await fetch('/api/worlds/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldName })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`[REALM_SWITCH] Active world changed to: ${worldName} (Tied config loaded)`, 'info');
      if (data.config) {
        updateActiveRealmDisplay(data.activeWorld, data.config.serverName);
      } else {
        updateActiveRealmDisplay(worldName);
      }
      loadExistingWorldsList();
    } else {
      showToast(data.message || 'Failed to switch realm.', 'error');
    }
  } catch (e) {
    showToast('[FAULT] Realm switch network error.', 'error');
  }
}

formCreateWorld.addEventListener('submit', async (e) => {
  e.preventDefault();
  playCyberBeep(1000, 'sine', 0.05);
  const name = worldGenName.value.trim();
  const seed = worldGenSeed.value.trim();
  const preset = worldGenPreset.value;
  const setAsActive = worldGenActive.checked;
  const crossplay = worldGenCrossplay ? worldGenCrossplay.checked : true;
  const pwd = worldGenPassword ? worldGenPassword.value.trim() : '';

  if (!name) {
    showToast('Please enter a world name.', 'error');
    return;
  }

  if (!pwd || pwd.length < 5) {
    showToast('Realm password is required (minimum 5 characters).', 'error');
    return;
  }

  showToast(`[MATRIX_INIT] Generating realm "${name}" with tied configuration...`, 'info');
  try {
    const res = await fetch('/api/worlds/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldName: name,
        seed: seed || undefined,
        preset: preset || undefined,
        password: pwd,
        setAsActive,
        crossplay
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`[REALM_CREATED] Realm "${data.world.name}" created with tied password!`, 'info');
      if (data.world.isActive) {
        updateActiveRealmDisplay(data.world.name);
      }
      formCreateWorld.reset();
      if (worldGenPassword) worldGenPassword.value = '';
      seedHashDisplay.textContent = 'Awaiting input...';
      switchWorldTab('list');
    } else {
      showToast(data.message || 'World generation failed.', 'error');
    }
  } catch (err) {
    showToast('[FAULT] Error creating world.', 'error');
  }
});

// =========================================================
// TOAST HELPER
// =========================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

// Polling fallback helper
async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    applyServerState(data);
  } catch (e) {
    console.error('[SYS_ERR] Error polling status:', e);
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  startSystemClock();
  connectWebSocket();
  initFileUploadZone();
  loadExistingWorldsList();
});
