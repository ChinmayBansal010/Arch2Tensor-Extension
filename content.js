let architectureDb = {};
let highlightIndex = -1;
let allHighlights = [];
let pinnedTooltips = [];
let compareList = [];
let hudVisible = false;
let extensionActive = false;
let activeProfile = 'All';

let tooltip = null;
let hud = null;
let comparePanel = null;
let searchOverlay = null;
let keydownListener = null;
let clickListener = null;

function initializeDOMElements() {
    if (extensionActive) return;
    
    tooltip = document.createElement('div');
    tooltip.id = 'arch-tooltip';
    document.body.appendChild(tooltip);

    hud = document.createElement('div');
    hud.id = 'arch-hud';
    document.body.appendChild(hud);

    comparePanel = document.createElement('div');
    comparePanel.id = 'arch-compare-panel';
    document.body.appendChild(comparePanel);

    searchOverlay = document.createElement('div');
    searchOverlay.id = 'arch-search-overlay';
    document.body.appendChild(searchOverlay);

    keydownListener = (e) => {
        if (e.key === 'Escape') {
            tooltip.style.display = 'none';
            searchOverlay.style.display = 'none';
        }
        if (e.key === 'ArrowRight' && e.altKey) navigateHighlight(1);
        if (e.key === 'ArrowLeft' && e.altKey) navigateHighlight(-1);
        if (e.key === 'f' && e.altKey) toggleSearchOverlay();
        if (e.key === 'h' && e.altKey) toggleHud();
        if (e.key === 'c' && e.altKey) toggleComparePanel();
    };

    clickListener = (e) => {
        if (
            !e.target.classList.contains('arch-highlight') &&
            !tooltip.contains(e.target) &&
            !e.target.closest('#arch-hud') &&
            !e.target.closest('#arch-compare-panel') &&
            !e.target.closest('#arch-search-overlay')
        ) {
            if (!tooltip.dataset.pinned) tooltip.style.display = 'none';
        }
    };

    document.addEventListener('keydown', keydownListener);
    document.addEventListener('click', clickListener);
    extensionActive = true;
}

function cleanupDOMElements() {
    if (!extensionActive) return;
    document.querySelectorAll('.arch-highlight').forEach(el => {
        el.classList.remove('arch-highlight', 'arch-highlight--active');
    });
    document.querySelectorAll('#arch-tooltip, #arch-hud, #arch-compare-panel, #arch-search-overlay').forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    if (keydownListener) document.removeEventListener('keydown', keydownListener);
    if (clickListener) document.removeEventListener('click', clickListener);
    tooltip = null;
    hud = null;
    comparePanel = null;
    searchOverlay = null;
    extensionActive = false;
}

function navigateHighlight(dir) {
    allHighlights = Array.from(document.querySelectorAll('.arch-highlight'));
    if (!allHighlights.length) return;
    highlightIndex = (highlightIndex + dir + allHighlights.length) % allHighlights.length;
    const el = allHighlights[highlightIndex];
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('arch-highlight--active');
    setTimeout(() => el.classList.remove('arch-highlight--active'), 1200);
    showTooltipForElement(el);
}

function toggleHud() {
    hudVisible = !hudVisible;
    hud.style.display = hudVisible ? 'block' : 'none';
}

function toggleSearchOverlay() {
    const visible = searchOverlay.style.display === 'block';
    searchOverlay.style.display = visible ? 'none' : 'block';
    if (!visible) {
        const input = searchOverlay.querySelector('#arch-search-input');
        if (input) input.focus();
    }
}

function toggleComparePanel() {
    const visible = comparePanel.style.display === 'block';
    comparePanel.style.display = visible ? 'none' : 'block';
    if (!visible) renderComparePanel();
}

function drawGraph(canvas, data) {
    const ctx = canvas.getContext('2d');
    
    const blocks = data.blocks && data.blocks.length > 0 
        ? data.blocks 
        : ['[Data Missing]', 'Please update DB', 'with model blocks'];
    
    // Base dimensions
    const baseBlockWidth = 340; 
    const minBlockHeight = 46;
    const gap = 32;
    const padding = 30;
    const dpr = window.devicePixelRatio || 1;

    // --- Helper: Text Wrapping Logic ---
    // Breaks text into multiple lines if it exceeds maxWidth
    function wrapText(context, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = context.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    // --- Helper: Style Parsing ---
    function getLayerStyle(name) {
        const n = name.toLowerCase();
        // Return Gradient Colors [Top, Bottom], Border, Text
        if (n.includes('conv')) return { grad: ['rgba(79, 195, 247, 0.15)', 'rgba(79, 195, 247, 0.05)'], border: '#4fc3f7', text: '#e1f5fe' };
        if (n.includes('pool')) return { grad: ['rgba(255, 138, 101, 0.15)', 'rgba(255, 138, 101, 0.05)'], border: '#ff8a65', text: '#fbe9e7' };
        if (n.includes('attention') || n.includes('transformer')) return { grad: ['rgba(179, 157, 219, 0.15)', 'rgba(179, 157, 219, 0.05)'], border: '#b39ddb', text: '#ede7f6' };
        if (n.includes('linear') || n.includes('dense') || n.includes('fc')) return { grad: ['rgba(129, 199, 132, 0.15)', 'rgba(129, 199, 132, 0.05)'], border: '#81c784', text: '#e8f5e9' };
        if (n.includes('norm') || n.includes('dropout')) return { grad: ['rgba(255, 213, 79, 0.15)', 'rgba(255, 213, 79, 0.05)'], border: '#ffd54f', text: '#fffde7' };
        if (n.includes('lstm') || n.includes('rnn')) return { grad: ['rgba(244, 143, 177, 0.15)', 'rgba(244, 143, 177, 0.05)'], border: '#f48fb1', text: '#fce4ec' };
        if (n.includes('input') || n.includes('output') || n.includes('image')) return { grad: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)'], border: '#e0e0e0', text: '#ffffff' };
        return { grad: ['#222222', '#1a1a1a'], border: '#555', text: '#cccccc' };
    }

    // --- First Pass: Calculate Heights ---
    // We need to know the total height *before* we set canvas size
    ctx.font = '600 13px "IBM Plex Mono", monospace, sans-serif'; // Set font early for measuring
    const lineHeight = 18;
    const textPadding = 24; // Horizontal padding inside block

    const processedBlocks = blocks.map(blockText => {
        const lines = wrapText(ctx, blockText, baseBlockWidth - textPadding);
        const textHeight = lines.length * lineHeight;
        // Block height is either the min height, or text height + vertical padding
        const blockHeight = Math.max(minBlockHeight, textHeight + 20); 
        return {
            text: blockText,
            lines: lines,
            height: blockHeight,
            style: getLayerStyle(blockText)
        };
    });

    // Calculate total required canvas height
    const totalContentHeight = processedBlocks.reduce((sum, block) => sum + block.height, 0);
    const totalGapsHeight = (processedBlocks.length - 1) * gap;
    const totalHeight = totalContentHeight + totalGapsHeight + (padding * 2);
    const totalWidth = 500; // Fixed width for the modal container

    // --- Setup Canvas ---
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, totalHeight);

    // --- Second Pass: Drawing ---
    const startX = totalWidth / 2 - baseBlockWidth / 2;
    let currentY = padding;

    processedBlocks.forEach((block, i) => {
        
        // 1. Draw Block Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        
        // 2. Draw Block Background (Gradient)
        const gradient = ctx.createLinearGradient(0, currentY, 0, currentY + block.height);
        gradient.addColorStop(0, block.style.grad[0]);
        gradient.addColorStop(1, block.style.grad[1]);
        
        ctx.fillStyle = gradient;
        ctx.strokeStyle = block.style.border;
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.roundRect(startX, currentY, baseBlockWidth, block.height, 8); // 8px border radius
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow for text and lines
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // 3. Draw Text Lines
        ctx.fillStyle = block.style.text;
        ctx.font = '600 13px "IBM Plex Mono", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Center text vertically within the dynamically sized block
        const totalTextHeight = block.lines.length * lineHeight;
        let textStartY = currentY + (block.height / 2) - (totalTextHeight / 2) + (lineHeight / 2);

        block.lines.forEach(line => {
            ctx.fillText(line, startX + baseBlockWidth / 2, textStartY);
            textStartY += lineHeight;
        });
        
        // 4. Draw Connecting Arrow
        if (i < processedBlocks.length - 1) {
            const arrowStartX = startX + baseBlockWidth / 2;
            const arrowStartY = currentY + block.height;
            const arrowEndY = arrowStartY + gap;
            
            // Draw Line
            ctx.beginPath();
            ctx.moveTo(arrowStartX, arrowStartY);
            ctx.lineTo(arrowStartX, arrowEndY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // Softer arrow color
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw Arrowhead
            ctx.beginPath();
            ctx.moveTo(arrowStartX - 6, arrowEndY - 8);
            ctx.lineTo(arrowStartX, arrowEndY);
            ctx.lineTo(arrowStartX + 6, arrowEndY - 8);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        }
        
        // Move Y pointer down for the next block
        currentY += block.height + gap;
    });
}

function initExtension() {
    chrome.storage.local.get(['globalEnabled', 'blockedDomains', 'blockedPages', 'delay', 'savedBookmarks', 'activeProfile'], (settings) => {
        const currentUrl = window.location.href.split('?')[0];
        const currentDomain = window.location.hostname;
        const isGlobalOn = settings.globalEnabled !== false;
        const isDomainBlocked = (settings.blockedDomains || []).includes(currentDomain);
        const isPageBlocked = (settings.blockedPages || []).includes(currentUrl);
        savedBookmarks = settings.savedBookmarks || [];
        activeProfile = settings.activeProfile || 'All';

        if (!isGlobalOn || isDomainBlocked || isPageBlocked) {
            cleanupDOMElements();
            return; 
        }

        initializeDOMElements();

        chrome.runtime.sendMessage(
            { action: "fetchArchitectures" },
            (response) => {
                if (chrome.runtime.lastError) return;
                let fetchedData = response;
                if (response && response.success !== undefined) {
                    fetchedData = response.data;
                }
                if (fetchedData && typeof fetchedData === 'object' && Object.keys(fetchedData).length > 0) {
                    architectureDb = fetchedData;
                    const userDelay = settings.delay !== undefined ? settings.delay : 1200;
                    
                    setTimeout(() => {
                        buildHud();
                        buildSearchOverlay();
                        highlightArchitectures(); 
                    }, userDelay);
                }
            }
        );
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.savedBookmarks) {
            savedBookmarks = changes.savedBookmarks.newValue || [];
        }
        if (changes.activeProfile) {
            activeProfile = changes.activeProfile.newValue || 'All';
            document.querySelectorAll('.arch-highlight').forEach(el => el.classList.remove('arch-highlight'));
            highlightArchitectures();
        }
        if (changes.globalEnabled || changes.blockedDomains || changes.blockedPages) {
            document.querySelectorAll('.arch-highlight').forEach(el => el.classList.remove('arch-highlight'));
            initExtension();
        }
    }
});

function buildArchitectureRegex(name) {
    let pattern = '';
    let i = 0;
    while (i < name.length) {
        const ch = name[i];
        if (/[-_\s/]/.test(ch)) {
            while (i + 1 < name.length && /[-_\s/]/.test(name[i + 1])) i++;
            pattern += '[-_\\s/]*';
            i++;
            continue;
        }
        if (ch === '+') {
            let count = 0;
            while (i < name.length && name[i] === '+') { count++; i++; }
            pattern += `\\+{${count}}`;
            continue;
        }
        if (/[0-9]/.test(ch)) {
            let num = '';
            while (i < name.length && /[0-9]/.test(name[i])) num += name[i++];
            pattern += num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (i < name.length && !/[-_\s/+]/.test(name[i])) {
                pattern += '[-_\\s/]*';
            }
            continue;
        }
        pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        i++;
        if (i < name.length && !/[+]/.test(name[i])) {
            pattern += '[-_\\s/]*';
        }
    }
    return new RegExp(pattern, 'i');
}

function normalizeArch(text) {
    return (text || '').toLowerCase().replace(/[-_\s/]+/g, '').replace(/[^\w+]/g, '');
}

function computeMatchConfidence(dbName, matchedText) {
    const normDb = normalizeArch(dbName);
    const normMatch = normalizeArch(matchedText);
    if (normDb === normMatch) return 100;
    if (normDb.toLowerCase() === normMatch.toLowerCase()) return 95;
    const separatorCount = (matchedText.match(/[-_\s/]/g) || []).length;
    return Math.max(70, 100 - separatorCount * 5);
}

function resolveCanonicalKey(arch) {
    const data = architectureDb[arch];
    if (!data) return arch;
    for (const [key, val] of Object.entries(architectureDb)) {
        if (key === arch) continue;
        if (val.aliases && val.aliases.some(a => normalizeArch(a) === normalizeArch(arch))) return key;
        if (data.aliases && data.aliases.some(a => normalizeArch(a) === normalizeArch(key))) return arch;
    }
    return arch;
}

function findBestArchitecture(text, sortedArchs, seenArchsInLine = new Set()) {
    let best = null;
    for (const arch of sortedArchs) {
        if (seenArchsInLine.has(arch)) continue;
        if (seenArchsInLine.has(resolveCanonicalKey(arch))) continue;
        const regex = buildArchitectureRegex(arch);
        const match = text.match(regex);
        if (!match) continue;
        const matchedText = match[0];
        const start = match.index;
        const end = start + matchedText.length;
        const before = start > 0 ? text[start - 1] : '';
        const after = end < text.length ? text[end] : '';
        const boundaryOk = (before === '' || /[^a-zA-Z0-9]/.test(before)) && (after === '' || /[^a-zA-Z0-9+]/.test(after));
        if (!boundaryOk) continue;
        const confidence = computeMatchConfidence(arch, matchedText);
        if (!best || start < best.index) {
            best = { arch, matchedText, index: start, confidence };
        }
    }
    return best;
}

function isInsideCodeBlock(node) {
    let el = node.parentNode;
    while (el && el !== document.body) {
        const tag = el.nodeName;
        if (['PRE', 'CODE', 'KBD', 'SAMP', 'TT', 'VAR'].includes(tag)) return true;
        if (el.classList && (
            el.classList.contains('highlight') ||
            el.classList.contains('code-block') ||
            el.classList.contains('prism') ||
            el.classList.contains('hljs') ||
            el.classList.contains('shiki') ||
            el.classList.contains('codehilite') ||
            el.classList.contains('sourceCode') ||
            el.classList.contains('arch-code')
        )) return true;
        el = el.parentNode;
    }
    return false;
}

let mutationObserver = null;
let mutationDebounceTimer = null;
const pendingRoots = new Set();

function startObserver() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const added of mutation.addedNodes) {
                if (added.nodeType === Node.TEXT_NODE) {
                    const parent = added.parentNode;
                    if (parent && !isInsideCodeBlock(added) && !parent.closest('#arch-tooltip, #arch-hud, #arch-compare-panel, #arch-search-overlay') && !parent.closest('.arch-highlight')) {
                        pendingRoots.add(parent);
                    }
                } else if (added.nodeType === Node.ELEMENT_NODE) {
                    if (!added.closest('#arch-tooltip, #arch-hud, #arch-compare-panel, #arch-search-overlay') && !added.closest('.arch-highlight')) {
                        pendingRoots.add(added);
                    }
                }
            }
        }
        if (!pendingRoots.size) return;
        clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();
            const deduped = roots.filter(root => root.isConnected && !roots.some(other => other !== root && other.contains(root)));
            const sortedArchs = Object.keys(architectureDb).filter(arch => {
                if (activeProfile === 'All') return true;
                return architectureDb[arch]?.type === activeProfile;
            }).sort((a, b) => {
                const na = normalizeArch(a).length;
                const nb = normalizeArch(b).length;
                if (nb !== na) return nb - na;
                return b.length - a.length;
            });
            const newCounts = {};
            mutationObserver.disconnect();
            deduped.forEach(root => highlightNodes(root, sortedArchs, newCounts));
            if (Object.keys(newCounts).length) {
                allHighlights = Array.from(document.querySelectorAll('.arch-highlight'));
                attachHoverListenersToNew(document.querySelectorAll('.arch-highlight:not([data-listener])'));
                refreshHudCounts(newCounts);
            }
            mutationObserver.observe(document.body, { childList: true, subtree: true });
        }, 300);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function highlightNodes(root, sortedArchs, pageCounts) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
        const parent = node.parentNode;
        const tag = parent.nodeName;
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(tag)) continue;
        if (isInsideCodeBlock(node)) continue;
        if (parent.closest('.arch-highlight')) continue; 
        if (!node.nodeValue.trim()) continue;
        nodes.push(node);
    }
    nodes.forEach((node) => {
        const fullText = node.nodeValue;
        const matches = [];
        let remaining = fullText;
        let offset = 0;
        const seenArchsInLine = new Set();
        while (remaining.length > 0) {
            const best = findBestArchitecture(remaining, sortedArchs, seenArchsInLine);
            if (!best) break;
            const canonicalKey = resolveCanonicalKey(best.arch);
            seenArchsInLine.add(best.arch);
            seenArchsInLine.add(canonicalKey);
            pageCounts[canonicalKey] = (pageCounts[canonicalKey] || 0) + 1;
            matches.push({
                arch: best.arch,
                matchedText: best.matchedText,
                start: offset + best.index,
                end: offset + best.index + best.matchedText.length,
                confidence: best.confidence
            });
            offset += best.index + best.matchedText.length;
            remaining = fullText.slice(offset);
        }
        if (!matches.length) return;
        let html = '';
        let cursor = 0;
        matches.forEach(({ arch, matchedText, start, end, confidence }) => {
            const escaped = fullText.slice(cursor, start).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += escaped;
            const confidenceClass = confidence === 100 ? 'conf-exact' : confidence >= 90 ? 'conf-high' : 'conf-medium';
            html += `<span class="arch-highlight ${confidenceClass}" data-arch="${arch}" data-confidence="${confidence}">${matchedText}</span>`;
            cursor = end;
        });
        html += fullText.slice(cursor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const wrapper = document.createElement('span');
        wrapper.className = 'arch-wrapper-node'; 
        wrapper.innerHTML = html;
        node.parentNode.replaceChild(wrapper, node);
    });
}

function highlightArchitectures() {
    const sortedArchs = Object.keys(architectureDb).filter(arch => {
        if (activeProfile === 'All') return true;
        return architectureDb[arch]?.type === activeProfile;
    }).sort((a, b) => {
        const na = normalizeArch(a).length;
        const nb = normalizeArch(b).length;
        if (nb !== na) return nb - na;
        return b.length - a.length;
    });
    const pageCounts = {};
    highlightNodes(document.body, sortedArchs, pageCounts);
    chrome.storage.local.get(['archPageHistory'], (result) => {
        const history = result.archPageHistory || {};
        const pageKey = location.hostname + location.pathname;
        history[pageKey] = {
            url: location.href,
            title: document.title,
            counts: pageCounts,
            visitedAt: Date.now()
        };
        chrome.storage.local.set({ archPageHistory: history });
    });
    allHighlights = Array.from(document.querySelectorAll('.arch-highlight'));
    attachHoverListeners();
    updateHud(pageCounts);
    startObserver();
}

function syncCompareButtons() {
    document.querySelectorAll('.hud-add-compare').forEach(btn => {
        const arch = btn.dataset.arch;
        if (compareList.includes(arch)) {
            btn.textContent = '−';
            btn.classList.add('active');
            btn.title = 'Remove from compare';
        } else {
            btn.textContent = '+';
            btn.classList.remove('active');
            btn.title = 'Add to compare';
        }
    });
}

function refreshHudCounts(newCounts) {
    const body = document.getElementById('hud-body');
    if (!body) return;
    const existingItems = body.querySelectorAll('.hud-item');
    const existingMap = {};
    existingItems.forEach(el => { existingMap[el.dataset.arch] = el; });
    
    Object.entries(newCounts).forEach(([arch, count]) => {
        if (existingMap[arch]) {
            const countEl = existingMap[arch].querySelector('.hud-item-count');
            if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + count;
        } else {
            const list = body.querySelector('.hud-list');
            if (!list) return;
            
            const isComp = compareList.includes(arch);
            const item = document.createElement('div');
            item.className = 'hud-item';
            item.dataset.arch = arch;
            item.innerHTML = `
                <div class="hud-item-left">
                    <span class="hud-item-name">${arch}</span>
                    <span class="hud-item-type">${architectureDb[arch]?.type || ''}</span>
                </div>
                <div class="hud-item-right">
                    <span class="hud-item-count">${count}</span>
                    <button class="hud-jump-btn" data-arch="${arch}">↓</button>
                    <button class="hud-add-compare ${isComp ? 'active' : ''}" data-arch="${arch}" title="${isComp ? 'Remove from compare' : 'Add to compare'}">${isComp ? '−' : '+'}</button>
                </div>
            `;
            item.querySelector('.hud-jump-btn').addEventListener('click', () => {
                const el = document.querySelector(`.arch-highlight[data-arch="${arch}"]`);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); showTooltipForElement(el); }
            });
            item.querySelector('.hud-add-compare').addEventListener('click', (e) => {
                const index = compareList.indexOf(arch);
                if (index === -1) {
                    if (compareList.length < 3) compareList.push(arch);
                } else {
                    compareList.splice(index, 1);
                }
                syncCompareButtons();
                if (comparePanel.style.display === 'block') renderComparePanel();
            });
            item.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const el = document.querySelector(`.arch-highlight[data-arch="${arch}"]`);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); showTooltipForElement(el); }
            });
            list.appendChild(item);
        }
    });
    const statPills = body.querySelectorAll('.hud-stat-pill');
    if (statPills.length >= 2) {
        const allHighlightsNow = document.querySelectorAll('.arch-highlight');
        const uniqueArchs = new Set(Array.from(allHighlightsNow).map(el => el.dataset.arch));
        statPills[0].textContent = `${allHighlightsNow.length} mentions`;
        statPills[1].textContent = `${uniqueArchs.size} unique`;
    }
}
function attachHoverListenersToNew(elements) {
    elements.forEach((el) => {
        if (el.dataset.listener) return;
        el.dataset.listener = '1';
        el.addEventListener('mouseenter', () => showTooltipForElement(el));
    });
}

function buildHud() {
    hud.innerHTML = `
        <div class="hud-header">
            <span class="hud-logo">⬡ ArchLens</span>
            <div class="hud-controls">
                <button class="hud-btn" id="hud-search-btn" title="Search (Alt+F)">⌕</button>
                <button class="hud-btn" id="hud-compare-btn" title="Compare (Alt+C)">⊞</button>
                <button class="hud-btn" id="hud-prev-btn" title="Prev (Alt+←)">←</button>
                <button class="hud-btn" id="hud-next-btn" title="Next (Alt+→)">→</button>
                <button class="hud-btn hud-close" id="hud-close-btn">✕</button>
            </div>
        </div>
        <div class="hud-body" id="hud-body">
            <div class="hud-empty">Scanning page...</div>
        </div>
    `;
    hud.querySelector('#hud-search-btn').addEventListener('click', toggleSearchOverlay);
    hud.querySelector('#hud-compare-btn').addEventListener('click', toggleComparePanel);
    hud.querySelector('#hud-prev-btn').addEventListener('click', () => navigateHighlight(-1));
    hud.querySelector('#hud-next-btn').addEventListener('click', () => navigateHighlight(1));
    hud.querySelector('#hud-close-btn').addEventListener('click', () => {
        hudVisible = false;
        hud.style.display = 'none';
    });
    makeDraggable(hud);
    hud.style.display = 'block';
    hudVisible = true;
}

function updateHud(pageCounts) {
    const body = document.getElementById('hud-body');
    if (!body) return;
    const entries = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, c]) => s + c, 0);
    if (!entries.length) {
        body.innerHTML = `<div class="hud-empty">No architectures found on this page</div>`;
        return;
    }
    body.innerHTML = `
        <div class="hud-stats">
            <span class="hud-stat-pill">${total} mentions</span>
            <span class="hud-stat-pill">${entries.length} unique</span>
        </div>
        <div class="hud-list">
            ${entries.map(([arch, count]) => {
                const isComp = compareList.includes(arch);
                return `
                <div class="hud-item" data-arch="${arch}">
                    <div class="hud-item-left">
                        <span class="hud-item-name">${arch}</span>
                        <span class="hud-item-type">${architectureDb[arch]?.type || ''}</span>
                    </div>
                    <div class="hud-item-right">
                        <span class="hud-item-count">${count}</span>
                        <button class="hud-jump-btn" data-arch="${arch}">↓</button>
                        <button class="hud-add-compare ${isComp ? 'active' : ''}" data-arch="${arch}" title="${isComp ? 'Remove from compare' : 'Add to compare'}">${isComp ? '−' : '+'}</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
    
    body.querySelectorAll('.hud-jump-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const arch = btn.dataset.arch;
            const el = document.querySelector(`.arch-highlight[data-arch="${arch}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showTooltipForElement(el);
            }
        });
    });
    
    // HUD Compare Add/Remove Toggle
    body.querySelectorAll('.hud-add-compare').forEach(btn => {
        btn.addEventListener('click', () => {
            const arch = btn.dataset.arch;
            const index = compareList.indexOf(arch);
            
            if (index === -1) {
                if (compareList.length < 3) {
                    compareList.push(arch);
                } else {
                    alert("You can only compare up to 3 architectures at once.");
                }
            } else {
                compareList.splice(index, 1);
            }
            
            syncCompareButtons();
            if (comparePanel.style.display === 'block') renderComparePanel();
            
            // Sync Tooltip button if it's currently open
            const ttCompBtn = document.getElementById('tt-compare-btn');
            if (ttCompBtn && tooltip.style.display === 'block') {
                if (compareList.includes(arch)) ttCompBtn.classList.add('active');
                else ttCompBtn.classList.remove('active');
            }
        });
    });
    
    body.querySelectorAll('.hud-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const arch = item.dataset.arch;
            const el = document.querySelector(`.arch-highlight[data-arch="${arch}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showTooltipForElement(el);
            }
        });
    });
}

function buildSearchOverlay() {
    searchOverlay.innerHTML = `
        <div class="search-modal">
            <div class="search-header">
                <span class="search-title">Search Architectures</span>
                <button class="search-close" id="search-close-btn">✕</button>
            </div>
            <input id="arch-search-input" class="search-input" placeholder="Type to search... (e.g. ResNet, YOLO, UNet)" autocomplete="off" />
            <div class="search-results" id="search-results"></div>
        </div>
    `;
    searchOverlay.querySelector('#search-close-btn').addEventListener('click', () => {
        searchOverlay.style.display = 'none';
    });
    const input = searchOverlay.querySelector('#arch-search-input');
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        const results = searchOverlay.querySelector('#search-results');
        if (!q) {
            results.innerHTML = '';
            return;
        }
        const matches = Object.entries(architectureDb).filter(([key, val]) =>
            key.toLowerCase().includes(q) ||
            (val.title || '').toLowerCase().includes(q) ||
            (val.description || '').toLowerCase().includes(q) ||
            (val.aliases || []).some(a => a.toLowerCase().includes(q))
        );
        if (!matches.length) {
            results.innerHTML = `<div class="search-empty">No results for "${q}"</div>`;
            return;
        }
        results.innerHTML = matches.slice(0, 8).map(([key, val]) => `
            <div class="search-result-item" data-arch="${key}">
                <div class="search-result-name">${val.title || key}</div>
                <div class="search-result-meta">
                    <span class="search-result-type">${val.type || ''}</span>
                    <span class="search-result-desc">${(val.description || '').slice(0, 80)}...</span>
                </div>
            </div>
        `).join('');
        results.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const arch = item.dataset.arch;
                const el = document.querySelector(`.arch-highlight[data-arch="${arch}"]`);
                searchOverlay.style.display = 'none';
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    showTooltipForElement(el);
                } else {
                    showFloatingTooltipForArch(arch);
                }
            });
        });
    });
    searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) searchOverlay.style.display = 'none';
    });
}

function renderComparePanel() {
    if (!compareList.length) {
        comparePanel.innerHTML = `
            <div class="compare-header">
                <span class="compare-title">Compare Architectures</span>
                <button class="compare-close" id="compare-close-btn">✕</button>
            </div>
            <div class="compare-empty">Add up to 3 architectures from the HUD panel to compare</div>
        `;
        comparePanel.querySelector('#compare-close-btn').addEventListener('click', () => {
            comparePanel.style.display = 'none';
        });
        return;
    }
    const fields = ['type', 'description'];
    const metricKeys = new Set();
    compareList.forEach(arch => {
        const d = architectureDb[arch];
        if (d?.metrics) Object.keys(d.metrics).forEach(k => metricKeys.add(k));
    });
    comparePanel.innerHTML = `
        <div class="compare-header">
            <span class="compare-title">Compare Architectures</span>
            <div class="compare-header-actions">
                <button class="compare-clear-btn" id="compare-clear-btn">Clear</button>
                <button class="compare-close" id="compare-close-btn">✕</button>
            </div>
        </div>
        <div class="compare-grid" style="grid-template-columns: 140px ${compareList.map(() => '1fr').join(' ')}">
            <div class="compare-cell compare-label-cell"></div>
            ${compareList.map(arch => `
                <div class="compare-cell compare-arch-header">
                    <span class="compare-arch-name">${architectureDb[arch]?.title || arch}</span>
                    <button class="compare-remove-btn" data-arch="${arch}">✕</button>
                </div>
            `).join('')}
            <div class="compare-cell compare-row-label">Type</div>
            ${compareList.map(arch => `<div class="compare-cell">${architectureDb[arch]?.type || '—'}</div>`).join('')}
            <div class="compare-cell compare-row-label">Description</div>
            ${compareList.map(arch => `<div class="compare-cell compare-desc-cell">${(architectureDb[arch]?.description || '—').slice(0, 100)}</div>`).join('')}
            ${[...metricKeys].map(mk => `
                <div class="compare-cell compare-row-label">${mk}</div>
                ${compareList.map(arch => {
                    const val = architectureDb[arch]?.metrics?.[mk];
                    return `<div class="compare-cell">${val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : val) : '—'}</div>`;
                }).join('')}
            `).join('')}
            <div class="compare-cell compare-row-label">Use Cases</div>
            ${compareList.map(arch => `
                <div class="compare-cell">
                    ${(architectureDb[arch]?.useCases || []).map(u => `<span class="compare-badge">${u}</span>`).join('')}
                </div>
            `).join('')}
        </div>
    `;
    comparePanel.querySelector('#compare-close-btn').addEventListener('click', () => {
        comparePanel.style.display = 'none';
    });
    comparePanel.querySelector('#compare-clear-btn').addEventListener('click', () => {
        compareList = [];
        renderComparePanel();
    });
    comparePanel.querySelectorAll('.compare-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            compareList = compareList.filter(a => a !== btn.dataset.arch);
            renderComparePanel();
        });
    });
}

function showTooltipForElement(el) {
    const arch = el.getAttribute('data-arch');
    const confidence = parseInt(el.dataset.confidence || '100');
    const data = architectureDb[arch];
    if (!data) return;
    renderTooltip(arch, data, confidence, el.getBoundingClientRect());
}

function showFloatingTooltipForArch(arch) {
    const data = architectureDb[arch];
    if (!data) return;
    const rect = { left: window.innerWidth / 2 - 240, bottom: 100, top: 100 };
    renderTooltip(arch, data, 100, rect);
}

function renderTooltip(arch, data, confidence, rect) {
    const mathUrl = `https://latex.codecogs.com/svg.image?\\color{white}${encodeURIComponent(data.mathRaw || '')}`;
    
    // Check initial states for buttons
    const isBookmarked = savedBookmarks.includes(arch);
    const bookmarkClass = isBookmarked ? 'bookmark-active' : '';
    const bookmarkTitle = isBookmarked ? 'Remove bookmark' : 'Save for later';
    
    const isCompared = compareList.includes(arch);
    const compareClass = isCompared ? 'active' : '';
    const compareTitle = isCompared ? 'Remove from compare' : 'Add to compare';
    
    let metricsHtml = '';
    if (data.metrics && Object.keys(data.metrics).length > 0) {
        Object.entries(data.metrics).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                metricsHtml += `<div class="metric-group-label">${key}</div>`;
                Object.entries(value).forEach(([subKey, subValue]) => {
                    metricsHtml += `
                        <div class="metric-row">
                            <span class="metric-key">${subKey}</span>
                            <span class="metric-val">${JSON.stringify(subValue).replace(/"/g, '')}</span>
                        </div>
                    `;
                });
            } else {
                metricsHtml += `
                    <div class="metric-row">
                        <span class="metric-key">${key}</span>
                        <span class="metric-val">${value}</span>
                    </div>
                `;
            }
        });
    } else {
        metricsHtml = `<span class="metric-empty">No metrics available</span>`;
    }
    
    const aliasesHtml = data.aliases && data.aliases.length
        ? `<div class="meta-item meta-full">
            <span class="meta-label">Aliases</span>
            <div class="meta-value alias-list">${data.aliases.map(a => `<span class="use-case-badge">${a}</span>`).join('')}</div>
           </div>`
        : '';
        
    const confidenceBar = `
        <div class="confidence-bar-wrap" title="Match confidence: ${confidence}%">
            <div class="confidence-bar" style="width:${confidence}%"></div>
            <span class="confidence-label">${confidence}%</span>
        </div>
    `;
    
    tooltip.dataset.pinned = '';
    tooltip.innerHTML = `
        <div class="arch-header">
            <div class="arch-title-container">
                <div class="arch-title">${data.title}</div>
                ${confidenceBar}
                <div class="arch-description">${data.description}</div>
            </div>
            <div class="arch-header-actions">
                <button class="tooltip-action-btn" id="tt-visualize-btn" title="Visualize Flow">👁️</button>
                <button class="tooltip-action-btn ${bookmarkClass}" id="tt-bookmark-btn" title="${bookmarkTitle}">🔖</button>
                <button class="tooltip-action-btn" id="tt-pin-btn" title="Pin tooltip">📌</button>
                <button class="tooltip-action-btn ${compareClass}" id="tt-compare-btn" title="${compareTitle}">⊞</button>
                <a class="arch-repo" href="https://${data.repo}" target="_blank">Repo ↗</a>
            </div>
        </div>

        <div class="arch-meta">
            <div class="meta-item">
                <span class="meta-label">Type</span>
                <span class="meta-value">${data.type}</span>
            </div>
            ${aliasesHtml}
            <div class="meta-item meta-full">
                <span class="meta-label">Metrics</span>
                <div class="meta-value metrics-grid">${metricsHtml}</div>
            </div>
        </div>

        <div class="arch-math-section" style="background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div class="math-label" style="font-size: 10px; color: #4fc3f7; text-transform: uppercase; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 12px;">Mathematical Formula</div>
            <div class="arch-math" style="display: flex; justify-content: center; align-items: center; background: #141414; padding: 16px; border-radius: 6px; box-shadow: inset 0 0 12px rgba(0,0,0,0.8); overflow-x: auto; margin-bottom: 12px; min-height: 60px;">
                <img src="${mathUrl}" style="max-height: 80px; width: auto;" alt="Math Formula" />
            </div>
            <div class="math-explanation" style="font-size: 11px; color: #999; line-height: 1.5;">${data.mathDescription}</div>
        </div>

        <div class="use-cases">
            <div class="use-cases-label">Use Cases</div>
            <div class="use-cases-list">
                ${(data.useCases || []).map(x => `<span class="use-case-badge">${x}</span>`).join('')}
            </div>
        </div>

        <div class="arch-graph-section" id="arch-graph-section" style="display: none; margin-top: 14px; border-top: 1px solid #222; padding-top: 16px; transition: all 0.3s ease;">
            <div class="graph-label" style="font-size: 10px; color: #4fc3f7; text-transform: uppercase; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 12px;">Architecture Flow</div>
            <div style="display: flex; justify-content: center; background: #0a0a0a; border-radius: 8px; padding: 20px; border: 1px solid #222; overflow-y: auto; max-height: 350px;">
                <canvas id="arch-graph-canvas" width="480"></canvas>
            </div>
        </div>

        <div class="code-container">
            <div class="code-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="code-lang" style="font-size: 11px; color: #90caf9; font-weight: bold; text-transform: uppercase;">Python</span>
                <div class="code-actions" style="display: flex; gap: 8px;">
                    <button class="colab-btn" id="tt-colab-btn" style="background: linear-gradient(135deg, #f9ab00 0%, #e65100 100%); color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                        🚀 Open in Colab
                    </button>
                    <button class="copy-btn" id="tt-copy-btn" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer;">
                        📋 Copy
                    </button>
                </div>
            </div>
            <pre class="arch-code" style="margin-top: 0;"><code>${data.code || ''}</code></pre>
        </div>
    `;

    // Visualize Flow Button
    const visualizeBtn = tooltip.querySelector('#tt-visualize-btn');
    const graphSection = tooltip.querySelector('#arch-graph-section');
    const canvas = tooltip.querySelector('#arch-graph-canvas');
    let graphDrawn = false;

    visualizeBtn.addEventListener('click', () => {
        if (graphSection.style.display === 'none') {
            graphSection.style.display = 'block';
            visualizeBtn.classList.add('active');
            if (!graphDrawn) {
                drawGraph(canvas, data);
                graphDrawn = true;
            }
        } else {
            graphSection.style.display = 'none';
            visualizeBtn.classList.remove('active');
        }
    });

    // Bookmark Toggle
    const bookmarkBtn = tooltip.querySelector('#tt-bookmark-btn');
    bookmarkBtn.addEventListener('click', () => {
        const index = savedBookmarks.indexOf(arch);
        if (index === -1) {
            savedBookmarks.push(arch);
            bookmarkBtn.classList.add('bookmark-active');
            bookmarkBtn.title = 'Remove bookmark';
        } else {
            savedBookmarks.splice(index, 1);
            bookmarkBtn.classList.remove('bookmark-active');
            bookmarkBtn.title = 'Save for later';
        }
        chrome.storage.local.set({ savedBookmarks: savedBookmarks });
    });

    // Pin Toggle
    const pinBtn = tooltip.querySelector('#tt-pin-btn');
    pinBtn.addEventListener('click', () => {
        if (tooltip.dataset.pinned === 'true') {
            tooltip.dataset.pinned = '';
            pinBtn.classList.remove('active');
            pinBtn.title = 'Pin tooltip';
        } else {
            tooltip.dataset.pinned = 'true';
            pinBtn.classList.add('active');
            pinBtn.title = 'Unpin tooltip';
        }
    });

    // Compare Toggle
    const compareBtn = tooltip.querySelector('#tt-compare-btn');
    compareBtn.addEventListener('click', () => {
        const index = compareList.indexOf(arch);
        if (index === -1) {
            if (compareList.length < 3) {
                compareList.push(arch);
                compareBtn.classList.add('active');
                compareBtn.title = 'Remove from compare';
            } else {
                alert("You can only compare up to 3 architectures at a time.");
            }
        } else {
            compareList.splice(index, 1);
            compareBtn.classList.remove('active');
            compareBtn.title = 'Add to compare';
        }
        syncCompareButtons();
        if (comparePanel.style.display === 'block') renderComparePanel();
    });

    tooltip.querySelector('#tt-copy-btn').addEventListener('click', () => {
        const btn = tooltip.querySelector('#tt-copy-btn');
        navigator.clipboard.writeText(data.code || '');
        const old = btn.innerText;
        btn.innerText = '✓ Copied!';
        btn.style.background = '#4caf50';
        setTimeout(() => { btn.innerText = old; btn.style.background = '#333'; }, 2000);
    });

    tooltip.querySelector('#tt-colab-btn').addEventListener('click', () => {
        const btn = tooltip.querySelector('#tt-colab-btn');
        navigator.clipboard.writeText(data.code || '');
        window.open('https://colab.research.google.com/#create=true', '_blank');
        const old = btn.innerHTML;
        btn.innerHTML = '✓ Copied & Opened!';
        btn.style.background = '#4caf50';
        setTimeout(() => { 
            btn.innerHTML = old; 
            btn.style.background = 'linear-gradient(135deg, #f9ab00 0%, #e65100 100%)'; 
        }, 3000);
    });

    // Correct positioning logic for 'position: fixed'
    // Do NOT add window.scrollX or window.scrollY!
    let left = rect.left;
    let top = rect.bottom + 8; // Place it 8px below the highlighted word
    
    tooltip.style.display = 'block';
    
    requestAnimationFrame(() => {
        const tip = tooltip.getBoundingClientRect();
        
        // Prevent horizontal overflow (keeps it on screen if too far right)
        if (left + tip.width > window.innerWidth - 20) {
            left = window.innerWidth - tip.width - 20;
        }
        
        // Prevent vertical overflow (flips it ABOVE the word if it goes off the bottom of the screen)
        if (top + tip.height > window.innerHeight - 20) {
            top = rect.top - tip.height - 8;
        }
        
        // Final position assignment (ensures it never goes off the left/top edges)
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    });
    makeDraggable(tooltip);
}

function attachHoverListeners() {
    document.querySelectorAll('.arch-highlight').forEach((el) => {
        if (el.dataset.listener) return;
        el.dataset.listener = '1';
        el.addEventListener('mouseenter', () => showTooltipForElement(el));
    });
}

function makeDraggable(el) {
    let isDragging = false, startX, startY, origLeft, origTop;
    const handle = el.querySelector('.hud-header, .arch-header, .compare-header') || el;
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        el.style.position = 'fixed';
        el.style.left = origLeft + 'px';
        el.style.top = origTop + 'px';
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (origLeft + dx) + 'px';
        el.style.top = (origTop + dy) + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'grab';
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageStats") {
        const highlights = document.querySelectorAll('.arch-highlight');
        const dbSize = Object.keys(architectureDb).length;
        const counts = {};
        highlights.forEach(el => {
            const arch = el.getAttribute('data-arch');
            counts[arch] = (counts[arch] || 0) + 1;
        });
        const architectures = Object.keys(counts).map(key => ({
            name: key,
            count: counts[key]
        })).sort((a, b) => b.count - a.count); 
        sendResponse({
            mentions: highlights.length,
            unique: Object.keys(counts).length,
            dbSize: dbSize,
            architectures: architectures
        });
    }
    return true;
});

initExtension();