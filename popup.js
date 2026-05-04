document.addEventListener('DOMContentLoaded', () => {
    const els = {
        globalToggle: document.getElementById('global-enabled'),
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        currentDomain: document.getElementById('current-domain'),
        currentPath: document.getElementById('current-path'),
        pageToggle: document.getElementById('page-enabled'),
        domainToggle: document.getElementById('domain-enabled'),
        domainLabel: document.getElementById('domain-label'),
        statMentions: document.getElementById('stat-mentions'),
        statUnique: document.getElementById('stat-unique'),
        statDb: document.getElementById('stat-db'),
        archChipList: document.getElementById('arch-chip-list'),
        settingHighlights: document.getElementById('setting-highlights'),
        settingHud: document.getElementById('setting-hud'),
        settingProfile: document.getElementById('setting-profile'),
        settingConfidence: document.getElementById('setting-confidence'),
        confidenceVal: document.getElementById('confidence-val'),
        settingDelay: document.getElementById('setting-delay'),
        delayVal: document.getElementById('delay-val'),
        blockedList: document.getElementById('blocked-list'),
        historyList: document.getElementById('history-list'),
        clearHistoryBtn: document.getElementById('clear-history-btn'),
        reloadBtn: document.getElementById('reload-btn'),
        bookmarksList: document.getElementById('bookmarks-list'),
        helpBtn: document.getElementById('help-btn'),
        helpModal: document.getElementById('help-modal'),
        helpCloseBtn: document.getElementById('help-close-btn'),
        exportBtn: document.getElementById('export-btn'),
        resetBtn: document.getElementById('reset-btn'),
        bookmarksSearch: document.getElementById('bookmarks-search'),
        totalArchitectures: document.getElementById('total-architectures')
    };

    let currentTab = null;
    let currentUrl = "";
    let currentDomain = "";
    let currentPath = "";

    const defaultSettings = {
        globalEnabled: true,
        blockedPages: [],
        blockedDomains: [],
        highlights: true,
        hud: true,
        activeProfile: 'All',
        confidence: 0,
        delay: 1200,
        history: [],
        savedBookmarks: []
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            currentTab = tabs[0];
            try {
                const urlObj = new URL(currentTab.url);
                currentUrl = currentTab.url.split('?')[0];
                currentDomain = urlObj.hostname;
                currentPath = urlObj.pathname;
                els.currentDomain.textContent = currentDomain;
                els.currentPath.textContent = currentPath === '/' ? '/ (Home)' : currentPath;
                els.domainLabel.textContent = `Disable on ${currentDomain}`;
            } catch (e) {
                els.currentDomain.textContent = "System Page";
                els.currentPath.textContent = "—";
            }
        }
        loadState();
    });

    function loadState() {
        chrome.storage.local.get(defaultSettings, (state) => {
            els.globalToggle.checked = state.globalEnabled;
            els.settingHighlights.checked = state.highlights;
            els.settingHud.checked = state.hud;
            els.settingConfidence.value = state.confidence;
            els.confidenceVal.textContent = state.confidence + '%';
            els.settingDelay.value = state.delay;
            els.delayVal.textContent = state.delay;

            const isPageBlocked = state.blockedPages.includes(currentUrl);
            const isDomainBlocked = state.blockedDomains.includes(currentDomain);
            els.pageToggle.checked = !isPageBlocked;
            els.domainToggle.checked = !isDomainBlocked;

            chrome.storage.local.get(['architectureDb'], (res) => {
                const db = res.architectureDb || {};
                const types = new Set();
                Object.values(db).forEach(v => {
                    if (v.type) types.add(v.type);
                });
                els.settingProfile.innerHTML = '<option value="All">All Domains</option>';
                types.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    if (state.activeProfile === t) opt.selected = true;
                    els.settingProfile.appendChild(opt);
                });
            });

            updateStatusDisplay(state.globalEnabled, isPageBlocked, isDomainBlocked);
            renderBlockedList(state.blockedPages, state.blockedDomains);
            renderHistoryList(state.history);
            renderBookmarksList(state.savedBookmarks);

            if (chrome.runtime) {
                try {
                    chrome.runtime.sendMessage({ action: "getArchitectureCount" }, (response) => {
                        if (response && response.count && els.totalArchitectures) {
                            els.totalArchitectures.textContent = `${response.count} architectures in database`;
                        }
                    });
                } catch (e) {}
            }

            if (state.globalEnabled && !isPageBlocked && !isDomainBlocked) {
                fetchPageStats();
            } else {
                setEmptyStats();
            }
        });
    }

    function updateStatusDisplay(global, pageBlocked, domainBlocked) {
        els.statusDot.className = 'status-dot';
        const popupBody = document.querySelector('.popup-body');
        const popupFooter = document.querySelector('.popup-footer');

        if (!global) {
            els.statusDot.classList.add('disabled');
            els.statusText.textContent = "Globally Disabled";
            popupBody.classList.add('disabled-overlay');
            popupFooter.classList.add('disabled-overlay');
        } else if (domainBlocked) {
            els.statusDot.classList.add('disabled');
            els.statusText.textContent = "Domain Blocked";
            popupBody.classList.remove('disabled-overlay');
            popupFooter.classList.remove('disabled-overlay');
        } else if (pageBlocked) {
            els.statusDot.classList.add('partial');
            els.statusText.textContent = "Page Blocked";
            popupBody.classList.remove('disabled-overlay');
            popupFooter.classList.remove('disabled-overlay');
        } else {
            els.statusDot.classList.add('active');
            els.statusText.textContent = "Active on this page";
            popupBody.classList.remove('disabled-overlay');
            popupFooter.classList.remove('disabled-overlay');
        }
    }

    els.globalToggle.addEventListener('change', (e) => saveSetting('globalEnabled', e.target.checked));
    els.settingHighlights.addEventListener('change', (e) => saveSetting('highlights', e.target.checked));
    els.settingHud.addEventListener('change', (e) => saveSetting('hud', e.target.checked));
    els.settingProfile.addEventListener('change', (e) => saveSetting('activeProfile', e.target.value));

    els.settingConfidence.addEventListener('input', (e) => els.confidenceVal.textContent = e.target.value + '%');
    els.settingConfidence.addEventListener('change', (e) => saveSetting('confidence', parseInt(e.target.value)));
    
    els.settingDelay.addEventListener('input', (e) => els.delayVal.textContent = e.target.value);
    els.settingDelay.addEventListener('change', (e) => saveSetting('delay', parseInt(e.target.value)));

    els.pageToggle.addEventListener('change', (e) => toggleBlock('blockedPages', currentUrl, !e.target.checked));
    els.domainToggle.addEventListener('change', (e) => toggleBlock('blockedDomains', currentDomain, !e.target.checked));

    els.reloadBtn.addEventListener('click', () => {
        if (currentTab) chrome.tabs.reload(currentTab.id);
        window.close();
    });

    els.clearHistoryBtn.addEventListener('click', () => {
        chrome.storage.local.set({ history: [] }, loadState);
    });

    els.helpBtn.addEventListener('click', () => {
        if (els.helpModal) els.helpModal.classList.add('active');
    });

    els.helpCloseBtn.addEventListener('click', () => {
        if (els.helpModal) els.helpModal.classList.remove('active');
    });

    if (els.helpModal) {
        els.helpModal.addEventListener('click', (e) => {
            if (e.target === els.helpModal) els.helpModal.classList.remove('active');
        });
    }

    els.exportBtn.addEventListener('click', () => {
        chrome.storage.local.get(null, (allData) => {
            const dataStr = JSON.stringify(allData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `arch2tensor-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    els.resetBtn.addEventListener('click', () => {
        chrome.storage.local.clear(() => {
            chrome.storage.local.set(defaultSettings, loadState);
        });
    });

    if (els.bookmarksSearch) {
        els.bookmarksSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#bookmarks-list .blocked-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }

    function saveSetting(key, value) {
        chrome.storage.local.set({ [key]: value }, loadState);
    }

    function toggleBlock(listKey, itemToBlock, shouldBlock) {
        if (!itemToBlock) return;
        chrome.storage.local.get([listKey], (res) => {
            let list = res[listKey] || [];
            if (shouldBlock && !list.includes(itemToBlock)) list.push(itemToBlock);
            if (!shouldBlock) list = list.filter(i => i !== itemToBlock);
            chrome.storage.local.set({ [listKey]: list }, loadState);
        });
    }

    function renderBlockedList(pages, domains) {
        els.blockedList.innerHTML = '';
        const allBlocked = [...domains.map(d => ({type: 'domain', val: d})), ...pages.map(p => ({type: 'page', val: p}))];
        if (allBlocked.length === 0) {
            els.blockedList.innerHTML = '<div class="empty-blocked">No blocked pages yet</div>';
            return;
        }
        allBlocked.forEach(item => {
            const div = document.createElement('div');
            div.className = 'blocked-item';
            div.innerHTML = `
                <span class="blocked-item-url" title="${item.val}">
                    ${item.type === 'domain' ? '🌐 ' : '📄 '}${item.val}
                </span>
                <button class="unblock-btn" title="Unblock">✕</button>
            `;
            div.querySelector('.unblock-btn').onclick = () => {
                toggleBlock(item.type === 'domain' ? 'blockedDomains' : 'blockedPages', item.val, false);
            };
            els.blockedList.appendChild(div);
        });
    }

    function renderHistoryList(history) {
        els.historyList.innerHTML = '';
        if (!history || history.length === 0) {
            els.historyList.innerHTML = '<div class="empty-blocked">No pages scanned yet</div>';
            return;
        }
        history.slice(-10).reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <span class="history-item-url" title="${item.url}">${item.url.replace(/^https?:\/\//, '')}</span>
                <span class="history-item-meta">${item.count} items</span>
            `;
            els.historyList.appendChild(div);
        });
    }

    function fetchPageStats() {
        if (!currentTab) return;
        try {
            chrome.tabs.sendMessage(currentTab.id, { action: "getPageStats" }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    setEmptyStats();
                    return;
                }
                els.statMentions.textContent = response.mentions || 0;
                els.statUnique.textContent = response.unique || 0;
                els.statDb.textContent = response.dbSize || 0;
                els.archChipList.innerHTML = '';
                if (response.architectures && response.architectures.length > 0) {
                    response.architectures.forEach(arch => {
                        const chip = document.createElement('span');
                        chip.className = 'arch-chip';
                        chip.innerHTML = `${arch.name} <span class="chip-count">${arch.count}</span>`;
                        els.archChipList.appendChild(chip);
                    });
                }
            });
        } catch (e) {
            setEmptyStats();
        }
    }

    function renderBookmarksList(bookmarks) {
        els.bookmarksList.innerHTML = '';
        if (!bookmarks || bookmarks.length === 0) {
            els.bookmarksList.innerHTML = '<div class="empty-blocked">No architectures saved yet</div>';
            return;
        }
        chrome.storage.local.get(['architectureDb'], (res) => {
            const db = res.architectureDb || {};
            bookmarks.forEach(archKey => {
                const data = db[archKey];
                const title = data ? data.title : archKey;
                const repoUrl = data ? `https://${data.repo}` : '#';
                const div = document.createElement('div');
                div.className = 'blocked-item';
                div.innerHTML = `
                    <span class="blocked-item-url" title="${title}" style="color: #4fc3f7; font-weight: 600;">
                        🔖 ${title}
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <a href="${repoUrl}" target="_blank" class="unblock-btn" style="text-decoration: none; border-color: #81c784; color: #81c784;" title="Open Repo">↗</a>
                        <button class="unblock-btn remove-bookmark-btn" title="Remove Bookmark">✕</button>
                    </div>
                `;
                div.querySelector('.remove-bookmark-btn').onclick = () => {
                    const newList = bookmarks.filter(b => b !== archKey);
                    chrome.storage.local.set({ savedBookmarks: newList }, loadState);
                };
                els.bookmarksList.appendChild(div);
            });
        });
    }

    function setEmptyStats() {
        els.statMentions.textContent = '—';
        els.statUnique.textContent = '—';
        els.statDb.textContent = '—';
        els.archChipList.innerHTML = '';
    }
});