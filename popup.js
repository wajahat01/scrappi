document.addEventListener('DOMContentLoaded', function() {
    const scrapeButton = document.getElementById('scrapeButton');
    const authButton = document.getElementById('authButton');
    const statusMessage = document.getElementById('statusMessage');

    if (!scrapeButton || !authButton || !statusMessage) {
        console.error("One or more UI elements (scrapeButton, authButton, statusMessage) not found.");
        if (statusMessage) statusMessage.textContent = "Popup UI error. Please reinstall.";
        return;
    }

    function updateUIMode(isAuthorized, message = '', messageColor = 'black') {
        if (isAuthorized) {
            scrapeButton.style.display = 'inline';
            authButton.style.display = 'none';
            statusMessage.textContent = message || 'Ready to scrape.';
            statusMessage.style.color = messageColor || 'green';
            scrapeButton.disabled = false;
        } else {
            scrapeButton.style.display = 'none';
            authButton.style.display = 'inline';
            statusMessage.textContent = message || 'Please authorize to access Google Docs.';
            statusMessage.style.color = messageColor || 'orange';
            scrapeButton.disabled = true; // Should be hidden, but good to keep state consistent
        }
    }

    function checkAuthStatus(interactive) {
        if (interactive) {
            statusMessage.textContent = "Attempting authorization...";
            statusMessage.style.color = "black";
            authButton.disabled = true; // Disable auth button during attempt
        }
        // Note: In MV3, chrome.identity.getAuthToken scopes are primarily defined in the manifest's oauth2 section.
        // Specifying scopes here can be problematic if they aren't a subset of manifest scopes or if not configured correctly.
        // For this extension, "https://www.googleapis.com/auth/documents" is in the manifest.
        chrome.identity.getAuthToken({ 
            interactive: interactive
            // scopes: ["https://www.googleapis.com/auth/documents"] // This line is often not needed if scopes are in manifest
        }, function(token) {
            if (interactive) {
                authButton.disabled = false; // Re-enable auth button after attempt
            }
            if (chrome.runtime.lastError || !token) {
                let errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Token not retrieved.";
                console.warn("Auth token retrieval failed:", errorMsg);
                
                // Avoid showing "User did not approve" or "interactive UI" errors for silent checks.
                let displayMsg = 'Please authorize to access Google Docs.';
                if (interactive) {
                    displayMsg = 'Authorization failed: ' + errorMsg + '. Please try again.';
                } else if (errorMsg.toLowerCase().includes("user gesture") || errorMsg.toLowerCase().includes("interactive")) {
                    // This indicates a silent check failed because interaction is needed.
                    displayMsg = 'Please click "Sign In / Authorize" to grant access.';
                }
                updateUIMode(false, displayMsg, 'orange');
            } else {
                // Token successfully retrieved
                console.log("Auth token successfully retrieved.");
                updateUIMode(true, interactive ? 'Authorization successful. Ready.' : 'Ready to scrape.', 'green');
            }
        });
    }

    authButton.addEventListener('click', () => {
        checkAuthStatus(true); // Initiate interactive auth flow
    });

    scrapeButton.addEventListener('click', () => {
        scrapeButton.disabled = true;
        authButton.disabled = true; // Also disable auth button during scrape
        statusMessage.textContent = "Processing... Scraping data...";
        statusMessage.style.color = 'black';
        
        chrome.runtime.sendMessage({ action: "startScrapeAndUpload" }, () => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error sending 'startScrapeAndUpload' to background:", chrome.runtime.lastError.message);
                updateUIMode(true, `Error: Could not connect to background. ${chrome.runtime.lastError.message}`, 'red');
                // Re-enable scrape button, auth state is still technically true but operation failed
                scrapeButton.disabled = false; 
                authButton.disabled = false;
            }
        });
    });

    // Listener for messages from background.js
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Popup received message from background:", message);
        
        scrapeButton.disabled = false; // Default to re-enabling buttons
        authButton.disabled = false;   // unless it's an intermediate update

        if (message.action === "updateStatus") {
            statusMessage.textContent = message.message;
            statusMessage.style.color = "black";
            scrapeButton.disabled = true; // Keep disabled during multi-step process
            authButton.disabled = true;
        } else if (message.action === "error") {
            statusMessage.textContent = message.message; // Background should format the full error
            statusMessage.style.color = "red";
            // Check if the error is an auth error from background, then switch to auth mode
            if (message.message && message.message.toLowerCase().includes("auth")) {
                 checkAuthStatus(false); // Re-check auth, likely to show authButton
            }
        } else if (message.action === "success") {
            statusMessage.textContent = message.message + " ";
            statusMessage.style.color = "green";
            if (message.url) {
                const link = document.createElement('a');
                link.href = message.url;
                link.textContent = "Open Doc";
                link.target = "_blank";
                statusMessage.appendChild(link);
            }
        } else {
            console.warn("Popup received unknown message action:", message.action);
            statusMessage.textContent = `Unknown status: ${JSON.stringify(message.message || message)}`;
            statusMessage.style.color = "orange";
        }
        return true; // Keep channel open for potential async sendResponse
    });

    // Initial check when popup opens
    checkAuthStatus(false); 
});
