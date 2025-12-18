// DOM element selection state
let selectedElement = null;
let originalOutline = '';
let originalCursor = '';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startSelection') {
        enableElementSelection();
        sendResponse({ success: true });
    } else if (request.action === 'getSelectedElement') {
        if (selectedElement) {
            const elementInfo = getElementInfo(selectedElement);
            sendResponse({ success: true, elementInfo });
        } else {
            sendResponse({ success: false, message: 'No element selected' });
        }
    }
    return true;
});

function enableElementSelection() {
    document.body.style.cursor = 'crosshair';

    // Add event listeners
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('click', selectElement);
}

function disableElementSelection() {
    document.body.style.cursor = originalCursor;
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('click', selectElement);
}

function highlightElement(event) {
    event.preventDefault();

    // Remove previous highlight
    if (selectedElement && selectedElement !== event.target) {
        selectedElement.style.outline = originalOutline;
    }

    // Highlight current element
    originalOutline = event.target.style.outline;
    event.target.style.outline = '2px solid #4CAF50';
}

function selectElement(event) {
    event.preventDefault();
    event.stopPropagation();

    selectedElement = event.target;
    selectedElement.style.outline = '3px solid #2196F3';

    disableElementSelection();

    // Notify popup that element is selected
    chrome.runtime.sendMessage({
        action: 'elementSelected',
        elementInfo: getElementInfo(selectedElement)
    });
}

function getElementInfo(element) {
    // Get CSS selector path
    const getSelector = (el) => {
        if (el.id) {
            return `#${el.id}`;
        }

        let selector = el.tagName.toLowerCase();

        if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).join('.');
            if (classes) {
                selector += `.${classes}`;
            }
        }

        // Add position if needed
        const parent = el.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(
                child => child.tagName === el.tagName
            );
            if (siblings.length > 1) {
                const index = siblings.indexOf(el) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }

        return selector;
    };

    // Build full path
    const path = [];
    let current = element;
    while (current && current !== document.body) {
        path.unshift(getSelector(current));
        current = current.parentElement;
    }

    return {
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        classes: element.className || '',
        selector: path.join(' > '),
        text: element.innerText?.substring(0, 100) || '',
        html: element.outerHTML.substring(0, 500),
        xpath: getXPath(element)
    };
}

function getXPath(element) {
    if (element.id) {
        return `//*[@id="${element.id}"]`;
    }

    if (element === document.body) {
        return '/html/body';
    }

    let ix = 0;
    const siblings = element.parentNode?.childNodes || [];

    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) {
            return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
        }
    }
}
