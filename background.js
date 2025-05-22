// Helper function to send messages to popup
function sendPopupMessage(message) {
  chrome.runtime.sendMessage(message, () => {
    if (chrome.runtime.lastError) {
      // This error typically means the popup was not open or has been closed.
      console.log("Popup not available to receive message:", chrome.runtime.lastError.message);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startScrapeAndUpload") {
    console.log("Background: Received startScrapeAndUpload from popup.");
    sendPopupMessage({ action: "updateStatus", message: "Verifying authentication..." }); // Changed message

    // Attempt to get token silently. Popup should have handled interactive auth.
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        let errorMessage = chrome.runtime.lastError ? chrome.runtime.lastError.message : "No token received or user not signed in/authorized.";
        // Provide a more user-friendly message if it's a common "needs interaction" error
        if (errorMessage.toLowerCase().includes("user gesture") || 
            errorMessage.toLowerCase().includes("interactive flow") ||
            errorMessage.toLowerCase().includes("requires an input user gesture")) {
          errorMessage = "Authorization required. Please click 'Sign In / Authorize' in the extension popup.";
        }
        console.error("Background: Silent authentication failed:", errorMessage);
        sendPopupMessage({ action: "error", message: `Authentication failed: ${errorMessage}` });
        return;
      }

      const authToken = token; // Store token locally for this operation chain
      console.log("Background: Authentication successful.");
      sendPopupMessage({ action: "updateStatus", message: "Authentication successful. Scraping data..." });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          const queryError = chrome.runtime.lastError ? chrome.runtime.lastError.message : "No active tab found.";
          console.error("Background: Error querying for active tab:", queryError);
          sendPopupMessage({ action: "error", message: `Error finding active tab: ${queryError}` });
          return;
        }

        const tabId = tabs[0].id;
        const tabUrl = tabs[0].url;
        console.log(`Background: Querying tab ${tabId} with URL ${tabUrl}`);

        if (tabUrl.startsWith("chrome://") || tabUrl.startsWith("https://chrome.google.com/webstore")) {
          console.warn("Background: Attempting to inject content script into a restricted page:", tabUrl);
          sendPopupMessage({ action: "error", message: "Cannot scrape data from this page (restricted)." });
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: "scrapeData" }, (response) => {
          if (chrome.runtime.lastError || !response || response.action !== "scrapedData") {
            const contentScriptError = chrome.runtime.lastError ? chrome.runtime.lastError.message : "No response or unexpected action from content script.";
            console.error("Background: Error receiving data from content script:", contentScriptError);
            sendPopupMessage({ action: "error", message: `Failed to get data from content script: ${contentScriptError}. Ensure you're on a standard webpage.` });
            return;
          }

          const scrapedText = response.data;
          console.log("Background: Scraped data received.");
          sendPopupMessage({ action: "updateStatus", message: "Data scraped. Creating Google Doc..." });

          // Step 1: Create Google Doc
          fetch('https://docs.googleapis.com/v1/documents', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: `Scraped Content - ${new Date().toLocaleString()}`
            }),
          })
          .then(res => {
            if (!res.ok) {
              return res.json().then(err => { throw new Error(`HTTP error ${res.status}: ${JSON.stringify(err)}`); });
            }
            return res.json();
          })
          .then(doc => {
            const documentId = doc.documentId;
            console.log(`Background: Google Doc created with ID: ${documentId}`);
            sendPopupMessage({ action: "updateStatus", message: `Doc created (ID: ${documentId.substring(0,10)}...). Adding content...` });

            // Step 2: Insert text into the new document
            return fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [
                  {
                    insertText: {
                      location: {
                        index: 1, // Start of the document body
                      },
                      text: scrapedText,
                    },
                  },
                ],
              }),
            })
            .then(updateRes => {
              if (!updateRes.ok) {
                return updateRes.json().then(err => { throw new Error(`HTTP error ${updateRes.status} writing to doc: ${JSON.stringify(err)}`); });
              }
              return updateRes.json().then(updateResult => ({...updateResult, documentId: documentId })); // Pass documentId along
            });
          })
          .then(finalResult => {
            const documentId = finalResult.documentId;
            const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
            console.log(`Background: Successfully wrote content to Google Doc: ${documentUrl}`);
            sendPopupMessage({ 
              action: "success", 
              message: "Data successfully sent to Google Doc!", 
              url: documentUrl 
            });
          })
          .catch(error => {
            console.error('Background: Google Docs API Error:', error);
            sendPopupMessage({ action: "error", message: `Google Docs API Error: ${error.message}` });
          });
        });
      });
    });
    return true; // Indicates asynchronous response
  }
  // No other message types are handled in this specific version,
  // but the listener remains open for future extensions.
  return true; // Keep channel open for other potential async responses
});

console.log("Background script loaded and listening.");
