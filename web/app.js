(function () {
  if (window.location.protocol === 'file:') {
    document.body.innerHTML = [
      '<main style="max-width:760px;margin:48px auto;padding:24px;font-family:Segoe UI Variable Text,Segoe UI,sans-serif;color:#eef2f6;background:#141922;border-radius:20px;border:1px solid rgba(255,255,255,.1)">',
      '<h1 style="margin-top:0;font-family:Cascadia Code,Consolas,monospace">Icarus Save Editor</h1>',
      '<p>This page needs the local PowerShell server so it can scan and write the real save files.</p>',
      '<p>Run <strong>launch-icarus-save-editor.bat</strong> from the same folder instead of opening the HTML file directly.</p>',
      '</main>'
    ].join('');
    return;
  }

  const KNOWN_META_RESOURCES = [
    {
      key: 'Credits',
      label: 'Credits',
      group: 'Workshop',
      description: 'Orbital workshop currency.',
      aliases: ['Credits']
    },
    {
      key: 'Exotic1',
      label: 'Exotics',
      group: 'Workshop',
      description: 'Purple exotics for workshop unlocks and purchases.',
      aliases: ['Exotic1', 'Exotics', 'Exotic']
    },
    {
      key: 'Exotic_Red',
      label: 'Red Exotics',
      group: 'Workshop',
      description: 'Great Hunt red exotic currency.',
      aliases: ['Exotic_Red', 'ExoticRed', 'RedExotic']
    },
    {
      key: 'Exotic_Uranium',
      label: 'Uranium',
      group: 'Dangerous Horizons',
      description: 'Recent Dangerous Horizons uranium currency.',
      aliases: ['Exotic_Uranium', 'ExoticUranium', 'Uranium']
    },
    {
      key: 'Biomass',
      label: 'Biomass',
      group: 'Hunt',
      description: 'Boss hunt biomass currency.',
      aliases: ['Biomass']
    },
    {
      key: 'Licence',
      label: 'Licence',
      group: 'Hunt',
      description: 'Boss hunt licence currency.',
      aliases: ['Licence', 'License']
    },
    {
      key: 'Refund',
      label: 'Refund',
      group: 'Meta',
      description: 'Profile refund or respec currency.',
      aliases: ['Refund']
    }
  ];

  const state = {
    accounts: [],
    selectedAccountId: null,
    saveRoot: '',
    defaultSaveRoot: '',
    saveRootExists: false,
    isCustomSaveRoot: false,
    bundle: null,
    currentRawPath: null,
    selectedRawPath: null,
    fileFilterText: ''
  };

  const refs = {
    saveRoot: document.getElementById('saveRoot'),
    saveRootHelp: document.getElementById('saveRootHelp'),
    saveRootInput: document.getElementById('saveRootInput'),
    useSaveRootBtn: document.getElementById('useSaveRootBtn'),
    resetSaveRootBtn: document.getElementById('resetSaveRootBtn'),
    accountList: document.getElementById('accountList'),
    refreshAccountsBtn: document.getElementById('refreshAccountsBtn'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    reloadAccountBtn: document.getElementById('reloadAccountBtn'),
    emptyState: document.getElementById('emptyState'),
    emptyStateTitle: document.getElementById('emptyStateTitle'),
    emptyStateCopy: document.getElementById('emptyStateCopy'),
    workspace: document.getElementById('workspace'),
    accountTitle: document.getElementById('accountTitle'),
    statusLine: document.getElementById('statusLine'),
    summaryGrid: document.getElementById('summaryGrid'),
    profileEditor: document.getElementById('profileEditor'),
    maxCurrenciesBtn: document.getElementById('maxCurrenciesBtn'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    characterEditor: document.getElementById('characterEditor'),
    saveCharactersBtn: document.getElementById('saveCharactersBtn'),
    accoladeSummary: document.getElementById('accoladeSummary'),
    bestiarySummary: document.getElementById('bestiarySummary'),
    inventorySummary: document.getElementById('inventorySummary'),
    loadoutSummary: document.getElementById('loadoutSummary'),
    mountSummary: document.getElementById('mountSummary'),
    prospectArchiveSummary: document.getElementById('prospectArchiveSummary'),
    prospectSummary: document.getElementById('prospectSummary'),
    openAccoladesBtn: document.getElementById('openAccoladesBtn'),
    openBestiaryBtn: document.getElementById('openBestiaryBtn'),
    openMetaInventoryBtn: document.getElementById('openMetaInventoryBtn'),
    openLoadoutsBtn: document.getElementById('openLoadoutsBtn'),
    openMountsBtn: document.getElementById('openMountsBtn'),
    openProspectsFolderBtn: document.getElementById('openProspectsFolderBtn'),
    fileFilterInput: document.getElementById('fileFilterInput'),
    fileSelect: document.getElementById('fileSelect'),
    fileListMeta: document.getElementById('fileListMeta'),
    fileMeta: document.getElementById('fileMeta'),
    loadFileBtn: document.getElementById('loadFileBtn'),
    formatJsonBtn: document.getElementById('formatJsonBtn'),
    saveFileBtn: document.getElementById('saveFileBtn'),
    rawEditor: document.getElementById('rawEditor'),
    backupSummary: document.getElementById('backupSummary'),
    deleteAllBackupsBtn: document.getElementById('deleteAllBackupsBtn'),
    toast: document.getElementById('toast')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setStatus(message) {
    refs.statusLine.textContent = message;
  }

  function showToast(message, kind) {
    refs.toast.textContent = message;
    refs.toast.classList.remove('hidden', 'is-error');
    if (kind === 'error') {
      refs.toast.classList.add('is-error');
    }

    clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      refs.toast.classList.add('hidden');
    }, 3200);
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }

    return payload;
  }

  function applyAccountsPayload(payload) {
    state.saveRoot = payload.saveRoot || '';
    state.defaultSaveRoot = payload.defaultSaveRoot || '';
    state.saveRootExists = Boolean(payload.saveRootExists);
    state.isCustomSaveRoot = Boolean(payload.isCustomSaveRoot);
    state.accounts = payload.accounts || [];
  }

  function renderSaveRootUi() {
    const activeRoot = state.saveRoot || state.defaultSaveRoot || 'Not found.';
    refs.saveRoot.textContent = activeRoot;
    refs.saveRootInput.placeholder = state.defaultSaveRoot || refs.saveRootInput.placeholder;

    if (document.activeElement !== refs.saveRootInput) {
      refs.saveRootInput.value = state.isCustomSaveRoot ? state.saveRoot : '';
    }

    if (!state.saveRootExists) {
      refs.saveRootHelp.textContent = 'Default save root was not found. Paste the Icarus PlayerData folder here.';
    } else if (state.isCustomSaveRoot) {
      refs.saveRootHelp.textContent = 'Using a custom PlayerData folder for this session.';
    } else {
      refs.saveRootHelp.textContent = 'Using the default Icarus PlayerData folder.';
    }

    refs.resetSaveRootBtn.disabled = !state.isCustomSaveRoot;
  }

  function renderEmptyStateMessage() {
    if (!refs.emptyStateTitle || !refs.emptyStateCopy) {
      return;
    }

    if (!state.saveRootExists) {
      refs.emptyStateTitle.textContent = 'Icarus save folder not found.';
      refs.emptyStateCopy.innerHTML = `The default scan looked in <strong>${escapeHtml(state.defaultSaveRoot || '%LOCALAPPDATA%\\Icarus\\Saved\\PlayerData')}</strong>. Paste the correct <strong>PlayerData</strong> path in the sidebar, then click <strong>Use This Folder</strong>.`;
      return;
    }

    if (state.isCustomSaveRoot) {
      refs.emptyStateTitle.textContent = 'No accounts were found in this folder.';
      refs.emptyStateCopy.innerHTML = `The editor scanned <strong>${escapeHtml(state.saveRoot)}</strong> but did not find any Steam account folders. Verify the folder and try again, or switch back to the default path.`;
      return;
    }

    refs.emptyStateTitle.textContent = 'No Icarus accounts were found.';
    refs.emptyStateCopy.innerHTML = `The app scanned <strong>${escapeHtml(state.saveRoot || state.defaultSaveRoot || '%LOCALAPPDATA%\\Icarus\\Saved\\PlayerData')}</strong>. Start the game once or verify the save folder exists, then click <strong>Rescan</strong>.`;
  }

  function normalizeResourceName(value) {
    return String(value || '')
      .replace(/[_\s-]+/g, '')
      .toLowerCase();
  }

  function matchesKnownResource(metaRow, definition) {
    const normalized = normalizeResourceName(metaRow);
    const candidates = [definition.key].concat(definition.aliases || []);
    return candidates.some((candidate) => normalizeResourceName(candidate) === normalized);
  }

  function splitKnownResources(resources) {
    const usedIndexes = new Set();
    const known = KNOWN_META_RESOURCES.map((definition) => {
      const matchIndex = resources.findIndex((resource, index) => {
        return !usedIndexes.has(index) && matchesKnownResource(resource.MetaRow, definition);
      });
      const resource = matchIndex >= 0 ? resources[matchIndex] : { MetaRow: definition.key, Count: 0 };
      if (matchIndex >= 0) {
        usedIndexes.add(matchIndex);
      }

      return {
        definition,
        resource
      };
    });

    const custom = resources.filter((resource, index) => !usedIndexes.has(index));
    return { known, custom };
  }

  function humanizeKey(value) {
    return String(value || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat().format(number);
  }

  function formatByteSize(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(number) / Math.log(1024)), units.length - 1);
    const size = number / (1024 ** exponent);
    const decimals = exponent === 0 || size >= 10 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[exponent]}`;
  }

  function formatIcarusTimestamp(value) {
    return String(value || '').replace(
      /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/,
      '$1-$2-$3 $4:$5:$6'
    );
  }

  function formatIsoTimestamp(value) {
    return String(value || '').replace('T', ' ');
  }

  function getFilteredFiles() {
    const files = state.bundle?.files || [];
    const filter = (state.fileFilterText || '').trim().toLowerCase();
    if (!filter) {
      return files;
    }

    return files.filter((file) => String(file.relativePath || '').toLowerCase().includes(filter));
  }

  function normalizeFlags(flags) {
    const values = Array.isArray(flags) ? flags : [];
    const seen = new Set();
    const normalized = [];

    values.forEach((value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return;
      }

      const integer = Math.trunc(number);
      if (seen.has(integer)) {
        return;
      }

      seen.add(integer);
      normalized.push(integer);
    });

    return normalized;
  }

  function parseFlagArray(value) {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) {
      throw new Error('UnlockedFlags JSON must be an array.');
    }

    return normalizeFlags(parsed);
  }

  function writeFlagArray(textarea, flags) {
    textarea.value = JSON.stringify(normalizeFlags(flags), null, 2);
  }

  function mountFlagEditor(editor, textarea, initialFlags, emptyLabel) {
    if (!editor || !textarea) {
      return;
    }

    const list = editor.querySelector('.flag-chip-list');
    const input = editor.querySelector('.flag-input');
    const count = editor.querySelector('.flag-count');
    const addButton = editor.querySelector('.add-flag-btn');
    const dedupeButton = editor.querySelector('.dedupe-flags-btn');
    const clearButton = editor.querySelector('.clear-flags-btn');
    let flags = normalizeFlags(initialFlags);

    function renderFlags() {
      flags = normalizeFlags(flags);
      writeFlagArray(textarea, flags);
      count.textContent = `${flags.length} flag${flags.length === 1 ? '' : 's'}`;

      if (!flags.length) {
        list.innerHTML = `<div class="empty-box compact-empty">${escapeHtml(emptyLabel)}</div>`;
        return;
      }

      list.innerHTML = flags.map((flag) => `
        <button type="button" class="flag-chip" data-flag="${escapeHtml(flag)}">
          <span class="mono">${escapeHtml(flag)}</span>
          <span aria-hidden="true">Remove</span>
        </button>
      `).join('');

      list.querySelectorAll('.flag-chip').forEach((button) => {
        button.addEventListener('click', () => {
          flags = flags.filter((flag) => flag !== Number(button.dataset.flag));
          renderFlags();
        });
      });
    }

    function addFlag() {
      const value = input.value.trim();
      if (!value) {
        return;
      }

      const number = Number(value);
      if (!Number.isFinite(number)) {
        showToast('Flags must be whole numbers.', 'error');
        return;
      }

      flags.push(Math.trunc(number));
      input.value = '';
      renderFlags();
    }

    addButton.addEventListener('click', addFlag);
    dedupeButton.addEventListener('click', () => {
      try {
        flags = parseFlagArray(textarea.value);
        renderFlags();
      } catch (error) {
        handleError(error);
      }
    });
    clearButton.addEventListener('click', () => {
      flags = [];
      renderFlags();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addFlag();
      }
    });
    textarea.addEventListener('change', () => {
      try {
        flags = parseFlagArray(textarea.value);
        renderFlags();
      } catch (error) {
        handleError(error);
      }
    });
    textarea.addEventListener('blur', () => {
      try {
        flags = parseFlagArray(textarea.value);
        renderFlags();
      } catch (error) {
        handleError(error);
      }
    });

    renderFlags();
  }

  function renderAccounts() {
    refs.accountList.innerHTML = '';
    renderSaveRootUi();
    renderEmptyStateMessage();

    if (!state.accounts.length) {
      refs.accountList.innerHTML = '<div class="empty-box">No accounts detected.</div>';
      refs.emptyState.classList.remove('hidden');
      refs.workspace.classList.add('hidden');
      refs.openFolderBtn.disabled = true;
      refs.reloadAccountBtn.disabled = true;
      return;
    }

    refs.emptyState.classList.add('hidden');
    refs.reloadAccountBtn.disabled = !state.selectedAccountId;
    refs.openFolderBtn.disabled = !state.selectedAccountId;

    state.accounts.forEach((account) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'account-button' + (account.steamId === state.selectedAccountId ? ' is-active' : '');
      const names = account.characterNames.length ? account.characterNames.join(', ') : 'No characters yet';
      button.innerHTML = `
        <strong class="mono">${escapeHtml(account.steamId)}</strong>
        <small>${escapeHtml(names)}</small>
      `;
      button.addEventListener('click', () => loadAccount(account.steamId));
      refs.accountList.appendChild(button);
    });
  }

  function renderSummary() {
    const bundle = state.bundle;
    const cards = [
      { label: 'Characters', value: bundle.characters.length },
      { label: 'JSON Files', value: bundle.files.length },
      { label: 'Backup Files', value: (bundle.backups || []).length },
      { label: 'Meta Resources', value: (bundle.profile?.MetaResources || []).length },
      { label: 'Workshop Items', value: bundle.metaInventorySummary.length },
      { label: 'Loadouts', value: bundle.loadoutSummary.length },
      { label: 'Mounts', value: bundle.mountSummary?.mountCount || 0 },
      { label: 'Accolades', value: bundle.accoladeSummary?.completedCount || 0 },
      { label: 'Bestiary Species', value: bundle.bestiarySummary?.creatureCount || 0 },
      { label: 'Prospect Files', value: bundle.prospectArchiveSummary?.fileCount || 0 }
    ];

    refs.summaryGrid.innerHTML = cards.map((card) => `
      <article class="summary-card">
        <div>
          <div class="summary-number">${escapeHtml(card.value)}</div>
          <div class="summary-value">${escapeHtml(card.label)}</div>
        </div>
      </article>
    `).join('');
  }

  function renderProfile() {
    const profile = deepClone(state.bundle.profile || {});
    const resources = Array.isArray(profile.MetaResources) ? profile.MetaResources : [];
    const resourceGroups = splitKnownResources(resources);
    const unlockedFlags = JSON.stringify(profile.UnlockedFlags || [], null, 2);
    const talents = JSON.stringify(profile.Talents || [], null, 2);

    refs.profileEditor.innerHTML = `
      <div class="profile-grid">
        <label>
          <span>User ID</span>
          <input type="text" id="profileUserId" value="${escapeHtml(profile.UserID || state.bundle.steamId || '')}" readonly>
        </label>
        <label>
          <span>Next Character Slot</span>
          <input type="number" id="profileNextChrSlot" value="${escapeHtml(profile.NextChrSlot ?? 0)}">
        </label>
        <label>
          <span>Data Version</span>
          <input type="number" value="${escapeHtml(profile.DataVersion ?? 0)}" readonly>
        </label>
      </div>

      <div class="profile-section">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Known Currencies</p>
            <h2 class="section-subtitle">Current Orbital, Hunt, And Expansion MetaResources</h2>
          </div>
        </div>
        <p class="section-note">Known rows stay visible even if your save has not created them yet. Extra or future rows remain editable below.</p>
        <div class="resource-card-grid">
          ${resourceGroups.known.map(({ definition, resource }) => `
            <article class="resource-card">
              <div class="resource-card-head">
                <div>
                  <p class="eyebrow">${escapeHtml(definition.group)}</p>
                  <h3>${escapeHtml(definition.label)}</h3>
                </div>
                <span class="tag mono">${escapeHtml(resource.MetaRow || definition.key)}</span>
              </div>
              <p class="resource-help">${escapeHtml(definition.description)}</p>
              <label>
                <span>Count</span>
                <input
                  type="number"
                  class="known-resource-count"
                  data-resource-key="${escapeHtml(definition.key)}"
                  data-meta-row="${escapeHtml(resource.MetaRow || definition.key)}"
                  value="${escapeHtml(resource.Count ?? 0)}">
              </label>
            </article>
          `).join('')}
        </div>
      </div>

      <div class="profile-section">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Custom MetaResources</p>
            <h2 class="section-subtitle">Unknown Or Future Currency Rows</h2>
          </div>
          <button id="addResourceBtn" class="ghost-button" type="button">Add Custom Resource</button>
        </div>
        <div id="resourceList" class="resource-list"></div>
      </div>

      <div class="profile-grid" style="margin-top:18px">
        <div class="flag-field">
          <div class="flag-editor" data-flag-editor="profile">
            <div class="flag-editor-head">
              <span>Unlocked Flags</span>
              <strong class="flag-count mono">0 flags</strong>
            </div>
            <p class="section-note">Remove one-time unlock flags here if you want that save logic to run again.</p>
            <div class="flag-toolbar">
              <input type="number" class="flag-input" placeholder="Flag number">
              <button type="button" class="ghost-button add-flag-btn">Add Flag</button>
              <button type="button" class="ghost-button dedupe-flags-btn">Sync From JSON</button>
              <button type="button" class="danger-button clear-flags-btn">Clear All</button>
            </div>
            <div class="flag-chip-list"></div>
          </div>
          <label>
            <span>Unlocked Flags JSON</span>
            <textarea id="profileUnlockedFlags">${escapeHtml(unlockedFlags)}</textarea>
          </label>
        </div>
        <label>
          <span>Profile Talents JSON</span>
          <textarea id="profileTalents">${escapeHtml(talents)}</textarea>
        </label>
      </div>
    `;

    const resourceList = refs.profileEditor.querySelector('#resourceList');

    function renderCustomEmptyState() {
      if (resourceList.children.length) {
        return;
      }

      resourceList.innerHTML = '<div class="empty-box compact-empty">No extra MetaResources are in this save right now.</div>';
    }

    function addResourceRow(row) {
      const emptyState = resourceList.querySelector('.compact-empty');
      if (emptyState) {
        emptyState.remove();
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'resource-row';
      wrapper.innerHTML = `
        <input type="text" class="resource-name" placeholder="MetaRow" value="${escapeHtml(row.MetaRow || '')}">
        <input type="number" class="resource-count" placeholder="Count" value="${escapeHtml(row.Count ?? 0)}">
        <button type="button" class="danger-button remove-resource">Remove</button>
      `;
      wrapper.querySelector('.remove-resource').addEventListener('click', () => {
        wrapper.remove();
        renderCustomEmptyState();
      });
      resourceList.appendChild(wrapper);
    }

    if (resourceGroups.custom.length) {
      resourceGroups.custom.forEach(addResourceRow);
    } else {
      renderCustomEmptyState();
    }

    refs.profileEditor.querySelector('#addResourceBtn').addEventListener('click', () => {
      addResourceRow({ MetaRow: '', Count: 0 });
    });

    mountFlagEditor(
      refs.profileEditor.querySelector('[data-flag-editor="profile"]'),
      refs.profileEditor.querySelector('#profileUnlockedFlags'),
      profile.UnlockedFlags || [],
      'No profile flags are set right now.'
    );
  }

  function renderCharacters() {
    const characters = state.bundle.characters || [];

    if (!characters.length) {
      refs.characterEditor.innerHTML = '<div class="empty-box">No character records were found in Characters.json.</div>';
      return;
    }

    refs.characterEditor.innerHTML = characters.map((character, index) => `
      <article class="character-card" data-character-index="${index}">
        <div class="char-top">
          <div>
            <p class="eyebrow">Character ${index + 1}</p>
            <h3 class="mono" style="margin:4px 0 0">${escapeHtml(character.CharacterName || `Slot ${character.ChrSlot}`)}</h3>
          </div>
          <span class="tag">Slot ${escapeHtml(character.ChrSlot ?? index)}</span>
        </div>
        <div class="character-grid">
          <label>
            <span>Name</span>
            <input type="text" data-field="CharacterName" value="${escapeHtml(character.CharacterName || '')}">
          </label>
          <label>
            <span>XP</span>
            <input type="number" data-field="XP" value="${escapeHtml(character.XP ?? 0)}">
          </label>
          <label>
            <span>XP Debt</span>
            <input type="number" data-field="XP_Debt" value="${escapeHtml(character.XP_Debt ?? 0)}">
          </label>
          <label>
            <span>Last Prospect ID</span>
            <input type="text" data-field="LastProspectId" value="${escapeHtml(character.LastProspectId || '')}">
          </label>
          <label>
            <span>Location</span>
            <input type="text" data-field="Location" value="${escapeHtml(character.Location || '')}">
          </label>
          <label>
            <span>Last Played (Unix Timestamp)</span>
            <input type="number" data-field="TimeLastPlayed" value="${escapeHtml(character.TimeLastPlayed ?? 0)}">
          </label>
        </div>
        <div class="tag-list">
          <label class="tag"><input type="checkbox" data-field="IsDead" ${character.IsDead ? 'checked' : ''}> Dead</label>
          <label class="tag"><input type="checkbox" data-field="IsAbandoned" ${character.IsAbandoned ? 'checked' : ''}> Abandoned</label>
        </div>
        <div class="character-advanced">
          <div class="flag-field">
            <div class="flag-editor" data-flag-editor="character">
              <div class="flag-editor-head">
                <span>Unlocked Flags</span>
                <strong class="flag-count mono">0 flags</strong>
              </div>
              <p class="section-note">Use this to remove character-specific unlock flags without hand-editing the JSON.</p>
              <div class="flag-toolbar">
                <input type="number" class="flag-input" placeholder="Flag number">
                <button type="button" class="ghost-button add-flag-btn">Add Flag</button>
                <button type="button" class="ghost-button dedupe-flags-btn">Sync From JSON</button>
                <button type="button" class="danger-button clear-flags-btn">Clear All</button>
              </div>
              <div class="flag-chip-list"></div>
            </div>
            <label>
              <span>Unlocked Flags JSON</span>
              <textarea data-json-field="UnlockedFlags">${escapeHtml(JSON.stringify(character.UnlockedFlags || [], null, 2))}</textarea>
            </label>
          </div>
          <label>
            <span>Character MetaResources JSON</span>
            <textarea data-json-field="MetaResources">${escapeHtml(JSON.stringify(character.MetaResources || [], null, 2))}</textarea>
          </label>
          <label>
            <span>Talents JSON</span>
            <textarea data-json-field="Talents">${escapeHtml(JSON.stringify(character.Talents || [], null, 2))}</textarea>
          </label>
          <label>
            <span>Cosmetic JSON</span>
            <textarea data-json-field="Cosmetic">${escapeHtml(JSON.stringify(character.Cosmetic || {}, null, 2))}</textarea>
          </label>
        </div>
      </article>
    `).join('');

    refs.characterEditor.querySelectorAll('[data-character-index]').forEach((card, index) => {
      mountFlagEditor(
        card.querySelector('[data-flag-editor="character"]'),
        card.querySelector('[data-json-field="UnlockedFlags"]'),
        characters[index].UnlockedFlags || [],
        'No character flags are set right now.'
      );
    });
  }

  function renderAccolades() {
    const summary = state.bundle.accoladeSummary || {};
    if (!summary.hasFile) {
      refs.accoladeSummary.innerHTML = '<div class="empty-box">Accolades.json was not found for this account.</div>';
      return;
    }

    const recentCompleted = (summary.recentCompleted || []).slice().reverse();

    refs.accoladeSummary.innerHTML = `
      <div class="mini-summary-grid">
        <article class="mini-summary-card">
          <span class="mini-summary-label">Completed</span>
          <strong>${escapeHtml(formatNumber(summary.completedCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Trackers</span>
          <strong>${escapeHtml(formatNumber(summary.trackerCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Tasks</span>
          <strong>${escapeHtml(formatNumber(summary.taskTrackerCount || 0))}</strong>
        </article>
      </div>

      <div class="detail-grid">
        <section class="detail-panel">
          <p class="eyebrow">Top Trackers</p>
          <div class="detail-list">
            ${(summary.topTrackers || []).map((tracker) => `
              <div class="detail-row">
                <span>${escapeHtml(humanizeKey(tracker.rowName))}</span>
                <strong>${escapeHtml(formatNumber(tracker.value))}</strong>
              </div>
            `).join('') || '<div class="empty-box compact-empty">No tracker values were found.</div>'}
          </div>
        </section>

        <section class="detail-panel">
          <p class="eyebrow">Recent Unlocks</p>
          <div class="detail-list">
            ${recentCompleted.map((item) => `
              <div class="detail-row stacked-row">
                <strong>${escapeHtml(humanizeKey(item.rowName))}</strong>
                <span>${escapeHtml(formatIcarusTimestamp(item.timeCompleted || ''))}</span>
              </div>
            `).join('') || '<div class="empty-box compact-empty">No completed accolade history was found.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  function renderBestiary() {
    const summary = state.bundle.bestiarySummary || {};
    if (!summary.hasFile) {
      refs.bestiarySummary.innerHTML = '<div class="empty-box">BestiaryData.json was not found for this account.</div>';
      return;
    }

    refs.bestiarySummary.innerHTML = `
      <div class="mini-summary-grid">
        <article class="mini-summary-card">
          <span class="mini-summary-label">Creatures</span>
          <strong>${escapeHtml(formatNumber(summary.creatureCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Fish</span>
          <strong>${escapeHtml(formatNumber(summary.fishCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Total Points</span>
          <strong>${escapeHtml(formatNumber(summary.totalPoints || 0))}</strong>
        </article>
      </div>

      <div class="detail-grid">
        <section class="detail-panel">
          <p class="eyebrow">Top Creatures</p>
          <div class="detail-list">
            ${(summary.topCreatures || []).map((entry) => `
              <div class="detail-row">
                <span>${escapeHtml(humanizeKey(entry.rowName))}</span>
                <strong>${escapeHtml(formatNumber(entry.points))}</strong>
              </div>
            `).join('') || '<div class="empty-box compact-empty">No creature discovery rows were found.</div>'}
          </div>
        </section>

        <section class="detail-panel">
          <p class="eyebrow">Top Fish</p>
          <div class="detail-list">
            ${(summary.topFish || []).map((entry) => `
              <div class="detail-row">
                <span>${escapeHtml(humanizeKey(entry.rowName))}</span>
                <strong>${escapeHtml(formatNumber(entry.points))}</strong>
              </div>
            `).join('') || '<div class="empty-box compact-empty">No fish tracking rows are saved yet.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  function renderInventory() {
    const items = state.bundle.metaInventorySummary || [];
    if (!items.length) {
      refs.inventorySummary.innerHTML = '<div class="empty-box">MetaInventory.json was not found or has no items.</div>';
      return;
    }

    refs.inventorySummary.innerHTML = `
      <div class="inventory-table-wrapper">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Row Name</th>
              <th>Data Table</th>
              <th>Stack</th>
              <th>Durability</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>${escapeHtml(item.index)}</td>
                <td class="mono">${escapeHtml(item.rowName || '')}</td>
                <td class="mono">${escapeHtml(item.dataTable || '')}</td>
                <td>${escapeHtml(item.stack ?? '')}</td>
                <td>${escapeHtml(item.durability ?? '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderLoadouts() {
    const loadouts = state.bundle.loadoutSummary || [];
    if (!loadouts.length) {
      refs.loadoutSummary.innerHTML = '<div class="empty-box">No loadout records were detected.</div>';
      return;
    }

    refs.loadoutSummary.innerHTML = `
      <div class="loadout-grid">
        ${loadouts.map((loadout) => `
          <article class="loadout-card">
            <div class="tag-list">
              <span class="tag">Slot ${escapeHtml(loadout.chrSlot)}</span>
              <span class="tag">${escapeHtml(loadout.difficulty || 'Unknown')}</span>
              <span class="tag">${escapeHtml(loadout.state || 'Unknown')}</span>
              <span class="tag">${loadout.insured ? 'Insured' : 'Uninsured'}</span>
              <span class="tag">${loadout.settled ? 'Settled' : 'Unsettled'}</span>
            </div>
            <p class="mono">${escapeHtml(loadout.prospectKey || loadout.prospectId || 'No prospect key')}</p>
            <p>${escapeHtml(loadout.memberCount)} member(s)</p>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderMounts() {
    const summary = state.bundle.mountSummary || {};
    if (!summary.hasFile) {
      refs.mountSummary.innerHTML = '<div class="empty-box">Mounts.json was not found for this account.</div>';
      return;
    }

    const entries = summary.entries || [];
    const typeBreakdown = summary.types || [];

    refs.mountSummary.innerHTML = `
      <div class="mini-summary-grid">
        <article class="mini-summary-card">
          <span class="mini-summary-label">Mounts</span>
          <strong>${escapeHtml(formatNumber(summary.mountCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Types</span>
          <strong>${escapeHtml(formatNumber(summary.typeCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Highest Level</span>
          <strong>${escapeHtml(formatNumber(summary.highestLevel || 0))}</strong>
        </article>
      </div>

      ${entries.length ? `
        <div class="detail-grid">
          <section class="detail-panel">
            <p class="eyebrow">Type Breakdown</p>
            <div class="detail-list">
              ${typeBreakdown.map((entry) => `
                <div class="detail-row">
                  <span>${escapeHtml(humanizeKey(entry.mountType || 'Unknown'))}</span>
                  <strong>${escapeHtml(formatNumber(entry.count || 0))}</strong>
                </div>
              `).join('') || '<div class="empty-box compact-empty">No mount types were detected.</div>'}
            </div>
          </section>

          <section class="detail-panel">
            <p class="eyebrow">Saved Mounts</p>
            <div class="mount-grid">
              ${entries.map((entry) => `
                <article class="mount-card">
                  <p class="eyebrow">Mount ${escapeHtml(entry.index + 1)}</p>
                  <p class="mono">${escapeHtml(entry.mountName || 'Unnamed Mount')}</p>
                  <div class="tag-list">
                    <span class="tag">Level ${escapeHtml(entry.mountLevel ?? 0)}</span>
                    <span class="tag">${escapeHtml(humanizeKey(entry.mountType || 'Unknown'))}</span>
                    ${entry.mountIconName ? `<span class="tag">Icon ${escapeHtml(entry.mountIconName)}</span>` : ''}
                  </div>
                </article>
              `).join('')}
            </div>
          </section>
        </div>
      ` : '<div class="empty-box">Mounts.json exists, but no saved mounts were detected.</div>'}
    `;
  }

  function renderProspectArchive() {
    const summary = state.bundle.prospectArchiveSummary || {};
    if (!summary.hasFolder) {
      refs.prospectArchiveSummary.innerHTML = '<div class="empty-box">No Prospects folder was found for this account.</div>';
      return;
    }

    const entries = summary.entries || [];
    if (!entries.length) {
      refs.prospectArchiveSummary.innerHTML = '<div class="empty-box">No saved prospect files were found.</div>';
      return;
    }

    const previewEntries = entries.slice(0, 12);

    refs.prospectArchiveSummary.innerHTML = `
      <div class="mini-summary-grid">
        <article class="mini-summary-card">
          <span class="mini-summary-label">Files</span>
          <strong>${escapeHtml(formatNumber(summary.fileCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Active</span>
          <strong>${escapeHtml(formatNumber(summary.activeCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Archived</span>
          <strong>${escapeHtml(formatNumber(summary.inactiveCount || 0))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Mission Keys</span>
          <strong>${escapeHtml(formatNumber(summary.missionCount || 0))}</strong>
        </article>
      </div>

      <div class="prospect-grid">
        ${previewEntries.map((entry) => `
          <article class="prospect-card">
            <p class="eyebrow">${escapeHtml(entry.sourceFile)}</p>
            <p class="mono">${escapeHtml(entry.missionKey || entry.prospectKey || entry.prospectId || 'Unknown Prospect')}</p>
            <div class="tag-list">
              <span class="tag">${escapeHtml(entry.difficulty || 'Unknown')}</span>
              <span class="tag">${escapeHtml(entry.state || 'Unknown')}</span>
              <span class="tag">${escapeHtml(entry.memberCount)} member(s)</span>
              <span class="tag">${entry.insurance ? 'Insured' : 'No Insurance'}</span>
            </div>
            <p>${escapeHtml(entry.claimedChar || 'No claimed character')}</p>
            <p class="file-meta">${escapeHtml(formatIsoTimestamp(entry.lastWriteTime || ''))}</p>
            <button type="button" class="ghost-button open-archive-file" data-relative-path="${escapeHtml(entry.relativePath)}">Open Raw File</button>
          </article>
        `).join('')}
      </div>

      ${entries.length > previewEntries.length ? `
        <p class="file-meta">Showing ${escapeHtml(previewEntries.length)} of ${escapeHtml(entries.length)} prospect files. Use the raw editor for the full archive.</p>
      ` : ''}
    `;

    refs.prospectArchiveSummary.querySelectorAll('.open-archive-file').forEach((button) => {
      button.addEventListener('click', () => {
        openRawShortcut(button.dataset.relativePath);
      });
    });
  }

  function renderProspects() {
    const prospects = state.bundle.associatedProspectSummary || [];
    if (!prospects.length) {
      refs.prospectSummary.innerHTML = '<div class="empty-box">No AssociatedProspects_Slot_*.json records were detected.</div>';
      return;
    }

    refs.prospectSummary.innerHTML = `
      <div class="prospect-grid">
        ${prospects.map((prospect) => `
          <article class="prospect-card">
            <p class="eyebrow">${escapeHtml(prospect.sourceFile)}</p>
            <p class="mono">${escapeHtml(prospect.prospectKey || prospect.prospectId || '')}</p>
            <div class="tag-list">
              <span class="tag">${escapeHtml(prospect.difficulty || 'Unknown')}</span>
              <span class="tag">${escapeHtml(prospect.state || 'Unknown')}</span>
              <span class="tag">${escapeHtml(prospect.hostType || 'Unknown')}</span>
            </div>
            <p>${escapeHtml(prospect.memberCount)} member(s)</p>
          </article>
        `).join('')}
      </div>
    `;
  }

  function updateRawEditorActionState() {
    const files = state.bundle?.files || [];
    const filteredFiles = getFilteredFiles();
    const hasLoadedFile = !!state.currentRawPath;
    const hasSelectedFile = !!state.selectedRawPath;
    const loadedSelectionMatches = hasLoadedFile && state.currentRawPath === state.selectedRawPath;

    refs.fileFilterInput.disabled = !files.length;
    refs.fileSelect.disabled = !filteredFiles.length;
    refs.loadFileBtn.disabled = !hasSelectedFile;
    refs.formatJsonBtn.disabled = !hasLoadedFile;
    refs.saveFileBtn.disabled = !loadedSelectionMatches;
    refs.rawEditor.disabled = !hasLoadedFile;
  }

  function renderFileList() {
    const files = state.bundle?.files || [];
    const filteredFiles = getFilteredFiles();
    const selectedPath = state.selectedRawPath;

    if (!files.length) {
      refs.fileSelect.innerHTML = '<option value="">No JSON files found</option>';
      refs.fileListMeta.textContent = 'No JSON files were found under the selected account.';
      refs.fileMeta.textContent = 'No JSON files were found under the selected account.';
      refs.rawEditor.value = '';
      state.currentRawPath = null;
      state.selectedRawPath = null;
      updateRawEditorActionState();
      return;
    }

    if (!filteredFiles.length) {
      refs.fileSelect.innerHTML = '<option value="">No files match current filter</option>';
      refs.fileListMeta.textContent = `No JSON files match "${state.fileFilterText}".`;
      refs.fileMeta.textContent = 'Adjust the file filter or clear it to load another JSON file.';
      state.selectedRawPath = null;
      updateRawEditorActionState();
      return;
    }

    refs.fileSelect.innerHTML = filteredFiles.map((file) => `
      <option value="${escapeHtml(file.relativePath)}">${escapeHtml(file.relativePath)}</option>
    `).join('');

    const preferred = [
      'Profile.json',
      'Characters.json',
      'Accolades.json',
      'BestiaryData.json',
      'MetaInventory.json',
      'Loadout/Loadouts.json',
      'Mounts.json'
    ];

    if (selectedPath && filteredFiles.some((file) => file.relativePath === selectedPath)) {
      state.selectedRawPath = selectedPath;
    } else {
      const firstPreferred = preferred.find((name) => filteredFiles.some((file) => file.relativePath === name));
      state.selectedRawPath = firstPreferred || filteredFiles[0].relativePath;
    }

    refs.fileSelect.value = state.selectedRawPath;

    let listMessage = state.fileFilterText
      ? `Showing ${filteredFiles.length} of ${files.length} file(s) for "${state.fileFilterText}".`
      : `Showing all ${files.length} file(s).`;

    if (state.currentRawPath && state.selectedRawPath && state.currentRawPath !== state.selectedRawPath) {
      listMessage += ` Click Load File to switch from ${state.currentRawPath} to ${state.selectedRawPath}.`;
    }

    refs.fileListMeta.textContent = listMessage;
    updateRawEditorActionState();
  }

  function renderBackups() {
    const backups = state.bundle?.backups || [];
    refs.deleteAllBackupsBtn.disabled = !backups.length;

    if (!backups.length) {
      refs.backupSummary.innerHTML = '<div class="empty-box">No editor backup files were found for this account.</div>';
      return;
    }

    const totalSize = backups.reduce((sum, backup) => sum + Number(backup.size || 0), 0);
    refs.backupSummary.innerHTML = `
      <div class="mini-summary-grid">
        <article class="mini-summary-card">
          <span class="mini-summary-label">Backup Files</span>
          <strong>${escapeHtml(formatNumber(backups.length))}</strong>
        </article>
        <article class="mini-summary-card">
          <span class="mini-summary-label">Total Size</span>
          <strong>${escapeHtml(formatByteSize(totalSize))}</strong>
        </article>
      </div>

      <div class="backup-list">
        ${backups.map((backup) => `
          <article class="backup-row">
            <div class="backup-meta">
              <p class="mono">${escapeHtml(backup.relativePath)}</p>
              <p class="file-meta">From ${escapeHtml(backup.sourceRelativePath || '')} | ${escapeHtml(formatByteSize(backup.size))} | ${escapeHtml(formatIsoTimestamp(backup.lastWriteTime || ''))}</p>
            </div>
            <div class="backup-actions">
              <button type="button" class="ghost-button restore-backup-btn" data-relative-path="${escapeHtml(backup.relativePath)}">Restore</button>
              <button type="button" class="danger-button delete-backup-btn" data-relative-path="${escapeHtml(backup.relativePath)}">Delete</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    refs.backupSummary.querySelectorAll('.restore-backup-btn').forEach((button) => {
      button.addEventListener('click', () => {
        restoreBackup(button.dataset.relativePath).catch(handleError);
      });
    });

    refs.backupSummary.querySelectorAll('.delete-backup-btn').forEach((button) => {
      button.addEventListener('click', () => {
        deleteBackup(button.dataset.relativePath).catch(handleError);
      });
    });
  }

  function collectProfile() {
    const profile = deepClone(state.bundle.profile || {});
    profile.UserID = refs.profileEditor.querySelector('#profileUserId').value.trim();
    profile.NextChrSlot = Number(refs.profileEditor.querySelector('#profileNextChrSlot').value || 0);

    const knownResources = Array.from(refs.profileEditor.querySelectorAll('.known-resource-count'))
      .map((input) => ({
        MetaRow: input.dataset.metaRow || input.dataset.resourceKey || '',
        Count: Number(input.value || 0)
      }))
      .filter((row) => row.MetaRow);

    const customResources = Array.from(refs.profileEditor.querySelectorAll('.resource-row'))
      .map((row) => ({
        MetaRow: row.querySelector('.resource-name').value.trim(),
        Count: Number(row.querySelector('.resource-count').value || 0)
      }))
      .filter((row) => row.MetaRow);

    const mergedResources = [];
    const seenResources = new Set();

    knownResources.concat(customResources).forEach((row) => {
      const key = normalizeResourceName(row.MetaRow);
      if (!key || seenResources.has(key)) {
        return;
      }

      seenResources.add(key);
      mergedResources.push(row);
    });

    profile.MetaResources = mergedResources;
    profile.UnlockedFlags = parseFlagArray(refs.profileEditor.querySelector('#profileUnlockedFlags').value || '[]');
    profile.Talents = JSON.parse(refs.profileEditor.querySelector('#profileTalents').value || '[]');
    return profile;
  }

  function collectCharacters() {
    return Array.from(refs.characterEditor.querySelectorAll('[data-character-index]')).map((card, index) => {
      const original = deepClone(state.bundle.characters[index]);
      original.CharacterName = card.querySelector('[data-field="CharacterName"]').value.trim();
      original.XP = Number(card.querySelector('[data-field="XP"]').value || 0);
      original.XP_Debt = Number(card.querySelector('[data-field="XP_Debt"]').value || 0);
      original.LastProspectId = card.querySelector('[data-field="LastProspectId"]').value.trim();
      original.Location = card.querySelector('[data-field="Location"]').value.trim();
      original.TimeLastPlayed = Number(card.querySelector('[data-field="TimeLastPlayed"]').value || 0);
      original.IsDead = card.querySelector('[data-field="IsDead"]').checked;
      original.IsAbandoned = card.querySelector('[data-field="IsAbandoned"]').checked;
      original.UnlockedFlags = parseFlagArray(card.querySelector('[data-json-field="UnlockedFlags"]').value || '[]');
      original.MetaResources = JSON.parse(card.querySelector('[data-json-field="MetaResources"]').value || '[]');
      original.Talents = JSON.parse(card.querySelector('[data-json-field="Talents"]').value || '[]');
      original.Cosmetic = JSON.parse(card.querySelector('[data-json-field="Cosmetic"]').value || '{}');
      return original;
    });
  }

  async function loadAccounts() {
    setStatus('Scanning save root...');
    const payload = await api('/api/accounts');
    applyAccountsPayload(payload);

    if (!state.accounts.length) {
      state.selectedAccountId = null;
      state.bundle = null;
      state.currentRawPath = null;
      state.selectedRawPath = null;
      renderAccounts();
      return;
    }

    if (!state.selectedAccountId || !state.accounts.some((account) => account.steamId === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0].steamId;
    }

    renderAccounts();
    await loadAccount(state.selectedAccountId);
  }

  async function loadAccount(steamId) {
    state.selectedAccountId = steamId;
    renderAccounts();
    refs.workspace.classList.remove('hidden');
    refs.emptyState.classList.add('hidden');
    refs.openFolderBtn.disabled = false;
    refs.reloadAccountBtn.disabled = false;
    setStatus(`Loading account ${steamId}...`);

    const payload = await api(`/api/account/${encodeURIComponent(steamId)}`);
    state.bundle = payload.data;
    refs.accountTitle.textContent = `Steam ID ${steamId}`;
    renderSummary();
    renderProfile();
    renderCharacters();
    renderAccolades();
    renderBestiary();
    renderInventory();
    renderLoadouts();
    renderMounts();
    renderProspectArchive();
    renderProspects();
    renderFileList();
    renderBackups();
    setStatus(`Loaded ${steamId}.`);

    if (state.selectedRawPath) {
      await loadRawFile(state.selectedRawPath);
    }
  }

  async function loadRawFile(relativePath) {
    if (!state.selectedAccountId || !relativePath) {
      return;
    }

    setStatus(`Loading ${relativePath}...`);
    const params = new URLSearchParams({
      accountId: state.selectedAccountId,
      path: relativePath
    });
    const payload = await api(`/api/file?${params.toString()}`);
    state.currentRawPath = payload.relativePath;
    state.selectedRawPath = payload.relativePath;
    refs.fileSelect.value = payload.relativePath;
    refs.fileMeta.textContent = `${payload.relativePath} | ${payload.size} bytes | ${payload.lastWriteTime}`;
    refs.rawEditor.value = payload.content || '';
    renderFileList();
    setStatus(`Loaded ${relativePath}.`);
  }

  async function setSaveRoot(saveRoot) {
    setStatus('Updating save root...');
    const payload = await api('/api/save-root', {
      method: 'POST',
      body: JSON.stringify({ saveRoot })
    });
    applyAccountsPayload(payload);
    state.bundle = null;
    state.currentRawPath = null;
    state.selectedRawPath = null;
    state.fileFilterText = '';
    refs.fileFilterInput.value = '';
    refs.rawEditor.value = '';
    refs.fileMeta.textContent = 'Pick a file to begin.';
    refs.fileListMeta.textContent = 'Showing all files.';

    if (!state.accounts.length) {
      state.selectedAccountId = null;
      renderAccounts();
      setStatus('Save root updated.');
      return;
    }

    if (!state.selectedAccountId || !state.accounts.some((account) => account.steamId === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0].steamId;
    }

    renderAccounts();
    await loadAccount(state.selectedAccountId);
  }

  async function saveProfile() {
    const profile = collectProfile();
    setStatus('Saving Profile.json...');
    const payload = await api(`/api/account/${encodeURIComponent(state.selectedAccountId)}/profile`, {
      method: 'POST',
      body: JSON.stringify({ profile })
    });
    showToast(`Profile.json saved. Backup: ${payload.backup || 'new file'}`);
    await loadAccount(state.selectedAccountId);
  }

  async function saveCharacters() {
    const characters = collectCharacters();
    setStatus('Saving Characters.json...');
    const payload = await api(`/api/account/${encodeURIComponent(state.selectedAccountId)}/characters`, {
      method: 'POST',
      body: JSON.stringify({ characters })
    });
    showToast(`Characters.json saved. Backup: ${payload.backup || 'new file'}`);
    await loadAccount(state.selectedAccountId);
  }

  async function saveRawFile() {
    if (!state.currentRawPath) {
      return;
    }

    setStatus(`Saving ${state.currentRawPath}...`);
    const payload = await api('/api/file', {
      method: 'POST',
      body: JSON.stringify({
        accountId: state.selectedAccountId,
        relativePath: state.currentRawPath,
        content: refs.rawEditor.value
      })
    });
    showToast(`${state.currentRawPath} saved. Backup: ${payload.backup || 'new file'}`);
    await loadRawFile(state.currentRawPath);
    await loadAccount(state.selectedAccountId);
  }

  async function deleteBackup(relativePath) {
    if (!state.selectedAccountId || !relativePath) {
      return;
    }

    if (!window.confirm(`Delete this backup file?\n\n${relativePath}`)) {
      return;
    }

    setStatus(`Deleting backup ${relativePath}...`);
    await api(`/api/account/${encodeURIComponent(state.selectedAccountId)}/backup/delete`, {
      method: 'POST',
      body: JSON.stringify({ relativePath })
    });
    showToast(`Deleted backup: ${relativePath}`);
    await loadAccount(state.selectedAccountId);
  }

  async function restoreBackup(relativePath) {
    if (!state.selectedAccountId || !relativePath) {
      return;
    }

    if (!window.confirm(`Restore this backup over its original file?\n\n${relativePath}`)) {
      return;
    }

    setStatus(`Restoring backup ${relativePath}...`);
    const payload = await api(`/api/account/${encodeURIComponent(state.selectedAccountId)}/backup/restore`, {
      method: 'POST',
      body: JSON.stringify({ relativePath })
    });
    state.selectedRawPath = payload.restoredPath || state.selectedRawPath;
    const backupMessage = payload.backup ? ` Current file backed up as ${payload.backup}.` : '';
    showToast(`Restored ${payload.restoredPath || relativePath}.${backupMessage}`);
    await loadAccount(state.selectedAccountId);
  }

  async function deleteAllBackups() {
    const backups = state.bundle?.backups || [];
    if (!state.selectedAccountId || !backups.length) {
      return;
    }

    if (!window.confirm(`Delete all ${backups.length} backup files for this account?`)) {
      return;
    }

    setStatus(`Deleting ${backups.length} backup file(s)...`);
    const payload = await api(`/api/account/${encodeURIComponent(state.selectedAccountId)}/backups/delete-all`, {
      method: 'POST'
    });
    showToast(`Deleted ${payload.deletedCount || backups.length} backup file(s).`);
    await loadAccount(state.selectedAccountId);
  }

  function maxCurrencies() {
    refs.profileEditor.querySelectorAll('.known-resource-count').forEach((input) => {
      input.value = '999999';
    });
  }

  async function openFolder(relativePath) {
    await api('/api/open-folder', {
      method: 'POST',
      body: JSON.stringify({
        accountId: state.selectedAccountId,
        relativePath: relativePath || ''
      })
    });
  }

  function openRawShortcut(relativePath) {
    refs.fileFilterInput.value = '';
    state.fileFilterText = '';
    state.selectedRawPath = relativePath;
    renderFileList();
    loadRawFile(relativePath).catch(handleError);
  }

  function formatRawEditor() {
    const parsed = JSON.parse(refs.rawEditor.value);
    refs.rawEditor.value = JSON.stringify(parsed, null, 2);
  }

  refs.refreshAccountsBtn.addEventListener('click', () => {
    loadAccounts().catch(handleError);
  });

  refs.useSaveRootBtn.addEventListener('click', () => {
    setSaveRoot(refs.saveRootInput.value.trim()).catch(handleError);
  });

  refs.saveRootInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setSaveRoot(refs.saveRootInput.value.trim()).catch(handleError);
    }
  });

  refs.resetSaveRootBtn.addEventListener('click', () => {
    setSaveRoot('').catch(handleError);
  });

  refs.reloadAccountBtn.addEventListener('click', () => {
    if (state.selectedAccountId) {
      loadAccount(state.selectedAccountId).catch(handleError);
    }
  });

  refs.openFolderBtn.addEventListener('click', () => {
    openFolder('').catch(handleError);
  });

  refs.maxCurrenciesBtn.addEventListener('click', () => {
    maxCurrencies();
  });

  refs.saveProfileBtn.addEventListener('click', () => {
    saveProfile().catch(handleError);
  });

  refs.saveCharactersBtn.addEventListener('click', () => {
    saveCharacters().catch(handleError);
  });

  refs.fileFilterInput.addEventListener('input', () => {
    state.fileFilterText = refs.fileFilterInput.value.trim();
    renderFileList();
  });

  refs.fileSelect.addEventListener('change', () => {
    state.selectedRawPath = refs.fileSelect.value || null;
    renderFileList();
  });

  refs.loadFileBtn.addEventListener('click', () => {
    loadRawFile(state.selectedRawPath).catch(handleError);
  });

  refs.formatJsonBtn.addEventListener('click', () => {
    try {
      formatRawEditor();
      showToast('JSON formatted.');
    } catch (error) {
      handleError(error);
    }
  });

  refs.saveFileBtn.addEventListener('click', () => {
    saveRawFile().catch(handleError);
  });

  refs.deleteAllBackupsBtn.addEventListener('click', () => {
    deleteAllBackups().catch(handleError);
  });

  refs.openAccoladesBtn.addEventListener('click', () => {
    openRawShortcut('Accolades.json');
  });

  refs.openBestiaryBtn.addEventListener('click', () => {
    openRawShortcut('BestiaryData.json');
  });

  refs.openMetaInventoryBtn.addEventListener('click', () => {
    openRawShortcut('MetaInventory.json');
  });

  refs.openLoadoutsBtn.addEventListener('click', () => {
    openRawShortcut('Loadout/Loadouts.json');
  });

  refs.openMountsBtn.addEventListener('click', () => {
    openRawShortcut('Mounts.json');
  });

  refs.openProspectsFolderBtn.addEventListener('click', () => {
    openFolder('Prospects').catch(handleError);
  });

  function handleError(error) {
    const message = error && error.message ? error.message : String(error);
    setStatus('Error.');
    showToast(message, 'error');
    console.error(error);
  }

  loadAccounts().catch(handleError);
})();
