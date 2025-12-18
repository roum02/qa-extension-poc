// Store selected element info
let currentElementInfo = null;

// DOM elements
const selectElementBtn = document.getElementById('selectElement');
const captureButton = document.getElementById('captureButton');
const clearButton = document.getElementById('clearButton');
const memoTextarea = document.getElementById('memo');
const elementInfoContainer = document.getElementById('elementInfoContainer');
const elementInfoDiv = document.getElementById('elementInfo');
const statusMessage = document.getElementById('statusMessage');

// Event listeners
selectElementBtn.addEventListener('click', startElementSelection);
captureButton.addEventListener('click', captureToMarkdown);
clearButton.addEventListener('click', clearAll);

// Load saved element info when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['selectedElement', 'selectedTabUrl']);
    if (result.selectedElement) {
        currentElementInfo = result.selectedElement;
        displayElementInfo(result.selectedElement);
        captureButton.disabled = false;
        showStatus('이전에 선택한 DOM 요소가 있습니다.', 'info');
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'elementSelected') {
        currentElementInfo = request.elementInfo;
        displayElementInfo(request.elementInfo);
        captureButton.disabled = false;
        showStatus('DOM 요소가 선택되었습니다!', 'success');
    }
});

async function startElementSelection() {
    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        console.log('Current tab URL:', tab.url);

        // Check if we can access the tab (not chrome:// or extension pages)
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
            showStatus(`이 페이지에서는 사용할 수 없습니다. (현재: ${tab.url || 'undefined'})`, 'error');
            return;
        }

        // Ensure content script is loaded before sending message
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        } catch (err) {
            // Content script might already be loaded, ignore error
            console.log('Content script already loaded or error:', err);
        }

        // Small delay to ensure content script is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send message to content script to start selection
        chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('오류: 페이지를 새로고침해주세요.', 'error');
                console.error('Message error:', chrome.runtime.lastError);
                return;
            }
            if (response && response.success) {
                showStatus('페이지에서 DOM 요소를 클릭하세요...', 'info');
            }
        });
    } catch (error) {
        showStatus('오류: ' + error.message, 'error');
        console.error('Selection error:', error);
    }
}

function displayElementInfo(info) {
    elementInfoContainer.style.display = 'block';

    // Clear previous content
    elementInfoDiv.textContent = '';

    // Create elements safely using DOM API
    const tagDiv = document.createElement('div');
    const tagLabel = document.createElement('strong');
    tagLabel.textContent = 'Tag:';
    tagDiv.appendChild(tagLabel);
    tagDiv.appendChild(document.createTextNode(' ' + info.tag));
    elementInfoDiv.appendChild(tagDiv);

    if (info.id) {
        const idDiv = document.createElement('div');
        const idLabel = document.createElement('strong');
        idLabel.textContent = 'ID:';
        idDiv.appendChild(idLabel);
        idDiv.appendChild(document.createTextNode(' ' + info.id));
        elementInfoDiv.appendChild(idDiv);
    }

    if (info.classes) {
        const classDiv = document.createElement('div');
        const classLabel = document.createElement('strong');
        classLabel.textContent = 'Classes:';
        classDiv.appendChild(classLabel);
        classDiv.appendChild(document.createTextNode(' ' + info.classes));
        elementInfoDiv.appendChild(classDiv);
    }

    const selectorLabel = document.createElement('div');
    const selectorStrong = document.createElement('strong');
    selectorStrong.textContent = 'Selector:';
    selectorLabel.appendChild(selectorStrong);
    elementInfoDiv.appendChild(selectorLabel);

    const selectorPre = document.createElement('pre');
    selectorPre.textContent = info.selector;
    elementInfoDiv.appendChild(selectorPre);

    if (info.text) {
        const textDiv = document.createElement('div');
        const textLabel = document.createElement('strong');
        textLabel.textContent = 'Text:';
        textDiv.appendChild(textLabel);
        const displayText = info.text.length >= 100 ? info.text + '...' : info.text;
        textDiv.appendChild(document.createTextNode(' ' + displayText));
        elementInfoDiv.appendChild(textDiv);
    }
}

async function captureToMarkdown() {
    if (!currentElementInfo) {
        showStatus('먼저 DOM 요소를 선택해주세요.', 'error');
        return;
    }

    const memo = memoTextarea.value.trim();

    // Get current tab URL reliably
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tab?.url || (await chrome.storage.local.get(['selectedTabUrl'])).selectedTabUrl || 'Unknown';

    // Generate markdown content
    const timestamp = new Date().toISOString();
    const filename = `dom-capture-${Date.now()}.md`;

    const markdownContent = generateMarkdown(currentElementInfo, memo, timestamp, pageUrl);

    // Download the file
    downloadMarkdownFile(filename, markdownContent);

    showStatus('마크다운 파일이 다운로드되었습니다!', 'success');
}

function generateMarkdown(elementInfo, memo, timestamp, pageUrl) {
    return `# DOM Element Capture

## Capture Information
- **Date:** ${new Date(timestamp).toLocaleString('ko-KR')}
- **URL:** ${pageUrl}

## Element Details

### Tag Information
- **Tag:** \`${elementInfo.tag}\`
${elementInfo.id ? `- **ID:** \`${elementInfo.id}\`` : ''}
${elementInfo.classes ? `- **Classes:** \`${elementInfo.classes}\`` : ''}

### CSS Selector
\`\`\`css
${elementInfo.selector}
\`\`\`

### XPath
\`\`\`xpath
${elementInfo.xpath}
\`\`\`

${elementInfo.text ? `### Text Content
\`\`\`
${elementInfo.text}
\`\`\`
` : ''}

### HTML Structure
\`\`\`html
${elementInfo.html}${elementInfo.html.length >= 500 ? '...' : ''}
\`\`\`

## Memo
${memo || '_메모 없음_'}

---
*Generated by DOM Memo Capture Extension*
`;
}

function downloadMarkdownFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    }, () => {
        if (chrome.runtime.lastError) {
            showStatus('다운로드 오류: ' + chrome.runtime.lastError.message, 'error');
        } else {
            // Clean up the object URL after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    });
}

function clearAll() {
    currentElementInfo = null;
    memoTextarea.value = '';
    elementInfoContainer.style.display = 'none';
    captureButton.disabled = true;
    statusMessage.textContent = '';

    // Clear storage
    chrome.storage.local.remove(['selectedElement', 'selectedTabId', 'selectedTabUrl'], () => {
        showStatus('초기화되었습니다.', 'info');
    });
}

function showStatus(message, type = 'info') {
    // Clear previous status
    statusMessage.textContent = '';

    // Create status div safely
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    statusMessage.appendChild(statusDiv);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (statusMessage.contains(statusDiv)) {
            statusMessage.textContent = '';
        }
    }, 5000);
}
