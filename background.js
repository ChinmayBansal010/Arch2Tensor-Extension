// const API_URL = "http://127.0.0.1:8000/architectures";
const API_URL = "https://arch2tensor-api.onrender.com/architectures";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getArchitectureCount") {
        chrome.storage.local.get(["architectureDb"], (result) => {
            const count = result.architectureDb ? Object.keys(result.architectureDb).length : 0;
            sendResponse({ success: true, count: count });
        });
        return true;
    }
    
    if (request.action === "fetchArchitectures") {
        chrome.storage.local.get(["architectureDb", "lastFetch"], (result) => {
            const now = Date.now();
            if (result.architectureDb && result.lastFetch && (now - result.lastFetch < 3600000)) {
                sendResponse({ success: true, data: result.architectureDb });
                return;
            }
            fetch(API_URL)
                .then(response => response.json())
                .then(data => {
                    const formattedDb = {};
                    data.forEach(item => {
                        const architectureData = {
                            title: item.title,
                            description: item.description,
                            mathRaw: item.math_raw,
                            mathDescription: item.math_description,
                            repo: item.repo,
                            code: item.code,
                            type: item.type,
                            metrics: item.metrics || {},
                            useCases: item.use_cases || [],
                            aliases: item.aliases || [],
                            blocks: item.blocks || ['Input Layer', 'Hidden Layers', 'Output Layer']
                        };
                        formattedDb[item.keyword] = architectureData;
                        if (item.aliases && Array.isArray(item.aliases)) {
                            item.aliases.forEach(alias => {
                                formattedDb[alias] = architectureData;
                            });
                        }
                    });
                    chrome.storage.local.set({
                        architectureDb: formattedDb,
                        lastFetch: now
                    });
                    sendResponse({ success: true, data: formattedDb });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        return true;
    }
});