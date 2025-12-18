(function() {
    'use strict';

    // Prevent multiple injections
    if (window.domMemoCapture_loaded) {
        console.log('DOM Memo Capture already loaded, skipping initialization');
        return;
    }
    window.domMemoCapture_loaded = true;

// DOM element selection state
let selectedElement = null;
let lastHighlightedElement = null;
let lastHighlightedOutline = '';
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
    // Capture the current cursor before changing it so we can restore it later
    originalCursor = document.body.style.cursor;

    document.body.style.cursor = 'crosshair';

    // Add event listeners
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('click', selectElement);
}

function disableElementSelection() {
    document.body.style.cursor = originalCursor;
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('click', selectElement);

    // Clean up: restore the last highlighted element's outline if it's not the selected one
    if (lastHighlightedElement && lastHighlightedElement !== selectedElement) {
        lastHighlightedElement.style.outline = lastHighlightedOutline;
    }
    lastHighlightedElement = null;
}

function highlightElement(event) {
    event.preventDefault();

    // Don't re-highlight the same element
    if (event.target === lastHighlightedElement) {
        return;
    }

    // Restore previous highlighted element's outline
    if (lastHighlightedElement && lastHighlightedElement !== selectedElement) {
        lastHighlightedElement.style.outline = lastHighlightedOutline;
    }

    // Save current element's outline and highlight it
    lastHighlightedElement = event.target;
    lastHighlightedOutline = event.target.style.outline;
    event.target.style.outline = '2px solid #4CAF50';
}

function selectElement(event) {
    event.preventDefault();
    event.stopPropagation();

    selectedElement = event.target;
    selectedElement.style.outline = '3px solid #2196F3';

    disableElementSelection();

    const elementInfo = getElementInfo(selectedElement);

    // Store directly in chrome.storage
    chrome.storage.local.set({
        selectedElement: elementInfo,
        selectedTabUrl: window.location.href
    }, () => {
        console.log('Element info stored');

        // Also notify popup if it's open
        chrome.runtime.sendMessage({
            action: 'elementSelected',
            elementInfo: elementInfo
        }).catch(() => {
            // Popup might be closed, that's OK
            console.log('Popup is closed, data saved to storage');
        });
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
    if (!element) {
        return '';
    }

    if (element.id) {
        return `//*[@id="${element.id}"]`;
    }

    if (element === document.body) {
        return '/html/body';
    }

    if (!element.parentNode) {
        return '/html';
    }

    let ix = 0;
    const siblings = element.parentNode.childNodes;

    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) {
            const parentPath = getXPath(element.parentNode);
            return parentPath + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
        }
    }

    // Fallback: element not found in parent's children (should not happen)
    return '';
}

})(); // End of IIFE
